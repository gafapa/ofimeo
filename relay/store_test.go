package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

type storeWriter struct {
	pub  ed25519.PublicKey
	priv ed25519.PrivateKey
	id   string
}

func newWriter(t *testing.T) storeWriter {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return storeWriter{pub, priv, StoreID(pub)}
}

func (w storeWriter) append(s *BlobStore, base int64, body []byte) (uint64, error) {
	unix := time.Now().Unix()
	b := ""
	if base >= 0 {
		b = strconv.FormatInt(base, 10)
	}
	sig := ed25519.Sign(w.priv, storeSignedMessage(w.id, unix, b, body))
	return s.Append(w.id, w.pub, sig, unix, base, body)
}

func testStore(t *testing.T, dir string, mutate func(*StoreConfig)) *BlobStore {
	t.Helper()
	cfg := defaultStoreConfig()
	if mutate != nil {
		mutate(&cfg)
	}
	s, err := OpenBlobStore(cfg, dir, quiet)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s
}

func statusOf(err error) int {
	if se, ok := err.(*storeError); ok {
		return se.status
	}
	return 0
}

func TestStoreAppendListSnapshot(t *testing.T) {
	dir := t.TempDir()
	s := testStore(t, dir, nil)
	w := newWriter(t)
	for i, body := range []string{"one", "two", "three"} {
		seq, err := w.append(s, -1, []byte(body))
		if err != nil || seq != uint64(i+1) {
			t.Fatalf("append %d: seq %d, %v", i, seq, err)
		}
	}
	// A retried request is not stored twice.
	if seq, err := w.append(s, -1, []byte("two")); err != nil || seq != 2 {
		t.Fatalf("duplicate: %d %v", seq, err)
	}
	list, _ := s.List(w.id, 1)
	if len(list.Blobs) != 2 || string(list.Blobs[0].Data) != "two" || list.Last != 3 || list.Count != 3 || list.Bytes != 11 {
		t.Fatalf("list after 1: %+v", list)
	}
	// Snapshot covering seq <= 2: "three" (not seen by the writer) stays.
	if seq, err := w.append(s, 2, []byte("snapshot")); err != nil || seq != 4 {
		t.Fatalf("snapshot: %d %v", seq, err)
	}
	list, _ = s.List(w.id, 0)
	if len(list.Blobs) != 2 || string(list.Blobs[0].Data) != "three" || string(list.Blobs[1].Data) != "snapshot" {
		t.Fatalf("after snapshot: %+v", list)
	}
	// Reloaded from disk.
	s.Close()
	s2 := testStore(t, dir, nil)
	list, _ = s2.List(w.id, 0)
	if len(list.Blobs) != 2 || list.Last != 4 || s2.Stats().Bytes != int64(len("three")+len("snapshot")) {
		t.Fatalf("reloaded: %+v %+v", list, s2.Stats())
	}
	if seq, err := w.append(s2, -1, []byte("five")); err != nil || seq != 5 {
		t.Fatalf("append after reload: %d %v", seq, err)
	}
	// Unknown mailboxes are just empty.
	if list, err := s2.List(newWriter(t).id, 0); err != nil || len(list.Blobs) != 0 {
		t.Fatalf("unknown mailbox: %+v %v", list, err)
	}
}

func TestStoreRejectsWrongWriters(t *testing.T) {
	s := testStore(t, t.TempDir(), nil)
	owner := newWriter(t)
	other := newWriter(t)
	unix := time.Now().Unix()
	body := []byte("x")
	// Someone who knows the mailbox id (a view link) but not its key.
	sig := ed25519.Sign(other.priv, storeSignedMessage(owner.id, unix, "", body))
	if _, err := s.Append(owner.id, other.pub, sig, unix, -1, body); statusOf(err) != http.StatusForbidden {
		t.Fatalf("foreign key accepted: %v", err)
	}
	// The right key but a signature over something else.
	sig = ed25519.Sign(owner.priv, storeSignedMessage(owner.id, unix, "", []byte("y")))
	if _, err := s.Append(owner.id, owner.pub, sig, unix, -1, body); statusOf(err) != http.StatusForbidden {
		t.Fatalf("bad signature accepted: %v", err)
	}
	// A signed append replayed as a snapshot (base changed).
	sig = ed25519.Sign(owner.priv, storeSignedMessage(owner.id, unix, "", body))
	if _, err := s.Append(owner.id, owner.pub, sig, unix, 5, body); statusOf(err) != http.StatusForbidden {
		t.Fatalf("base not covered by the signature: %v", err)
	}
	// Old requests.
	old := time.Now().Add(-time.Hour).Unix()
	sig = ed25519.Sign(owner.priv, storeSignedMessage(owner.id, old, "", body))
	if _, err := s.Append(owner.id, owner.pub, sig, old, -1, body); statusOf(err) != http.StatusUnauthorized {
		t.Fatalf("stale request accepted: %v", err)
	}
	if list, _ := s.List(owner.id, 0); len(list.Blobs) != 0 {
		t.Fatal("rejected writes were stored")
	}
}

func TestStoreQuotasAndTTL(t *testing.T) {
	dir := t.TempDir()
	s := testStore(t, dir, func(c *StoreConfig) {
		c.MaxBlobBytes = 1024
		c.MaxDocBytes = 3000
		c.MaxTotalBytes = 4500
		c.MaxBlobsPerDoc = 10
	})
	w := newWriter(t)
	blob := func(n int, fill byte) []byte { return bytes.Repeat([]byte{fill}, n) }
	if _, err := w.append(s, -1, blob(1025, 1)); statusOf(err) != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized blob: %v", err)
	}
	for i := 0; i < 2; i++ {
		if _, err := w.append(s, -1, blob(1000, byte(i))); err != nil {
			t.Fatal(err)
		}
	}
	// 3000 bytes would exceed the document quota with the next 1000.
	if _, err := w.append(s, -1, blob(1001, 9)); statusOf(err) != http.StatusRequestEntityTooLarge {
		t.Fatalf("document quota: %v", err)
	}
	// A snapshot that replaces everything fits.
	if _, err := w.append(s, 2, blob(900, 7)); err != nil {
		t.Fatalf("snapshot within quota: %v", err)
	}
	// Total quota across documents.
	w2, w3 := newWriter(t), newWriter(t)
	for i := 0; i < 2; i++ {
		if _, err := w2.append(s, -1, blob(1000, byte(20+i))); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := w3.append(s, -1, blob(1000, 30)); err != nil {
		t.Fatal(err)
	}
	if _, err := w3.append(s, -1, blob(1000, 31)); statusOf(err) != http.StatusInsufficientStorage {
		t.Fatalf("total quota: %v (total %d)", err, s.Stats().Bytes)
	}
	// Blob count per document.
	small := newWriter(t)
	s2 := testStore(t, t.TempDir(), func(c *StoreConfig) { c.MaxBlobsPerDoc = 10 })
	for i := 0; i < 10; i++ {
		if _, err := small.append(s2, -1, []byte{byte(i)}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := small.append(s2, -1, []byte{99}); statusOf(err) != http.StatusRequestEntityTooLarge {
		t.Fatalf("blob count: %v", err)
	}
	if _, err := small.append(s2, 10, []byte{100}); err != nil {
		t.Fatalf("snapshot after the blob limit: %v", err)
	}

	// TTL: mailboxes not written for 180 days disappear, from disk too.
	s.now = func() time.Time { return time.Now().Add(181 * 24 * time.Hour) }
	s.sweep()
	if st := s.Stats(); st.Mailboxes != 0 || st.Bytes != 0 {
		t.Fatalf("expired mailboxes kept: %+v", st)
	}
	if _, err := os.Stat(filepath.Join(dir, w.id[:2], w.id)); !os.IsNotExist(err) {
		t.Fatalf("expired mailbox still on disk: %v", err)
	}
}

func TestStoreHTTP(t *testing.T) {
	cfg := testConfig(t)
	web := newTestWeb(t, cfg)
	web.store = testStore(t, t.TempDir(), func(c *StoreConfig) { c.WritesPerMinute = 3; c.DefaultOn = true })
	h := web.HTTPSHandler()
	w := newWriter(t)
	do := func(method, path string, body []byte, headers map[string]string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "https://relay.local:8443"+path, bytes.NewReader(body))
		req.RemoteAddr = "192.168.1.20:5000"
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	signed := func(body []byte, key ed25519.PrivateKey, pub ed25519.PublicKey) map[string]string {
		unix := time.Now().Unix()
		return map[string]string{
			"X-Ofimeo-Key":       base64.RawURLEncoding.EncodeToString(pub),
			"X-Ofimeo-Time":      strconv.FormatInt(unix, 10),
			"X-Ofimeo-Signature": base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, storeSignedMessage(w.id, unix, "", body))),
		}
	}

	// Capabilities, also in /ofimeo/config.
	rec := do(http.MethodGet, "/ofimeo/store", nil, nil)
	var info StoreInfo
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &info) != nil || !info.Enabled || !info.DefaultOn || info.TTLDays != 180 {
		t.Fatalf("info: %d %s", rec.Code, rec.Body)
	}
	rec = do(http.MethodGet, "/ofimeo/config", nil, nil)
	var cc ClientConfig
	if json.Unmarshal(rec.Body.Bytes(), &cc) != nil || cc.Store == nil || !cc.Store.Enabled {
		t.Fatalf("config lacks the store: %s", rec.Body)
	}
	// CORS preflight for the custom headers.
	rec = do(http.MethodOptions, "/ofimeo/store/"+w.id, nil, map[string]string{"Origin": "https://gafapa.github.io", "Access-Control-Request-Method": "POST"})
	if rec.Code != http.StatusNoContent || rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("preflight: %d %v", rec.Code, rec.Header())
	}

	rec = do(http.MethodPost, "/ofimeo/store/"+w.id, []byte("cipher"), signed([]byte("cipher"), w.priv, w.pub))
	if rec.Code != 200 {
		t.Fatalf("post: %d %s", rec.Code, rec.Body)
	}
	other := newWriter(t)
	rec = do(http.MethodPost, "/ofimeo/store/"+w.id, []byte("forged"), signed([]byte("forged"), other.priv, other.pub))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("forged post: %d", rec.Code)
	}
	rec = do(http.MethodGet, "/ofimeo/store/"+w.id+"?after=0", nil, nil)
	var list Listing
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &list) != nil || len(list.Blobs) != 1 || string(list.Blobs[0].Data) != "cipher" {
		t.Fatalf("get: %d %s", rec.Code, rec.Body)
	}
	// Per-address write limit (3 per minute here; two used above).
	do(http.MethodPost, "/ofimeo/store/"+w.id, []byte("c2"), signed([]byte("c2"), w.priv, w.pub))
	if rec = do(http.MethodPost, "/ofimeo/store/"+w.id, []byte("c3"), signed([]byte("c3"), w.priv, w.pub)); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("rate limit: %d", rec.Code)
	}
	if rec = do(http.MethodGet, "/ofimeo/store/not-an-id", nil, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("bad id: %d", rec.Code)
	}

	// Store turned off.
	web.store = nil
	h = web.HTTPSHandler()
	rec = do(http.MethodGet, "/ofimeo/store", nil, nil)
	if json.Unmarshal(rec.Body.Bytes(), &info) != nil || info.Enabled {
		t.Fatalf("disabled info: %s", rec.Body)
	}
	if rec = do(http.MethodGet, "/ofimeo/store/"+w.id, nil, nil); rec.Code != http.StatusNotFound {
		t.Fatalf("disabled get: %d", rec.Code)
	}
}

func TestStoreConfigSources(t *testing.T) {
	c := defaultStoreConfig()
	t.Setenv("OFIMEO_STORE", "off")
	t.Setenv("OFIMEO_STORE_MAX_TOTAL", "10GB")
	t.Setenv("OFIMEO_STORE_TTL", "720h")
	if err := applyStoreEnv(&c); err != nil {
		t.Fatal(err)
	}
	if c.Enabled || c.MaxTotalBytes != 10<<30 || time.Duration(c.TTL) != 720*time.Hour {
		t.Fatalf("env not applied: %+v", c)
	}
	t.Setenv("OFIMEO_STORE", "maybe")
	if err := applyStoreEnv(&c); err == nil {
		t.Fatal("invalid OFIMEO_STORE accepted")
	}
}
