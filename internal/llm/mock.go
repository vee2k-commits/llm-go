package llm

import (
	"context"
	"fmt"
	"time"

	"vee/internal/bus"
)

type MockBackend struct{}

func NewMockBackend() *MockBackend {
	return &MockBackend{}
}

func (m *MockBackend) Name() string {
	return "mock"
}

func (m *MockBackend) Stream(ctx context.Context, sessionID string, messages []Message, opts StreamOptions, onEvent func(bus.Event)) error {
	onEvent(bus.Event{Topic: "chat.message", Payload: map[string]interface{}{"sessionId": sessionID, "role": "assistant", "content": fmt.Sprintf("Mock response to %d messages", len(messages)), "seq": 1}})
	time.Sleep(50 * time.Millisecond)
	onEvent(bus.Event{Topic: "chat.ended", Payload: map[string]interface{}{"sessionId": sessionID}})
	return nil
}
