// Package audio is Vee's media player. A Manager routes bus commands
// (audio.play, audio.pause, ...) to a Player (libVLC by default, a silent
// noop fallback under the !libvlc tag), resolves URIs via yt-dlp, owns the
// curated media-source catalog in the registry, and mirrors player state on
// state.audio.*.
package audio

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/notify"
	"vee/internal/registry"
)

// Track describes one playable item.
type Track struct {
	URI      string         `json:"uri"`
	Title    string         `json:"title"`
	Source   string         `json:"source"`
	Duration int            `json:"duration"`
	Meta     map[string]any `json:"meta,omitempty"`
}

// Player is the audio backend. The default build uses libVLC; a build without
// the libvlc tag falls back to a silent noop that still routes state.
type Player interface {
	Play(ctx context.Context, uri, title string) error
	Stop() error
	Pause() error
	Resume() error
	Volume(v int) error
	Seek(ms int) error
	NowPlaying() (Track, bool)
	Name() string
}

// endNotifier is an optional Player capability: a player that emits a
// "track finished" event lets the Manager advance its queue automatically.
type endNotifier interface {
	SetOnEnd(cb func())
}

const recentLimit = 10

// MediaSource is one curated audio stream (radio, lo-fi, broadcast).
type MediaSource struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	URL   string `json:"url"`
	Genre string `json:"genre"`
}

// DefaultMediaSources returns the built-in curated catalog. Each entry is
// registered under registry.MediaSource with an id like "ms.radioparadise".
func DefaultMediaSources() []MediaSource {
	return []MediaSource{
		{ID: "ms.radioparadise", Name: "Radio Paradise", URL: "https://stream.radioparadise.com/aac-320", Genre: "eclectic rock"},
		{ID: "ms.somafm.groovesalad", Name: "SomaFM Groove Salad", URL: "https://ice1.somafm.com/groovesalad-128-aac", Genre: "ambient / downtempo"},
		{ID: "ms.lofi", Name: "Lofi Radio", URL: "https://play.streamafrica.net/lofiradio", Genre: "lo-fi beats"},
		{ID: "ms.bbcworldservice", Name: "BBC World Service", URL: "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service", Genre: "news / talk"},
	}
}

// Manager owns playback state, the media-source catalog and the play queue.
type Manager struct {
	mu       sync.Mutex
	bus      *bus.Bus
	reg      *registry.Registry
	cfg      *config.Store
	notify   *notify.Service
	resolver *Resolver
	player   Player
	sources  []MediaSource
	queue    []Track
	current  Track
	playing  bool
	recent   []Track
}

// NewManager wires an audio Manager. p is the active player.
func NewManager(b *bus.Bus, reg *registry.Registry, cfg *config.Store, n *notify.Service, p Player) *Manager {
	return &Manager{
		bus:      b,
		reg:      reg,
		cfg:      cfg,
		notify:   n,
		resolver: NewResolver(),
		player:   p,
	}
}

// Start subscribes to the audio.* command topics and publishes the initial
// state so late (reconnecting) subscribers catch up instantly.
func (m *Manager) Start() {
	if m.bus == nil {
		return
	}
	m.bus.Subscribe("audio.play", m.handlePlay)
	m.bus.Subscribe("audio.pause", m.handlePause)
	m.bus.Subscribe("audio.resume", m.handleResume)
	m.bus.Subscribe("audio.stop", m.handleStop)
	m.bus.Subscribe("audio.volume", m.handleVolume)
	m.bus.Subscribe("audio.queueSearch", m.handleQueueSearch)
	m.wireEndNotifier()
	m.publishState()
	m.publishRecent()
}

// SetPlayer swaps the active player.
func (m *Manager) SetPlayer(p Player) {
	m.mu.Lock()
	m.player = p
	m.mu.Unlock()
	m.wireEndNotifier()
}

// Player returns the active player.
func (m *Manager) Player() Player {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.player
}

// RegisterMediaSources registers a media-source catalog into the registry and
// keeps it on the Manager. An empty slice registers the built-in defaults.
func (m *Manager) RegisterMediaSources(sources []MediaSource) {
	if len(sources) == 0 {
		sources = DefaultMediaSources()
	}
	m.mu.Lock()
	m.sources = append(m.sources, sources...)
	m.mu.Unlock()

	if m.reg == nil {
		return
	}
	for _, s := range sources {
		_ = m.reg.Register(registry.Entry{
			ID:          s.ID,
			Kind:        registry.MediaSource,
			Name:        s.Name,
			Description: s.Genre,
			Status:      registry.StatusEnabled,
			Meta:        map[string]any{"url": s.URL, "genre": s.Genre},
		})
	}
}

// handlePlay resolves the requested uri and hands it to the player. The bus
// dispatches synchronously, so the (potentially slow, yt-dlp bound) resolver
// work runs in a goroutine and publishers never block.
func (m *Manager) handlePlay(msg bus.Msg) {
	p := asMap(msg.Payload)
	uri, _ := p["uri"].(string)
	title, _ := p["title"].(string)
	uri = strings.TrimSpace(uri)
	if uri == "" {
		m.notify.Warn("Audio", "audio.play needs a uri")
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		tr, err := m.resolver.Resolve(ctx, uri)
		if err != nil {
			m.notify.Errorf("Audio", "could not resolve %q: %v", uri, err)
			return
		}
		if tr.Title == "" {
			tr.Title = title
		}
		tr.Meta = map[string]any{"requested": uri}
		if err := m.player.Play(ctx, tr.URI, tr.Title); err != nil {
			m.notify.Errorf("Audio", "play failed: %v", err)
			return
		}
		m.setCurrent(tr)
		m.addRecent(tr)
		m.bus.Publish("audio.started", tr)
		m.publishState()
	}()
}

func (m *Manager) handlePause(_ bus.Msg) {
	if err := m.player.Pause(); err != nil {
		m.notify.Errorf("Audio", "pause failed: %v", err)
		return
	}
	m.mu.Lock()
	m.playing = false
	m.mu.Unlock()
	m.publishTrack()
	m.publishState()
}

func (m *Manager) handleResume(_ bus.Msg) {
	if err := m.player.Resume(); err != nil {
		m.notify.Errorf("Audio", "resume failed: %v", err)
		return
	}
	m.mu.Lock()
	m.playing = true
	m.mu.Unlock()
	m.publishTrack()
	m.publishState()
}

func (m *Manager) handleStop(_ bus.Msg) {
	if err := m.player.Stop(); err != nil {
		m.notify.Errorf("Audio", "stop failed: %v", err)
		return
	}
	m.stopCurrent()
}

func (m *Manager) handleVolume(msg bus.Msg) {
	p := asMap(msg.Payload)
	v := toInt(p["volume"])
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	if err := m.player.Volume(v); err != nil {
		m.notify.Errorf("Audio", "volume failed: %v", err)
		return
	}
	if m.cfg != nil {
		_ = m.cfg.Set("audio.volume", strconv.Itoa(v))
	}
	m.publishTrack()
	m.publishState()
}

// handleQueueSearch resolves a query into tracks and appends them to the
// internal play queue. Resolution shells out to yt-dlp and can take tens of
// seconds, so it runs in a goroutine to keep bus publishers unblocked.
func (m *Manager) handleQueueSearch(msg bus.Msg) {
	p := asMap(msg.Payload)
	query, _ := p["query"].(string)
	n := toInt(p["n"])
	if n < 1 {
		n = 1
	}
	query = strings.TrimSpace(query)
	if query == "" {
		m.notify.Warn("Audio", "audio.queueSearch needs a query")
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		tracks, err := m.resolver.Search(ctx, query, n)
		if err != nil {
			m.notify.Errorf("Audio", "search failed: %v", err)
			return
		}
		if len(tracks) == 0 {
			m.notify.Warn("Audio", "no results for "+query)
			return
		}
		m.mu.Lock()
		m.queue = append(m.queue, tracks...)
		q := append([]Track{}, m.queue...)
		m.mu.Unlock()
		m.bus.Publish("audio.queue", q)
		m.publishState()
		m.notify.Info("Audio", fmt.Sprintf("queued %d track(s) for %q", len(tracks), query))
	}()
}

// handleEnd advances the queue when a player reports a track finished.
func (m *Manager) handleEnd() {
	m.mu.Lock()
	if len(m.queue) == 0 {
		m.mu.Unlock()
		m.stopCurrent()
		return
	}
	next := m.queue[0]
	m.queue = m.queue[1:]
	m.mu.Unlock()

	if err := m.player.Play(context.Background(), next.URI, next.Title); err != nil {
		m.notify.Errorf("Audio", "auto-advance failed: %v", err)
		return
	}
	m.setCurrent(next)
	m.addRecent(next)
	m.bus.Publish("audio.started", next)
	m.publishState()
}

func (m *Manager) setCurrent(tr Track) {
	m.mu.Lock()
	m.current = tr
	m.playing = true
	m.mu.Unlock()
}

func (m *Manager) stopCurrent() {
	m.mu.Lock()
	m.current = Track{}
	m.playing = false
	m.mu.Unlock()
	m.bus.Publish("audio.stopped", m.current)
	m.publishState()
}

func (m *Manager) addRecent(tr Track) {
	m.mu.Lock()
	m.recent = append([]Track{tr}, m.recent...)
	if len(m.recent) > recentLimit {
		m.recent = m.recent[:recentLimit]
	}
	m.mu.Unlock()
	m.publishRecent()
}

// publishTrack emits the current track on audio.track.
func (m *Manager) publishTrack() {
	m.mu.Lock()
	cur := m.current
	m.mu.Unlock()
	m.bus.Publish("audio.track", cur)
}

// publishRecent mirrors the recent-played list on state.audio.recent.
func (m *Manager) publishRecent() {
	m.mu.Lock()
	recent := append([]Track{}, m.recent...)
	m.mu.Unlock()
	m.bus.Publish("state.audio.recent", recent)
}

// publishState mirrors the full player state on state.audio (replayed to late
// subscribers by the bus).
func (m *Manager) publishState() {
	m.mu.Lock()
	cur := m.current
	playing := m.playing
	recent := append([]Track{}, m.recent...)
	queue := append([]Track{}, m.queue...)
	m.mu.Unlock()
	vol := 0
	if m.cfg != nil {
		vol = int(m.cfg.Number("audio.volume"))
	}
	m.bus.Publish("state.audio", map[string]any{
		"playing": playing,
		"track":   cur,
		"volume":  vol,
		"queue":   queue,
		"recent":  recent,
	})
}

// wireEndNotifier hands the Manager's queue-advance hook to a player that
// supports it.
func (m *Manager) wireEndNotifier() {
	m.mu.Lock()
	p := m.player
	m.mu.Unlock()
	if e, ok := p.(endNotifier); ok {
		e.SetOnEnd(m.handleEnd)
	}
}

// DefineSettings seeds the audio module's config knobs.
func DefineSettings(cfg *config.Store) {
	if cfg == nil {
		return
	}
	cfg.Define(config.Setting{
		Key:         "audio.volume",
		Group:       "audio",
		Label:       "Volume",
		Type:        config.TypeNumber,
		Default:     "70",
		Min:         0,
		Max:         100,
		Description: "Default playback volume (0-100).",
	})
	opts := make([]config.Option, 0, len(DefaultMediaSources()))
	for _, s := range DefaultMediaSources() {
		opts = append(opts, config.Option{Label: s.Name, Value: s.ID})
	}
	cfg.Define(config.Setting{
		Key:         "audio.default-source",
		Group:       "audio",
		Label:       "Default media source",
		Type:        config.TypeSelect,
		Options:     opts,
		Description: "Curated stream to play when no query is given.",
	})
}

// asMap normalizes bus payloads (any map shape) into map[string]any.
func asMap(payload any) map[string]any {
	switch t := payload.(type) {
	case map[string]any:
		return t
	case map[string]string:
		out := make(map[string]any, len(t))
		for k, v := range t {
			out[k] = v
		}
		return out
	case nil:
		return map[string]any{}
	default:
		return map[string]any{}
	}
}

// toInt converts a loosely-typed numeric value (JSON float64, int, string)
// into an int, defaulting to 0.
func toInt(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case float32:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	default:
		return 0
	}
}
