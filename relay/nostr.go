package main

// Minimal Nostr relay (NIP-01 subset used by Trystero: EVENT, REQ, CLOSE,
// EOSE, OK) kept entirely in memory. Events are checked (id and Schnorr
// signature), kept for a short time only (Trystero's events are ephemeral
// connection offers) and rate-limited per connection.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"

	"github.com/btcsuite/btcd/btcec/v2/schnorr"
	"github.com/coder/websocket"
)

const (
	eventRetention  = 2 * time.Minute
	maxStoredEvents = 5000
	defaultReqLimit = 500
	sendQueue       = 256
)

type Event struct {
	ID        string     `json:"id"`
	PubKey    string     `json:"pubkey"`
	CreatedAt int64      `json:"created_at"`
	Kind      int        `json:"kind"`
	Tags      [][]string `json:"tags"`
	Content   string     `json:"content"`
	Sig       string     `json:"sig"`
}

type storedEvent struct {
	ev       *Event
	raw      json.RawMessage
	received time.Time
}

type Filter struct {
	IDs     []string
	Authors []string
	Kinds   []int
	Since   *int64
	Until   *int64
	Limit   int // -1: not given
	Tags    map[string][]string
}

func (f *Filter) UnmarshalJSON(b []byte) error {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(b, &m); err != nil {
		return err
	}
	f.Limit = -1
	for k, v := range m {
		var err error
		switch {
		case k == "ids":
			err = json.Unmarshal(v, &f.IDs)
		case k == "authors":
			err = json.Unmarshal(v, &f.Authors)
		case k == "kinds":
			err = json.Unmarshal(v, &f.Kinds)
		case k == "since":
			err = json.Unmarshal(v, &f.Since)
		case k == "until":
			err = json.Unmarshal(v, &f.Until)
		case k == "limit":
			err = json.Unmarshal(v, &f.Limit)
		case len(k) == 2 && k[0] == '#':
			var vals []string
			err = json.Unmarshal(v, &vals)
			if f.Tags == nil {
				f.Tags = map[string][]string{}
			}
			f.Tags[k[1:]] = vals
		}
		if err != nil {
			return fmt.Errorf("filter %q: %w", k, err)
		}
	}
	return nil
}

func (f *Filter) Matches(ev *Event) bool {
	if len(f.IDs) > 0 && !hasPrefixIn(ev.ID, f.IDs) {
		return false
	}
	if len(f.Authors) > 0 && !hasPrefixIn(ev.PubKey, f.Authors) {
		return false
	}
	if len(f.Kinds) > 0 && !containsInt(f.Kinds, ev.Kind) {
		return false
	}
	if f.Since != nil && ev.CreatedAt < *f.Since {
		return false
	}
	if f.Until != nil && ev.CreatedAt > *f.Until {
		return false
	}
	for name, vals := range f.Tags {
		found := false
		for _, t := range ev.Tags {
			if len(t) >= 2 && t[0] == name && containsString(vals, t[1]) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func hasPrefixIn(s string, list []string) bool {
	for _, p := range list {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

func containsInt(list []int, v int) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func containsString(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// serializeEvent is the NIP-01 form hashed into the event id, written exactly
// as JavaScript's JSON.stringify does (what clients hash).
func serializeEvent(ev *Event) []byte {
	var b strings.Builder
	b.WriteString(`[0,`)
	writeJSString(&b, ev.PubKey)
	b.WriteString(`,` + strconv.FormatInt(ev.CreatedAt, 10) + `,` + strconv.Itoa(ev.Kind) + `,[`)
	for i, tag := range ev.Tags {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteByte('[')
		for j, s := range tag {
			if j > 0 {
				b.WriteByte(',')
			}
			writeJSString(&b, s)
		}
		b.WriteByte(']')
	}
	b.WriteString(`],`)
	writeJSString(&b, ev.Content)
	b.WriteByte(']')
	return []byte(b.String())
}

func writeJSString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}

// verifyEvent checks the id (hash of the content) and the Schnorr signature.
func verifyEvent(ev *Event) error {
	if len(ev.ID) != 64 || len(ev.PubKey) != 64 || len(ev.Sig) != 128 {
		return errors.New("bad id, pubkey or sig length")
	}
	sum := sha256.Sum256(serializeEvent(ev))
	if hex.EncodeToString(sum[:]) != ev.ID {
		return errors.New("id does not match the event")
	}
	pk, err := hex.DecodeString(ev.PubKey)
	if err != nil {
		return err
	}
	sig, err := hex.DecodeString(ev.Sig)
	if err != nil {
		return err
	}
	pub, err := schnorr.ParsePubKey(pk)
	if err != nil {
		return err
	}
	s, err := schnorr.ParseSignature(sig)
	if err != nil {
		return err
	}
	if !s.Verify(sum[:], pub) {
		return errors.New("bad signature")
	}
	return nil
}

type NostrRelay struct {
	cfg    *Config
	log    *slog.Logger
	mu     sync.Mutex
	conns  map[*nostrConn]struct{}
	events []storedEvent

	received atomic.Int64
	rejected atomic.Int64
}

func NewNostrRelay(cfg *Config, log *slog.Logger) *NostrRelay {
	return &NostrRelay{cfg: cfg, log: log, conns: map[*nostrConn]struct{}{}}
}

type nostrConn struct {
	ws     *websocket.Conn
	send   chan []byte
	cancel context.CancelFunc
	addr   string
	mu     sync.Mutex
	subs   map[string][]Filter
	tokens float64
	last   time.Time
}

type NostrStats struct {
	Clients       int   `json:"clients"`
	Subscriptions int   `json:"subscriptions"`
	Stored        int   `json:"stored_events"`
	Received      int64 `json:"events_received"`
	Rejected      int64 `json:"events_rejected"`
}

func (n *NostrRelay) Stats() NostrStats {
	n.mu.Lock()
	defer n.mu.Unlock()
	s := NostrStats{Clients: len(n.conns), Stored: len(n.events), Received: n.received.Load(), Rejected: n.rejected.Load()}
	for c := range n.conns {
		c.mu.Lock()
		s.Subscriptions += len(c.subs)
		c.mu.Unlock()
	}
	return s
}

// Info is the NIP-11 relay information document.
func (n *NostrRelay) Info() map[string]any {
	return map[string]any{
		"name":           n.cfg.Name,
		"description":    "Ofimeo Relay: signaling for Ofimeo documents on this network (ephemeral, in memory).",
		"software":       "ofimeo-relay",
		"version":        version,
		"supported_nips": []int{1, 11},
		"limitation": map[string]any{
			"max_message_length": n.cfg.MaxEventBytes + 1024,
			"max_subscriptions":  n.cfg.MaxSubscriptions,
			"max_limit":          defaultReqLimit,
		},
	}
}

func (n *NostrRelay) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		if strings.Contains(r.Header.Get("Accept"), "application/nostr+json") {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Content-Type", "application/nostr+json")
			_ = json.NewEncoder(w).Encode(n.Info())
			return
		}
		http.Error(w, "This is a Nostr relay: connect with a WebSocket.", http.StatusUpgradeRequired)
		return
	}
	n.mu.Lock()
	full := len(n.conns) >= n.cfg.MaxClients
	n.mu.Unlock()
	if full {
		http.Error(w, "too many clients", http.StatusServiceUnavailable)
		return
	}
	// Any web origin may connect (the app may be hosted anywhere); access is
	// restricted by network address instead.
	ws, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	ws.SetReadLimit(int64(n.cfg.MaxEventBytes) + 4096)
	ctx, cancel := context.WithCancel(context.Background())
	c := &nostrConn{ws: ws, send: make(chan []byte, sendQueue), cancel: cancel, addr: r.RemoteAddr, subs: map[string][]Filter{}, tokens: float64(n.cfg.EventsPerMinute), last: time.Now()}
	n.mu.Lock()
	n.conns[c] = struct{}{}
	n.mu.Unlock()
	defer func() {
		cancel()
		n.mu.Lock()
		delete(n.conns, c)
		n.mu.Unlock()
		ws.CloseNow()
	}()
	go n.writeLoop(ctx, c)
	for {
		_, data, err := ws.Read(ctx)
		if err != nil {
			return
		}
		n.handle(c, data)
	}
}

func (n *NostrRelay) writeLoop(ctx context.Context, c *nostrConn) {
	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.send:
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.ws.Write(wctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				c.cancel()
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, 20*time.Second)
			err := c.ws.Ping(pctx)
			cancel()
			if err != nil {
				c.cancel()
				return
			}
		}
	}
}

// enqueue drops the connection when the client does not keep up.
func (c *nostrConn) enqueue(msg []byte) {
	select {
	case c.send <- msg:
	default:
		c.cancel()
	}
}

func (c *nostrConn) reply(parts ...any) {
	b, err := json.Marshal(parts)
	if err == nil {
		c.enqueue(b)
	}
}

func (c *nostrConn) allowEvent(perMinute int) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	c.tokens += now.Sub(c.last).Minutes() * float64(perMinute)
	if c.tokens > float64(perMinute) {
		c.tokens = float64(perMinute)
	}
	c.last = now
	if c.tokens < 1 {
		return false
	}
	c.tokens--
	return true
}

func (n *NostrRelay) handle(c *nostrConn, data []byte) {
	var msg []json.RawMessage
	if err := json.Unmarshal(data, &msg); err != nil || len(msg) < 2 {
		c.reply("NOTICE", "invalid: expected a JSON array")
		return
	}
	var typ string
	_ = json.Unmarshal(msg[0], &typ)
	switch typ {
	case "EVENT":
		n.handleEvent(c, msg[1])
	case "REQ":
		var id string
		if err := json.Unmarshal(msg[1], &id); err != nil || id == "" || len(id) > 64 {
			c.reply("NOTICE", "invalid: bad subscription id")
			return
		}
		filters := make([]Filter, 0, len(msg)-2)
		for _, raw := range msg[2:] {
			var f Filter
			if err := json.Unmarshal(raw, &f); err != nil {
				c.reply("NOTICE", "invalid: "+err.Error())
				return
			}
			filters = append(filters, f)
		}
		c.mu.Lock()
		_, exists := c.subs[id]
		if !exists && len(c.subs) >= n.cfg.MaxSubscriptions {
			c.mu.Unlock()
			// Not CLOSED: Trystero stops using a relay that closes a subscription.
			c.reply("NOTICE", "rate-limited: too many subscriptions")
			return
		}
		c.subs[id] = filters
		c.mu.Unlock()
		n.sendStored(c, id, filters)
		c.reply("EOSE", id)
	case "CLOSE":
		var id string
		_ = json.Unmarshal(msg[1], &id)
		c.mu.Lock()
		delete(c.subs, id)
		c.mu.Unlock()
	default:
		c.reply("NOTICE", "unsupported message type "+strconv.Quote(typ))
	}
}

func (n *NostrRelay) handleEvent(c *nostrConn, raw json.RawMessage) {
	var ev Event
	if err := json.Unmarshal(raw, &ev); err != nil {
		c.reply("NOTICE", "invalid: bad event")
		return
	}
	if len(raw) > n.cfg.MaxEventBytes {
		n.rejected.Add(1)
		c.reply("OK", ev.ID, false, "invalid: event too large")
		return
	}
	if !c.allowEvent(n.cfg.EventsPerMinute) {
		n.rejected.Add(1)
		c.reply("OK", ev.ID, false, "rate-limited: slow down")
		return
	}
	if !utf8.ValidString(ev.Content) {
		n.rejected.Add(1)
		c.reply("OK", ev.ID, false, "invalid: content is not UTF-8")
		return
	}
	if err := verifyEvent(&ev); err != nil {
		n.rejected.Add(1)
		c.reply("OK", ev.ID, false, "invalid: "+err.Error())
		return
	}
	n.received.Add(1)
	now := time.Now()
	n.mu.Lock()
	duplicate := false
	for _, s := range n.events {
		if s.ev.ID == ev.ID {
			duplicate = true
			break
		}
	}
	if !duplicate {
		n.pruneLocked(now)
		n.events = append(n.events, storedEvent{ev: &ev, raw: raw, received: now})
	}
	targets := make([]*nostrConn, 0, len(n.conns))
	for other := range n.conns {
		targets = append(targets, other)
	}
	n.mu.Unlock()
	if duplicate {
		c.reply("OK", ev.ID, true, "duplicate: already have this event")
		return
	}
	c.reply("OK", ev.ID, true, "")
	for _, other := range targets {
		other.mu.Lock()
		var ids []string
		for id, filters := range other.subs {
			for i := range filters {
				if filters[i].Matches(&ev) {
					ids = append(ids, id)
					break
				}
			}
		}
		other.mu.Unlock()
		for _, id := range ids {
			other.enqueue(eventMessage(id, raw))
		}
	}
}

func eventMessage(subID string, raw json.RawMessage) []byte {
	b, _ := json.Marshal([]any{"EVENT", subID, raw})
	return b
}

func (n *NostrRelay) pruneLocked(now time.Time) {
	cut := 0
	for cut < len(n.events) && (now.Sub(n.events[cut].received) > eventRetention || len(n.events)-cut >= maxStoredEvents) {
		cut++
	}
	if cut > 0 {
		n.events = append([]storedEvent(nil), n.events[cut:]...)
	}
}

func (n *NostrRelay) sendStored(c *nostrConn, id string, filters []Filter) {
	n.mu.Lock()
	n.pruneLocked(time.Now())
	events := n.events
	n.mu.Unlock()
	sent := map[string]bool{}
	for _, f := range filters {
		limit := f.Limit
		if limit < 0 || limit > defaultReqLimit {
			limit = defaultReqLimit
		}
		// Newest first.
		for i := len(events) - 1; i >= 0 && limit > 0; i-- {
			if !sent[events[i].ev.ID] && f.Matches(events[i].ev) {
				sent[events[i].ev.ID] = true
				c.enqueue(eventMessage(id, events[i].raw))
				limit--
			}
		}
	}
}

// Close disconnects every client (graceful shutdown).
func (n *NostrRelay) Close() {
	n.mu.Lock()
	conns := make([]*nostrConn, 0, len(n.conns))
	for c := range n.conns {
		conns = append(conns, c)
	}
	n.mu.Unlock()
	var wg sync.WaitGroup
	for _, c := range conns {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c.ws.Close(websocket.StatusGoingAway, "relay shutting down")
			c.cancel()
		}()
	}
	wg.Wait()
}
