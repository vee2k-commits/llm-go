package server

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
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
	s.mux.HandleFunc("/api/characters/upload", s.handleCharacterUpload)
	s.mux.HandleFunc("/api/characters/selected", s.handleCharacterSelected)
}

func (s *Server) handleCharacterSelected(w http.ResponseWriter, r *http.Request) {
	// GET returns current selection, POST sets selection { id: "violet" }
	selPath := "web/static/assets/characters/selected.json"
	switch r.Method {
	case http.MethodGet:
		if b, err := os.ReadFile(selPath); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
		// not found -> empty
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{}"))
		return
	case http.MethodPost:
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		if payload.ID == "" {
			http.Error(w, "missing id", http.StatusBadRequest)
			return
		}
		meta := map[string]string{"id": payload.ID}
		out, _ := json.MarshalIndent(meta, "", "  ")
		_ = os.MkdirAll("web/static/assets/characters", 0755)
		if err := os.WriteFile(selPath, out, 0644); err != nil {
			http.Error(w, "unable to save", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(out)
		return
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (s *Server) handleCharacterUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Expect a multipart form with fields: id, file
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "invalid form", http.StatusBadRequest)
		return
	}
	id := r.FormValue("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Simple validation: ensure content-type starts with image/
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	contentType := http.DetectContentType(buf[:n])
	if !strings.HasPrefix(contentType, "image/") {
		http.Error(w, "invalid file type", http.StatusBadRequest)
		return
	}
	// rewind
	if _, err := file.Seek(0, 0); err != nil {
		// ignore
	}

	// ensure dest dir
	dstDir := "web/static/assets/characters/" + id
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		http.Error(w, "unable to create dir", http.StatusInternalServerError)
		return
	}
	// write file as png or keep original extension
	fname := header.Filename
	outPath := dstDir + "/" + fname
	out, err := os.Create(outPath)
	if err != nil {
		http.Error(w, "unable to save file", http.StatusInternalServerError)
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		http.Error(w, "unable to write file", http.StatusInternalServerError)
		return
	}

	// write a simple metadata file pointing at this file
	meta := map[string]interface{}{"id": id, "imagePath": "/static/assets/characters/" + id + "/" + fname}
	metaOut, _ := json.MarshalIndent(meta, "", "  ")
	_ = os.WriteFile(dstDir+"/metadata.json", metaOut, 0644)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "ok", "path": meta["imagePath"]})
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
