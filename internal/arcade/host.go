package arcade

import "vee/internal/bus"

type Host struct {
	bus *bus.Bus
}

func NewHost(eventBus *bus.Bus) *Host {
	return &Host{bus: eventBus}
}

func (h *Host) Announce(menu string) {
	h.bus.Publish("notify.push", map[string]interface{}{"level": "info", "title": "Arcade", "body": menu, "ttl": 5000})
}
