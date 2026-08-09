package macros

import (
	"bufio"
	"encoding/json"
	"os"
	"strconv"
	"strings"
)

// ParseJSON decodes a JSON document into a slice of macros.
func ParseJSON(data []byte) ([]Macro, error) {
	var out []Macro
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ParseText parses a tolerant line-based macro format.
//
// Supported keys: id:, name:, trigger:, description:, steps:, then
// "- action:" and "- args: {k: v}" (values parsed via strconv).
func ParseText(data []byte) ([]Macro, error) {
	var out []Macro
	var cur *Macro
	var curStep *Step

	flush := func() {
		if cur != nil {
			out = append(out, *cur)
		}
		cur = &Macro{}
		curStep = nil
	}

	sc := bufio.NewScanner(strings.NewReader(string(data)))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if line == "steps:" {
			if cur == nil {
				cur = &Macro{}
			}
			continue
		}
		if strings.HasPrefix(line, "- action:") {
			step := Step{Action: strings.TrimSpace(strings.TrimPrefix(line, "- action:"))}
			curStep = &step
			cur.Steps = append(cur.Steps, step)
			continue
		}
		if strings.HasPrefix(line, "- args:") {
			raw := strings.TrimSpace(strings.TrimPrefix(line, "- args:"))
			args, err := parseArgs(raw)
			if err != nil {
				return nil, err
			}
			if curStep != nil && len(cur.Steps) > 0 {
				cur.Steps[len(cur.Steps)-1].Args = args
			}
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		val = strings.TrimSpace(val)
		switch strings.TrimSpace(key) {
		case "id":
			cur.ID = val
		case "name":
			cur.Name = val
		case "trigger":
			cur.Trigger = val
		case "description":
			cur.Description = val
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	flush()
	return out, nil
}

func parseArgs(raw string) (map[string]any, error) {
	args := map[string]any{}
	raw = strings.TrimSpace(raw)
	if raw == "{}" {
		return args, nil
	}
	inner := strings.TrimSuffix(strings.TrimPrefix(raw, "{"), "}")
	for _, pair := range strings.Split(inner, ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(pair), ":")
		if !ok {
			continue
		}
		k = strings.Trim(strings.TrimSpace(k), `"`)
		args[k] = parseValue(strings.TrimSpace(v))
	}
	return args, nil
}

func parseValue(v string) any {
	v = strings.TrimSpace(v)
	if len(v) >= 2 && v[0] == '"' && v[len(v)-1] == '"' {
		return v[1 : len(v)-1]
	}
	if b, err := strconv.ParseBool(v); err == nil {
		return b
	}
	if n, err := strconv.ParseInt(v, 10, 64); err == nil {
		return n
	}
	if f, err := strconv.ParseFloat(v, 64); err == nil {
		return f
	}
	return v
}

// LoadFile parses a macro file by extension: .json uses JSON, anything else text.
func LoadFile(path string) ([]Macro, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if strings.HasSuffix(strings.ToLower(path), ".json") {
		return ParseJSON(data)
	}
	return ParseText(data)
}
