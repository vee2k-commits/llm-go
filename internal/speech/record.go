package speech

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

// recordSampleRate is the mono 16 kHz rate STT engines expect.
const recordSampleRate = 16000

// RecordWAV captures `seconds` of audio from the default PulseAudio source via
// ffmpeg and returns it as a complete 16 kHz mono 16-bit WAV. The context is
// honored: cancelling it kills ffmpeg and returns ctx.Err().
func RecordWAV(ctx context.Context, seconds int) ([]byte, error) {
	if seconds <= 0 {
		seconds = 5
	}
	bin, err := exec.LookPath("ffmpeg")
	if err != nil {
		return nil, fmt.Errorf("record: ffmpeg not found (install ffmpeg): %w", err)
	}
	args := []string{
		"-f", "pulse",
		"-i", "default",
		"-t", fmt.Sprint(seconds),
		"-ar", fmt.Sprint(recordSampleRate),
		"-ac", "1",
		"-c:a", "pcm_s16le",
		"-f", "wav",
		"pipe:1",
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("record: ffmpeg failed: %w", err)
	}
	if out.Len() < 44 {
		return nil, fmt.Errorf("record: ffmpeg produced no audio (is a mic present?)")
	}
	return out.Bytes(), nil
}
