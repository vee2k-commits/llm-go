package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

// DefaultOpenAIModel is the model requested from the OpenAI-compatible
// endpoint whenever llm.openai.model is unset or persisted as an empty
// string (an empty override in vee.db must not mask the default).
const DefaultOpenAIModel = "oc/big-pickle"

// OpenAIOpts configures the generic OpenAI-compatible backend. It speaks the
// same streaming protocol as llamacpp (OpenAI chat completions SSE), so it
// works against api.openai.com or any compatible endpoint.
type OpenAIOpts struct {
	BaseURL string // default https://api.openai.com/v1
	APIKey  string // sent as Authorization: Bearer <key>
	Model   string
	Tools   []Tool
}

// OpenAIBackend streams chat completions from an OpenAI-compatible endpoint.
type OpenAIBackend struct {
	mu   sync.RWMutex
	opts OpenAIOpts
	cli  *http.Client
}

// NewOpenAIBackend builds the backend. BaseURL defaults to
// http://localhost:20128/v1 (the local OpenAI-compatible proxy) when empty.
// Model defaults to DefaultOpenAIModel when empty so a blank (or blank
// persisted) llm.openai.model never produces a "Missing model" request.
func NewOpenAIBackend(opts OpenAIOpts) *OpenAIBackend {
	if opts.BaseURL == "" {
		opts.BaseURL = "http://localhost:20128/v1"
	}
	if opts.Model == "" {
		opts.Model = DefaultOpenAIModel
	}
	return &OpenAIBackend{
		opts: opts,
		cli:  &http.Client{Timeout: 0}, // streaming; no total timeout
	}
}

// Name implements Backend.
func (o *OpenAIBackend) Name() string { return "openai" }

// SetBaseURL points the backend at a new endpoint (driven by llm.openai.url).
func (o *OpenAIBackend) SetBaseURL(u string) {
	o.mu.Lock()
	o.opts.BaseURL = strings.TrimSpace(u)
	o.mu.Unlock()
}

// SetAPIKey swaps the bearer key (driven by llm.openai.apiKey; the
// VEE_OPENAI_API_KEY env var takes precedence at startup).
func (o *OpenAIBackend) SetAPIKey(k string) {
	o.mu.Lock()
	o.opts.APIKey = strings.TrimSpace(k)
	o.mu.Unlock()
}

// Health pings GET <base>/models with the bearer key.
func (o *OpenAIBackend) Health(ctx context.Context) bool {
	o.mu.RLock()
	base := o.opts.BaseURL
	key := o.opts.APIKey
	o.mu.RUnlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(base, "/")+"/models", nil)
	if err != nil {
		return false
	}
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	resp, err := o.cli.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// Stream implements Backend. It POSTs to /chat/completions with stream=true
// and normalizes each SSE data chunk into canonical Events — the same shape
// the llamacpp backend produces.
func (o *OpenAIBackend) Stream(ctx context.Context, sessionID string, msgs []Message, opts Opts, on func(Event)) error {
	body, err := o.buildRequestBody(msgs, opts)
	if err != nil {
		return err
	}

	o.mu.RLock()
	base := o.opts.BaseURL
	key := o.opts.APIKey
	o.mu.RUnlock()
	if key == "" {
		return fmt.Errorf("no API key configured \u2014 set VEE_OPENAI_API_KEY to enable chat")
	}
	url := strings.TrimSuffix(base, "/") + "/chat/completions"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := o.cli.Do(req)
	if err != nil {
		return fmt.Errorf("openai: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		detail := strings.TrimSpace(string(b))
		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return fmt.Errorf("openai auth failed (%d): check the API key (VEE_OPENAI_API_KEY or llm.openai.apiKey): %s", resp.StatusCode, detail)
		default:
			return fmt.Errorf("openai stream (%d): %s", resp.StatusCode, detail)
		}
	}

	var curToolCallID string
	var curToolName string
	var curToolArgs strings.Builder

	return consumeSSE(ctx, resp.Body, func(raw []byte) {
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			return
		}
		choices, _ := m["choices"].([]any)
		if len(choices) == 0 {
			return
		}
		choice, ok := choices[0].(map[string]any)
		if !ok {
			return
		}

		finishReason, _ := choice["finish_reason"].(string)
		if finishReason != "" && finishReason != "null" {
			if curToolCallID != "" {
				on(Event{Type: "tool_end", ToolCallID: curToolCallID, ToolName: curToolName, ToolArgs: curToolArgs.String()})
				curToolCallID = ""
				curToolName = ""
				curToolArgs.Reset()
			}
			on(Event{Type: "end"})
			return
		}

		delta, _ := choice["delta"].(map[string]any)
		if delta == nil {
			return
		}

		if content, ok := delta["content"].(string); ok && content != "" {
			on(Event{Type: "token", Text: content})
		}

		if toolCalls, ok := delta["tool_calls"].([]any); ok && len(toolCalls) > 0 {
			for _, tc := range toolCalls {
				toolCall, ok := tc.(map[string]any)
				if !ok {
					continue
				}
				if id, ok := toolCall["id"].(string); ok && id != "" {
					curToolCallID = id
				}
				if fn, ok := toolCall["function"].(map[string]any); ok {
					if name, ok := fn["name"].(string); ok && name != "" {
						curToolName = name
						if curToolCallID != "" {
							on(Event{Type: "tool_start", ToolCallID: curToolCallID, ToolName: curToolName})
						}
					}
					if args, ok := fn["arguments"].(string); ok {
						curToolArgs.WriteString(args)
						if curToolCallID != "" {
							on(Event{Type: "tool_update", ToolCallID: curToolCallID, ToolName: curToolName})
						}
					}
				}
			}
		}
	})
}

func (o *OpenAIBackend) buildRequestBody(msgs []Message, opts Opts) ([]byte, error) {
	type openAIMsg struct {
		Role       string `json:"role"`
		Content    string `json:"content,omitempty"`
		ToolCallID string `json:"tool_call_id,omitempty"`
	}

	openAIMsgs := make([]openAIMsg, 0, len(msgs))
	for _, msg := range msgs {
		m := openAIMsg{Role: msg.Role, Content: msg.Content}
		if msg.Role == RoleTool && msg.ToolCallID != "" {
			m.ToolCallID = msg.ToolCallID
		}
		openAIMsgs = append(openAIMsgs, m)
	}

	model := opts.Model
	if model == "" {
		model = o.opts.Model
	}

	body := map[string]any{
		"model":    model,
		"messages": openAIMsgs,
		"stream":   true,
	}

	if len(opts.ToolsEnabled) > 0 && len(o.opts.Tools) > 0 {
		tools := make([]map[string]any, 0, len(o.opts.Tools))
		for _, t := range o.opts.Tools {
			tools = append(tools, map[string]any{
				"type": "function",
				"function": map[string]any{
					"name":        t.Name,
					"description": t.Description,
					"parameters":  t.ArgsSchema,
				},
			})
		}
		body["tools"] = tools
	}

	return json.Marshal(body)
}
