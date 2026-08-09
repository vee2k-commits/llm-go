package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"vee/internal/bus"
	"vee/internal/config"
	"vee/internal/layers"
	"vee/internal/lexicon"
	"vee/internal/llm"
	"vee/internal/registry"
	"vee/internal/theme"
)

func apiSettings(b *bus.Bus, cfg *config.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(cfg.Schema())
		case http.MethodPost:
			var req struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := cfg.Set(req.Key, req.Value); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func apiLexicon(lex *lexicon.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(lex.All())
	}
}

func apiTheme(cfg *config.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(theme.Vars(cfg))
	}
}

func apiRegistry(reg *registry.Registry) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		kind := r.URL.Query().Get("kind")
		var entries []registry.Entry
		if kind != "" {
			entries = reg.List(registry.Kind(kind))
		} else {
			entries = reg.List("")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(entries)
	}
}

func apiLayers(lay *layers.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(lay.List())
		case http.MethodPost:
			var req struct {
				Layer string `json:"layer"`
				X     int    `json:"x"`
				Y     int    `json:"y"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Layer == "" {
				http.Error(w, "layer required", http.StatusBadRequest)
				return
			}
			lay.Click(req.Layer, req.X, req.Y)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// apiArcade handles screensaver/game commands: POST /api/arcade/launch starts
// a game (publishes arcade.launch); POST /api/arcade/dismiss clicks the
// screensaver to turn it off.
func apiArcade(b *bus.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		action := strings.TrimPrefix(r.URL.Path, "/api/arcade/")
		var payload map[string]any
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&payload)
		}
		if payload == nil {
			payload = map[string]any{}
		}
		switch action {
		case "launch":
			b.Publish("arcade.launch", payload)
		case "dismiss":
			b.Publish("arcade.click", map[string]any{"active": true})
		default:
			http.Error(w, "unknown action", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
	}
}

func apiGames(b *bus.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if msg, ok := b.State("state.registry.game"); ok {
			if payload, ok := msg.Payload.([]registry.Entry); ok {
				_ = json.NewEncoder(w).Encode(payload)
				return
			}
		}
		_ = json.NewEncoder(w).Encode([]registry.Entry{})
	}
}

func apiChat(b *bus.Bus, m *llm.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			SessionID string `json:"sessionId"`
			Content   string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.SessionID == "" {
			req.SessionID = m.NewSession().ID
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"sessionId": req.SessionID})
		// Announce the submission on the bus (macro triggers listen here),
		// then drive the chat turn.
		b.Publish("chat.submitted", map[string]any{"text": req.Content, "origin": "chat"})
		go func() {
			_ = m.Prompt(context.Background(), req.SessionID, req.Content, llm.Opts{})
		}()
	}
}

func apiAudio(b *bus.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		action := strings.TrimPrefix(r.URL.Path, "/api/audio/")
		var payload map[string]any
		if r.Body != nil {
			_ = json.NewDecoder(r.Body).Decode(&payload)
		}
		if payload == nil {
			payload = map[string]any{}
		}
		switch action {
		case "play":
			b.Publish("audio.play", payload)
		case "pause":
			b.Publish("audio.pause", payload)
		case "resume":
			b.Publish("audio.resume", payload)
		case "stop":
			b.Publish("audio.stop", payload)
		case "volume":
			b.Publish("audio.volume", payload)
		case "queueSearch":
			b.Publish("audio.queueSearch", payload)
		default:
			http.Error(w, "unknown action", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
	}
}

func apiSpeech(b *bus.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		action := strings.TrimPrefix(r.URL.Path, "/api/speech/")
		switch action {
		case "speak":
			var req struct {
				Text  string `json:"text"`
				Voice string `json:"voice"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			b.Publish("tts.speak", map[string]any{"text": req.Text, "voice": req.Voice})
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
		case "record":
			b.Publish("stt.listen", map[string]any{})
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
		default:
			http.Error(w, "unknown action", http.StatusBadRequest)
		}
	}
}

func apiMacros(b *bus.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			ID string `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		b.Publish("macro.run", map[string]any{"id": req.ID})
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
	}
}

func apiWizards(b *bus.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/api/wizards/"), "/", 2)
		if len(parts) < 1 || parts[0] == "" {
			http.Error(w, "wizard id required", http.StatusBadRequest)
			return
		}
		id := parts[0]
		action := ""
		if len(parts) > 1 {
			action = parts[1]
		}
		switch action {
		case "start", "":
			var req struct {
				SessionID string `json:"sessionId"`
			}
			if r.Body != nil {
				_ = json.NewDecoder(r.Body).Decode(&req)
			}
			b.Publish("wizard.start", map[string]any{"id": id, "sessionId": req.SessionID})
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
		default:
			http.Error(w, "unknown action", http.StatusBadRequest)
		}
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}

func intParam(r *http.Request, key string, def int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return def
	}
	n, _ := strconv.Atoi(s)
	return n
}

func strParam(r *http.Request, key, def string) string {
	s := r.URL.Query().Get(key)
	if s == "" {
		return def
	}
	return s
}
