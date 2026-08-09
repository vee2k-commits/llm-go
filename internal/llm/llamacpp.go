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

// LlamaCppOpts configures the llamacpp backend.
type LlamaCppOpts struct {
	BaseURL string
	Model   string
	Tools   []Tool
}

// LlamaCppBackend connects to a local llama-server (OpenAI-compatible
// streaming endpoint) and normalizes SSE responses into canonical Events.
type LlamaCppBackend struct {
	mu   sync.RWMutex
	opts LlamaCppOpts
	cli  *http.Client
}

// NewLlamaCppBackend builds the backend. BaseURL defaults to
// http://127.0.0.1:8080/v1 when empty.
func NewLlamaCppBackend(opts LlamaCppOpts) *LlamaCppBackend {
	if opts.BaseURL == "" {
		opts.BaseURL = "http://127.0.0.1:8080/v1"
	}
	return &LlamaCppBackend{
		opts: opts,
		cli:  &http.Client{Timeout: 0},
	}
}

// Name implements Backend.
func (l *LlamaCppBackend) Name() string { return "llamacpp" }

// SetBaseURL points the backend at a new llama-server address (driven by the
// llm.llamacpp.url setting).
func (l *LlamaCppBackend) SetBaseURL(u string) {
	l.mu.Lock()
	l.opts.BaseURL = strings.TrimSpace(u)
	l.mu.Unlock()
}

// Health pings llama-server.
func (l *LlamaCppBackend) Health(ctx context.Context) bool {
	l.mu.RLock()
	base := l.opts.BaseURL
	l.mu.RUnlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(base, "/")+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := l.cli.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// Stream implements Backend. It POSTs to /chat/completions with the
// messages array, stream=true, and tools if any, then reads the SSE
// stream and normalizes each data chunk into canonical Events.
func (l *LlamaCppBackend) Stream(ctx context.Context, sessionID string, msgs []Message, opts Opts, on func(Event)) error {
	body, err := l.buildRequestBody(msgs, opts)
	if err != nil {
		return err
	}

	l.mu.RLock()
	base := l.opts.BaseURL
	l.mu.RUnlock()
	url := strings.TrimSuffix(base, "/") + "/chat/completions"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := l.cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("llamacpp stream (%d): %s", resp.StatusCode, strings.TrimSpace(string(b)))
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

func (l *LlamaCppBackend) buildRequestBody(msgs []Message, opts Opts) ([]byte, error) {
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
		model = l.opts.Model
	}

	body := map[string]any{
		"model":    model,
		"messages": openAIMsgs,
		"stream":   true,
	}

	if len(opts.ToolsEnabled) > 0 && len(l.opts.Tools) > 0 {
		tools := make([]map[string]any, 0, len(l.opts.Tools))
		for _, t := range l.opts.Tools {
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
