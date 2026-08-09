package arcade

import (
	"context"
	"strings"
	"sync"
	"time"

	"vee/internal/bus"
)

// NerdVoice is implemented by speech.VoiceHost elsewhere; it keeps the arcade
// host decoupled from the speech package (wired in cmd/vee/main.go).
type NerdVoice interface {
	SayAsNerd(text string)
	Listen(ctx context.Context) (string, error)
}

// Host is the "80s nerd" that runs the arcade by voice only: listen for a game,
// match it to the catalog, speak the result, and launch.
type Host struct {
	Voice   NerdVoice
	Bus     *bus.Bus
	Catalog *Catalog
	Log     func(format string, args ...any)

	mu       sync.Mutex
	listening bool
}

// Start subscribes to arcade.games.request and runs the voice loop on demand.
func (h *Host) Start() {
	if h.Bus == nil {
		return
	}
	h.Bus.Subscribe("arcade.games.request", func(m bus.Msg) {
		go h.voiceLoop()
	})
}

// voiceLoop conducts the STT→LLM→TTS interaction, capped at a few tries.
func (h *Host) voiceLoop() {
	h.mu.Lock()
	if h.listening {
		h.mu.Unlock()
		return
	}
	h.listening = true
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		h.listening = false
		h.mu.Unlock()
	}()

	if h.Voice == nil {
		return
	}
	h.say("THE ARCADE IS OPEN. SPEAK THE NAME OF A GAME, CHAMP.")
	for try := 0; try < 3; try++ {
		text, err := h.Voice.Listen(context.Background())
		if err != nil || strings.TrimSpace(text) == "" {
			h.say("STATIC. TRY AGAIN.")
			continue
		}
		game, ok := h.matchGame(text)
		if !ok {
			h.say(randomOneLiner())
			continue
		}
		h.say("LOADING " + strings.ToUpper(game.Title) + ". GOOD LUCK.")
		h.Bus.Publish("arcade.launch", map[string]any{"gameId": game.ID})
		return
	}
	h.say("NOBODY INSERTED A COIN. POWERING DOWN.")
}

func (h *Host) matchGame(text string) (Game, bool) {
	if h.Catalog == nil {
		return Game{}, false
	}
	t := strings.ToLower(strings.TrimSpace(text))
	for _, g := range h.Catalog.List() {
		if strings.Contains(strings.ToLower(g.Title), t) {
			return g, true
		}
		if strings.Contains(t, strings.ToLower(g.Title)) {
			return g, true
		}
	}
	return Game{}, false
}

func (h *Host) say(text string) {
	h.Bus.Publish("arcade.nerd.said", map[string]string{"text": text})
	if h.Log != nil {
		h.Log("%s", text)
	}
	h.Voice.SayAsNerd(text)
}

// NerdOneLiners returns cheesy 80s arcade phrases for the host's personality.
func NerdOneLiners() []string {
	return []string{
		"INSERT COIN TO CONTINUE.",
		"THE NIGHT ARCADE NEVER SLEEPS.",
		"PRESS START, CHAMP.",
		"HIGH SCORE. LOW SELF-ESTEEM. THAT'S THE ARCADE.",
		"I'VE BEEN BEATING GAMES SINCE BEFORE YOU WERE BORN.",
		"CONTINUE? 10, 9, 8, 7, 6...",
		"YOU GOT THE HANDS, KID. NOW GET THE DOTS.",
		"MY CRT HAS SEEN MORE ACTION THAN YOU, PAL.",
	}
}

func randomOneLiner() string {
	lines := NerdOneLiners()
	// deterministic-ish pick so it is testable
	return lines[int(time.Now().UnixNano())%len(lines)]
}
