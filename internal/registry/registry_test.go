package registry

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"vee/internal/bus"
	"vee/internal/db"
)

func newReg(t *testing.T) (*Registry, *bus.Bus) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "r.db")
	database, err := db.Open(path)
	if err != nil {
		t.Fatalf("db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	b := bus.New(2)
	r, err := New(context.Background(), b, database)
	if err != nil {
		t.Fatalf("registry: %v", err)
	}
	return r, b
}

func TestRegisterGetList(t *testing.T) {
	r, b := newReg(t)
	var published []string
	b.Subscribe("registry.registered", func(m bus.Msg) {
		published = append(published, m.Payload.(Entry).ID)
	})
	if err := r.Register(Entry{ID: "g.pacman", Kind: Game, Name: "Pac-Man"}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(Entry{ID: "g.tetris", Kind: Game, Name: "Tetris"}); err != nil {
		t.Fatal(err)
	}

	e, ok := r.Get("g.pacman")
	if !ok || e.Name != "Pac-Man" {
		t.Fatalf("Get = %+v,%v want Pac-Man", e, ok)
	}

	games := r.List(Game)
	if len(games) != 2 {
		t.Fatalf("List(game) = %d want 2", len(games))
	}

	all := r.List("")
	if len(all) != 2 {
		t.Fatalf("List(all) = %d want 2", len(all))
	}
	if len(published) != 2 {
		t.Fatalf("registry.registered published %d times, want 2: %v", len(published), published)
	}
}

func TestRegisterRequiresIDAndKind(t *testing.T) {
	r, _ := newReg(t)
	if err := r.Register(Entry{Kind: Game}); err == nil {
		t.Fatal("expected error for missing id")
	}
	if err := r.Register(Entry{ID: "x"}); err == nil {
		t.Fatal("expected error for missing kind")
	}
}

func TestRegisterDefaults(t *testing.T) {
	r, _ := newReg(t)
	if err := r.Register(Entry{ID: "x.y", Kind: Tool}); err != nil {
		t.Fatal(err)
	}
	e, _ := r.Get("x.y")
	if e.Name != "x.y" || e.Status != StatusEnabled {
		t.Fatalf("defaults = %+v", e)
	}
}

func TestSetStatus(t *testing.T) {
	r, b := newReg(t)
	_ = r.Register(Entry{ID: "cmd.x", Kind: Command})
	var got string
	b.Subscribe("registry.updated", func(m bus.Msg) {
		got = m.Payload.(Entry).Status
	})
	r.SetStatus("cmd.x", StatusDisabled)
	e, ok := r.Get("cmd.x")
	if !ok || e.Status != StatusDisabled {
		t.Fatalf("SetStatus = %+v,%v", e, ok)
	}
	if got != StatusDisabled {
		t.Fatalf("registry.updated not published with status %q", got)
	}
}

func TestUnregister(t *testing.T) {
	r, b := newReg(t)
	_ = r.Register(Entry{ID: "g.x", Kind: Game})
	var removed any
	b.Subscribe("registry.removed", func(m bus.Msg) {
		removed = m.Payload.(Entry).ID
	})
	r.Unregister("g.x")
	if _, ok := r.Get("g.x"); ok {
		t.Fatal("still present after unregister")
	}
	if removed != "g.x" {
		t.Fatalf("registry.removed published with %v", removed)
	}
}

func TestPublishStateMirrorsKinds(t *testing.T) {
	r, b := newReg(t)
	var stateKeys []string
	b.SubscribePattern("state.registry.*", func(m bus.Msg) {
		// topic like state.registry.game
		parts := splitTopicForTest(m.Topic)
		stateKeys = append(stateKeys, parts[len(parts)-1])
	})
	_ = r.Register(Entry{ID: "gm.one", Kind: Game})
	_ = r.Register(Entry{ID: "ms.one", Kind: MediaSource})
	// Count occurrences
	counts := map[string]int{}
	for _, k := range stateKeys {
		counts[k]++
	}
	if counts["game"] == 0 {
		t.Fatalf("state.registry.game never published; have %v", counts)
	}
	if counts["mediasource"] == 0 {
		t.Fatalf("state.registry.mediasource never published; have %v", counts)
	}
}

func TestCallHook(t *testing.T) {
	r, _ := newReg(t)
	called := ""
	_ = r.Register(Entry{ID: "t.x", Kind: Tool, Hook: func(ev Event) {
		called = ev.Type
	}})
	r.CallHook("t.x", Event{Type: "ping"})
	if called != "ping" {
		t.Fatalf("hook not invoked: %q", called)
	}
}

func TestCount(t *testing.T) {
	r, _ := newReg(t)
	_ = r.Register(Entry{ID: "g.a", Kind: Game})
	_ = r.Register(Entry{ID: "g.b", Kind: Game})
	if r.Count(Game) != 2 {
		t.Fatalf("Count(game) = %d want 2", r.Count(Game))
	}
}

func TestEntryMetaJSONOmitsHook(t *testing.T) {
	e := Entry{ID: "x", Name: "X", Meta: map[string]any{"a": 1}, Hook: func(Event) {}}
	b, err := json.Marshal(e)
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	if !json.Valid(b) {
		t.Fatalf("invalid json: %s", s)
	}
	if contains(s, "Hook") || contains(s, "\"-\"") {
		t.Fatalf("hook leaked into json: %s", s)
	}
}

func contains(s, sub string) bool { return len(s) >= len(sub) && (indexOf(s, sub) >= 0) }

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func splitTopicForTest(t string) []string {
	var out []string
	cur := ""
	for _, r := range t {
		if r == '.' {
			out = append(out, cur)
			cur = ""
			continue
		}
		cur += string(r)
	}
	out = append(out, cur)
	return out
}
