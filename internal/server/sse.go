package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"vee/internal/bus"
)

type client struct {
	ch chan []byte
}

type Hub struct {
	bus       *bus.Bus
	clients   map[*client]bool
	mu        sync.Mutex
	stateKeys []string
}

func NewHub(b *bus.Bus) *Hub {
	return &Hub{
		bus:     b,
		clients: map[*client]bool{},
		stateKeys: []string{
			"state.layer",
			"state.arcade",
			"state.audio",
			"state.chat",
			"state.settings",
			"state.lexicon",
			"state.theme",
			"state.registry.module",
			"state.registry.setting",
			"state.registry.command",
			"state.registry.tool",
			"state.registry.wizard",
			"state.registry.game",
			"state.registry.mediasource",
			"state.registry.provider",
			"state.registry.layer",
		},
	}
}

func (h *Hub) run() {
	h.bus.SubscribePattern("**", func(msg bus.Msg) {
		b, err := json.Marshal(map[string]any{
			"topic":   msg.Topic,
			"payload": msg.Payload,
		})
		if err != nil {
			return
		}
		h.mu.Lock()
		for c := range h.clients {
			select {
			case c.ch <- b:
			default:
			}
		}
		h.mu.Unlock()
	})
}

func (h *Hub) sseHandler(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	c := &client{ch: make(chan []byte, 64)}
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		delete(h.clients, c)
		h.mu.Unlock()
		close(c.ch)
	}()

	// Replay the latest state.* snapshot so a (re)connecting client catches
	// up instantly instead of waiting for the next mutation.
	h.replayState(w)
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case b, ok := <-c.ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", b)
			flusher.Flush()
		}
	}
}

func (h *Hub) replayState(w http.ResponseWriter) {
	for _, key := range h.stateKeys {
		if msg, ok := h.bus.State(key); ok {
			b, err := json.Marshal(map[string]any{
				"topic":   msg.Topic,
				"payload": msg.Payload,
			})
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", b)
		}
	}
}
