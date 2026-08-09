package llm

import (
	"context"
	"os"
	"time"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/notify"
)

// DefineSettings seeds the llm module's config knobs. Follow the same pattern
// as audio.DefineSettings / speech.DefineSettings: pure schema registration.
// Runtime reactions (backend switching, pi URL sync) are wired on the Manager
// itself since they need the bus and the backend map.
func DefineSettings(cfg *config.Store) {
	if cfg == nil {
		return
	}
	cfg.Define(config.Setting{
		Key:   "llm.backend",
		Group: "llm",
		Label: "LLM backend",
		Type:  config.TypeSelect,
		Options: []config.Option{
			{Label: "OpenAI-compatible", Value: "openai"},
			{Label: "llama.cpp", Value: "llamacpp"},
			{Label: "pi", Value: "pi"},
			{Label: "opencode", Value: "opencode"},
		},
		Default:     "openai",
		Description: "Which provider answers chat prompts.",
	})
	cfg.Define(config.Setting{
		Key:         "llm.pi.enabled",
		Group:       "llm",
		Label:       "Pi proxy",
		Type:        config.TypeBool,
		Default:     "false",
		Description: "Enable the pi-harness proxy.",
	})
	cfg.Define(config.Setting{
		Key:         "llm.pi.url",
		Group:       "llm",
		Label:       "Pi URL",
		Type:        config.TypeString,
		Default:     "http://127.0.0.1:8080",
		Description: "Base URL of the pi-harness server.",
	})
	cfg.Define(config.Setting{
		Key:         "llm.llamacpp.url",
		Group:       "llm",
		Label:       "llama.cpp URL",
		Type:        config.TypeString,
		Default:     "http://127.0.0.1:8080/v1",
		Description: "Base URL of the local llama-server (OpenAI-compatible).",
	})
	cfg.Define(config.Setting{
		Key:         "llm.openai.url",
		Group:       "llm",
		Label:       "OpenAI-compatible URL",
		Type:        config.TypeString,
		Default:     "http://localhost:20128/v1",
		Description: "Base URL of the OpenAI-compatible endpoint.",
	})
	cfg.Define(config.Setting{
		Key:         "llm.openai.model",
		Group:       "llm",
		Label:       "OpenAI model",
		Type:        config.TypeString,
		Default:     DefaultOpenAIModel,
		Description: "Model name to request from the OpenAI-compatible endpoint.",
	})
	cfg.Define(config.Setting{
		Key:         "llm.openai.apiKey",
		Group:       "llm",
		Label:       "OpenAI API key",
		Type:        config.TypeString,
		Default:     "",
		Description: "API key for the OpenAI-compatible endpoint. The VEE_OPENAI_API_KEY environment variable takes precedence.",
	})
}

// WatchSettings reacts to llm.* setting changes: switches the active backend,
// keeps the pi proxy pointed at llm.pi.url, and mirrors the llamacpp base URL.
func (m *Manager) WatchSettings(cfg *config.Store) {
	if m.bus == nil || cfg == nil {
		return
	}
	m.bus.Subscribe("settings.changed.llm.backend", func(msg bus.Msg) {
		name, _ := msg.Payload.(string)
		if name == "" {
			return
		}
		if err := m.SetBackend(name); err != nil && m.notify != nil {
			m.notify.Warn("LLM", err.Error())
		}
	})
	m.bus.Subscribe("settings.changed.llm.pi.url", func(msg bus.Msg) {
		u, _ := msg.Payload.(string)
		if u == "" {
			return
		}
		if pi := m.Pi(); pi != nil {
			pi.SetBaseURL(u)
		}
	})
	m.bus.Subscribe("settings.changed.llm.llamacpp.url", func(msg bus.Msg) {
		u, _ := msg.Payload.(string)
		if u == "" {
			return
		}
		m.mu.Lock()
		b := m.backends["llamacpp"]
		m.mu.Unlock()
		if lc, ok := b.(*LlamaCppBackend); ok {
			lc.SetBaseURL(u)
		}
	})
	m.bus.Subscribe("settings.changed.llm.openai.url", func(msg bus.Msg) {
		u, _ := msg.Payload.(string)
		if u == "" {
			return
		}
		if oa := m.OpenAI(); oa != nil {
			oa.SetBaseURL(u)
		}
	})
	m.bus.Subscribe("settings.changed.llm.openai.apiKey", func(msg bus.Msg) {
		k, _ := msg.Payload.(string)
		// The environment variable always wins over the persisted setting.
		if env := os.Getenv("VEE_OPENAI_API_KEY"); env != "" {
			k = env
		}
		if oa := m.OpenAI(); oa != nil {
			oa.SetAPIKey(k)
		}
	})
}

// StartPiHealth runs the pi connection watcher: every interval it health-checks
// the pi backend (gated on llm.pi.enabled) and publishes pi.connected /
// pi.disconnected only on edge transitions. A failed check surfaces a toast so
// the user knows pi-harness is unreachable.
func (m *Manager) StartPiHealth(cfg *config.Store, n *notify.Service, interval time.Duration) {
	if m.bus == nil || cfg == nil {
		return
	}
	if interval <= 0 {
		interval = 10 * time.Second
	}
	go func() {
		last := false
		first := true
		for {
			time.Sleep(interval)
			if !cfg.Bool("llm.pi.enabled") {
				continue
			}
			pi := m.Pi()
			if pi == nil {
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			ok := pi.Health(ctx)
			cancel()
			if ok != last || first {
				if ok {
					m.bus.Publish("pi.connected", map[string]any{})
					if n != nil && !first {
						n.Info("Pi", "pi-harness connected")
					}
				} else {
					m.bus.Publish("pi.disconnected", map[string]any{})
					if n != nil {
						n.Warn("Pi", "pi-harness unreachable — check llm.pi.url and that pi is running")
					}
				}
			}
			last = ok
			first = false
		}
	}()
}
