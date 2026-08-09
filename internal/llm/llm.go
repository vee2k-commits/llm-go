// Package llm is Vee's LLM provider layer. Backends (pi, llamacpp, mock) are
// registered as `provider` registry entries; the `llm.backend` setting picks
// the active one. Every backend is normalized into the same chat.* events so
// the frontend never knows (or cares) who generated a reply.
package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"vee/internal/bus"
	"vee/internal/db"
	"vee/internal/notify"
)

// Role constants.
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleSystem    = "system"
	RoleTool      = "tool"
)

// Message is one turn in a conversation.
type Message struct {
	Role       string `json:"role"`
	Content    string `json:"content"`
	ToolCallID string `json:"toolCallId,omitempty"`
}

// Opts controls a single Stream call.
type Opts struct {
	SystemPromptPrefix string
	SystemPromptSuffix string
	ToolsEnabled       []string
	Model              string
	// ToolDispatch executes a tool call outside the agent (used by direct
	// llamacpp tool-calling and the mock backend).
	ToolDispatch func(toolName string, args map[string]any) string
}

// Event is the canonical stream event a backend produces.
type Event struct {
	Type        string // message_start | token | thinking | tool_start | tool_update | tool_end | end | error
	Text        string
	Thinking    string
	ToolCallID  string
	ToolName    string
	ToolArgs    string
	ToolResult  string
	IsToolError bool
	Err         error
}

// Backend streams a conversation.
type Backend interface {
	Name() string
	Stream(ctx context.Context, sessionID string, msgs []Message, opts Opts, on func(Event)) error
	Health(ctx context.Context) bool
}

// Session is a persisted conversation.
type Session struct {
	ID      string    `json:"id"`
	Backend string    `json:"backend"`
	Created time.Time `json:"created"`
	msgs    []Message
}

// Manager owns sessions, the active backend, and the tool registry.
type Manager struct {
	bus       *bus.Bus
	db        *db.DB
	notify    *notify.Service
	backends  map[string]Backend
	active    string
	tools     *ToolSet
	mu        sync.Mutex
	sessions  map[string]*Session
	seqBySess map[string]int
	chatState map[string]map[string]any // per-session last assistant message
}

// NewManager wires the manager. active is the default backend name. It
// subscribes to the `llm.prompt` command (published by wizards and macros) so
// any component can drive a chat turn through the bus.
func NewManager(b *bus.Bus, database *db.DB, n *notify.Service, active string) *Manager {
	m := &Manager{
		bus:       b,
		db:        database,
		notify:    n,
		backends:  map[string]Backend{},
		active:    active,
		tools:     NewToolSet(),
		sessions:  map[string]*Session{},
		seqBySess: map[string]int{},
	}
	if b != nil {
		b.Subscribe("llm.prompt", func(msg bus.Msg) {
			p, _ := msg.Payload.(map[string]any)
			sid, _ := p["sessionId"].(string)
			content, _ := p["content"].(string)
			if sid == "" || content == "" {
				return
			}
			go func() {
				if err := m.Prompt(context.Background(), sid, content, Opts{}); err != nil && n != nil {
					n.Errorf("LLM", "%v", err)
				}
			}()
		})
	}
	return m
}

// RegisterBackend adds a provider.
func (m *Manager) RegisterBackend(b Backend) {
	m.backends[b.Name()] = b
}

// Backends lists registered backend names.
func (m *Manager) Backends() []string {
	out := make([]string, 0, len(m.backends))
	for k := range m.backends {
		out = append(out, k)
	}
	return out
}

// SetBackend switches the active provider and announces it.
func (m *Manager) SetBackend(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.backends[name]; !ok {
		return fmt.Errorf("unknown backend %q", name)
	}
	m.active = name
	m.bus.Publish("llm.backend.switched", map[string]string{"backend": name})
	return nil
}

// Active returns the current backend name.
func (m *Manager) Active() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.active
}

// Pi returns the registered pi backend, if any (used by the health watcher).
func (m *Manager) Pi() *PiBackend {
	m.mu.Lock()
	defer m.mu.Unlock()
	if b, ok := m.backends["pi"]; ok {
		if pi, ok := b.(*PiBackend); ok {
			return pi
		}
	}
	return nil
}

// OpenAI returns the registered OpenAI-compatible backend, if any.
func (m *Manager) OpenAI() *OpenAIBackend {
	m.mu.Lock()
	defer m.mu.Unlock()
	if b, ok := m.backends["openai"]; ok {
		if oa, ok := b.(*OpenAIBackend); ok {
			return oa
		}
	}
	return nil
}

// Tools exposes the tool registry for tool/skill registration.
func (m *Manager) Tools() *ToolSet { return m.tools }

// RegisterTool adds a tool exposed to the LLM and as a registry entry.
func (m *Manager) RegisterTool(t Tool) {
	m.tools.Add(t)
}

// NewSession creates a fresh conversation.
func (m *Manager) NewSession() *Session {
	id := fmt.Sprintf("sess-%d", time.Now().UnixNano())
	s := &Session{ID: id, Backend: m.active, Created: time.Now()}
	m.mu.Lock()
	m.sessions[id] = s
	m.seqBySess[id] = 0
	m.mu.Unlock()
	if m.db != nil {
		_, _ = m.db.Exec(`INSERT INTO sessions(id, backend, created) VALUES(?,?,?)`, id, m.active, s.Created.Unix())
	}
	return s
}

// GetSession returns an existing session or creates one.
func (m *Manager) GetSession(id string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[id]; ok {
		return s
	}
	s := &Session{ID: id, Backend: m.active, Created: time.Now()}
	m.sessions[id] = s
	m.seqBySess[id] = 0
	if m.db != nil {
		_, _ = m.db.Exec(`INSERT INTO sessions(id, backend, created) VALUES(?,?,?)`, id, m.active, s.Created.Unix())
	}
	return s
}

// History returns a copy of the session's messages.
func (m *Manager) History(s *Session) []Message {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]Message{}, s.msgs...)
}

func (m *Manager) append(s *Session, role, content string) Message {
	m.mu.Lock()
	msg := Message{Role: role, Content: content}
	s.msgs = append(s.msgs, msg)
	seq := m.seqBySess[s.ID]
	m.seqBySess[s.ID] = seq + 1
	m.mu.Unlock()
	if m.db != nil {
		_, _ = m.db.Exec(`INSERT INTO messages(session, role, content, seq, ts) VALUES(?,?,?,?,?)`,
			s.ID, role, content, seq, time.Now().UnixMilli())
	}
	return msg
}

// Prompt runs a user message through the active backend, streaming normalized
// events on the bus. It is the single entry point for chat.
func (m *Manager) Prompt(ctx context.Context, sessionID, content string, opts Opts) error {
	s := m.GetSession(sessionID)
	m.append(s, RoleUser, content)
	m.mu.Lock()
	seq := m.seqBySess[s.ID] - 1
	m.mu.Unlock()
	m.bus.Publish("chat.message", map[string]any{
		"sessionId": s.ID, "role": RoleUser, "content": content,
		"seq": seq,
	})

	// Publish an empty assistant message immediately so the frontend has a
	// container to append token deltas to.
	m.append(s, RoleAssistant, "")
	m.mu.Lock()
	assistantSeq := m.seqBySess[s.ID] - 1
	m.mu.Unlock()
	m.bus.Publish("chat.message", map[string]any{
		"sessionId": s.ID, "role": RoleAssistant, "content": "",
		"seq": assistantSeq,
	})

	backend, ok := m.backends[m.active]
	if !ok {
		return fmt.Errorf("active backend %q not registered", m.active)
	}
	if opts.ToolDispatch == nil {
		opts.ToolDispatch = m.tools.Dispatch(m.bus)
	}

	var streamed strings.Builder

	on := func(ev Event) {
		switch ev.Type {
		case "token":
			streamed.WriteString(ev.Text)
			m.bus.Publish("chat.token", map[string]any{"sessionId": s.ID, "delta": ev.Text})
		case "thinking":
			m.bus.Publish("chat.thinking", map[string]any{"sessionId": s.ID, "delta": ev.Thinking})
		case "tool_start":
			m.bus.Publish("chat.tool_start", map[string]any{
				"sessionId": s.ID, "toolCallId": ev.ToolCallID, "toolName": ev.ToolName, "toolArgs": ev.ToolArgs})
		case "tool_end":
			m.bus.Publish("chat.tool_end", map[string]any{
				"sessionId": s.ID, "toolCallId": ev.ToolCallID, "toolName": ev.ToolName,
				"toolResult": ev.ToolResult, "isToolError": ev.IsToolError})
		case "end":
			m.bus.Publish("chat.ended", map[string]string{"sessionId": s.ID})
		case "error":
			m.notify.Errorf("LLM error", "%v", ev.Err)
			m.bus.Publish("chat.error", map[string]any{"sessionId": s.ID, "error": ev.Err.Error()})
		}
	}

	err := backend.Stream(ctx, s.ID, m.History(s), opts, on)
	if err != nil && m.notify != nil {
		m.notify.Errorf("LLM error", "%v", err)
	}

	// Mirror the final assistant message on state.chat.<session> (and the
	// combined state.chat snapshot) so SSE replay restores the conversation.
	final := streamed.String()
	m.mu.Lock()
	if len(s.msgs) > 0 && s.msgs[len(s.msgs)-1].Role == RoleAssistant {
		s.msgs[len(s.msgs)-1].Content = final
	}
	if m.chatState == nil {
		m.chatState = map[string]map[string]any{}
	}
	m.chatState[s.ID] = map[string]any{
		"sessionId": s.ID, "role": RoleAssistant, "content": final, "seq": assistantSeq,
	}
	combined := make(map[string]map[string]any, len(m.chatState))
	for k, v := range m.chatState {
		combined[k] = v
	}
	m.mu.Unlock()
	m.bus.SetState("state.chat."+s.ID, m.chatState[s.ID])
	m.bus.SetState("state.chat", combined)

	if err != nil {
		return err
	}
	return nil
}

// SetSystemPrompt stores a per-session system prompt (used as the prefix).
func (m *Manager) SetSystemPrompt(sessionID, prompt string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[sessionID]; ok {
		if s.msgs == nil {
			s.msgs = []Message{}
		}
		if len(s.msgs) == 0 || s.msgs[0].Role != RoleSystem {
			s.msgs = append([]Message{{Role: RoleSystem, Content: prompt}}, s.msgs...)
		} else {
			s.msgs[0].Content = prompt
		}
	}
}

// EventJSON is a helper to marshal bus payloads for SSE.
func EventJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
