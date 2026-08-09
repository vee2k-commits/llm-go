// Package arcade is Vee's retro game shelf: a catalog of web games plus a
// screensaver that cycles demos and a voice-driven launcher.
package arcade

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/notify"
	"vee/internal/registry"
)

// Game is one playable title in the arcade catalog.
type Game struct {
	ID      string
	Title   string
	Genre   string
	Engine  string
	Entry   string
	Demo    string
	License string
	Source  string
}

// Catalog is a thread-safe collection of games, optionally mirrored into the
// registry as Game entries.
type Catalog struct {
	mu    sync.RWMutex
	reg   *registry.Registry
	games []Game
}

// NewCatalog creates a Catalog; reg may be nil.
func NewCatalog(reg *registry.Registry) *Catalog {
	return &Catalog{reg: reg}
}

// Register adds a game to the catalog and, if a registry is attached, as a
// registry Game entry.
func (c *Catalog) Register(g Game) {
	c.mu.Lock()
	c.games = append(c.games, g)
	c.mu.Unlock()
	if c.reg != nil {
		_ = c.reg.Register(registry.Entry{
			ID:          g.ID,
			Kind:        registry.Game,
			Name:        g.Title,
			Description: g.Genre,
			Status:      registry.StatusRegistered,
			Meta: map[string]any{
				"engine":  g.Engine,
				"entry":   g.Entry,
				"demo":    g.Demo,
				"license": g.License,
				"source":  g.Source,
			},
		})
	}
}

// List returns a snapshot of all games in catalog order.
func (c *Catalog) List() []Game {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]Game, len(c.games))
	copy(out, c.games)
	return out
}

// Get returns the game with the given id.
func (c *Catalog) Get(id string) (Game, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, g := range c.games {
		if g.ID == id {
			return g, true
		}
	}
	return Game{}, false
}

// LoadFromDir walks a directory tree and registers every manifest.json it
// finds as a game.
func (c *Catalog) LoadFromDir(dir string) error {
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() || info.Name() != "manifest.json" {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var g Game
		if err := json.Unmarshal(b, &g); err != nil {
			return err
		}
		c.Register(g)
		return nil
	})
}

// DefaultGames returns the built-in arcade lineup.
func DefaultGames() []Game {
	return []Game{
		{ID: "breakout", Title: "Breakout", Genre: "Arcade", Engine: "html5", Entry: "index.html", License: "MIT", Source: "https://github.com/jakesgordon/javascript-breakout"},
		{ID: "tetris", Title: "Tetris", Genre: "Puzzle", Engine: "html5", Entry: "index.html", License: "Unlicense", Source: "https://github.com/dionyziz/canvas-tetris"},
		{ID: "pacman", Title: "Pac-Man", Genre: "Maze", Engine: "html5", Entry: "index.html", License: "MIT", Source: "https://github.com/platzhersh/pacman-canvas"},
		{ID: "frogger", Title: "Frogger", Genre: "Arcade", Engine: "html5", Entry: "index.html", License: "MIT", Source: "https://github.com/praneethy91/frogger-arcade-game"},
		{ID: "mario", Title: "Super Mario", Genre: "Platformer", Engine: "html5", Entry: "index.html", License: "MIT", Source: "https://github.com/robertkleffner/mariohtml5"},
		{ID: "racer", Title: "Racer", Genre: "Racing", Engine: "html5", Entry: "index.html", License: "MIT", Source: "https://github.com/lrq3000/javascript-racer"},
		{ID: "pinball", Title: "Pinball", Genre: "Pinball", Engine: "html5", Entry: "index.html", License: "CC0", Source: "https://github.com/h4k1m0u/pinball"},
		{ID: "doom", Title: "DOOM", Genre: "FPS", Engine: "jsdos", Entry: "/arcade/games/doom/doom.jsdos", License: "user WAD", Source: "https://www.idsoftware.com/"},
	}
}

// NewScreensaver builds a Screensaver wired to the bus, config, notifier and catalog.
func NewScreensaver(b *bus.Bus, cfg *config.Store, n *notify.Service, cat *Catalog) *Screensaver {
	return &Screensaver{Bus: b, Cfg: cfg, Notify: n, Catalog: cat}
}

// Screensaver idles after a timeout and cycles demo games until touched.
type Screensaver struct {
	Bus     *bus.Bus
	Cfg     *config.Store
	Notify  *notify.Service
	Catalog *Catalog

	mu       sync.RWMutex
	active   bool
	demoIdx  int
	stopDemo chan struct{}
}

// Start subscribes to screensaver.toggle, arcade.launch (voice host / API)
// and arcade.click (click dismisses the screensaver), then launches the idle
// loop.
func (s *Screensaver) Start() {
	if s.Bus == nil {
		return
	}
	s.Bus.Subscribe("arcade.launch", func(m bus.Msg) {
		p, _ := m.Payload.(map[string]any)
		gameID, _ := p["gameId"].(string)
		if gameID == "" {
			return
		}
		s.Launch(gameID)
	})
	s.Bus.Subscribe("arcade.click", func(_ bus.Msg) {
		s.Deactivate()
	})
	s.Bus.Subscribe("screensaver.toggle", func(m bus.Msg) {
		on, flip := false, true
		if m.Payload != nil {
			if p, ok := m.Payload.(map[string]any); ok {
				if v, ok := p["active"].(bool); ok {
					on, flip = v, false
				}
			}
		}
		if flip {
			s.mu.RLock()
			on = !s.active
			s.mu.RUnlock()
		}
		if on {
			s.Activate()
		} else {
			s.Deactivate()
		}
	})
	go s.IdleLoop()
}

// IdleLoop sleeps screensaver.idle seconds, then activates the screensaver.
func (s *Screensaver) IdleLoop() {
	if s.Cfg == nil {
		return
	}
	secs := s.Cfg.Number("screensaver.idle")
	if secs <= 0 || !s.Cfg.Bool("screensaver.enabled") {
		return
	}
	time.Sleep(time.Duration(secs * float64(time.Second)))
	s.Activate()
}

// Activate turns the screensaver on and starts the demo cycle.
func (s *Screensaver) Activate() {
	s.mu.Lock()
	if s.active {
		s.mu.Unlock()
		return
	}
	s.active = true
	s.stopDemo = make(chan struct{})
	stop := s.stopDemo
	s.mu.Unlock()

	s.Bus.Publish("screensaver.activated", map[string]any{})
	s.Bus.Publish("state.arcade", map[string]any{"active": true})
	go s.demoLoop(stop)
}

// Deactivate turns the screensaver off and stops the demo cycle.
func (s *Screensaver) Deactivate() {
	s.mu.Lock()
	if !s.active {
		s.mu.Unlock()
		return
	}
	s.active = false
	stop := s.stopDemo
	s.stopDemo = nil
	s.mu.Unlock()

	if stop != nil {
		close(stop)
	}
	s.Bus.Publish("screensaver.deactivated", map[string]any{})
	s.Bus.Publish("state.arcade", map[string]any{"active": false})
}

// HandleClick publishes arcade.click when the screensaver is active.
func (s *Screensaver) HandleClick() {
	s.mu.RLock()
	a := s.active
	s.mu.RUnlock()
	if a {
		s.Bus.Publish("arcade.click", map[string]any{"active": true})
	}
}

// Launch starts a game: publishes arcade.launched and posts a toast.
func (s *Screensaver) Launch(gameID string) {
	g, ok := s.Catalog.Get(gameID)
	if !ok {
		if s.Notify != nil {
			s.Notify.Warn("Unknown game", gameID)
		}
		return
	}
	s.Bus.Publish("arcade.launched", map[string]any{"game": g})
	if s.Notify != nil {
		s.Notify.Info("Launching "+g.Title, "Engine: "+g.Engine)
	}
}

// demoLoop cycles catalog games on arcade.game.demo every screensaver.demo
// seconds until stop closes.
func (s *Screensaver) demoLoop(stop chan struct{}) {
	secs := s.Cfg.Number("screensaver.demo")
	if secs <= 0 {
		secs = 30
	}
	games := s.Catalog.List()
	if len(games) == 0 {
		games = DefaultGames()
	}
	t := time.NewTicker(time.Duration(secs * float64(time.Second)))
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			if len(games) == 0 {
				continue
			}
			s.mu.Lock()
			g := games[s.demoIdx%len(games)]
			s.demoIdx++
			s.mu.Unlock()
			s.Bus.Publish("arcade.game.demo", map[string]any{"game": g})
		}
	}
}

// DefineSettings registers the arcade screensaver knobs.
func DefineSettings(cfg *config.Store) {
	cfg.Define(config.Setting{
		Key: "screensaver.idle", Group: "Screensaver", Label: "Idle timeout (seconds)",
		Type: config.TypeNumber, Default: "300", Min: 0, Max: 86400,
		Description: "Seconds of inactivity before the arcade screensaver activates; 0 disables it.",
	})
	cfg.Define(config.Setting{
		Key: "screensaver.demo", Group: "Screensaver", Label: "Demo cycle (seconds)",
		Type: config.TypeNumber, Default: "30", Min: 1, Max: 600,
		Description: "Seconds each demo game plays while the screensaver is active.",
	})
	cfg.Define(config.Setting{
		Key: "screensaver.enabled", Group: "Screensaver", Label: "Screensaver enabled",
		Type: config.TypeBool, Default: "true",
		Description: "Whether the idle screensaver may activate.",
	})
}

