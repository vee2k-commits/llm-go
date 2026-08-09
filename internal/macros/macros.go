// Package macros implements Vee's command macros: reusable sequences of bus
// messages triggered by voice or chat text.
package macros

import (
	"fmt"
	"strings"

	"vee/internal/bus"
	"vee/internal/notify"
	"vee/internal/registry"
)

// Step is one bus message inside a macro.
type Step struct {
	Action string         `json:"action"`
	Args   map[string]any `json:"args,omitempty"`
}

// Macro is a named, triggerable sequence of steps.
type Macro struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Trigger     string `json:"trigger"`
	Description string `json:"description"`
	Steps       []Step `json:"steps"`
}

// Engine runs macros and registers them as registry commands.
type Engine struct {
	Bus    *bus.Bus
	Reg    *registry.Registry
	Notify *notify.Service
	macros map[string]Macro
}

// NewEngine builds an Engine bound to the bus, registry and notifier. It also
// subscribes to the `macro.run` command so the API and chat can trigger macros.
func NewEngine(b *bus.Bus, reg *registry.Registry, n *notify.Service) *Engine {
	e := &Engine{
		Bus:    b,
		Reg:    reg,
		Notify: n,
		macros: map[string]Macro{},
	}
	if b != nil {
		b.Subscribe("macro.run", func(msg bus.Msg) {
			p, _ := msg.Payload.(map[string]any)
			id, _ := p["id"].(string)
			if id == "" {
				return
			}
			if err := e.Run(id); err != nil && e.Notify != nil {
				e.Notify.Errorf("Macro", "%v", err)
			}
		})
	}
	return e
}

// Register validates and stores a macro, then exposes it as a registry command.
func (e *Engine) Register(m Macro) error {
	if m.ID == "" {
		return fmt.Errorf("macro needs an id")
	}
	if len(m.Steps) == 0 {
		return fmt.Errorf("macro %q needs at least one step", m.ID)
	}
	e.macros[m.ID] = m
	return e.Reg.Register(registry.Entry{
		ID:          "macro." + m.ID,
		Kind:        registry.Command,
		Name:        m.Name,
		Description: m.Description,
		Meta: map[string]any{
			"trigger": m.Trigger,
			"steps":   m.Steps,
		},
	})
}

// Run executes a macro's steps on the bus, wrapping them in started/finished.
func (e *Engine) Run(id string) error {
	m, ok := e.macros[id]
	if !ok {
		return fmt.Errorf("macro %q not found", id)
	}
	e.Bus.Publish("macro.started", map[string]any{"id": id})
	for _, s := range m.Steps {
		e.Bus.Publish(s.Action, s.Args)
	}
	e.Bus.Publish("macro.finished", map[string]any{"id": id, "steps": len(m.Steps)})
	return nil
}

// Match returns the id of the first macro whose trigger matches text
// case-insensitively, either exactly or as a substring.
func (e *Engine) Match(text string) string {
	lower := strings.ToLower(strings.TrimSpace(text))
	for _, m := range e.macros {
		tr := strings.ToLower(m.Trigger)
		if tr != "" && (tr == lower || strings.Contains(lower, tr)) {
			return m.ID
		}
	}
	return ""
}

// SeedDefaultMacros registers Vee's built-in macros.
func (e *Engine) SeedDefaultMacros() {
	defaults := []Macro{
		{
			ID:          "funny-animals",
			Name:        "Funny Animals",
			Trigger:     "funny animals",
			Description: "Queue funny animal videos and chat about them.",
			Steps: []Step{
				{Action: "audio.queueSearch", Args: map[string]any{"query": "funny animals compilation", "n": 5}},
				{Action: "llm.prompt", Args: map[string]any{"content": "Tell me one fun fact about each animal in the queue."}},
			},
		},
		{
			ID:          "cyberwave",
			Name:        "Cyberwave",
			Trigger:     "cyberwave",
			Description: "Spin up Groove Salad and set the mood.",
			Steps: []Step{
				{Action: "audio.play", Args: map[string]any{"uri": "https://somafm.com/groovesalad130.pls", "title": "Groove Salad"}},
			},
		},
		{
			ID:          "focus",
			Name:        "Focus",
			Trigger:     "focus",
			Description: "Lock the arcade and drop a focus toast.",
			Steps: []Step{
				{Action: "screensaver.toggle", Args: map[string]any{}},
				{Action: "notify.push", Args: map[string]any{"title": "Focus", "body": "Arcade locked"}},
			},
		},
		{
			ID:          "goodbye-vee",
			Name:        "Goodbye Vee",
			Trigger:     "goodbye",
			Description: "Say goodbye to Vee.",
			Steps: []Step{
				{Action: "notify.push", Args: map[string]any{"title": "Vee", "body": "See you, champ."}},
			},
		},
	}
	for _, m := range defaults {
		_ = e.Register(m)
	}
}
