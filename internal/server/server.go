package server

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/db"
	"vee/internal/lexicon"
	"vee/internal/layers"
	"vee/internal/llm"
	"vee/internal/notify"
	"vee/internal/registry"
)

func New(addr string, b *bus.Bus, database *db.DB, reg *registry.Registry, cfg *config.Store, lex *lexicon.Store, n *notify.Service, m *llm.Manager, lay *layers.Manager) *http.Server {
	mux := http.NewServeMux()

	hub := NewHub(b)
	go hub.run()

	mux.HandleFunc("/api/events", hub.sseHandler)
	mux.HandleFunc("/api/settings", apiSettings(b, cfg))
	mux.HandleFunc("/api/lexicon", apiLexicon(lex))
	mux.HandleFunc("/api/theme", apiTheme(cfg))
	mux.HandleFunc("/api/registry", apiRegistry(reg))
	mux.HandleFunc("/api/layers", apiLayers(lay))
	mux.HandleFunc("/api/games", apiGames(b))
	mux.HandleFunc("/api/arcade/", apiArcade(b))
	mux.HandleFunc("/api/chat", apiChat(m))
	mux.HandleFunc("/api/audio/", apiAudio(b))
	mux.HandleFunc("/api/speech/", apiSpeech(b))
	mux.HandleFunc("/api/macros/", apiMacros(b))
	mux.HandleFunc("/api/wizards/", apiWizards(b))
	mux.HandleFunc("/partials/", apiPartials)
	mux.HandleFunc("/static/", serveStatic)
	mux.HandleFunc("/", serveIndex)

	return &http.Server{Addr: addr, Handler: mux}
}

func Start(srv *http.Server) error {
	return srv.ListenAndServe()
}

func MustStart(addr string, b *bus.Bus, database *db.DB, reg *registry.Registry, cfg *config.Store, lex *lexicon.Store, n *notify.Service, m *llm.Manager, lay *layers.Manager) {
	srv := New(addr, b, database, reg, cfg, lex, n, m, lay)
	log.Printf("vee: listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("vee: %v", err)
	}
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	data, err := os.ReadFile("web/index.html")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}

func serveStatic(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path[len("/static/"):]
	if path == "" {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join("web/static", path)
	http.ServeFile(w, r, full)
}

func apiPartials(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Path[len("/partials/"):]
	if name == "" {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join("web/partials", name+".html")
	http.ServeFile(w, r, full)
}