package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"vee/internal/bus"
)

type Router9Backend struct {
	baseURL string
	client  *http.Client
}

func NewRouter9Backend(baseURL string) *Router9Backend {
	if baseURL == "" {
		baseURL = "http://localhost:20128/v1"
	}
	return &Router9Backend{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		client: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

func (r *Router9Backend) Name() string {
	return "9router"
}

func (r *Router9Backend) Stream(ctx context.Context, sessionID string, messages []Message, opts StreamOptions, onEvent func(bus.Event)) error {
	endpoint, err := url.JoinPath(r.baseURL, "chat", "stream")
	if err != nil {
		return err
	}

	requestPayload := map[string]any{
		"session_id":  sessionID,
		"messages":    messages,
		"temperature": opts.Temperature,
		"max_tokens":  opts.MaxTokens,
	}

	body, err := json.Marshal(requestPayload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("9router backend returned status %d: %s", resp.StatusCode, string(raw))
	}

	decoder := json.NewDecoder(resp.Body)
	for {
		var event map[string]any
		if err := decoder.Decode(&event); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return err
		}
		if content, ok := event["content"].(string); ok {
			onEvent(bus.Event{Topic: "chat.token", Payload: map[string]interface{}{"sessionId": sessionID, "delta": content}})
		}
	}

	onEvent(bus.Event{Topic: "chat.ended", Payload: map[string]interface{}{"sessionId": sessionID}})
	return nil
}
