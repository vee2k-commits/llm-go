package llm

import (
	"fmt"
	"testing"
)

func TestNormalizePiToken(t *testing.T) {
	raw := []byte(`{"type":"message_update","text":"hello world"}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "token" || ev.Text != "hello world" {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizePiNestedDelta(t *testing.T) {
	raw := []byte(`{"type":"message_update","assistantMessageEvent":{"delta":" nested"}}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "token" || ev.Text != " nested" {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizePiEnd(t *testing.T) {
	for _, raw := range [][]byte{
		[]byte(`{"type":"turn_end"}`),
		[]byte(`{"type":"agent_done"}`),
		[]byte(`{"type":"message_end_full"}`),
	} {
		ev := normalizePiEvent(raw)
		if ev == nil || ev.Type != "end" {
			t.Fatalf("expected end, got %+v", ev)
		}
	}
}

func TestNormalizePiError(t *testing.T) {
	raw := []byte(`{"type":"error","message":"boom"}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "error" || ev.Err.Error() != "boom" {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizePiErrorReason(t *testing.T) {
	raw := []byte(`{"type":"session.error_reason","reason":"ratelimited"}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "error" || ev.Err.Error() != "ratelimited" {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizePiThinking(t *testing.T) {
	raw := []byte(`{"type":"thinking_update","text":"hmm..."}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "thinking" || ev.Thinking != "hmm..." {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizePiToolStart(t *testing.T) {
	raw := []byte(`{"type":"tool_call_start","toolCallId":"t1","toolName":"read","args":{"p":1}}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "tool_start" || ev.ToolCallID != "t1" || ev.ToolName != "read" {
		t.Fatalf("got %+v", ev)
	}
	if ev.ToolArgs == "" {
		t.Fatal("expected tool args")
	}
}

func TestNormalizePiToolEnd(t *testing.T) {
	raw := []byte(`{"type":"tool_call_end","toolCallId":"t1","toolName":"read","toolResult":"result text","isToolError":false}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "tool_end" || ev.ToolResult != "result text" || ev.IsToolError {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizePiToolEndError(t *testing.T) {
	for _, v := range []string{`true`, `"true"`, `"1"`} {
		raw := []byte(fmt.Sprintf(`{"type":"tool_call_end","toolCallId":"t1","toolName":"x","isToolError":%s}`, v))
		ev := normalizePiEvent(raw)
		if ev == nil || ev.Type != "tool_end" || !ev.IsToolError {
			t.Fatalf("isToolError should be true for %q, got %+v", v, ev)
		}
	}
}

func TestNormalizePiIgnoredTypes(t *testing.T) {
	for _, raw := range [][]byte{
		[]byte(`{"type":"message_start"}`),
		[]byte(`{"type":"queue_update"}`),
		[]byte(`{"type":"session"}`),
	} {
		if normalizePiEvent(raw) != nil {
			t.Fatalf("expected nil for ignored type")
		}
	}
}

func TestNormalizePiInvalidJSON(t *testing.T) {
	if normalizePiEvent([]byte(`{bad json`)) != nil {
		t.Fatal("invalid json should return nil")
	}
}

func TestNormalizeOpenCodeMessage(t *testing.T) {
	// opencode emits a final "message" event with assembled text
	raw := []byte(`{"type":"message","message":{"type":"text","text":"final answer"}}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "token" || ev.Text != "final answer" {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizeOpenCodeMessageUpdate(t *testing.T) {
	raw := []byte(`{"type":"message_update","delta":" chunk"}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "token" || ev.Text != " chunk" {
		t.Fatalf("got %+v", ev)
	}
}

func TestNormalizePiToolUpdate(t *testing.T) {
	raw := []byte(`{"type":"tool_call_update","toolCallId":"t1","toolName":"read"}`)
	ev := normalizePiEvent(raw)
	if ev == nil || ev.Type != "tool_update" || ev.ToolCallID != "t1" {
		t.Fatalf("got %+v", ev)
	}
}

func TestParseDeltaPrecedence(t *testing.T) {
	m := map[string]any{"text": "a"}
	if v, ok := parseDelta(m); !ok || v != "a" {
		t.Fatalf("parseDelta text = %q,%v", v, ok)
	}
	m = map[string]any{"assistantMessageEvent": map[string]any{"delta": "b"}}
	if v, ok := parseDelta(m); !ok || v != "b" {
		t.Fatalf("parseDelta nested = %q,%v", v, ok)
	}
	m = map[string]any{"delta": "c"}
	if v, ok := parseDelta(m); !ok || v != "c" {
		t.Fatalf("parseDelta flat delta = %q,%v", v, ok)
	}
	m = map[string]any{}
	if v, ok := parseDelta(m); ok {
		t.Fatalf("expected false, got %q", v)
	}
}
