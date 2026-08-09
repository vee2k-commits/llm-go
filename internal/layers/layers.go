// Package layers is Vee's virtual display surface: a stack of named layers
// (desktop, chat, notify, settings, arcade, wizard). The browser mirrors these;
// clicking the desktop spawns a chat bubble at the click point.
package layers

import (
	"sort"
	"sync"

	"vee/internal/bus"
)

// Layer describes one surface.
type Layer struct {
	ID      string         `json:"id"`
	Name    string         `json:"name"`
	Z       int            `json:"z"`
	Visible bool           `json:"visible"`
	Pane    string         `json:"pane"` // overlay | panel-left | panel-right | toast
	Meta    map[string]any `json:"meta,omitempty"`
}

// ClickPayload carries where a click landed.
type ClickPayload struct {
	Layer string `json:"layer"`
	X     int    `json:"x"`
	Y     int    `json:"y"`
}

// Manager owns the layer stack and mirrors it on state.layer.*.
type Manager struct {
	mu     sync.RWMutex
	bus    *bus.Bus
	layers map[string]*Layer
}

// NewManager builds a Manager and seeds the six canonical layers.
func NewManager(b *bus.Bus) *Manager {
	m := &Manager{bus: b, layers: map[string]*Layer{}}
	m.seed(Layer{ID: "desktop", Name: "Desktop", Z: 0, Visible: true, Pane: "overlay"})
	m.seed(Layer{ID: "chat", Name: "Chat", Z: 10, Visible: true, Pane: "panel-left"})
	m.seed(Layer{ID: "notify", Name: "Notifications", Z: 100, Visible: true, Pane: "toast"})
	m.seed(Layer{ID: "settings", Name: "Settings", Z: 50, Visible: false, Pane: "panel-right"})
	m.seed(Layer{ID: "wizard", Name: "Wizards", Z: 60, Visible: false, Pane: "overlay"})
	m.seed(Layer{ID: "arcade", Name: "Arcade", Z: 90, Visible: false, Pane: "overlay"})
	m.Publish()
	return m
}

func (m *Manager) seed(l Layer) {
	if l.Name == "" {
		l.Name = l.ID
	}
	if l.Meta == nil {
		l.Meta = map[string]any{}
	}
	m.layers[l.ID] = &l
}

// Register adds a custom layer at runtime (from a module).
func (m *Manager) Register(l Layer) {
	m.mu.Lock()
	if l.Name == "" {
		l.Name = l.ID
	}
	m.layers[l.ID] = &l
	m.mu.Unlock()
	m.Publish()
}

// Get returns a snapshot of a layer.
func (m *Manager) Get(id string) (Layer, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	l, ok := m.layers[id]
	if !ok {
		return Layer{}, false
	}
	return *l, true
}

// List returns all layers sorted by Z.
func (m *Manager) List() []Layer {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Layer, 0, len(m.layers))
	for _, l := range m.layers {
		out = append(out, *l)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Z < out[j].Z })
	return out
}

// SetVisible toggles a layer and publishes layer.toggled.
func (m *Manager) SetVisible(id string, visible bool) {
	m.mu.Lock()
	l, ok := m.layers[id]
	if !ok {
		m.mu.Unlock()
		return
	}
	l.Visible = visible
	m.mu.Unlock()
	m.Publish()
	m.bus.Publish("layer.toggled", map[string]any{"id": id, "visible": visible})
}

// Toggle flips a layer.
func (m *Manager) Toggle(id string) bool {
	m.mu.RLock()
	l, ok := m.layers[id]
	cur := ok && l.Visible
	m.mu.RUnlock()
	m.SetVisible(id, !cur)
	return !cur
}

// Click records a click on a layer (desktop click spawns chat there).
func (m *Manager) Click(id string, x, y int) {
	m.bus.Publish("layer.activated", ClickPayload{Layer: id, X: x, Y: y})
}

// Publish mirrors the stack on state.layer (replay-safe).
func (m *Manager) Publish() {
	m.bus.Publish("state.layer", m.List())
}
