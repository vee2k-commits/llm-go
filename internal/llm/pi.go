package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"vee/internal/bus"
)

type PIBackend struct {
	url    string
	client *http.Client
}

func NewPIBackend(baseURL string) *PIBackend {
	if baseURL == "" {
		baseURL = "http://127.0.0.1:8080/v1"
	}
	return &PIBackend{
		url: baseURL,
		client: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func (p *PIBackend) Name() string {
	return "pi"
}

func (p *PIBackend) Stream(ctx context.Context, sessionID string, messages []Message, opts StreamOptions, onEvent func(bus.Event)) error {
	sessionURL, err := url.JoinPath(p.url, "sessions")
	if err != nil {
		return err
	}

	reqBody, err := json.Marshal(map[string]interface{}{"messages": messages})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sessionURL, bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pi backend returned status %d: %s", resp.StatusCode, string(body))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}
		if msg, ok := event["message_update"].(map[string]any); ok {
			content, _ := msg["text"].(string)
			onEvent(bus.Event{Topic: "chat.token", Payload: map[string]interface{}{"sessionId": sessionID, "delta": content}})
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}

	onEvent(bus.Event{Topic: "chat.ended", Payload: map[string]interface{}{"sessionId": sessionID}})
	return nil
}
