package config

import (
	"context"
	"path/filepath"
	"testing"

	"vee/internal/bus"
	"vee/internal/db"
)

func newStore(t *testing.T, base []Setting) (*Store, *bus.Bus) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")
	database, err := db.Open(path)
	if err != nil {
		t.Fatalf("db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	b := bus.New(2)
	s, err := New(context.Background(), b, database, base)
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	return s, b
}

func TestDefineAndGetAndSet(t *testing.T) {
	s, _ := newStore(t, nil)
	s.Define(Setting{Key: "theme.font.size", Group: "theme", Default: "15px", Type: TypeString})

	if got := s.Get("theme.font.size"); got != "15px" {
		t.Fatalf("default = %q want 15px", got)
	}
	if got := s.Get("nope"); got != "" {
		t.Fatalf("unknown key = %q want empty", got)
	}

	if err := s.Set("theme.font.size", "20px"); err != nil {
		t.Fatal(err)
	}
	if got := s.Get("theme.font.size"); got != "20px" {
		t.Fatalf("after set = %q want 20px", got)
	}
}

func TestSetUnknownKeyIsNoOp(t *testing.T) {
	s, _ := newStore(t, nil)
	if err := s.Set("does.not.exist", "x"); err != nil {
		t.Fatalf("Set unknown should be no-op, got err %v", err)
	}
	if got := s.Get("does.not.exist"); got != "" {
		t.Fatalf("unknown key leaked value %q", got)
	}
}

func TestSetPublishesChanged(t *testing.T) {
	s, b := newStore(t, []Setting{{Key: "a.b", Group: "g", Default: "1"}})
	var got []string
	b.Subscribe("settings.changed", func(m bus.Msg) {
		p := m.Payload.(map[string]string)
		got = append(got, p["key"])
	})
	b.Subscribe("state.settings", func(_ bus.Msg) {})

	if err := s.Set("a.b", "2"); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != "a.b" {
		t.Fatalf("settings.changed not published: %v", got)
	}
}

func TestBoolAndNumber(t *testing.T) {
	s, _ := newStore(t, []Setting{
		{Key: "on.flag", Default: "true", Type: TypeBool},
		{Key: "size", Default: "42", Type: TypeNumber},
	})
	if !s.Bool("on.flag") {
		t.Fatal("Bool true")
	}
	if s.Number("size") != 42 {
		t.Fatalf("Number = %v want 42", s.Number("size"))
	}
}

func TestSetAny(t *testing.T) {
	s, _ := newStore(t, []Setting{{Key: "n", Default: "0", Type: TypeNumber}})
	if err := s.SetAny("n", 7); err != nil {
		t.Fatal(err)
	}
	if s.Get("n") != "7" {
		t.Fatalf("SetAny int = %q want 7", s.Get("n"))
	}
}

func TestPersistedOverrideWins(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "p.db")
	database, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })

	// pre-seed an override
	if err := database.SettingSet(context.Background(), "seeded", "fromdisk"); err != nil {
		t.Fatal(err)
	}
	b := bus.New(2)
	s, err := New(context.Background(), b, database, []Setting{{
		Key: "seeded", Group: "g", Default: "default",
	}})
	if err != nil {
		t.Fatal(err)
	}
	if got := s.Get("seeded"); got != "fromdisk" {
		t.Fatalf("override should win over default: got %q", got)
	}
}

func TestAsRegistryEntries(t *testing.T) {
	s, _ := newStore(t, []Setting{
		{Key: "theme.font.size", Group: "theme", Default: "15px", Type: TypeString, Label: "Font size"},
	})
	entries := s.AsRegistryEntries()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Kind != "setting" || entries[0].ID != "theme.font.size" {
		t.Fatalf("bad entry: %+v", entries[0])
	}
}

func TestSchemaOmitsEmpty(t *testing.T) {
	s, _ := newStore(t, []Setting{{Key: "k", Default: "d", Type: TypeBool}})
	sch := s.Schema()
	if len(sch) != 1 || sch[0].Value != "d" {
		t.Fatalf("bad schema: %+v", sch)
	}
}

func TestSetThenCloseReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "r.db")
	func() {
		database, _ := db.Open(path)
		t.Cleanup(func() { /* last open closes it */ })
		b := bus.New(2)
		s, _ := New(context.Background(), b, database, []Setting{{Key: "k", Default: "d"}})
		_ = s.Set("k", "persisted")
		database.Close()
	}()
	database, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	b := bus.New(2)
	s, err := New(context.Background(), b, database, []Setting{{Key: "k", Default: "d"}})
	if err != nil {
		t.Fatal(err)
	}
	if got := s.Get("k"); got != "persisted" {
		t.Fatalf("expected persisted value, got %q", got)
	}
}
