package llm

import (
	"context"
	"errors"
	"sync"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/registry"
)

type Backend interface {
	Name() string
	Stream(ctx context.Context, sessionID string, messages []Message, opts StreamOptions, onEvent func(bus.Event)) error
}

type StreamOptions struct {
	Temperature float64
	MaxTokens   int
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Manager struct {
	mu        sync.RWMutex
	bus       *bus.Bus
	config    *config.Config
	registry  *registry.Registry
	providers map[string]Backend
	active    string
}

func NewManager(eventBus *bus.Bus, cfg *config.Config, reg *registry.Registry) *Manager {
	return &Manager{
		bus:       eventBus,
		config:    cfg,
		registry:  reg,
		providers: make(map[string]Backend),
	}
}

func (m *Manager) RegisterProvider(provider Backend) error {
	if provider == nil {
		return errors.New("provider cannot be nil")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.providers[provider.Name()] = provider
	return nil
}

func (m *Manager) SetBackend(name string) error {
	m.mu.RLock()
	_, ok := m.providers[name]
	m.mu.RUnlock()
	if !ok {
		return errors.New("backend not found")
	}
	if err := m.config.Set("llm.backend", name); err != nil {
		return err
	}
	m.mu.Lock()
	m.active = name
	m.mu.Unlock()
	m.bus.Publish("llm.backend.switched", map[string]string{"backend": name})
	return nil
}

func (m *Manager) ActiveBackend() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}

func (m *Manager) Stream(ctx context.Context, sessionID string, messages []Message, opts StreamOptions, onEvent func(bus.Event)) error {
	m.mu.RLock()
	provider, ok := m.providers[m.active]
	m.mu.RUnlock()
	if !ok {
		return errors.New("no active backend")
	}
	return provider.Stream(ctx, sessionID, messages, opts, onEvent)
}
