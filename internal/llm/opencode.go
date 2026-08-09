package llm

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
)

// OpenCodeOpts configures the headless opencode backend.
type OpenCodeOpts struct {
	// Binary is the opencode CLI path (default "opencode").
	Binary string
	// Model is the provider/model selector (e.g. "openrouter/deepseek/deepseek-chat-v3-0324:free").
	Model string
	// Env are extra environment variables (e.g. OPENROUTER_API_KEY).
	Env []string
}

// OpenCodeBackend runs `opencode run --format json` as a subprocess and
// normalizes its JSONL output into canonical Events. It shares the pi/opencode
// event shape (message_update / text_delta), so normalizePiEvent handles it.
type OpenCodeBackend struct {
	mu   sync.RWMutex
	opts OpenCodeOpts
}

// NewOpenCodeBackend builds the backend. Binary defaults to "opencode".
func NewOpenCodeBackend(opts OpenCodeOpts) *OpenCodeBackend {
	if opts.Binary == "" {
		opts.Binary = "opencode"
	}
	return &OpenCodeBackend{opts: opts}
}

// Name implements Backend.
func (o *OpenCodeBackend) Name() string { return "opencode" }

// Health reports whether the opencode CLI is installed.
func (o *OpenCodeBackend) Health(ctx context.Context) bool {
	bin, _ := exec.LookPath(o.opts.Binary)
	if bin == "" {
		return false
	}
	cmd := exec.CommandContext(ctx, bin, "--version")
	cmd.Stdout = os.Stderr
	return cmd.Run() == nil
}

// Stream implements Backend. It sends the final user message to
// `opencode run --format json -m <model> <content>` and normalizes the JSONL
// reply into canonical Events.
func (o *OpenCodeBackend) Stream(ctx context.Context, sessionID string, msgs []Message, opts Opts, on func(Event)) error {
	content := lastUserContent(msgs)
	if content == "" {
		return fmt.Errorf("opencode: no user message to send")
	}

	o.mu.RLock()
	bin := o.opts.Binary
	model := opts.Model
	if model == "" {
		model = o.opts.Model
	}
	env := o.opts.Env
	o.mu.RUnlock()

	if model == "" {
		return fmt.Errorf("opencode: no model configured")
	}

	args := []string{"run", "--format", "json", "-m", model}
	args = append(args, content)

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = append(os.Environ(), env...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("opencode: stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("opencode: start: %w", err)
	}

	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}
		if ev := normalizePiEvent([]byte(line)); ev != nil {
			on(*ev)
		}
	}
	werr := cmd.Wait()
	if werr != nil && sc.Err() == nil {
		return fmt.Errorf("opencode: %w", werr)
	}
	if sc.Err() != nil {
		return fmt.Errorf("opencode: read: %w", sc.Err())
	}
	return nil
}
