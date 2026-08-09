package bus

import (
	"strings"
	"sync"
)

type Event struct {
	Topic   string      `json:"topic"`
	Payload interface{} `json:"payload"`
}

type Bus struct {
	mu          sync.RWMutex
	subscribers []*subscription
	state       map[string]interface{}
}

type subscription struct {
	pattern string
	channel chan Event
}

func New() *Bus {
	return &Bus{
		state: make(map[string]interface{}),
	}
}

func (b *Bus) Publish(topic string, payload interface{}) {
	b.mu.RLock()
	subscribers := append([]*subscription(nil), b.subscribers...)
	b.mu.RUnlock()

	if strings.HasPrefix(topic, "state.") {
		b.mu.Lock()
		b.state[topic] = payload
		b.mu.Unlock()
	}

	event := Event{Topic: topic, Payload: payload}
	for _, sub := range subscribers {
		if matchTopic(topic, sub.pattern) {
			select {
			case sub.channel <- event:
			default:
			}
		}
	}
}

func (b *Bus) SetState(topic string, payload interface{}) {
	if !strings.HasPrefix(topic, "state.") {
		return
	}
	b.Publish(topic, payload)
}

func (b *Bus) State(topic string) interface{} {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.state[topic]
}

func (b *Bus) Subscribe(pattern string) (chan Event, func()) {
	ch := make(chan Event, 64)
	sub := &subscription{pattern: pattern, channel: ch}

	b.mu.Lock()
	b.subscribers = append(b.subscribers, sub)
	stateSnapshot := make(map[string]interface{}, len(b.state))
	for k, v := range b.state {
		stateSnapshot[k] = v
	}
	b.mu.Unlock()

	go func() {
		for topic, payload := range stateSnapshot {
			if matchTopic(topic, pattern) {
				ch <- Event{Topic: topic, Payload: payload}
			}
		}
	}()

	return ch, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		for i, candidate := range b.subscribers {
			if candidate == sub {
				b.subscribers = append(b.subscribers[:i], b.subscribers[i+1:]...)
				close(ch)
				break
			}
		}
	}
}

func matchTopic(topic, pattern string) bool {
	topicParts := strings.Split(topic, ".")
	patternParts := strings.Split(pattern, ".")
	return matchParts(topicParts, patternParts)
}

func matchParts(topicParts, patternParts []string) bool {
	if len(patternParts) == 0 {
		return len(topicParts) == 0
	}
	if patternParts[0] == "**" {
		if len(patternParts) == 1 {
			return true
		}
		for i := 0; i <= len(topicParts); i++ {
			if matchParts(topicParts[i:], patternParts[1:]) {
				return true
			}
		}
		return false
	}
	if len(topicParts) == 0 {
		return false
	}
	if patternParts[0] != "*" && patternParts[0] != topicParts[0] {
		return false
	}
	return matchParts(topicParts[1:], patternParts[1:])
}
