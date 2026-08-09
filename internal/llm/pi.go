package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

// PiOpts configures the pi-harness proxy backend.
type PiOpts struct {
	BaseURL            string // default http://127.0.0.1:8080
	APIKey             string
	Provider           string
	Model              string
	WorkspaceDir       string
	SystemPromptPrefix string
	SystemPromptSuffix string
	ToolsEnabled       []string // filters pi built-ins (read,bash,write,...)
}

// PiBackend proxies to pi-harness over HTTP/SSE. This is the "pi server
// proxying from this front end" architecture: Vee's Go server is the only
// thing that talks to pi.
type PiBackend struct {
	mu   sync.RWMutex
	opts PiOpts
	cli  *http.Client

	sess map[string]string // veeSessionID -> pi session id
}

// NewPiBackend builds the proxy.
func NewPiBackend(opts PiOpts) *PiBackend {
	if opts.BaseURL == "" {
		opts.BaseURL = "http://127.0.0.1:8080"
	}
	return &PiBackend{
		opts: opts,
		cli:  &http.Client{Timeout: 0}, // no total timeout; streaming
		sess: map[string]string{},
	}
}

// UpdateOpts adjusts persona/model/tools at runtime.
func (p *PiBackend) UpdateOpts(fn func(*PiOpts)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	fn(&p.opts)
}

// SetBaseURL points the proxy at a new pi-harness address (driven by the
// llm.pi.url setting) and drops cached sessions, which belong to the old
// server.
func (p *PiBackend) SetBaseURL(u string) {
	p.mu.Lock()
	p.opts.BaseURL = strings.TrimSuffix(strings.TrimSpace(u), "/")
	p.sess = map[string]string{}
	p.mu.Unlock()
}

// Name implements Backend.
func (p *PiBackend) Name() string { return "pi" }

// Health pings pi-harness.
func (p *PiBackend) Health(ctx context.Context) bool {
	p.mu.RLock()
	base := p.opts.BaseURL
	p.mu.RUnlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(base, "/")+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := p.cli.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (p *PiBackend) piSessionID(ctx context.Context, veeSession string) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if id, ok := p.sess[veeSession]; ok {
		return id, nil
	}
	opts := p.opts
	body, _ := json.Marshal(map[string]any{
		"provider":            opts.Provider,
		"model":               opts.Model,
		"workspaceDir":        opts.WorkspaceDir,
		"systemPromptPrefix":  opts.SystemPromptPrefix,
		"systemPromptSuffix":  opts.SystemPromptSuffix,
		"toolsEnabled":        opts.ToolsEnabled,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(opts.BaseURL, "/")+"/sessions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if opts.APIKey != "" {
		req.Header.Set("x-api-key", opts.APIKey)
	}
	resp, err := p.cli.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		SessionID string `json:"sessionId"`
		Error     string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("pi create session: %w", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("pi create session (%d): %s", resp.StatusCode, out.Error)
	}
	p.sess[veeSession] = out.SessionID
	return out.SessionID, nil
}

func (p *PiBackend) dropSession(veeSession string) {
	p.mu.Lock()
	delete(p.sess, veeSession)
	p.mu.Unlock()
}

// Stream implements Backend. It sends the final user message to pi and
// normalizes the SSE reply into canonical Events.
func (p *PiBackend) Stream(ctx context.Context, sessionID string, msgs []Message, opts Opts, on func(Event)) error {
	content := lastUserContent(msgs)

	send := func() error {
		piID, err := p.piSessionID(ctx, sessionID)
		if err != nil {
			return err
		}
		body, _ := json.Marshal(map[string]string{"content": content})
		url := strings.TrimSuffix(p.opts.BaseURL, "/") + "/sessions/" + piID + "/messages"
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		if p.opts.APIKey != "" {
			req.Header.Set("x-api-key", p.opts.APIKey)
		}
		resp, err := p.cli.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound {
			// pi session expired (in-memory). Recreate and retry once.
			p.dropSession(sessionID)
			return errSessionExpired
		}
		if resp.StatusCode != http.StatusOK {
			b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
			return fmt.Errorf("pi stream (%d): %s", resp.StatusCode, strings.TrimSpace(string(b)))
		}
		return consumeSSE(ctx, resp.Body, func(raw []byte) {
			ev := normalizePiEvent(raw)
			if ev != nil {
				on(*ev)
			}
		})
	}

	err := send()
	if err == errSessionExpired {
		on(Event{Type: "error", Err: fmt.Errorf("pi session expired; context reset")})
		err = send()
	}
	return err
}

var errSessionExpired = fmt.Errorf("pi session expired")

// lastUserContent returns the most recent non-system user message.
func lastUserContent(msgs []Message) string {
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == RoleUser {
			return msgs[i].Content
		}
	}
	return ""
}

// consumeSSE reads an SSE stream of "event:" / "data:" frames and hands each
// data payload (raw JSON) to fn. It also dispatches on the blank-line boundary
// so multi-line data accumulates.
func consumeSSE(ctx context.Context, r io.Reader, fn func([]byte)) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	var data []byte
	for sc.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		line := sc.Text()
		switch {
		case line == "":
			if len(data) > 0 {
				fn(data)
				data = nil
			}
		case strings.HasPrefix(line, "data:"):
			payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if len(data) > 0 {
				data = append(data, '\n')
			}
			data = append(data, payload...)
		default:
			// ignore event:/id:/retry: lines
		}
	}
	if len(data) > 0 {
		fn(data)
	}
	return sc.Err()
}
