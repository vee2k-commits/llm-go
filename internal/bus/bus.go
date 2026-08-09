// Package bus is Vee's spine: a wildcard pub/sub with stateful replay topics.
// Every component communicates through this bus; no module imports another module.
package bus

import (
	"sync"
)

// Msg is a single event or command on the bus.
type Msg struct {
	Topic   string
	Payload any
}

// Handler receives messages. A handler must not block indefinitely;
// slow handlers are the caller's problem (dispatch is synchronous).
type Handler func(Msg)

type glob struct {
	id      uint64
	pattern []string // split on "."
	handler Handler
}

type entry struct {
	id      uint64
	handler Handler
}

// Bus is a concurrency-safe topic router.
type Bus struct {
	mu       sync.RWMutex
	nextID   uint64
	exact    map[string][]entry
	globs    []glob
	state    map[string]Msg    // latest payload for state.* topics
	replay   map[string][]Msg  // last N per topic
	replayN  int
}

// New creates a Bus. replayN is the number of messages kept per topic for late
// subscribers; pass 0 to keep none.
func New(replayN int) *Bus {
	if replayN <= 0 {
		replayN = 0
	}
	return &Bus{
		exact:   make(map[string][]entry),
		state:   make(map[string]Msg),
		replay:  make(map[string][]Msg),
		replayN: replayN,
	}
}

// Publish delivers a message to all matching subscribers. It never panics on a
// nil payload. If the topic is a state topic it is stored for replay.
func (b *Bus) Publish(topic string, payload any) {
	msg := Msg{Topic: topic, Payload: payload}
	b.mu.RLock()
	handlers := make([]Handler, 0, 4)
	for _, e := range b.exact[topic] {
		handlers = append(handlers, e.handler)
	}
	globs := append([]glob{}, b.globs...)
	hasState := len(topic) > 6 && topic[:6] == "state."
	b.mu.RUnlock()

	if hasState {
		b.mu.Lock()
		b.state[topic] = msg
		b.mu.Unlock()
	}

	// Replay buffer (last N per topic) is populated for EVERY topic, not just
	// state.*, so late subscribers can catch up on transient events too.
	if b.replayN > 0 {
		b.mu.Lock()
		l := b.replay[topic]
		l = append(l, msg)
		if len(l) > b.replayN {
			l = l[len(l)-b.replayN:]
		}
		b.replay[topic] = l
		b.mu.Unlock()
	}

	for _, h := range handlers {
		h(msg)
	}
	for _, g := range globs {
		if matchPattern(g.pattern, splitTopic(topic)) {
			g.handler(msg)
		}
	}
}

// SetState publishes AND replays on reconnect, for state.* topics.
func (b *Bus) SetState(topic string, payload any) {
	b.Publish(topic, payload)
}

// State returns the latest stored payload for a state topic.
func (b *Bus) State(topic string) (Msg, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	m, ok := b.state[topic]
	return m, ok
}

// Subscribe registers an exact-topic handler and returns an unsubscribe func.
func (b *Bus) Subscribe(topic string, h Handler) func() {
	b.mu.Lock()
	b.nextID++
	id := b.nextID
	b.exact[topic] = append(b.exact[topic], entry{id: id, handler: h})
	b.mu.Unlock()
	return b.unsubscribe(topic, id)
}

// SubscribePattern registers a glob handler. Pattern tokens split on "."; "*"
// matches one segment, "**" matches any remainder.
func (b *Bus) SubscribePattern(pattern string, h Handler) func() {
	b.mu.Lock()
	b.nextID++
	id := b.nextID
	b.globs = append(b.globs, glob{id: id, pattern: splitTopic(pattern), handler: h})
	b.mu.Unlock()
	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		for i, g := range b.globs {
			if g.id == id {
				b.globs = append(b.globs[:i], b.globs[i+1:]...)
				return
			}
		}
	}
}

func (b *Bus) unsubscribe(topic string, id uint64) func() {
	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		es := b.exact[topic]
		for i, e := range es {
			if e.id == id {
				b.exact[topic] = append(es[:i], es[i+1:]...)
				return
			}
		}
	}
}

// Replay delivers the last stored messages of a topic to h (newest omitted;
// order is oldest→newest).
func (b *Bus) Replay(topic string, h Handler) {
	b.mu.RLock()
	l := append([]Msg{}, b.replay[topic]...)
	b.mu.RUnlock()
	for _, m := range l {
		h(m)
	}
}

func splitTopic(t string) []string {
	out := []string{}
	cur := ""
	for _, r := range t {
		if r == '.' {
			out = append(out, cur)
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" || len(out) == 0 {
		out = append(out, cur)
	}
	return out
}

func matchPattern(pattern, topic []string) bool {
	i, j := 0, 0
	for i < len(pattern) {
		switch pattern[i] {
		case "**":
			if i == len(pattern)-1 {
				return true
			}
			for k := j; k <= len(topic); k++ {
				if matchPattern(pattern[i+1:], topic[k:]) {
					return true
				}
			}
			return false
		case "*":
			if j >= len(topic) {
				return false
			}
			i++
			j++
		default:
			if j >= len(topic) || pattern[i] != topic[j] {
				return false
			}
			i++
			j++
		}
	}
	return j == len(topic)
}
