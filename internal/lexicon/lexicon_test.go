package lexicon

import (
	"context"
	"path/filepath"
	"sync"
	"testing"

	"vee/internal/bus"
	"vee/internal/db"
)

func newStore(t *testing.T, base map[string]string) (*Store, *bus.Bus) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "l.db")
	database, err := db.Open(path)
	if err != nil {
		t.Fatalf("db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	b := bus.New(2)
	s, err := New(context.Background(), b, database, base)
	if err != nil {
		t.Fatalf("lexicon: %v", err)
	}
	return s, b
}

func TestGetBase(t *testing.T) {
	s, _ := newStore(t, map[string]string{"app.title": "Vee"})
	if v, ok := s.Get("app.title"); !ok || v != "Vee" {
		t.Fatalf("Get base = %q,%v want Vee", v, ok)
	}
	if _, ok := s.Get("missing"); ok {
		t.Fatal("expected missing key to be absent")
	}
}

func TestOverrideWins(t *testing.T) {
	s, _ := newStore(t, map[string]string{"app.title": "Vee"})
	if err := s.Set("app.title", "VeeOS"); err != nil {
		t.Fatal(err)
	}
	v, ok := s.Get("app.title")
	if !ok || v != "VeeOS" {
		t.Fatalf("override = %q,%v want VeeOS", v, ok)
	}
}

func TestEmptyValueHidesElement(t *testing.T) {
	s, b := newStore(t, map[string]string{"app.title": "Vee"})
	// empty override means "hide this element"
	if err := s.Set("app.title", ""); err != nil {
		t.Fatal(err)
	}
	v, ok := s.Get("app.title")
	if !ok || v != "" {
		t.Fatalf("empty override = %q,%v want \"\"", v, ok)
	}
	// All() should expose the empty override (key present, value empty)
	all := s.All()
	if all["app.title"] != "" {
		t.Fatalf("All should contain empty override: %v", all["app.title"])
	}
	_ = b
}

func TestClearRestoresBase(t *testing.T) {
	s, _ := newStore(t, map[string]string{"app.title": "Vee"})
	_ = s.Set("app.title", "Custom")
	_ = s.Clear("app.title")
	v, ok := s.Get("app.title")
	if !ok || v != "Vee" {
		t.Fatalf("after clear = %q,%v want Vee", v, ok)
	}
}

func TestSetPublishesChanged(t *testing.T) {
	s, b := newStore(t, map[string]string{"app.title": "Vee"})
	var got string
	b.Subscribe("lexicon.changed", func(m bus.Msg) {
		got = m.Payload.(map[string]string)["key"]
	})
	_ = s.Set("app.title", "New")
	if got != "app.title" {
		t.Fatalf("lexicon.changed not published: got %q", got)
	}
}

func TestPersistedOverride(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lp.db")
	database, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })

	s, err := New(context.Background(), bus.New(2), database, map[string]string{"k": "base"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Set("k", "on-disk"); err != nil {
		t.Fatal(err)
	}
	database.Close()

	d2, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	s2, err := New(context.Background(), bus.New(2), d2, map[string]string{"k": "base"})
	if err != nil {
		t.Fatal(err)
	}
	if v, _ := s2.Get("k"); v != "on-disk" {
		t.Fatalf("override not persisted: %q", v)
	}
}

func TestSeedBaseMerges(t *testing.T) {
	s, b := newStore(t, map[string]string{"a": "first"})
	s.SeedBase(map[string]string{"b": "second"})
	if v, _ := s.Get("b"); v != "second" {
		t.Fatalf("seeded = %q want second", v)
	}
	if v, _ := s.Get("a"); v != "first" {
		t.Fatalf("original = %q want first", v)
	}
	_ = b
}

func TestConcurrent(t *testing.T) {
	s, _ := newStore(t, map[string]string{"k": "base"})
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_ = s.Set("k", "v")
			_, _ = s.Get("k")
			_ = s.All()
		}(i)
	}
	wg.Wait()
}
