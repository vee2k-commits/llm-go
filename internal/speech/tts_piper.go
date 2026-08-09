package speech

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

const (
	piperSampleRate = 22050
	piperChannels   = 1
	piperBitDepth   = 16 // S16_LE
)

// piperSilenceSamples is the run of ~quiet samples that marks the end of one
// spoken utterance in the raw PCM stream (~0.35s at 22050 Hz).
const piperSilenceSamples = piperSampleRate * 35 / 100

// piperMaxPCM caps how much raw audio we'll buffer per utterance (~60s).
const piperMaxPCM = piperSampleRate * 2 * 60

// PiperTTS is a client for a long-lived `piper --output_raw` process. It keeps
// one piper child alive, feeds sentences to its stdin, and reads the resulting
// raw 22050 Hz S16_LE mono PCM from its stdout. Each utterance is silence
// terminated, wrapped in a WAV, and played through aplay.
type PiperTTS struct {
	voice  string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	mu     sync.Mutex
}

// NewPiperTTS builds a PiperTTS for the given voice model (e.g.
// "en_US-lessac-medium"). An empty voice selects the default model. The piper
// binary is located here; if it is missing, Available() will report false.
func NewPiperTTS(voice string) *PiperTTS {
	if voice == "" {
		voice = "en_US-lessac-medium"
	}
	return &PiperTTS{voice: voice}
}

// Name implements TTS.
func (p *PiperTTS) Name() string { return "piper" }

// Available reports whether the piper binary exists and (once started) the
// persistent process is still alive.
func (p *PiperTTS) Available() bool {
	if _, err := exec.LookPath("piper"); err != nil {
		return false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd == nil {
		return true
	}
	return p.cmd.ProcessState == nil
}

// Speak renders text and plays it. It serializes with any concurrent Speak on
// the same instance (one stdin/stdout stream, so calls are strictly ordered).
func (p *PiperTTS) Speak(ctx context.Context, text string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if err := p.ensureStarted(); err != nil {
		return err
	}
	p.drain()

	if _, err := io.WriteString(p.stdin, text+"\n"); err != nil {
		return fmt.Errorf("piper: write: %w", err)
	}

	pcm, err := p.readUntilSilence(ctx)
	if err != nil {
		return err
	}
	if len(pcm) == 0 {
		return nil
	}
	return playWAV(encodeWAV(pcm, piperSampleRate))
}

// ensureStarted launches the persistent piper child on first use. If piper is
// missing it returns a descriptive error so callers can fall back to espeak.
func (p *PiperTTS) ensureStarted() error {
	if p.cmd != nil {
		return nil
	}
	bin, err := exec.LookPath("piper")
	if err != nil {
		return fmt.Errorf("piper: binary not found (install piper): %w", err)
	}
	cmd := exec.Command(bin, "-m", p.voice, "--output_raw")
	cmd.Stderr = io.Discard
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("piper: stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("piper: stdout: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("piper: start: %w", err)
	}
	p.cmd, p.stdin, p.stdout = cmd, stdin, stdout
	return nil
}

// drain discards any leftover bytes still sitting in the pipe from the previous
// utterance so the next read starts cleanly at silence.
func (p *PiperTTS) drain() {
	if f, ok := p.stdout.(*os.File); ok {
		f.SetReadDeadline(time.Now().Add(40 * time.Millisecond))
		defer f.SetReadDeadline(time.Time{})
	}
	io.Copy(io.Discard, p.stdout)
}

// readUntilSilence reads the raw PCM stream until the audio has gone quiet for
// piperSilenceSamples, or the context is done, or piperMaxPCM is reached. It
// also trims trailing silence from the returned samples.
func (p *PiperTTS) readUntilSilence(ctx context.Context) ([]byte, error) {
	if f, ok := p.stdout.(*os.File); ok {
		f.SetReadDeadline(time.Now().Add(60 * time.Second))
		defer f.SetReadDeadline(time.Time{})
	}
	var out []byte
	buf := make([]byte, 4096)
	silent := 0
	for {
		select {
		case <-ctx.Done():
			return out, ctx.Err()
		default:
		}
		n, err := p.stdout.Read(buf)
		if n > 0 {
			out = append(out, buf[:n]...)
			if len(out) > piperMaxPCM {
				break
			}
			if isSilent(buf[:n]) {
				silent += n / 2
			} else {
				silent = 0
			}
			if silent >= piperSilenceSamples && len(out) > piperSampleRate*2 {
				break
			}
		}
		if err != nil {
			if errors.Is(err, os.ErrDeadlineExceeded) || err == io.EOF {
				break
			}
			return out, fmt.Errorf("piper: read: %w", err)
		}
	}
	return trimSilence(out), nil
}

// isSilent reports whether a raw S16_LE chunk is essentially quiet (a short,
// silent gap anywhere in the stream ends the utterance).
func isSilent(b []byte) bool {
	for i := 0; i+1 < len(b); i += 2 {
		v := int16(binary.LittleEndian.Uint16(b[i : i+2]))
		if v > 300 || v < -300 {
			return false
		}
	}
	return true
}

// trimSilence drops leading and trailing near-silent samples.
func trimSilence(pcm []byte) []byte {
	start := 0
	for start+1 < len(pcm) {
		v := int16(binary.LittleEndian.Uint16(pcm[start : start+2]))
		if v > 100 || v < -100 {
			break
		}
		start += 2
	}
	end := len(pcm)
	for end-2 >= start {
		v := int16(binary.LittleEndian.Uint16(pcm[end-2 : end]))
		if v > 100 || v < -100 {
			break
		}
		end -= 2
	}
	if end <= start {
		return nil
	}
	return pcm[start:end]
}

// encodeWAV wraps raw S16_LE PCM in a RIFF/WAVE container so aplay can play it.
func encodeWAV(pcm []byte, sampleRate int) []byte {
	dataLen := len(pcm)
	buf := make([]byte, 44+dataLen)
	copy(buf, "RIFF")
	binary.LittleEndian.PutUint32(buf[4:], uint32(36+dataLen))
	copy(buf[8:], "WAVE")
	copy(buf[12:], "fmt ")
	binary.LittleEndian.PutUint32(buf[16:], 16)
	binary.LittleEndian.PutUint16(buf[20:], 1) // PCM
	binary.LittleEndian.PutUint16(buf[22:], piperChannels)
	binary.LittleEndian.PutUint32(buf[24:], uint32(sampleRate))
	binary.LittleEndian.PutUint32(buf[28:], uint32(sampleRate*piperChannels*piperBitDepth/8))
	binary.LittleEndian.PutUint16(buf[32:], uint16(piperChannels*piperBitDepth/8))
	binary.LittleEndian.PutUint16(buf[34:], piperBitDepth)
	copy(buf[36:], "data")
	binary.LittleEndian.PutUint32(buf[40:], uint32(dataLen))
	copy(buf[44:], pcm)
	return buf
}

// playWAV writes the WAV to a temp file and plays it via aplay.
func playWAV(wav []byte) error {
	f, err := os.CreateTemp("", "vee_tts_*.wav")
	if err != nil {
		return fmt.Errorf("aplay: temp: %w", err)
	}
	path := f.Name()
	defer os.Remove(path)
	if _, err := f.Write(wav); err != nil {
		f.Close()
		return fmt.Errorf("aplay: write: %w", err)
	}
	f.Close()
	return playWAVFile(path)
}

// playWAVFile plays an existing WAV file with aplay -q.
func playWAVFile(path string) error {
	bin, err := exec.LookPath("aplay")
	if err != nil {
		return fmt.Errorf("aplay: binary not found (install alsa-utils): %w", err)
	}
	cmd := exec.Command(bin, "-q", path)
	cmd.Stderr = io.Discard
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("aplay: %w", err)
	}
	return nil
}
