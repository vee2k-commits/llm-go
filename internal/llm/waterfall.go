package llm

import (
	"encoding/json"
	"sync"

	"vee/internal/config"
)

// Tier names used by the waterfall.
const (
	TierFree  = "free"
	TierCheap = "cheap"
	TierPro   = "pro"
)

// Tier is an ordered list of fallback models for one cost tier.
type Tier struct {
	Name   string   `json:"name"`
	Models []string `json:"models"`
}

// ModelRouter is the "free usage waterfall". It starts on the cheapest tier
// (free OpenRouter models), advances within a tier on failure (rate limits),
// and escalates across tiers (free -> cheap -> pro) when free models keep
// failing. It is fully settings-driven, so the user can edit the whole ladder.
type ModelRouter struct {
	mu     sync.Mutex
	cfg    *config.Store
	tiers  []Tier
	byName map[string]*Tier
	cursor map[string]int // tier name -> index of next model to try
	active string         // current tier
}

// DefaultWaterfall is the initial ladder. Free first; escalate on failure.
var DefaultWaterfall = []Tier{
	{
		Name: TierFree,
		Models: []string{
			"deepseek/deepseek-chat-v3-0324:free",
			"google/gemma-3-27b-it:free",
			"meta-llama/llama-3.3-70b-instruct:free",
		},
	},
	{
		Name: TierCheap,
		Models: []string{
			"deepseek/deepseek-chat-v3-0324",
			"qwen/qwen-2.5-72b-instruct",
		},
	},
	{
		Name: TierPro,
		Models: []string{
			"anthropic/claude-sonnet-4.5",
			"openai/gpt-4.1",
		},
	},
}

// NewModelRouter loads the ladder from settings (key llm.waterfall) or uses
// the default. The active tier comes from llm.waterfall.tier. It defines both
// settings so they are always persisted/editable even if the host app never
// registered them.
func NewModelRouter(cfg *config.Store) *ModelRouter {
	cfg.Define(config.Setting{
		Key:     "llm.waterfall",
		Group:   "LLM",
		Label:   "Waterfall ladder",
		Type:    config.TypeString,
		Default: "",
		Description: "JSON array of tiers: [{\"name\":\"free\",\"models\":[...]}]",
	})
	cfg.Define(config.Setting{
		Key:     "llm.waterfall.tier",
		Group:   "LLM",
		Label:   "Active tier",
		Type:    config.TypeSelect,
		Default: TierFree,
		Options: []config.Option{
			{Label: "Free", Value: TierFree},
			{Label: "Cheap", Value: TierCheap},
			{Label: "Pro", Value: TierPro},
		},
		Description: "Current usage tier; escalates automatically on failure.",
	})
	r := &ModelRouter{
		cfg:    cfg,
		byName: map[string]*Tier{},
		cursor: map[string]int{},
	}
	r.load()
	return r
}

func (r *ModelRouter) load() {
	r.tiers = nil
	for k := range r.byName {
		delete(r.byName, k)
	}
	raw := r.cfg.Get("llm.waterfall")
	if raw != "" {
		var tiers []Tier
		if err := json.Unmarshal([]byte(raw), &tiers); err == nil && len(tiers) > 0 {
			r.tiers = tiers
		}
	}
	if len(r.tiers) == 0 {
		r.tiers = DefaultWaterfall
	}
	for i := range r.tiers {
		t := r.tiers[i]
		if t.Name == "" {
			t.Name = TierFree
		}
		r.byName[t.Name] = &r.tiers[i]
		if _, ok := r.cursor[t.Name]; !ok {
			r.cursor[t.Name] = 0
		}
	}
	r.active = r.cfg.Get("llm.waterfall.tier")
	if _, ok := r.byName[r.active]; !ok {
		r.active = r.tiers[0].Name
	}
}

// Tier returns the current tier name.
func (r *ModelRouter) Tier() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.active
}

// SetTier switches the active tier (free/cheap/pro) and publishes state.
func (r *ModelRouter) SetTier(name string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.byName[name]; !ok {
		return false
	}
	r.active = name
	_ = r.cfg.Set("llm.waterfall.tier", name)
	return true
}

// Current returns the model to use right now in the active tier.
func (r *ModelRouter) Current() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	t := r.byName[r.active]
	if t == nil || len(t.Models) == 0 {
		return ""
	}
	idx := r.cursor[r.active] % len(t.Models)
	return t.Models[idx]
}

// IsFree reports whether the current model is a :free OpenRouter model.
func (r *ModelRouter) IsFree() bool {
	m := r.Current()
	return len(m) >= 5 && m[len(m)-5:] == ":free"
}

// Advance moves to the next model within the active tier. If it wraps around,
// it escalates to the next tier up. Returns the new current model.
func (r *ModelRouter) Advance() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	t := r.byName[r.active]
	if t != nil && len(t.Models) > 0 {
		r.cursor[r.active] = (r.cursor[r.active] + 1) % len(t.Models)
		// If we wrapped, the whole tier is exhausted -> escalate.
		if r.cursor[r.active] == 0 {
			if up := r.nextTier(r.active); up != "" {
				r.active = up
				r.cursor[up] = 0
				_ = r.cfg.Set("llm.waterfall.tier", up)
			}
		}
	}
	// Inline the "current model" read to avoid re-locking Current() (which
	// would deadlock against the lock we already hold).
	t = r.byName[r.active]
	if t == nil || len(t.Models) == 0 {
		return ""
	}
	return t.Models[r.cursor[r.active]%len(t.Models)]
}

// Reset restores the active tier to the cheapest and resets cursors.
func (r *ModelRouter) Reset() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for k := range r.cursor {
		r.cursor[k] = 0
	}
	if len(r.tiers) > 0 {
		r.active = r.tiers[0].Name
	}
	_ = r.cfg.Set("llm.waterfall.tier", r.active)
}

// nextTier returns the name of the tier above `name`, or "".
func (r *ModelRouter) nextTier(name string) string {
	for i, t := range r.tiers {
		if t.Name == name && i+1 < len(r.tiers) {
			return r.tiers[i+1].Name
		}
	}
	return ""
}

// Tiers returns a snapshot for the settings UI.
func (r *ModelRouter) Tiers() []Tier {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]Tier, 0, len(r.tiers))
	for _, t := range r.tiers {
		cp := t
		out = append(out, cp)
	}
	return out
}

// Names returns tier names in escalation order (free -> cheap -> pro).
func (r *ModelRouter) Names() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]string, 0, len(r.tiers))
	for _, t := range r.tiers {
		out = append(out, t.Name)
	}
	return out
}
