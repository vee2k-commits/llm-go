package audio

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Resolver turns a user query/URL/path into one or more playable Tracks. It
// shells out to yt-dlp for anything that is not a direct local file or URL.
type Resolver struct {
	// YTDLP is the yt-dlp binary path (default: YTDLP_PATH env or "yt-dlp").
	YTDLP string
	// Timeout bounds each yt-dlp invocation.
	Timeout time.Duration
}

// NewResolver returns a Resolver with the default binary path and timeout.
func NewResolver() *Resolver {
	bin := os.Getenv("YTDLP_PATH")
	if bin == "" {
		bin = "yt-dlp"
	}
	return &Resolver{YTDLP: bin, Timeout: 30 * time.Second}
}

// Resolve turns input into a single playable Track. Local file paths become
// file:// URIs, http(s) URLs pass through, YouTube URLs are resolved to a
// direct audio stream via yt-dlp, and anything else is treated as a search
// query (first hit).
func (r *Resolver) Resolve(ctx context.Context, input string) (Track, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return Track{}, fmt.Errorf("empty input")
	}

	if st, err := os.Stat(input); err == nil && !st.IsDir() {
		abs, err := filepath.Abs(input)
		if err != nil {
			abs = input
		}
		return Track{URI: "file://" + abs, Title: filepath.Base(input), Source: "local"}, nil
	}

	if strings.HasPrefix(input, "http://") || strings.HasPrefix(input, "https://") {
		if isYouTube(input) {
			return r.resolveYouTube(ctx, input)
		}
		return Track{URI: input, Title: input, Source: "url"}, nil
	}

	return r.resolveSearch(ctx, input, 1)
}

// Search resolves a plain query into n tracks (capped 1..10) via
// "ytsearchN:QUERY".
func (r *Resolver) Search(ctx context.Context, query string, n int) ([]Track, error) {
	if n < 1 {
		n = 1
	}
	if n > 10 {
		n = 10
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty search query")
	}
	spec := fmt.Sprintf("ytsearch%d:%s", n, query)
	lines, err := r.ytdlpLines(ctx, spec, "--print", "%(id)s\t%(title)s")
	if err != nil {
		return nil, err
	}
	tracks := make([]Track, 0, len(lines))
	for _, line := range lines {
		id, title, ok := strings.Cut(line, "\t")
		if !ok {
			continue
		}
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		tracks = append(tracks, Track{
			URI:    "https://www.youtube.com/watch?v=" + id,
			Title:  strings.TrimSpace(title),
			Source: "youtube",
		})
	}
	if len(tracks) == 0 {
		return nil, fmt.Errorf("no search results for %q", query)
	}
	return tracks, nil
}

func (r *Resolver) resolveSearch(ctx context.Context, query string, n int) (Track, error) {
	tracks, err := r.Search(ctx, query, n)
	if err != nil {
		return Track{}, err
	}
	return tracks[0], nil
}

func (r *Resolver) resolveYouTube(ctx context.Context, input string) (Track, error) {
	uri, err := r.ytdlpOut(ctx, "-f", "bestaudio/best", "-g", "--no-playlist", input)
	if err != nil {
		return Track{}, err
	}
	title, _ := r.ytdlpOut(ctx, "--print", "%(title)s", "--no-playlist", input)
	return Track{URI: uri, Title: title, Source: "youtube"}, nil
}

// ytdlpOut runs yt-dlp and returns the last non-empty stdout line.
func (r *Resolver) ytdlpOut(ctx context.Context, args ...string) (string, error) {
	lines, err := r.ytdlpLines(ctx, args...)
	if err != nil {
		return "", err
	}
	return lines[len(lines)-1], nil
}

// ytdlpLines runs yt-dlp and returns every non-empty stdout line.
func (r *Resolver) ytdlpLines(ctx context.Context, args ...string) ([]string, error) {
	bin := r.ytdlpBinary()
	if _, err := exec.LookPath(bin); err != nil {
		return nil, fmt.Errorf("yt-dlp not found at %q (install it or set YTDLP_PATH)", bin)
	}
	runCtx, cancel := context.WithTimeout(ctx, r.timeout())
	defer cancel()
	cmd := exec.CommandContext(runCtx, bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if runCtx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("yt-dlp timed out after %s", r.timeout())
		}
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("yt-dlp: %s", msg)
	}
	lines := nonEmptyLines(string(out))
	if len(lines) == 0 {
		return nil, fmt.Errorf("yt-dlp produced no output")
	}
	return lines, nil
}

func (r *Resolver) ytdlpBinary() string {
	if r.YTDLP != "" {
		return r.YTDLP
	}
	return "yt-dlp"
}

func (r *Resolver) timeout() time.Duration {
	if r.Timeout > 0 {
		return r.Timeout
	}
	return 30 * time.Second
}

func isYouTube(s string) bool {
	lower := strings.ToLower(s)
	return strings.Contains(lower, "youtube.com") || strings.Contains(lower, "youtu.be")
}

func nonEmptyLines(s string) []string {
	var out []string
	for _, l := range strings.Split(s, "\n") {
		l = strings.TrimSpace(l)
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}
