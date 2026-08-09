//go:build !libvlc

package audio

import (
	"context"
	"sync"
)

// noopPlayer is the fallback Player used when the binary is built without
// libVLC. It satisfies the Player contract, tracks the nominal current media,
// and lets the Manager resolve URIs and publish state, but emits no audio.
type noopPlayer struct {
	mu    sync.Mutex
	track Track
	vol   int
}

// NewNoopPlayer returns a silent Player for the !libvlc build.
func NewNoopPlayer() *noopPlayer {
	return &noopPlayer{vol: 70}
}

// Play records the requested track without emitting audio.
func (p *noopPlayer) Play(_ context.Context, uri, title string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.track = Track{URI: uri, Title: title, Source: "noop"}
	return nil
}

// Stop clears the nominal current track.
func (p *noopPlayer) Stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.track = Track{}
	return nil
}

// Pause is a no-op.
func (p *noopPlayer) Pause() error { return nil }

// Resume is a no-op.
func (p *noopPlayer) Resume() error { return nil }

// Volume records the requested level without applying it.
func (p *noopPlayer) Volume(v int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	p.vol = v
	return nil
}

// Seek is a no-op.
func (p *noopPlayer) Seek(ms int) error { return nil }

// NowPlaying returns the nominal current track, if any.
func (p *noopPlayer) NowPlaying() (Track, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.track.URI == "" {
		return Track{}, false
	}
	return p.track, true
}

// Name identifies the backend.
func (p *noopPlayer) Name() string { return "noop" }
