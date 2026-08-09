package main

import (
	"log"
	"os"

	"vee/internal/arcade"
	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/db"
	"vee/internal/llm"
	"vee/internal/registry"
	"vee/internal/server"
)

func main() {
	database, err := db.Open("vee.db")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	eventBus := bus.New()
	registryStore := registry.New(database, eventBus)
	configStore := config.New(database, eventBus)
	llmManager := llm.NewManager(eventBus, configStore, registryStore)

	registryStore.Register(registry.Entry{Kind: "provider", ID: "mock", Data: map[string]any{"name": "Mock provider", "description": "Local fallback LLM for development"}})
	registryStore.Register(registry.Entry{Kind: "provider", ID: "pi", Data: map[string]any{"name": "pi", "description": "Proxy to pi.dev headless model"}})
	registryStore.Register(registry.Entry{Kind: "provider", ID: "9router", Data: map[string]any{"name": "9router", "description": "Proxy to 9router at localhost:20128/v1"}})

	llmManager.RegisterProvider(llm.NewMockBackend())
	llmManager.RegisterProvider(llm.NewPIBackend(os.Getenv("PI_URL")))
	llmManager.RegisterProvider(llm.NewRouter9Backend(os.Getenv("ROUTER9_URL")))

	arcade.New(eventBus, registryStore)
	arcade.RegisterDefaultGames(registryStore)

	defaultBackend := configStore.Get("llm.backend")
	if backendName, ok := defaultBackend.(string); ok && backendName != "" {
		if err := llmManager.SetBackend(backendName); err != nil {
			log.Printf("warning: could not set configured backend %q: %v", backendName, err)
			_ = llmManager.SetBackend("mock")
		}
	} else {
		_ = llmManager.SetBackend("9router")
		_ = configStore.Set("llm.backend", "9router")
	}

	apiServer := server.New(eventBus, registryStore, configStore, llmManager)
	addr := ":8080"
	if port := os.Getenv("PORT"); port != "" {
		addr = ":" + port
	}

	log.Printf("starting vee backend on %s", addr)
	if err := apiServer.Start(addr); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
