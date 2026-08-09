package llm

import (
	"encoding/json"
	"fmt"
)

// normalizePiEvent converts a pi(-harness) or opencode SSE/JSONL payload into a
// canonical Event. Both tools share the same message_update / text_delta shape,
// so a single tolerant normalizer serves both seams.
func normalizePiEvent(raw []byte) *Event {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	typ, _ := m["type"].(string)
	switch typ {
	case "turn_start", "message_start", "message_end", "agent_start", "agent_end",
		"auto_retry_start", "auto_retry_end", "queue_update", "session", "session_initialized":
		return nil
	case "turn_end", "agent_settled", "agent_done", "message_end_full":
		return &Event{Type: "end"}
	case "error", "session.error", "session.error_reason":
		msg, _ := m["message"].(string)
		if msg == "" {
			if e, ok := m["error"]; ok {
				msg = fmt.Sprint(e)
			}
		}
		if msg == "" {
			if e, ok := m["reason"]; ok {
				msg = fmt.Sprint(e)
			}
		}
		return &Event{Type: "error", Err: fmt.Errorf("%s", msg)}
	case "message_update":
		if txt, ok := parseDelta(m); ok {
			return &Event{Type: "token", Text: txt}
		}
		return nil
	case "thinking_update", "reasoning", "reasoning_update":
		if txt, ok := parseDelta(m); ok {
			return &Event{Type: "thinking", Thinking: txt}
		}
		return nil
	case "message":
		// opencode emits a final "message" event with the assembled text.
		if msg, ok := m["message"].(map[string]any); ok {
			if msg["type"] == "text" {
				if txt, ok := msg["text"].(string); ok && txt != "" {
					return &Event{Type: "token", Text: txt}
				}
			}
		}
		return nil
	case "tool_call_start", "tool_execution_start":
		args := str(m, "toolArgs")
		if args == "" {
			if a, ok := m["args"]; ok {
				if b, err := json.Marshal(a); err == nil {
					args = string(b)
				}
			}
		}
		return &Event{Type: "tool_start", ToolCallID: str(m, "toolCallId"), ToolName: str(m, "toolName"), ToolArgs: args}
	case "tool_call_update", "tool_execution_update":
		return &Event{Type: "tool_update", ToolCallID: str(m, "toolCallId"), ToolName: str(m, "toolName")}
	case "tool_call_end", "tool_execution_end":
		return &Event{Type: "tool_end", ToolCallID: str(m, "toolCallId"), ToolName: str(m, "toolName"),
			ToolResult: str(m, "toolResult"), IsToolError: boolField(m, "isToolError")}
	}
	return nil
}

// parseDelta extracts a streaming text delta from either the harness-flattened
// shape {"text":"..."} or the nested {"assistantMessageEvent":{"delta":"..."}}.
func parseDelta(m map[string]any) (string, bool) {
	if txt, ok := m["text"].(string); ok && txt != "" {
		return txt, true
	}
	if ame, ok := m["assistantMessageEvent"].(map[string]any); ok {
		if d, ok := ame["delta"].(string); ok && d != "" {
			return d, true
		}
	}
	if d, ok := m["delta"].(string); ok && d != "" {
		return d, true
	}
	return "", false
}

func str(m map[string]any, k string) string {
	if v, ok := m[k]; ok {
		return fmt.Sprint(v)
	}
	return ""
}

func boolField(m map[string]any, k string) bool {
	if v, ok := m[k]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
		if s, ok := v.(string); ok {
			return s == "true" || s == "1"
		}
	}
	return false
}
