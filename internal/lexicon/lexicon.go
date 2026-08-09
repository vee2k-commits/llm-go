// Package lexicon is Vee's word-overlay engine: change or remove any visible
// string. UI elements carry data-lx="key"; the browser substitutes text from
// this store. An empty value means the element is hidden entirely.
package lexicon

import (
	"context"
	"sync"

	"vee/internal/bus"
	"vee/internal/db"
)

// Store holds string overrides plus the base strings it was seeded with.
type Store struct {
	mu        sync.RWMutex
	bus       *bus.Bus
	db        *db.DB
	base      map[string]string // registered defaults (kind=lexicon / module seeds)
	overrides map[string]string // user/LLM overrides (persisted)
}

// New builds a Store. base is the initial string table.
func New(ctx context.Context, b *bus.Bus, database *db.DB, base map[string]string) (*Store, error) {
	s := &Store{
		bus:       b,
		db:        database,
		base:      base,
		overrides: map[string]string{},
	}
	if base == nil {
		s.base = map[string]string{}
	}
	persisted, err := database.LexiconAll(ctx)
	if err != nil {
		return nil, err
	}
	for k, v := range persisted {
		s.overrides[k] = v
	}
	s.PublishState()
	return s, nil
}

// Get returns the effective string for a key. ok=false means unknown.
// value=="" means "remove this element from the UI".
func (s *Store) Get(key string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if v, ok := s.overrides[key]; ok {
		return v, true
	}
	if v, ok := s.base[key]; ok {
		return v, true
	}
	return "", false
}

// All returns the merged table (base + overrides) for the browser.
func (s *Store) All() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]string, len(s.base)+len(s.overrides))
	for k, v := range s.base {
		out[k] = v
	}
	for k, v := range s.overrides {
		out[k] = v // overrides win
	}
	return out
}

// Overrides returns just the user/LLM overrides.
func (s *Store) Overrides() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]string, len(s.overrides))
	for k, v := range s.overrides {
		out[k] = v
	}
	return out
}

// Set overrides a key ("" removes the element from the UI). Persists + publishes.
func (s *Store) Set(key, value string) error {
	s.mu.Lock()
	s.overrides[key] = value
	s.mu.Unlock()
	if s.db != nil {
		if err := s.db.LexiconSet(context.Background(), key, value, "global"); err != nil {
			return err
		}
	}
	s.PublishState()
	s.bus.Publish("lexicon.changed", map[string]string{"key": key, "value": value})
	return nil
}

// Clear removes an override, restoring the base string (if any).
func (s *Store) Clear(key string) error {
	s.mu.Lock()
	delete(s.overrides, key)
	s.mu.Unlock()
	if s.db != nil {
		if err := s.db.LexiconClear(context.Background(), key); err != nil {
			return err
		}
	}
	s.PublishState()
	s.bus.Publish("lexicon.changed", map[string]string{"key": key, "value": s.base[key]})
	return nil
}

// SeedBase merges additional base strings (used by modules at init).
func (s *Store) SeedBase(extra map[string]string) {
	s.mu.Lock()
	for k, v := range extra {
		s.base[k] = v
	}
	s.mu.Unlock()
	s.PublishState()
}

// PublishState broadcasts the full merged table on state.lexicon.
func (s *Store) PublishState() {
	s.bus.Publish("state.lexicon", s.All())
}
