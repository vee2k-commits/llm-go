package llm

import (
	"testing"

	"vee/internal/bus"
)

func TestToolSetAddListGet(t *testing.T) {
	ts := NewToolSet()
	ts.Add(Tool{Name: "read", Description: "read file", ArgsSchema: map[string]any{"type": "object"}, Command: "file.read"})
	ts.Add(Tool{Name: "read", Description: "dup"}) // replace
	ts.Add(Tool{Name: "bash", Command: "shell.exec"})

	if len(ts.List()) != 2 {
		t.Fatalf("List = %d want 2", len(ts.List()))
	}
	r, ok := ts.Get("read")
	if !ok || r.Description != "dup" {
		t.Fatalf("Get read = %+v,%v", r, ok)
	}
}

func TestToolSetSchemas(t *testing.T) {
	ts := NewToolSet()
	ts.Add(Tool{Name: "read", Description: "r", ArgsSchema: map[string]any{"type": "object"}})
	s := ts.Schemas()
	if len(s) != 1 {
		t.Fatal("expected 1 schema")
	}
	fn := s[0]["function"].(map[string]any)
	if fn["name"] != "read" || fn["description"] != "r" {
		t.Fatalf("bad schema: %+v", fn)
	}
}

func TestToolSetDispatchKnown(t *testing.T) {
	b := bus.New(2)
	var recv map[string]any
	b.Subscribe("file.read", func(m bus.Msg) {
		recv = m.Payload.(map[string]any)
	})
	ts := NewToolSet()
	ts.Add(Tool{
		Name:        "read",
		Command:     "file.read",
		ArgMap:      map[string]string{"path": "path"},
		ArgsSchema:  map[string]any{"type": "object"},
	})
	fn := ts.Dispatch(b)
	result := fn("read", map[string]any{"path": "/tmp/x"})
	if recv == nil || recv["path"] != "/tmp/x" {
		t.Fatalf("bus payload = %+v", recv)
	}
	if result == "" {
		t.Fatal("Dispatch should return a non-empty status string")
	}
}

func TestToolSetDispatchUnknown(t *testing.T) {
	b := bus.New(2)
	ts := NewToolSet()
	fn := ts.Dispatch(b)
	got := fn("nope", nil)
	if got == "ok" {
		t.Fatal("unknown tool should not return ok")
	}
}

func TestToolSetDispatchNoCommand(t *testing.T) {
	b := bus.New(2)
	ts := NewToolSet()
	ts.Add(Tool{Name: "noaction"})
	fn := ts.Dispatch(b)
	got := fn("noaction", nil)
	if got == "ok" {
		t.Fatal("tool without command should not publish ok")
	}
}

func TestToolSetDispatchArgMapRename(t *testing.T) {
	b := bus.New(2)
	var recv map[string]any
	b.Subscribe("shell.exec", func(m bus.Msg) {
		recv = m.Payload.(map[string]any)
	})
	ts := NewToolSet()
	ts.Add(Tool{Name: "bash", Command: "shell.exec", ArgMap: map[string]string{"cmd": "command"}})
	fn := ts.Dispatch(b)
	fn("bash", map[string]any{"cmd": "ls -la"})
	if recv["command"] != "ls -la" {
		t.Fatalf("ArgMap rename failed: %+v", recv)
	}
	if _, ok := recv["cmd"]; ok {
		t.Fatalf("old key should be removed: %+v", recv)
	}
}

func TestToolSetOrderStable(t *testing.T) {
	ts := NewToolSet()
	ts.Add(Tool{Name: "z"})
	ts.Add(Tool{Name: "a"})
	ts.Add(Tool{Name: "m"})
	list := ts.List()
	order := []string{"z", "a", "m"}
	if len(list) != len(order) {
		t.Fatal("len mismatch")
	}
	for i, n := range order {
		if list[i].Name != n {
			t.Fatalf("order[%d] = %q want %q", i, list[i].Name, n)
		}
	}
}
