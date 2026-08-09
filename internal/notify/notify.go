// Package notify is Vee's toast/notification system. Both modules and the LLM
// post here (the LLM gets a notify.push tool). Toasts render near the [Vee]
// wordmark and are the "notification system for LLMs".
package notify

import (
	"fmt"
	"sync/atomic"
	"time"

	"vee/internal/bus"
)

// Level of a notification.
type Level string

const (
	LevelInfo  Level = "info"
	LevelDebug Level = "debug"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

// Notice is a single toast.
type Notice struct {
	ID      int64  `json:"id"`
	Level   Level  `json:"level"`
	Title   string `json:"title"`
	Body    string `json:"body"`
	TTL     int    `json:"ttl"` // seconds; 0 = until dismissed
	Created int64  `json:"created"`
}

// Service fans notices onto the bus.
type Service struct {
	bus  *bus.Bus
	next atomic.Int64
}

// New creates a Service.
func New(b *bus.Bus) *Service {
	return &Service{bus: b}
}

func (s *Service) push(level Level, title, body string, ttl int) {
	n := Notice{
		ID:      s.next.Add(1),
		Level:   level,
		Title:   title,
		Body:    body,
		TTL:     ttl,
		Created: time.Now().UnixMilli(),
	}
	s.bus.Publish("notify.push", n)
}

// Info posts an informational toast.
func (s *Service) Info(title, body string) { s.push(LevelInfo, title, body, 5) }

// Debug posts a debug toast.
func (s *Service) Debug(title, body string) { s.push(LevelDebug, title, body, 3) }

// Warn posts a warning toast.
func (s *Service) Warn(title, body string) { s.push(LevelWarn, title, body, 8) }

// Error posts an error toast (sticky until dismissed).
func (s *Service) Error(title, body string) { s.push(LevelError, title, body, 0) }

// Errorf formats an error toast.
func (s *Service) Errorf(title, format string, args ...any) {
	s.push(LevelError, title, fmt.Sprintf(format, args...), 0)
}
