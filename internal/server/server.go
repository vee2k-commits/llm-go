package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/llm"
	"vee/internal/registry"
)

type Server struct {
	bus      *bus.Bus
	registry *registry.Registry
	config   *config.Config
	llm      *llm.Manager
	mux      *http.ServeMux
	mu       sync.RWMutex
}

func New(eventBus *bus.Bus, reg *registry.Registry, cfg *config.Config, manager *llm.Manager) *Server {
	s := &Server{
		bus:      eventBus,
		registry: reg,
		config:   cfg,
		llm:      manager,
		mux:      http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))
	s.mux.HandleFunc("/arcade/", s.handleArcade)
	s.mux.HandleFunc("/arcade", s.handleArcade)
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/providers", s.handleProviders)
	s.mux.HandleFunc("/games", s.handleGames)
	s.mux.HandleFunc("/llm/stream", s.handleLLMStream)
}

func (s *Server) handleArcade(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/arcade")
	if path == "" || path == "/" {
		http.ServeFile(w, r, "web/arcade/list.html")
		return
	}
	gameID := strings.Trim(path, "/")
	if _, found := s.registry.Get("game", gameID); !found {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, "web/arcade/index.html")
}

func (s *Server) handleGames(w http.ResponseWriter, r *http.Request) {
	list := s.registry.List("game")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

func (s *Server) Start(addr string) error {
	return http.ListenAndServe(addr, s.mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok"})
}

func (s *Server) handleProviders(w http.ResponseWriter, r *http.Request) {
	list := s.registry.List("provider")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(list)
}

func (s *Server) handleLLMStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		SessionID string            `json:"sessionId"`
		Messages  []llm.Message     `json:"messages"`
		Options   llm.StreamOptions `json:"options"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	events := make([]bus.Event, 0)
	eventHandler := func(event bus.Event) {
		events = append(events, event)
	}

	if err := s.llm.Stream(ctx, payload.SessionID, payload.Messages, payload.Options, eventHandler); err != nil {
		log.Printf("llm stream error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(events)
}
