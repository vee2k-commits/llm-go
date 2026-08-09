// Package config is Vee's settings engine: typed, schema'd, persisted knobs.
// Every knob is a registry `setting` entry; changing one publishes
// settings.changed so lexicon/theme re-derive and the browser updates live.
package config

import (
	"context"
	"encoding/json"
	"sort"
	"strconv"
	"strings"
	"sync"

	"vee/internal/bus"
	"vee/internal/db"
	"vee/internal/registry"
)

// Type of a setting value.
type Type string

const (
	TypeString Type = "string"
	TypeBool   Type = "bool"
	TypeNumber Type = "number"
	TypeSelect Type = "select"
)

// Option is one choice for TypeSelect.
type Option struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// Setting is the schema + current value of one knob.
type Setting struct {
	Key         string   `json:"key"`
	Group       string   `json:"group"`
	Label       string   `json:"label"`
	Type        Type     `json:"type"`
	Default     string   `json:"default"`
	Value       string   `json:"value"`
	Options     []Option `json:"options,omitempty"`
	Min         float64  `json:"min,omitempty"`
	Max         float64  `json:"max,omitempty"`
	Description string   `json:"description"`
}

// Store holds setting values. Values come from defaults (registry) then
// overrides (sqlite).
type Store struct {
	mu    sync.RWMutex
	bus   *bus.Bus
	db    *db.DB
	specs map[string]Setting // full schema
	vals  map[string]string  // effective values (default or override)
	// orderedByGroup for the settings UI
	groups []string
}

// New builds a Store. base lists default Setting specs (usually from the
// registry); persisted overrides are layered on top.
func New(ctx context.Context, b *bus.Bus, database *db.DB, base []Setting) (*Store, error) {
	s := &Store{
		bus:   b,
		db:    database,
		specs: map[string]Setting{},
		vals:  map[string]string{},
	}
	for _, sp := range base {
		if sp.Label == "" {
			sp.Label = sp.Key
		}
		if sp.Type == "" {
			sp.Type = TypeString
		}
		s.specs[sp.Key] = sp
		s.vals[sp.Key] = sp.Default
		if !contains(s.groups, sp.Group) {
			s.groups = append(s.groups, sp.Group)
		}
	}
	if database != nil {
		overrides, err := database.SettingsAll(ctx)
		if err != nil {
			return nil, err
		}
		for k, v := range overrides {
			if _, ok := s.specs[k]; ok {
				s.vals[k] = v
			}
		}
	}
	sort.Strings(s.groups)
	return s, nil
}

// AddSpec registers a runtime setting schema (used by modules).
func (s *Store) AddSpec(sp Setting) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sp.Label == "" {
		sp.Label = sp.Key
	}
	if sp.Type == "" {
		sp.Type = TypeString
	}
	s.specs[sp.Key] = sp
	if _, ok := s.vals[sp.Key]; !ok {
		s.vals[sp.Key] = sp.Default
	}
	if !contains(s.groups, sp.Group) {
		s.groups = append(s.groups, sp.Group)
		sort.Strings(s.groups)
	}
}

// Define registers a spec AND persists its current value if unset. Returns the
// spec so callers can chain.
func (s *Store) Define(sp Setting) Setting {
	s.AddSpec(sp)
	return sp
}

// Get returns the raw string value of a key (default or override).
func (s *Store) Get(key string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if v, ok := s.vals[key]; ok {
		return v
	}
	return ""
}

// Persisted returns the raw persisted (sqlite) override for a key, bypassing
// the in-memory schema. Useful for knobs whose spec is registered after New
// (overrides are normally only loaded for specs known at construction).
func (s *Store) Persisted(key string) string {
	if s.db == nil {
		return ""
	}
	all, err := s.db.SettingsAll(context.Background())
	if err != nil {
		return ""
	}
	return all[key]
}

// GetDefault returns the schema default.
func (s *Store) GetDefault(key string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if sp, ok := s.specs[key]; ok {
		return sp.Default
	}
	return ""
}

// Bool / Number typed accessors.
func (s *Store) Bool(key string) bool {
	v := strings.ToLower(s.Get(key))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func (s *Store) Number(key string) float64 {
	v, _ := strconv.ParseFloat(s.Get(key), 64)
	return v
}

// Set persists a value and publishes settings.changed (+ a per-key topic).
func (s *Store) Set(key, value string) error {
	s.mu.Lock()
	if _, ok := s.specs[key]; !ok {
		s.mu.Unlock()
		return nil // unknown knob: ignore
	}
	s.vals[key] = value
	s.mu.Unlock()

	if s.db != nil {
		if err := s.db.SettingSet(context.Background(), key, value); err != nil {
			return err
		}
	}
	if s.bus != nil {
		s.bus.Publish("settings.changed", map[string]string{"key": key, "value": value})
		s.bus.Publish("settings.changed."+key, value)
		s.bus.Publish("state.settings", s.All())
	}
	return nil
}

// SetAny converts a native value to its string form.
func (s *Store) SetAny(key string, v any) error {
	var str string
	switch t := v.(type) {
	case string:
		str = t
	case bool:
		str = strconv.FormatBool(t)
	case float64:
		str = strconv.FormatFloat(t, 'f', -1, 64)
	case int:
		str = strconv.Itoa(t)
	default:
		b, _ := json.Marshal(t)
		str = string(b)
	}
	return s.Set(key, str)
}

// All returns a snapshot of all effective values.
func (s *Store) All() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]string, len(s.vals))
	for k, v := range s.vals {
		out[k] = v
	}
	return out
}

// Spec returns the schema for a key.
func (s *Store) Spec(key string) (Setting, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sp, ok := s.specs[key]
	return sp, ok
}

// Schema returns all specs grouped, for the settings UI.
func (s *Store) Schema() []Setting {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Setting, 0, len(s.specs))
	for _, k := range sortedKeys(s.specs) {
		sp := s.specs[k]
		sp.Value = s.vals[k]
		out = append(out, sp)
	}
	return out
}

// Groups lists group names in order.
func (s *Store) Groups() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string{}, s.groups...)
}

// AsRegistryEntries materializes current specs as registry setting entries.
func (s *Store) AsRegistryEntries() []registry.Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]registry.Entry, 0, len(s.specs))
	for _, k := range sortedKeys(s.specs) {
		sp := s.specs[k]
		out = append(out, registry.Entry{
			ID:   sp.Key,
			Kind: registry.Setting,
			Name: sp.Label,
			Meta: map[string]any{"group": sp.Group, "type": string(sp.Type),
				"value": s.vals[k], "default": sp.Default, "options": sp.Options,
				"min": sp.Min, "max": sp.Max, "description": sp.Description},
		})
	}
	return out
}

func sortedKeys(m map[string]Setting) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
