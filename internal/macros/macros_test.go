package macros

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"vee/internal/bus"
	"vee/internal/notify"
	"vee/internal/registry"
)

func TestEngineRegisterAndRun(t *testing.T) {
	b := bus.New(10)
	reg, _ := registry.New(context.Background(), b, nil)
	n := notify.New(b)
	e := NewEngine(b, reg, n)

	// Step action tracking
	var step1Count, step2Count int
	b.Subscribe("test.step1", func(msg bus.Msg) {
		step1Count++
	})
	b.Subscribe("test.step2", func(msg bus.Msg) {
		step2Count++
	})

	var started, finished bool
	b.Subscribe("macro.started", func(msg bus.Msg) {
		started = true
	})
	b.Subscribe("macro.finished", func(msg bus.Msg) {
		finished = true
	})

	m := Macro{
		ID:      "test-macro",
		Name:    "Test Macro",
		Trigger: "run test",
		Steps: []Step{
			{Action: "test.step1"},
			{Action: "test.step2", Args: map[string]any{"val": 42}},
		},
	}

	if err := e.Register(m); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// Verify command registered
	if _, ok := reg.Get("macro.test-macro"); !ok {
		t.Fatal("macro command not found in registry")
	}

	// Run macro
	if err := e.Run("test-macro"); err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if !started || !finished {
		t.Fatalf("expected started and finished events, got started=%v finished=%v", started, finished)
	}
	if step1Count != 1 || step2Count != 1 {
		t.Fatalf("step counts mismatch: step1=%d step2=%d", step1Count, step2Count)
	}
}

func TestMacroRunEventWiring(t *testing.T) {
	b := bus.New(10)
	reg, _ := registry.New(context.Background(), b, nil)
	n := notify.New(b)
	e := NewEngine(b, reg, n)

	var stepFired bool
	b.Subscribe("test.action", func(msg bus.Msg) {
		stepFired = true
	})

	_ = e.Register(Macro{
		ID:    "wire-test",
		Steps: []Step{{Action: "test.action"}},
	})

	// Publish macro.run event on bus
	b.Publish("macro.run", map[string]any{"id": "wire-test"})

	if !stepFired {
		t.Fatal("macro.run event did not execute macro steps")
	}
}

func TestRegisterValidation(t *testing.T) {
	b := bus.New(10)
	reg, _ := registry.New(context.Background(), b, nil)
	e := NewEngine(b, reg, nil)

	if err := e.Register(Macro{ID: ""}); err == nil {
		t.Fatal("expected error for empty ID")
	}
	if err := e.Register(Macro{ID: "no-steps", Steps: []Step{}}); err == nil {
		t.Fatal("expected error for macro with no steps")
	}
}

func TestRunNotFound(t *testing.T) {
	e := NewEngine(nil, nil, nil)
	if err := e.Run("nonexistent"); err == nil {
		t.Fatal("expected error running nonexistent macro")
	}
}

func TestMatch(t *testing.T) {
	b := bus.New(10)
	reg, _ := registry.New(context.Background(), b, nil)
	e := NewEngine(b, reg, nil)

	_ = e.Register(Macro{
		ID:      "m1",
		Trigger: "play music",
		Steps:   []Step{{Action: "a"}},
	})

	if id := e.Match("Please Play Music Now"); id != "m1" {
		t.Fatalf("Match = %q want m1", id)
	}
	if id := e.Match("something else"); id != "" {
		t.Fatalf("Match = %q want empty", id)
	}
}

func TestSeedDefaultMacros(t *testing.T) {
	b := bus.New(10)
	reg, _ := registry.New(context.Background(), b, nil)
	e := NewEngine(b, reg, nil)

	e.SeedDefaultMacros()

	if id := e.Match("cyberwave"); id != "cyberwave" {
		t.Fatalf("Default cyberwave macro match failed, got %q", id)
	}
}

func TestParseJSONAndText(t *testing.T) {
	jsonData := []byte(`[{"id":"m1","name":"M1","steps":[{"action":"a1","args":{"x":1}}]}]`)
	ms, err := ParseJSON(jsonData)
	if err != nil || len(ms) != 1 || ms[0].ID != "m1" {
		t.Fatalf("ParseJSON failed: err=%v ms=%v", err, ms)
	}

	textData := []byte(`id: m2
name: M2
trigger: hello
steps:
- action: test.act
- args: {key: "val", count: 5, flag: true}
`)
	msText, err := ParseText(textData)
	if err != nil || len(msText) != 1 || msText[0].ID != "m2" {
		t.Fatalf("ParseText failed: err=%v ms=%v", err, msText)
	}
	if len(msText[0].Steps) != 1 || msText[0].Steps[0].Action != "test.act" {
		t.Fatalf("ParseText step mismatch: %v", msText[0].Steps)
	}

	// Test LoadFile
	tmpDir := t.TempDir()
	jsonPath := filepath.Join(tmpDir, "test.json")
	textPath := filepath.Join(tmpDir, "test.txt")
	_ = os.WriteFile(jsonPath, jsonData, 0644)
	_ = os.WriteFile(textPath, textData, 0644)

	if loaded, err := LoadFile(jsonPath); err != nil || len(loaded) != 1 {
		t.Fatalf("LoadFile json failed: %v", err)
	}
	if loaded, err := LoadFile(textPath); err != nil || len(loaded) != 1 {
		t.Fatalf("LoadFile text failed: %v", err)
	}
}

// Regression: ParseText must not panic when a scalar key (id:, name:, ...)
// or a step appears before any "steps:" header.
func TestParseTextNoPanicWithoutStepsHeader(t *testing.T) {
	cases := [][]byte{
		[]byte("id: m1\nname: M1\ntrigger: hi\nsteps:\n- action: a\n"),
		[]byte("- action: a\n- args: {k: 1}\n"),
		[]byte("id: only-id\n"),
		[]byte("steps:\n- action: a\nid: late\n"),
	}
	for i, data := range cases {
		ms, err := ParseText(data)
		if err != nil {
			t.Fatalf("case %d: unexpected error: %v", i, err)
		}
		if len(ms) == 0 {
			t.Fatalf("case %d: expected at least one macro", i)
		}
	}
}

func TestChatSubmittedTriggersMacro(t *testing.T) {
	b := bus.New(10)
	reg, _ := registry.New(context.Background(), b, nil)
	e := NewEngine(b, reg, nil)

	var fired bool
	b.Subscribe("test.fired", func(msg bus.Msg) {
		fired = true
	})
	_ = e.Register(Macro{
		ID:      "animals-macro",
		Trigger: "animals",
		Steps:   []Step{{Action: "test.fired"}},
	})

	b.Publish("chat.submitted", map[string]any{"text": "please load funny animals videos", "origin": "chat"})
	if !fired {
		t.Fatal("chat.submitted did not trigger matching macro")
	}

	fired = false
	b.Publish("chat.submitted", map[string]any{"text": "nothing matching here", "origin": "chat"})
	if fired {
		t.Fatal("macro fired on non-matching text")
	}
}
