package bus

import (
	"sync"
	"testing"
)

func TestSubscribeExact(t *testing.T) {
	b := New(5)
	var got []Msg
	unsub := b.Subscribe("foo.bar", func(m Msg) { got = append(got, m) })
	b.Publish("foo.bar", "hello")
	b.Publish("foo.baz", "nope")
	if len(got) != 1 || got[0].Payload != "hello" {
		t.Fatalf("expected one 'hello' msg, got %v", got)
	}
	unsub()
	b.Publish("foo.bar", "again")
	if len(got) != 1 {
		t.Fatalf("unsubscribe did not work: %d", len(got))
	}
}

func TestSubscribePatternGlob(t *testing.T) {
	b := New(5)
	var got []string
	b.SubscribePattern("chat.*", func(m Msg) { got = append(got, m.Topic) })
	b.Publish("chat.message", 1)
	b.Publish("chat.token", 2)
	b.Publish("chat.ended", 3)
	b.Publish("state.chat", 9) // outside pattern scope (single segment match)
	if len(got) != 3 {
		t.Fatalf("expected 3 chat.* msgs, got %d: %v", len(got), got)
	}
}

func TestSubscribePatternDoubleStar(t *testing.T) {
	b := New(5)
	var got []string
	b.SubscribePattern("**", func(m Msg) { got = append(got, m.Topic) })
	b.Publish("a.b.c", 1)
	b.Publish("wizard.started", 2)
	if len(got) != 2 {
		t.Fatalf("expected ** to catch all, got %d: %v", len(got), got)
	}
}

func TestSubscribePatternUnsubscribe(t *testing.T) {
	b := New(5)
	var got int
	unsub := b.SubscribePattern("**", func(m Msg) { got++ })
	b.Publish("a", 1)
	b.Publish("b", 2)
	unsub()
	b.Publish("c", 3)
	if got != 2 {
		t.Fatalf("expected 2 before unsubscribe, got %d", got)
	}
}

func TestSubscribePatternStarOneSegment(t *testing.T) {
	b := New(5)
	var got []string
	b.SubscribePattern("a.*.c", func(m Msg) { got = append(got, m.Topic) })
	b.Publish("a.b.c", 1)
	b.Publish("a.b.d.c", 2) // "b.d" is two segments, star matches one
	b.Publish("a.x.c.y", 3)
	if len(got) != 1 || got[0] != "a.b.c" {
		t.Fatalf("star must match exactly one segment: %v", got)
	}
}

func TestStateRoundTrip(t *testing.T) {
	b := New(5)
	b.Publish("state.x", "v1")
	b.Publish("state.y", "v2")
	if m, ok := b.State("state.x"); !ok || m.Payload != "v1" {
		t.Fatalf("state.state.x = %v,%v", m, ok)
	}
	m, ok := b.State("state.doesnotexist")
	if ok {
		t.Fatalf("expected no state for unknown key, got %v", m)
	}
}

func TestReplay(t *testing.T) {
	b := New(2)
	b.Publish("k", "a")
	b.Publish("k", "b")
	b.Publish("k", "c")
	b.Publish("k", "d")
	var got []string
	b.Replay("k", func(m Msg) { got = append(got, m.Payload.(string)) })
	if len(got) != 2 || got[0] != "c" || got[1] != "d" {
		t.Fatalf("expected replay [c d], got %v", got)
	}
}

func TestPublishConcurrent(t *testing.T) {
	b := New(5)
	b.State("state.x")
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			b.Publish("state.concurrent", n)
			b.Publish("plain.topic", n)
		}(i)
	}
	// one subscriber to drain
	go func() {
		b.SubscribePattern("**", func(Msg) {})
	}()
	b.Subscribe("state.concurrent", func(Msg) {})
	wg.Wait()
}

func TestMatchPatternDoubleStarEnd(t *testing.T) {
	// "a.**" matches "a" and "a.b.c"
	pat := splitTopic("a.**")
	if !matchPattern(pat, splitTopic("a")) {
		t.Fatal("expected a.** to match 'a'")
	}
	if !matchPattern(pat, splitTopic("a.b.c")) {
		t.Fatal("expected a.** to match 'a.b.c'")
	}
	if matchPattern(pat, splitTopic("b.a")) {
		t.Fatal("did not expect a.** to match 'b.a'")
	}
}

func TestSplitTopic(t *testing.T) {
	cases := []struct {
		in  string
		out []string
	}{
		{"state.audio", []string{"state", "audio"}},
		{"plain", []string{"plain"}},
		{"", []string{""}},
		{"a.b.c", []string{"a", "b", "c"}},
	}
	for _, c := range cases {
		got := splitTopic(c.in)
		if len(got) != len(c.out) || (len(got) > 0 && got[0] != c.out[0]) {
			t.Errorf("splitTopic(%q) = %v, want %v", c.in, got, c.out)
		}
	}
}

func TestHasStatePrefix(t *testing.T) {
	b := New(0)
	got := ""
	b.Subscribe("state.foo", func(m Msg) { got = m.Payload.(string) })
	b.Publish("state.foo", "hello")
	if got != "hello" {
		t.Fatalf("state topic not delivered; got %q", got)
	}
}
