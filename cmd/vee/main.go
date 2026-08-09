package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vee/internal/arcade"
	"vee/internal/audio"
	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/db"
	"vee/internal/layers"
	"vee/internal/lexicon"
	"vee/internal/llm"
	"vee/internal/macros"
	"vee/internal/notify"
	"vee/internal/registry"
	"vee/internal/server"
	"vee/internal/speech"
	"vee/internal/theme"
	"vee/internal/wizards"
)

func main() {
	ctx := context.Background()

	database, err := db.Open("vee.db")
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer database.Close()

	b := bus.New(20)

	reg, err := registry.New(ctx, b, database)
	if err != nil {
		log.Fatalf("registry: %v", err)
	}

	cfg, err := config.New(ctx, b, database, nil)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	// Lexicon base strings: every data-lx key in web/index.html + partials,
	// so rename/removal works from the settings UI.
	lexBase := map[string]string{
		"vee.wordmark":         "Vee",
		"chat.placeholder":     "Type a message...",
		"chat.send":            "Send",
		"chat.attach":          "\U0001F4CE",
		"chat.mic":             "\U0001F3A4",
		"chat.vee-btn":         "Vee",
		"settings.title":       "Settings",
		"arcade.title":         "Arcade",
		"arcade.close":         "Close",
		"arcade.games":         "Games",
		"arcade.back":          "Pitter-Patter",
		"arcade.nerd.greeting": "THE ARCADE IS OPEN. SPEAK THE NAME OF A GAME.",
	}
	lex, err := lexicon.New(ctx, b, database, lexBase)
	if err != nil {
		log.Fatalf("lexicon: %v", err)
	}

	unsubTheme := theme.Watch(b, cfg)
	defer unsubTheme()

	lay := layers.NewManager(b)

	n := notify.New(b)

	// Settings schemas first, so the persisted llm.backend can be honored.
	audio.DefineSettings(cfg)
	speech.DefineSettings(cfg)
	arcade.DefineSettings(cfg)
	llm.DefineSettings(cfg)

	backend := cfg.Persisted("llm.backend")
	if backend == "" {
		backend = cfg.Get("llm.backend") // schema default: openai
	}
	m := llm.NewManager(b, database, n, backend)

	openaiKey := os.Getenv("VEE_OPENAI_API_KEY")
	if openaiKey == "" {
		openaiKey = cfg.Get("llm.openai.apiKey")
	}
	m.RegisterBackend(llm.NewOpenAIBackend(llm.OpenAIOpts{
		BaseURL: cfg.Get("llm.openai.url"),
		APIKey:  openaiKey,
		Model:   cfg.Get("llm.openai.model"),
	}))
	m.RegisterBackend(llm.NewLlamaCppBackend(llm.LlamaCppOpts{BaseURL: cfg.Get("llm.llamacpp.url")}))
	m.RegisterBackend(llm.NewPiBackend(llm.PiOpts{BaseURL: cfg.Get("llm.pi.url")}))
	m.RegisterBackend(llm.NewOpenCodeBackend(llm.OpenCodeOpts{}))
	m.WatchSettings(cfg)
	if err := m.SetBackend(backend); err != nil {
		log.Printf("llm: %v", err)
	}

	// One registry `provider` entry per backend.
	providers := []struct{ id, name, desc string }{
		{"openai", "OpenAI-compatible", "Generic OpenAI-compatible chat completions endpoint"},
		{"llamacpp", "llama.cpp", "Local llama-server (OpenAI-compatible)"},
		{"pi", "pi", "pi-harness proxy"},
		{"opencode", "opencode", "Headless opencode CLI"},
	}
	for _, p := range providers {
		_ = reg.Register(registry.Entry{
			ID:          "provider." + p.id,
			Kind:        registry.Provider,
			Name:        p.name,
			Description: p.desc,
			Status:      registry.StatusEnabled,
			Meta:        map[string]any{"backend": p.id},
		})
	}

	// Tools exposed to the LLM: each maps to one bus command.
	for _, t := range []llm.Tool{
		{Name: "audio.play", Description: "Play audio from a uri (stream, file, or YouTube link).",
			ArgsSchema: objSchema("uri", "title"), Command: "audio.play"},
		{Name: "audio.queueSearch", Description: "Search YouTube and queue the top n results as audio tracks.",
			ArgsSchema: objSchema("query", "n"), Command: "audio.queueSearch"},
		{Name: "tts.speak", Description: "Speak text aloud via the TTS engine.",
			ArgsSchema: objSchema("text", "voice"), Command: "tts.speak"},
		{Name: "lexicon.set", Description: "Change or remove a visible word in the UI (empty value hides the element).",
			ArgsSchema: objSchema("key", "value"), Command: "lexicon.set"},
		{Name: "settings.set", Description: "Change a desktop setting.",
			ArgsSchema: objSchema("key", "value"), Command: "settings.set"},
		{Name: "notify.push", Description: "Show a toast notification near the [Vee] wordmark.",
			ArgsSchema: objSchema("level", "title", "body"), Command: "notify.push"},
		{Name: "layer.toggle", Description: "Show/hide a desktop layer (desktop, chat, settings, arcade, wizard).",
			ArgsSchema: objSchema("id"), Command: "layer.toggle"},
		{Name: "macro.run", Description: "Run a registered [Vee] macro by id.",
			ArgsSchema: objSchema("id"), Command: "macro.run"},
		{Name: "arcade.launch", Description: "Launch an arcade game by id.",
			ArgsSchema: objSchema("gameId"), Command: "arcade.launch"},
	} {
		m.RegisterTool(t)
		_ = reg.Register(registry.Entry{
			ID:          "tool." + t.Name,
			Kind:        registry.Tool,
			Name:        t.Name,
			Description: t.Description,
			Status:      registry.StatusEnabled,
			Meta:        map[string]any{"command": t.Command, "args_schema": t.ArgsSchema},
		})
	}

	// Command subscribers for topics with no owner yet.
	b.Subscribe("settings.set", func(msg bus.Msg) {
		p, _ := msg.Payload.(map[string]any)
		key, _ := p["key"].(string)
		if key == "" {
			return
		}
		_ = cfg.Set(key, asString(p["value"]))
	})
	b.Subscribe("lexicon.set", func(msg bus.Msg) {
		p, _ := msg.Payload.(map[string]any)
		key, _ := p["key"].(string)
		if key == "" {
			return
		}
		_ = lex.Set(key, asString(p["value"]))
	})
	b.Subscribe("layer.toggle", func(msg bus.Msg) {
		p, _ := msg.Payload.(map[string]any)
		id, _ := p["id"].(string)
		if id == "" {
			return
		}
		lay.Toggle(id)
	})

	// Pi connection watcher: edge-triggered pi.connected/pi.disconnected.
	m.StartPiHealth(cfg, n, 10*time.Second)

	audioPlayer, err := newAudioPlayer()
	if err != nil {
		log.Fatalf("audio player: %v", err)
	}
	audioMgr := audio.NewManager(b, reg, cfg, n, audioPlayer)
	audioMgr.RegisterMediaSources(nil)
	audioMgr.Start()

	// Every knob is a registry `setting` entry (the desktop contract).
	for _, e := range cfg.AsRegistryEntries() {
		_ = reg.Register(e)
	}

	host := &speech.VoiceHost{
		STT:         speech.NewWhisperSTT(""),
		TTS:         speech.NewEspeakTTS(),
		Bus:         b,
		Personality: speech.CharacterNerd("en-us"),
	}
	speechMgr := speech.NewManager(b, host, n)
	speechMgr.Start()

	macroEngine := macros.NewEngine(b, reg, n)
	macroEngine.SeedDefaultMacros()

	wizRunner := wizards.NewRunner(b, reg, n)
	wizRunner.SeedWizards()
	wizRunner.Start()

	arcadeCat := arcade.NewCatalog(reg)
	err = arcadeCat.LoadFromDir("web/arcade/games")
	if err != nil {
		log.Printf("arcade: no game dir: %v", err)
	}
	if len(arcadeCat.List()) == 0 {
		for _, g := range arcade.DefaultGames() {
			arcadeCat.Register(g)
		}
	}
	arcadeSrv := arcade.NewScreensaver(b, cfg, n, arcadeCat)
	arcadeSrv.Start()

	arcadeHost := &arcade.Host{
		Voice:   host,
		Bus:     b,
		Catalog: arcadeCat,
		Log:     log.Printf,
	}
	arcadeHost.Start()

	addr := os.Getenv("VEE_ADDR")
	if addr == "" {
		addr = ":8787"
	}

	srv := server.New(addr, b, database, reg, cfg, lex, n, m, lay)
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	b.Publish("system.ready", map[string]any{})

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("vee: shutting down")
	_ = srv.Shutdown(ctx)
}

// objSchema builds a loose JSON-schema object with the given string properties.
func objSchema(props ...string) map[string]any {
	properties := map[string]any{}
	for _, p := range props {
		properties[p] = map[string]any{"type": "string"}
	}
	return map[string]any{"type": "object", "properties": properties}
}

// asString coerces a loosely-typed bus payload value into a string.
func asString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case nil:
		return ""
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}
