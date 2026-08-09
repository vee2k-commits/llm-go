// Package registry is Vee's typed catalog. Everything in the desktop is an
// entry: settings, lexicon strings, themes, commands (macros), tools, skills,
// wizards, games, media sources, LLM providers, display layers, modules.
package registry

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"

	"vee/internal/bus"
	"vee/internal/db"
)

// Kind enumerates the registry catalog.
type Kind string

const (
	Module      Kind = "module"
	Setting     Kind = "setting"
	Lexicon     Kind = "lexicon"
	Theme       Kind = "theme"
	Command     Kind = "command"
	Tool        Kind = "tool"
	Skill       Kind = "skill"
	Wizard      Kind = "wizard"
	Game        Kind = "game"
	MediaSource Kind = "mediasource"
	Provider    Kind = "provider"
	Layer       Kind = "layer"
)

// Status of an entry.
const (
	StatusRegistered = "registered"
	StatusEnabled    = "enabled"
	StatusDisabled   = "disabled"
	StatusFailed     = "failed"
)

// Entry is one catalog item. Hook is an optional in-process callback and is
// never serialized.
type Entry struct {
	ID          string         `json:"id"`
	Kind        Kind           `json:"kind"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Status      string         `json:"status"`
	Weight      int            `json:"weight,omitempty"`
	Meta        map[string]any `json:"meta,omitempty"`
	Hook        func(Event)    `json:"-"`
}

// Event is delivered to an entry's Hook on registry changes it cares about.
type Event struct {
	Type string
	Args map[string]any
}

// Registry is a thread-safe catalog backed by sqlite.
type Registry struct {
	mu      sync.RWMutex
	bus     *bus.Bus
	db      *db.DB
	byID    map[string]*Entry
	byKind  map[Kind][]string
	ordered []string
}

// New loads persisted entries and returns a Registry.
func New(ctx context.Context, b *bus.Bus, database *db.DB) (*Registry, error) {
	r := &Registry{
		bus:    b,
		db:     database,
		byID:   map[string]*Entry{},
		byKind: map[Kind][]string{},
	}
	if database != nil {
		ids, jsons, err := database.RegistryAll(ctx)
		if err != nil {
			return nil, err
		}
		for i, id := range ids {
			var e Entry
			if err := json.Unmarshal([]byte(jsons[i]), &e); err != nil {
				continue
			}
			if e.ID == "" {
				e.ID = id
			}
			r.byID[e.ID] = &e
			r.byKind[e.Kind] = append(r.byKind[e.Kind], e.ID)
			r.ordered = append(r.ordered, e.ID)
		}
		sort.Strings(r.ordered)
	}
	return r, nil
}

// Register adds or replaces an entry and publishes registry.registered.
func (r *Registry) Register(e Entry) error {
	if e.ID == "" {
		return fmt.Errorf("registry entry needs an id")
	}
	if e.Kind == "" {
		return fmt.Errorf("registry entry %q needs a kind", e.ID)
	}
	if e.Status == "" {
		e.Status = StatusEnabled
	}
	// Default display name falls back to the id.
	if e.Name == "" {
		e.Name = e.ID
	}

	r.mu.Lock()
	exists := false
	if _, ok := r.byID[e.ID]; ok {
		exists = true
		old := r.byID[e.ID]
		old.Name, old.Description = e.Name, e.Description
		old.Status, old.Weight = e.Status, e.Weight
		old.Meta, old.Hook = e.Meta, e.Hook
		e = *old
	} else {
		cp := e
		r.byID[e.ID] = &cp
		r.byKind[e.Kind] = append(r.byKind[e.Kind], e.ID)
		r.ordered = append(r.ordered, e.ID)
		sort.Strings(r.ordered)
	}
	r.mu.Unlock()

	if r.db != nil {
		b, _ := json.Marshal(e)
		_ = r.db.RegistrySet(context.Background(), e.ID, string(e.Kind), string(b))
	}

	topic := "registry.registered"
	if exists {
		topic = "registry.updated"
	}
	r.publishState()
	if r.bus != nil {
		r.bus.Publish(topic, e)
	}
	return nil
}

// Unregister removes an entry and publishes registry.removed.
func (r *Registry) Unregister(id string) {
	r.mu.Lock()
	e, ok := r.byID[id]
	if !ok {
		r.mu.Unlock()
		return
	}
	delete(r.byID, id)
	if list := r.byKind[e.Kind]; list != nil {
		for i, x := range list {
			if x == id {
				r.byKind[e.Kind] = append(list[:i], list[i+1:]...)
				break
			}
		}
	}
	for i, x := range r.ordered {
		if x == id {
			r.ordered = append(r.ordered[:i], r.ordered[i+1:]...)
			break
		}
	}
	r.mu.Unlock()

 	if r.db != nil {
 		_ = r.db.RegistryDelete(context.Background(), id)
 	}
 	r.publishState()
 	if r.bus != nil {
 		r.bus.Publish("registry.removed", *e)
 	}
 }

// Get returns a copy of an entry.
func (r *Registry) Get(id string) (Entry, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.byID[id]
	if !ok {
		return Entry{}, false
	}
	return *e, true
}

// List returns entries of a kind (or all if kind == ""), sorted by id.
func (r *Registry) List(kind Kind) []Entry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var ids []string
	if kind == "" {
		ids = append(ids, r.ordered...)
	} else {
		ids = append(ids, r.byKind[kind]...)
	}
	out := make([]Entry, 0, len(ids))
	for _, id := range ids {
		if e, ok := r.byID[id]; ok {
			out = append(out, *e)
		}
	}
	return out
}

// Count returns the number of entries of a kind.
func (r *Registry) Count(kind Kind) int {
	return len(r.List(kind))
}

// SetStatus updates an entry's status and publishes registry.updated.
func (r *Registry) SetStatus(id, status string) {
	r.mu.Lock()
	e, ok := r.byID[id]
	if ok {
		e.Status = status
	}
	r.mu.Unlock()
	if ok && r.db != nil {
		b, _ := json.Marshal(e)
		_ = r.db.RegistrySet(context.Background(), id, string(e.Kind), string(b))
	}
	if ok {
		r.publishState()
		r.bus.Publish("registry.updated", *e)
	}
}

// CallHook invokes an entry's Hook, if any, with an event.
func (r *Registry) CallHook(id string, ev Event) {
	r.mu.RLock()
	e, ok := r.byID[id]
	r.mu.RUnlock()
	if ok && e.Hook != nil {
		e.Hook(ev)
	}
}

// Kind returns the kind of an id, or "".
func (r *Registry) Kind(id string) Kind {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if e, ok := r.byID[id]; ok {
		return e.Kind
	}
	return ""
}

func (r *Registry) publishState() {
	if r.bus == nil {
		return
	}
	for _, k := range []Kind{Module, Setting, Lexicon, Theme, Command, Tool, Skill, Wizard, Game, MediaSource, Provider, Layer} {
		r.bus.Publish("state.registry."+string(k), r.List(k))
	}
}
