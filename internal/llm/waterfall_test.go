package llm

import (
	"context"
	"testing"

	"vee/internal/config"
)

func newCfg(t *testing.T) *config.Store {
	t.Helper()
	c, err := config.New(context.Background(), nil, nil, nil)
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	return c
}

func newRouter(t *testing.T, cfg *config.Store) *ModelRouter {
	return NewModelRouter(cfg)
}

func TestDefaultWaterfall(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	if r.Tier() != TierFree {
		t.Fatalf("initial tier = %q want free", r.Tier())
	}
	cur := r.Current()
	if cur != DefaultWaterfall[0].Models[0] {
		t.Fatalf("current = %q", cur)
	}
	if !r.IsFree() {
		t.Fatal("expected free model")
	}
}

func TestAdvanceWithinTier(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	first := r.Current()
	second := r.Advance()
	if first == second {
		t.Fatalf("advance should move to next model: %q -> %q", first, second)
	}
	// within free tier, second should be index 1
	if second != DefaultWaterfall[0].Models[1] {
		t.Fatalf("second = %q want %q", second, DefaultWaterfall[0].Models[1])
	}
}

func TestAdvanceEscalatesTier(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	// free has 3 models: advance 3x to wrap -> escalate to cheap
	m0 := r.Current()
	r.Advance()
	r.Advance()
	m3 := r.Advance()
	if m3 == m0 {
		t.Fatalf("advance 3 times stayed at %q; expected escalation", m3)
	}
	if r.Tier() != TierCheap {
		t.Fatalf("expected escalation to cheap, got %q", r.Tier())
	}
}

func TestReset(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	r.Advance()
	r.Advance()
	r.Reset()
	if r.Tier() != TierFree {
		t.Fatalf("tier = %q want free after reset", r.Tier())
	}
	if r.Current() != DefaultWaterfall[0].Models[0] {
		t.Fatalf("current = %q want first free model", r.Current())
	}
}

func TestSetTierInvalid(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	if r.SetTier("bogus") {
		t.Fatal("SetTier bogus should return false")
	}
	if r.Tier() != TierFree {
		t.Fatalf("tier should be unchanged, got %q", r.Tier())
	}
}

func TestSetTierValid(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	if !r.SetTier(TierPro) {
		t.Fatal("SetTier pro should return true")
	}
	if r.Tier() != TierPro {
		t.Fatalf("tier = %q want pro", r.Tier())
	}
}

func TestLoadFromSettings(t *testing.T) {
	cfg := newCfg(t)
	r := NewModelRouter(cfg)
	custom := `[{"name":"free","models":["m1","m2"]},{"name":"cheap","models":["m3"]}]`
	if err := cfg.SetAny("llm.waterfall", custom); err != nil {
		t.Fatal(err)
	}
	if err := cfg.SetAny("llm.waterfall.tier", "cheap"); err != nil {
		t.Fatal(err)
	}
	r.load()
	if r.Tier() != "cheap" {
		t.Fatalf("tier = %q want cheap", r.Tier())
	}
	if r.Current() != "m3" {
		t.Fatalf("current = %q want m3", r.Current())
	}
}

func TestIsFreeTrueAndFalse(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	if !r.IsFree() {
		t.Fatal("default current is a :free model")
	}
	if !r.SetTier(TierCheap) {
		t.Fatal("set cheap")
	}
	if r.IsFree() {
		t.Fatal("cheap model should not be free")
	}
}

func TestNames(t *testing.T) {
	cfg := newCfg(t)
	r := newRouter(t, cfg)
	names := r.Names()
	if len(names) != 3 || names[0] != TierFree || names[2] != TierPro {
		t.Fatalf("Names = %v", names)
	}
}
