package arcade

import (
	"sync"

	"vee/internal/bus"
	"vee/internal/registry"
)

type Arcade struct {
	bus      *bus.Bus
	registry *registry.Registry
	mu       sync.RWMutex
	active   string
}

func New(eventBus *bus.Bus, registryStore *registry.Registry) *Arcade {
	a := &Arcade{bus: eventBus, registry: registryStore}
	events, _ := eventBus.Subscribe("arcade.launch")
	go a.listen(events)
	return a
}

func (a *Arcade) listen(events chan bus.Event) {
	for event := range events {
		payload, ok := event.Payload.(map[string]any)
		if !ok {
			continue
		}
		gameID, _ := payload["gameId"].(string)
		if gameID == "" {
			continue
		}
		a.Launch(gameID)
	}
}

func (a *Arcade) Launch(gameID string) {
	_, found := a.registry.Get("game", gameID)
	if !found {
		a.bus.Publish("notify.push", map[string]interface{}{
			"level": "warn",
			"title": "Game not found",
			"body":  "No arcade game matches id: " + gameID,
			"ttl":   3000,
		})
		return
	}

	a.mu.Lock()
	a.active = gameID
	a.mu.Unlock()

	a.bus.Publish("arcade.game.started", map[string]string{"gameId": gameID})
	a.bus.Publish("state.arcade.active", map[string]string{"gameId": gameID})
}

func (a *Arcade) ActiveGame() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.active
}
