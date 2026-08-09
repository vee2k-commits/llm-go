package speech

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"sync/atomic"
)

// EspeakTTS synthesizes speech with espeak-ng. It is the character voice of the
// desktop (the 80s arcade nerd): lightweight, immediate, and great for a
// high-pitch fast one-liner.
type EspeakTTS struct {
	Voice   string
	Pitch   int
	Rate    int
	Variant string // e.g. "+m3" — appended to the voice selector

	mu  sync.Mutex
	seq atomic.Int64
}

// NewEspeakTTS builds an espeak-ng TTS with the default voice/pitch/rate.
func NewEspeakTTS() *EspeakTTS {
	return &EspeakTTS{Voice: "en-us", Pitch: 50, Rate: 175}
}

// Name implements TTS.
func (e *EspeakTTS) Name() string { return "espeak" }

// Available reports whether the espeak-ng binary is on PATH.
func (e *EspeakTTS) Available() bool {
	_, err := exec.LookPath("espeak-ng")
	return err == nil
}

// Speak renders text with espeak-ng and plays the result. It prefers writing a
// WAV and playing it through aplay for prompt-less, exactly-once output; if
// aplay is missing it falls back to letting espeak-ng speak directly.
func (e *EspeakTTS) Speak(ctx context.Context, text string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	voice := e.Voice
	if voice == "" {
		voice = "en-us"
	}
	if e.Variant != "" {
		voice += e.Variant
	}
	pitch := e.Pitch
	if pitch == 0 {
		pitch = 50
	}
	rate := e.Rate
	if rate == 0 {
		rate = 175
	}

	if _, err := exec.LookPath("aplay"); err != nil {
		// No player available: let espeak-ng speak straight to the audio device.
		cmd := exec.CommandContext(ctx, "espeak-ng",
			"-v", voice, "-p", fmt.Sprint(pitch), "-s", fmt.Sprint(rate), text)
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}

	path := fmt.Sprintf("%s/vee_tts_%d.wav", os.TempDir(), e.seq.Add(1))
	defer os.Remove(path)

	args := []string{"-v", voice, "-p", fmt.Sprint(pitch), "-s", fmt.Sprint(rate),
		"-w", path, text}
	cmd := exec.CommandContext(ctx, "espeak-ng", args...)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("espeak: %w", err)
	}
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("espeak: no audio produced: %w", err)
	}
	return playWAVFile(path)
}
