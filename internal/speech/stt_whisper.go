package speech

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"time"
)

// DefaultWhisperURL is the local whisper.cpp `whisper-server` endpoint.
const DefaultWhisperURL = "http://127.0.0.1:9090"

// WhisperSTT transcribes 16 kHz mono WAV audio via a whisper.cpp HTTP server.
type WhisperSTT struct {
	URL string
	cli *http.Client
}

// NewWhisperSTT builds a client for the given whisper-server base URL.
// An empty url falls back to the default local endpoint.
func NewWhisperSTT(url string) *WhisperSTT {
	if url == "" {
		url = DefaultWhisperURL
	}
	return &WhisperSTT{
		URL: url,
		cli: &http.Client{Timeout: 60 * time.Second},
	}
}

// Name implements STT.
func (w *WhisperSTT) Name() string { return "whisper" }

// Available reports whether the whisper-server is reachable and healthy.
func (w *WhisperSTT) Available() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.URL+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := w.cli.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return resp.StatusCode == http.StatusOK
}

// Transcribe POSTs the WAV as a multipart form to /inference and returns the
// recognized text. The request mirrors the whisper.cpp server's expected fields.
func (w *WhisperSTT) Transcribe(ctx context.Context, wav []byte) (string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	hdr := make(textproto.MIMEHeader)
	hdr.Set("Content-Disposition", `form-data; name="file"; filename="utterance.wav"`)
	hdr.Set("Content-Type", "audio/wav")
	fw, err := mw.CreatePart(hdr)
	if err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	fw.Write(wav)
	mw.WriteField("response_format", "json")
	mw.WriteField("language", "en")
	mw.WriteField("temperature", "0.0")
	mw.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, w.URL+"/inference", &buf)
	if err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := w.cli.Do(req)
	if err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("whisper: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("whisper: status %d: %s", resp.StatusCode, body)
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("whisper: bad response: %w", err)
	}
	return out.Text, nil
}
