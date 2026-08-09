package llm

import (
	"fmt"
	"time"

	"vee/internal/bus"
)

// Tool is a capability exposed to the LLM. ArgsSchema is a JSON schema object.
type Tool struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	ArgsSchema  map[string]any    `json:"args_schema"`
	Command     string            `json:"-"` // bus command published on execution
	ArgMap      map[string]string `json:"-"` // tool arg -> bus arg
}

// ToolSet is the ordered set of tools Vee hands to backends.
type ToolSet struct {
	order []string
	byID  map[string]Tool
}

// NewToolSet returns an empty ToolSet.
func NewToolSet() *ToolSet {
	return &ToolSet{byID: map[string]Tool{}}
}

// Add registers or replaces a tool.
func (t *ToolSet) Add(tool Tool) {
	if _, ok := t.byID[tool.Name]; !ok {
		t.order = append(t.order, tool.Name)
	}
	t.byID[tool.Name] = tool
}

// List returns tools in registration order.
func (t *ToolSet) List() []Tool {
	out := make([]Tool, 0, len(t.order))
	for _, n := range t.order {
		out = append(out, t.byID[n])
	}
	return out
}

// Get returns a tool by name.
func (t *ToolSet) Get(name string) (Tool, bool) {
	tool, ok := t.byID[name]
	return tool, ok
}

// Schemas returns the JSON-schema form for model tool-calling.
func (t *ToolSet) Schemas() []map[string]any {
	out := make([]map[string]any, 0, len(t.order))
	for _, n := range t.order {
		tool := t.byID[n]
		out = append(out, map[string]any{
			"type":        "function",
			"function":    map[string]any{"name": tool.Name, "description": tool.Description, "parameters": tool.ArgsSchema},
		})
	}
	return out
}

// Dispatch builds a ToolDispatch that publishes the tool's command on the bus.
func (t *ToolSet) Dispatch(b *bus.Bus) func(name string, args map[string]any) string {
	return func(name string, args map[string]any) string {
		tool, ok := t.byID[name]
		if !ok {
			return fmt.Sprintf("unknown tool %q", name)
		}
		if tool.Command == "" {
			return fmt.Sprintf("tool %q has no bus command", name)
		}
		payload := map[string]any{}
		for k, v := range args {
			payload[k] = v
		}
		// Rename args to bus-expected keys when a mapping exists.
		if tool.ArgMap != nil {
			for from, to := range tool.ArgMap {
				if v, ok := payload[from]; ok {
					delete(payload, from)
					payload[to] = v
				}
			}
		}
		b.Publish(tool.Command, payload)
		return fmt.Sprintf("ok (published %s) at %s", tool.Command, time.Now().Format("15:04:05"))
	}
}
