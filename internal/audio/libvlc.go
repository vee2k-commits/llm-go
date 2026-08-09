//go:build libvlc

package audio

import (
	"context"
	"fmt"
	"strings"
	"sync"

	vlc "github.com/adrg/libvlc-go/v3"
)

// libvlcPlayer is a headless libVLC audio backend. Playback runs with video
// disabled and a small network cache so HLS/icecast/http streams start fast.
type libvlcPlayer struct {
	mu       sync.Mutex
	player   *vlc.Player
	media    *vlc.Media
	onEnd    func()
	track    Track
	released bool
}

// NewLibVLCPlayer initializes libVLC and returns a ready player.
func NewLibVLCPlayer() (*libvlcPlayer, error) {
	lp := &libvlcPlayer{}
	if err := lp.ensure(); err != nil {
		return nil, err
	}
	return lp, nil
}

// ensure (re)initializes libVLC and the player if it is not already live.
func (p *libvlcPlayer) ensure() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.player != nil {
		return nil
	}
	if err := vlc.Init("--no-video", "--quiet", "--network-caching=1500"); err != nil {
		return fmt.Errorf("vlc init: %w", err)
	}
	player, err := vlc.NewPlayer()
	if err != nil {
		_ = vlc.Release()
		return fmt.Errorf("vlc new player: %w", err)
	}
	p.player = player
	p.released = false
	if em, err := player.EventManager(); err == nil {
		_, _ = em.Attach(vlc.MediaPlayerEndReached, p.onEvent, nil)
	}
	return nil
}

// onEvent fires on media-player events (runs on the library's event goroutine).
func (p *libvlcPlayer) onEvent(event vlc.Event, _ interface{}) {
	if event != vlc.MediaPlayerEndReached {
		return
	}
	p.mu.Lock()
	cb := p.onEnd
	p.mu.Unlock()
	if cb != nil {
		cb()
	}
}

// SetOnEnd registers a callback fired when the current media reaches its end.
func (p *libvlcPlayer) SetOnEnd(cb func()) {
	p.mu.Lock()
	p.onEnd = cb
	p.mu.Unlock()
}

// Play loads media from a URL or local path and starts playback.
func (p *libvlcPlayer) Play(_ context.Context, uri, title string) error {
	if err := p.ensure(); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	_ = p.player.Stop()
	p.releaseMedia()

	var (
		m   *vlc.Media
		err error
	)
	if strings.HasPrefix(uri, "file://") {
		m, err = p.player.LoadMediaFromPath(strings.TrimPrefix(uri, "file://"))
	} else {
		m, err = p.player.LoadMediaFromURL(uri)
	}
	if err != nil {
		return fmt.Errorf("load media: %w", err)
	}
	p.media = m
	p.track = Track{URI: uri, Title: title, Source: "libvlc"}
	if err := p.player.Play(); err != nil {
		p.releaseMedia()
		p.track = Track{}
		return fmt.Errorf("vlc play: %w", err)
	}
	return nil
}

// Stop halts playback, frees media and releases the libVLC instance.
func (p *libvlcPlayer) Stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.player != nil {
		_ = p.player.Stop()
	}
	p.releaseMedia()
	p.player = nil
	p.track = Track{}
	if !p.released {
		p.released = true
		_ = vlc.Release()
	}
	return nil
}

// Pause pauses the current media.
func (p *libvlcPlayer) Pause() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.player == nil {
		return nil
	}
	return p.player.SetPause(true)
}

// Resume resumes the current media.
func (p *libvlcPlayer) Resume() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.player == nil {
		return nil
	}
	return p.player.SetPause(false)
}

// Volume sets playback volume, clamped to 0-100.
func (p *libvlcPlayer) Volume(v int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.player == nil {
		return nil
	}
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	return p.player.SetVolume(v)
}

// Seek moves playback to the given position in milliseconds.
func (p *libvlcPlayer) Seek(ms int) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.player == nil {
		return nil
	}
	return p.player.SetMediaTime(ms)
}

// NowPlaying returns the current track, if any.
func (p *libvlcPlayer) NowPlaying() (Track, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.track.URI == "" {
		return Track{}, false
	}
	return p.track, true
}

// Name identifies the backend.
func (p *libvlcPlayer) Name() string { return "libvlc" }

func (p *libvlcPlayer) releaseMedia() {
	if p.media != nil {
		_ = p.media.Release()
		p.media = nil
	}
}
