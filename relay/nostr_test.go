package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcec/v2/schnorr"
	"github.com/coder/websocket"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func testConfig(t *testing.T) *Config {
	cfg := defaultConfig()
	cfg.DataDir = t.TempDir()
	cfg.Secret = "test-secret"
	return &cfg
}

func signedEvent(t *testing.T, key *btcec.PrivateKey, kind int, tags [][]string, content string) Event {
	t.Helper()
	ev := Event{PubKey: hex.EncodeToString(schnorr.SerializePubKey(key.PubKey())), CreatedAt: time.Now().Unix(), Kind: kind, Tags: tags, Content: content}
	sum := sha256.Sum256(serializeEvent(&ev))
	ev.ID = hex.EncodeToString(sum[:])
	sig, err := schnorr.Sign(key, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	ev.Sig = hex.EncodeToString(sig.Serialize())
	return ev
}

func TestSerializeMatchesJSONStringify(t *testing.T) {
	ev := Event{PubKey: "ab", CreatedAt: 5, Kind: 20001, Tags: [][]string{{"x", "t\"1"}}, Content: "a\nb c\x01\\</>"}
	// JSON.stringify([0,"ab",5,20001,[["x","t\"1"]],"a\nb c\u0001\\</>"])
	want := "[0,\"ab\",5,20001,[[\"x\",\"t\\\"1\"]],\"a\\nb c\\u0001\\\\</>\"]"
	if got := string(serializeEvent(&ev)); got != want {
		t.Fatalf("got %s\nwant %s", got, want)
	}
}

func TestVerifyEvent(t *testing.T) {
	key, _ := btcec.NewPrivateKey()
	ev := signedEvent(t, key, 20001, [][]string{{"x", "topic"}}, "hello")
	if err := verifyEvent(&ev); err != nil {
		t.Fatalf("valid event rejected: %v", err)
	}
	ev.Content = "changed"
	if verifyEvent(&ev) == nil {
		t.Fatal("tampered event accepted")
	}
}

func TestFilter(t *testing.T) {
	var f Filter
	since := time.Now().Unix() - 10
	if err := json.Unmarshal([]byte(`{"kinds":[20001],"#x":["a","b"],"since":`+itoa64(since)+`}`), &f); err != nil {
		t.Fatal(err)
	}
	ev := &Event{Kind: 20001, CreatedAt: time.Now().Unix(), Tags: [][]string{{"x", "b"}}}
	if !f.Matches(ev) {
		t.Fatal("should match")
	}
	ev.Tags = [][]string{{"x", "c"}}
	if f.Matches(ev) {
		t.Fatal("tag should not match")
	}
	ev.Tags, ev.Kind = [][]string{{"x", "a"}}, 1
	if f.Matches(ev) {
		t.Fatal("kind should not match")
	}
}

func itoa64(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

type wsClient struct {
	t  *testing.T
	ws *websocket.Conn
}

func dial(t *testing.T, url string) *wsClient {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ws, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(url, "http")+"/nostr", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ws.CloseNow() })
	return &wsClient{t, ws}
}

func (c *wsClient) send(v ...any) {
	b, _ := json.Marshal(v)
	if err := c.ws.Write(context.Background(), websocket.MessageText, b); err != nil {
		c.t.Fatal(err)
	}
}

func (c *wsClient) recv() []json.RawMessage {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, b, err := c.ws.Read(ctx)
	if err != nil {
		c.t.Fatal(err)
	}
	var msg []json.RawMessage
	if err := json.Unmarshal(b, &msg); err != nil {
		c.t.Fatal(err)
	}
	return msg
}

func str(r json.RawMessage) string {
	var s string
	_ = json.Unmarshal(r, &s)
	return s
}

func TestRelayFlow(t *testing.T) {
	cfg := testConfig(t)
	cfg.EventsPerMinute = 3
	relay := NewNostrRelay(cfg, quiet)
	srv := httptest.NewServer(relay)
	defer srv.Close()

	sub := dial(t, srv.URL)
	sub.send("REQ", "s1", map[string]any{"kinds": []int{20001}, "#x": []string{"room"}})
	if m := sub.recv(); str(m[0]) != "EOSE" || str(m[1]) != "s1" {
		t.Fatalf("expected EOSE, got %s", m)
	}

	pub := dial(t, srv.URL)
	key, _ := btcec.NewPrivateKey()
	ev := signedEvent(t, key, 20001, [][]string{{"x", "room"}}, "offer")
	pub.send("EVENT", ev)
	if m := pub.recv(); str(m[0]) != "OK" || string(m[2]) != "true" {
		t.Fatalf("expected OK true, got %s", m)
	}
	m := sub.recv()
	var got Event
	_ = json.Unmarshal(m[2], &got)
	if str(m[0]) != "EVENT" || str(m[1]) != "s1" || got.ID != ev.ID {
		t.Fatalf("subscriber did not get the event: %s", m)
	}

	// A late subscriber gets the recent event, then EOSE.
	late := dial(t, srv.URL)
	late.send("REQ", "s2", map[string]any{"#x": []string{"room"}})
	if m := late.recv(); str(m[0]) != "EVENT" {
		t.Fatalf("expected stored EVENT, got %s", m)
	}
	if m := late.recv(); str(m[0]) != "EOSE" {
		t.Fatalf("expected EOSE, got %s", m)
	}

	// Bad signature: rejected with OK false.
	bad := signedEvent(t, key, 20001, [][]string{{"x", "room"}}, "x")
	bad.Content = "y"
	pub.send("EVENT", bad)
	if m := pub.recv(); string(m[2]) != "false" || !strings.HasPrefix(str(m[3]), "invalid:") {
		t.Fatalf("expected invalid, got %s", m)
	}

	// Rate limit (3 per minute, 2 used): the next ones are rate-limited.
	pub.send("EVENT", signedEvent(t, key, 20001, nil, "2"))
	pub.recv()
	pub.send("EVENT", signedEvent(t, key, 20001, nil, "3"))
	if m := pub.recv(); !strings.HasPrefix(str(m[3]), "rate-limited:") {
		t.Fatalf("expected rate-limited, got %s", m)
	}

	// CLOSE stops delivery.
	sub.send("CLOSE", "s1")
	time.Sleep(50 * time.Millisecond)
	if s := relay.Stats(); s.Clients != 3 || s.Subscriptions != 1 {
		t.Fatalf("unexpected stats %+v", s)
	}
}
