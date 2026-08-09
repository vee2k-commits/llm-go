package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"vee/internal/audio"
	"vee/internal/arcade"
	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/db"
	"vee/internal/lexicon"
	"vee/internal/layers"
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

	lex, err := lexicon.New(ctx, b, database, nil)
	if err != nil {
		log.Fatalf("lexicon: %v", err)
	}

	unsubTheme := theme.Watch(b, cfg)
	defer unsubTheme()

	lay := layers.NewManager(b)

	n := notify.New(b)

	m := llm.NewManager(b, database, n, "llamacpp")
	m.RegisterBackend(llm.NewLlamaCppBackend(llm.LlamaCppOpts{}))
	m.RegisterBackend(llm.NewPiBackend(llm.PiOpts{}))
	m.RegisterBackend(llm.NewOpenCodeBackend(llm.OpenCodeOpts{}))

	audioPlayer, err := newAudioPlayer()
	if err != nil {
		log.Fatalf("audio player: %v", err)
	}
	audioMgr := audio.NewManager(b, reg, cfg, n, audioPlayer)
	audioMgr.RegisterMediaSources(nil)
	audioMgr.Start()

	audio.DefineSettings(cfg)
	speech.DefineSettings(cfg)
	arcade.DefineSettings(cfg)

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