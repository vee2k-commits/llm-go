// Package speech owns Vee's voice loop: speech-to-text (Whisper), text-to-speech
// (piper for a natural host voice, espeak-ng for the 80s-nerd character voice),
// and the bus wiring that turns commands into spoken or transcribed events.
//
// The one rule of the architecture: every component talks to the world only
// through the event bus and the registry. This package publishes `tts.spoken`
// and `stt.utterance`, subscribes to the `tts.speak` command, and defines the
// `speech.*` settings knobs.
package speech

import (
	"context"
	"fmt"
	"math/rand"
	"sync"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/notify"
)

// STT transcribes audio (a 16 kHz mono PCM WAV) into text.
type STT interface {
	Name() string
	Available() bool
	Transcribe(ctx context.Context, wav []byte) (string, error)
}

// TTS speaks a string out loud.
type TTS interface {
	Name() string
	Available() bool
	Speak(ctx context.Context, text string) error
}

// Personality holds the character knobs that flavor a VoiceHost's speech.
// The arcade host uses an 80s-nerd personality with high pitch/rate and a
// library of one-liners.
type Personality struct {
	Voice       string
	Pitch, Rate int
	OneLiners   []string
}

// VoiceHost combines an STT, a TTS, the event bus, and a Personality. It is the
// tiny unit of speech used both by the desktop speech manager and by the arcade
// nerd host.
type VoiceHost struct {
	STT STT
	TTS TTS
	Bus *bus.Bus
	Personality
}

// Say speaks text via the configured TTS and announces it on `tts.spoken`.
func (h *VoiceHost) Say(text string) {
	if h.TTS == nil || !h.TTS.Available() || text == "" {
		return
	}
	if err := h.TTS.Speak(context.Background(), text); err != nil {
		if h.Bus != nil {
			h.Bus.Publish("notify.push", map[string]any{
				"level": "error", "title": "TTS failed", "body": err.Error(),
			})
		}
		return
	}
	if h.Bus != nil {
		h.Bus.Publish("tts.spoken", map[string]any{
			"text": text, "voice": h.Personality.Voice,
		})
	}
}

// SayAsNerd speaks text with the 80s-nerd character voice (espeak, high pitch,
// fast rate, nasal-ish m3 variant) regardless of the host TTS configured on the
// host. The nerd is espeak-only by design.
func (h *VoiceHost) SayAsNerd(text string) {
	es := NewEspeakTTS()
	es.Voice = "en-us"
	es.Pitch = 60
	es.Rate = 165
	es.Variant = "+m3"
	if err := es.Speak(context.Background(), text); err != nil {
		if h.Bus != nil {
			h.Bus.Publish("notify.push", map[string]any{
				"level": "warn", "title": "nerd voice", "body": err.Error(),
			})
		}
		return
	}
	if h.Bus != nil {
		h.Bus.Publish("tts.spoken", map[string]any{
			"text": text, "voice": "en-us+m3",
		})
	}
}

// Listen captures microphone audio to a short WAV, transcribes it with the
// STT, and announces the result on `stt.utterance`.
func (h *VoiceHost) Listen(ctx context.Context) (string, error) {
	if h.STT == nil {
		return "", fmt.Errorf("speech: no STT configured")
	}
	wav, err := RecordWAV(ctx, 5)
	if err != nil {
		return "", err
	}
	text, err := h.STT.Transcribe(ctx, wav)
	if err != nil {
		return "", err
	}
	if h.Bus != nil {
		h.Bus.Publish("stt.utterance", map[string]any{"text": text})
	}
	return text, nil
}

// NerdIntro returns a random 80s one-liner from the personality library.
func (h *VoiceHost) NerdIntro() string {
	if len(h.OneLiners) == 0 {
		return "INSERT COIN TO CONTINUE"
	}
	return h.OneLiners[rand.Intn(len(h.OneLiners))]
}

// CharacterNerd returns a Personality preset for the 80s arcade nerd, including
// a set of voiced one-liners.
func CharacterNerd(v string) Personality {
	return Personality{
		Voice: v,
		Pitch: 60,
		Rate:  165,
		OneLiners: []string{
			"INSERT COIN TO CONTINUE",
			"THE NIGHT ARCADE NEVER SLEEPS",
			"PRESS START, CHAMP",
			"HIGH SCORE GUYS, HIGH SCORE",
			"CANDYCRUSH IS FOR THE WEAK, KID",
		},
	}
}

// Manager wires the speech module into the bus: it listens for `tts.speak`
// commands and owns the VoiceHost used by the rest of the desktop.
type Manager struct {
	MU     sync.Mutex
	STT    STT
	TTS    TTS
	Host   *VoiceHost
	Bus    *bus.Bus
	Notify *notify.Service
	unsub  func()
}

// NewManager builds a speech Manager around a host and service.
func NewManager(b *bus.Bus, host *VoiceHost, notifySvc *notify.Service) *Manager {
	return &Manager{Bus: b, Host: host, Notify: notifySvc}
}

// Start subscribes to the `tts.speak` command topic and the `stt.listen`
// command topic. Safe to call more than once (unsubscribes the prior handlers
// first).
func (m *Manager) Start() {
	if m.unsub != nil {
		m.unsub()
		m.unsub = nil
	}
	m.unsub = m.Bus.Subscribe("tts.speak", func(msg bus.Msg) {
		payload, _ := msg.Payload.(map[string]any)
		text, _ := payload["text"].(string)
		if text == "" {
			return
		}
		if voice, _ := payload["voice"].(string); voice != "" && m.Host != nil && m.Host.Personality.Voice != voice {
			m.Host.Personality.Voice = voice
		}
		if err := m.Speak(context.Background(), text); err != nil {
			m.Notify.Error("tts", err.Error())
		}
	})
	m.Bus.Subscribe("stt.listen", func(_ bus.Msg) {
		go func() {
			if m.Host == nil || m.Host.STT == nil {
				if m.Notify != nil {
					m.Notify.Warn("Speech", "no STT configured")
				}
				return
			}
			text, err := m.Host.Listen(context.Background())
			if err != nil {
				if m.Notify != nil {
					m.Notify.Errorf("Speech", "listen failed: %v", err)
				}
				return
			}
			if text != "" && m.Notify != nil {
				m.Notify.Info("You said", text)
			}
		}()
	})
}

// Stop cancels the tts.speak subscription.
func (m *Manager) Stop() {
	if m.unsub != nil {
		m.unsub()
		m.unsub = nil
	}
}

// SetSTT swaps the transcription engine.
func (m *Manager) SetSTT(s STT) {
	m.MU.Lock()
	defer m.MU.Unlock()
	m.STT = s
	if m.Host != nil {
		m.Host.STT = s
	}
}

// SetTTS swaps the speech synthesis engine.
func (m *Manager) SetTTS(t TTS) {
	m.MU.Lock()
	defer m.MU.Unlock()
	m.TTS = t
	if m.Host != nil {
		m.Host.TTS = t
	}
}

// Transcribe routes a WAV through the current STT.
func (m *Manager) Transcribe(ctx context.Context, wav []byte) (string, error) {
	m.MU.Lock()
	s := m.STT
	m.MU.Unlock()
	if s == nil {
		return "", fmt.Errorf("speech: no STT configured")
	}
	return s.Transcribe(ctx, wav)
}

// Speak routes text through the current TTS.
func (m *Manager) Speak(ctx context.Context, text string) error {
	m.MU.Lock()
	t := m.TTS
	m.MU.Unlock()
	if t == nil {
		return fmt.Errorf("speech: no TTS configured")
	}
	return t.Speak(ctx, text)
}

// DefineSettings registers the speech settings schema with the config store.
func DefineSettings(cfg *config.Store) {
	cfg.Define(config.Setting{
		Key: "speech.stt.enabled", Group: "speech", Label: "Speech-to-text",
		Type: config.TypeBool, Default: "true",
		Description: "Enable voice transcription.",
	})
	cfg.Define(config.Setting{
		Key: "speech.tts.enabled", Group: "speech", Label: "Text-to-speech",
		Type: config.TypeBool, Default: "true",
		Description: "Enable voice synthesis.",
	})
	cfg.Define(config.Setting{
		Key: "speech.tts.engine", Group: "speech", Label: "TTS engine",
		Type: config.TypeSelect, Default: "espeak",
		Options: []config.Option{
			{Label: "piper", Value: "piper"},
			{Label: "espeak", Value: "espeak"},
		},
		Description: "Natural voice (piper) or lightweight espeak-ng.",
	})
	cfg.Define(config.Setting{
		Key: "speech.nerd.pitch", Group: "speech", Label: "Nerd pitch",
		Type: config.TypeNumber, Default: "60", Min: 0, Max: 99,
		Description: "Character voice pitch.",
	})
	cfg.Define(config.Setting{
		Key: "speech.nerd.rate", Group: "speech", Label: "Nerd rate",
		Type: config.TypeNumber, Default: "165", Min: 80, Max: 320,
		Description: "Character voice words-per-minute.",
	})
}
