// Package wizards hosts Vee's creative-suite pipelines: comic book, cartoon,
// character, game creation. Each wizard is an LLM-driven, jovial, beginner-first
// guided dialog that runs entirely through the bus (it never imports llm).
package wizards

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"vee/internal/bus"
	"vee/internal/notify"
	"vee/internal/registry"
)

// Question is one step in a wizard's guided dialog.
type Question struct {
	Key     string   `json:"key"`
	Prompt  string   `json:"prompt"`
	Kind    string   `json:"kind"` // text | select | yesno
	Options []string `json:"options,omitempty"`
}

// WizardSpec is a registered creative-suite pipeline.
type WizardSpec struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Target    string     `json:"target"` // comic | cartoon | character | game | blender | design
	Persona   string     `json:"persona"`
	Questions []Question `json:"questions"`
	Script    string     `json:"script"`
}

// Runner drives wizard dialogs over the bus.
type Runner struct {
	Bus    *bus.Bus
	Reg    *registry.Registry
	Notify *notify.Service

	mu sync.Mutex
	// idx tracks how many questions have been asked per session.
	idx map[string]int
}

// NewRunner builds a Runner.
func NewRunner(b *bus.Bus, reg *registry.Registry, n *notify.Service) *Runner {
	r := &Runner{Bus: b, Reg: reg, Notify: n, idx: map[string]int{}}
	return r
}

// Start subscribes to chat.ended (advance wizard) and wizard.start (begin a
// wizard from the API or chat).
func (r *Runner) Start() {
	if r.Bus == nil {
		return
	}
	r.Bus.Subscribe("wizard.start", func(m bus.Msg) {
		p, _ := m.Payload.(map[string]any)
		id, _ := p["id"].(string)
		sid, _ := p["sessionId"].(string)
		if id == "" {
			return
		}
		if err := r.StartWizard(id, sid); err != nil && r.Notify != nil {
			r.Notify.Errorf("Wizard", "%v", err)
		}
	})
	r.Bus.Subscribe("chat.ended", func(m bus.Msg) {
		if p, ok := m.Payload.(map[string]string); ok {
			if sid := p["sessionId"]; sid != "" {
				r.Bus.Publish("wizard.step.complete", map[string]any{"sessionId": sid})
			}
		}
	})
}

// Register adds a wizard to the registry (kind=wizard).
func (r *Runner) Register(spec WizardSpec) error {
	if spec.ID == "" {
		return fmt.Errorf("wizard needs an id")
	}
	if spec.Persona == "" {
		spec.Persona = "You are a warm, encouraging coach."
	}
	meta, _ := json.Marshal(spec)
	return r.Reg.Register(registry.Entry{
		ID:          spec.ID,
		Kind:        registry.Wizard,
		Name:        spec.Title,
		Description: spec.Target,
		Status:      registry.StatusEnabled,
		Meta:        map[string]any{"spec": string(meta)},
	})
}

// StartWizard begins the dialog: it builds a jovial prompt and hands it to the
// LLM via the llm.prompt bus command.
func (r *Runner) StartWizard(id, sessionID string) error {
	entry, ok := r.Reg.Get(id)
	if !ok || entry.Kind != registry.Wizard {
		return fmt.Errorf("unknown wizard %q", id)
	}
	var spec WizardSpec
	if raw, ok := entry.Meta["spec"].(string); ok {
		_ = json.Unmarshal([]byte(raw), &spec)
	}
	if spec.ID == "" {
		return fmt.Errorf("wizard %q has no spec", id)
	}

	r.mu.Lock()
	r.idx[sessionID] = 0
	r.mu.Unlock()

	r.Bus.Publish("wizard.started", map[string]any{"id": id, "sessionId": sessionID})
	content := r.buildPrompt(spec, sessionID)
	r.Bus.Publish("llm.prompt", map[string]any{"sessionId": sessionID, "content": content})

	if r.Notify != nil {
		r.Notify.Info("Wizard: "+spec.Title, "Let's create something. Answer one question at a time.")
	}
	return nil
}

// Next returns the next unanswered question for a session.
func (r *Runner) Next(sessionID string) (Question, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	// Without a resolved spec we cannot advance; this is a hook for the
	// frontend to page through questions one at a time.
	idx := r.idx[sessionID]
	r.idx[sessionID] = idx + 1
	return Question{}, false
}

func (r *Runner) buildPrompt(spec WizardSpec, sessionID string) string {
	var b strings.Builder
	b.WriteString(spec.Persona)
	b.WriteString("\n\nYou are guiding the user through creating a ")
	b.WriteString(spec.Target)
	b.WriteString(". Celebrate every idea, keep it joyful and beginner-friendly. Ask exactly one question at a time and wait for the answer.\n\n")
	for i, q := range spec.Questions {
		fmt.Fprintf(&b, "Q%d: %s", i+1, q.Prompt)
		if len(q.Options) > 0 {
			fmt.Fprintf(&b, " (options: %s)", strings.Join(q.Options, ", "))
		}
		b.WriteString("\n")
	}
	b.WriteString("\nPipeline script (what to produce when done):\n")
	b.WriteString(spec.Script)
	return b.String()
}

// SeedWizards registers the four starter creative suites.
func (r *Runner) SeedWizards() {
	specs := []WizardSpec{
		{
			ID: "wizard.comic", Title: "Comic Book Maker", Target: "comic",
			Persona: "You are a jovial comic coach who believes everyone has a story worth a 12-page run. Celebrate every idea.",
			Questions: []Question{
				{Key: "hero", Prompt: "Who is your hero? What are their powers or quirks?", Kind: "text"},
				{Key: "villain", Prompt: "Who is the villain, and what do they want?", Kind: "text"},
				{Key: "style", Prompt: "Pick an art style: clean lines, retro pulp, manga, or watercolor?", Kind: "select", Options: []string{"clean", "retro", "manga", "watercolor"}},
				{Key: "tone", Prompt: "Is this a comedy, a drama, or a wild mashup of both?", Kind: "select", Options: []string{"comedy", "drama", "mashup"}},
				{Key: "story", Prompt: "What's the one-sentence hook for issue one?", Kind: "text"},
			},
			Script: "Emit a comic JSON {pages:[{panels:[{caption, art_prompt}]}]} then a stylized HTML/JS canvas prompt the user can render.",
		},
		{
			ID: "wizard.cartoon", Title: "Cartoon Maker", Target: "cartoon",
			Persona: "You are an upbeat cartoon director. Exaggerate everything, especially the joy.",
			Questions: []Question{
				{Key: "character", Prompt: "Who stars in this cartoon?", Kind: "text"},
				{Key: "setting", Prompt: "Where does the mayhem happen?", Kind: "text"},
				{Key: "gag", Prompt: "What is the main gag or catchphrase?", Kind: "text"},
			},
			Script: "Emit a cartoon JSON {scenes:[{setup, punchline, art_prompt}]} plus a CSS/JS animation prompt.",
		},
		{
			ID: "wizard.character", Title: "Character Creator", Target: "character",
			Persona: "You are a character designer who sketches with words. Make every character feel alive.",
			Questions: []Question{
				{Key: "role", Prompt: "What role is this character (hero, sidekick, monster, merchant)?", Kind: "text"},
				{Key: "look", Prompt: "Describe their look: colors, silhouette, signature prop?", Kind: "text"},
				{Key: "voice", Prompt: "How do they talk? Any catchphrase?", Kind: "text"},
				{Key: "game", Prompt: "Are they for a game, an animation, or a comic?", Kind: "select", Options: []string{"game", "animation", "comic"}},
			},
			Script: "Emit a character sheet JSON {name, look, voice, backstory, art_prompt} suitable for concept art and Blender reference.",
		},
		{
			ID: "wizard.game", Title: "Game Maker", Target: "game",
			Persona: "You are a game designer who thinks out loud and makes the player feel like the hero.",
			Questions: []Question{
				{Key: "genre", Prompt: "What kind of game: arcade, puzzle, platformer, or adventure?", Kind: "select", Options: []string{"arcade", "puzzle", "platformer", "adventure"}},
				{Key: "mechanics", Prompt: "What is the one core mechanic that makes it fun?", Kind: "text"},
				{Key: "world", Prompt: "What is the world and its vibe?", Kind: "text"},
				{Key: "scope", Prompt: "Is this a jam-sized prototype or a bigger dream?", Kind: "select", Options: []string{"jam", "prototype", "dream"}},
			},
			Script: "Emit a game spec JSON {genre, mechanics, world, scope} plus a first-sprint task list the user can build with a coding agent.",
		},
	}
	for _, s := range specs {
		_ = r.Register(s)
	}
}
