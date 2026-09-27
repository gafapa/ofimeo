package main

// Store-and-forward mailbox: an optional encrypted blob store so two devices
// sync even when they are never online at the same time (see
// docs/store-forward.md).
//
// Browsers encrypt everything before it arrives here; the relay never sees
// document content or keys. A mailbox is named by an opaque id,
//
//	id = hex(SHA-256("ofimeo-store-id:v1" || pub))
//
// where pub is an Ed25519 public key (the document's edit or comment key, or
// one derived from the room secret for older documents). Anyone who knows the
// id may read the (encrypted) blobs; appending needs a signature by the key
// whose hash is the id, so view-only links can read but never write:
//
//	GET  /ofimeo/store                 capabilities and limits (JSON)
//	GET  /ofimeo/store/<id>?after=<n>  blobs with seq > n (JSON, base64)
//	POST /ofimeo/store/<id>            append the body as a new blob
//	    X-Ofimeo-Key:       base64url(pub)
//	    X-Ofimeo-Time:      unix seconds (±15 min)
//	    X-Ofimeo-Base:      optional; a snapshot: drop blobs with seq <= base
//	    X-Ofimeo-Signature: base64url(Ed25519(storeSignedMessage(...)))
//
// Blobs live on disk under <data>/store/<id[:2]>/<id>/ (one file each, plus
// meta.json), with quotas per document and in total, a time to live since the
// last write, and per-address rate limits.

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// StoreConfig is the "store" section of ofimeo-relay.json.
type StoreConfig struct {
	// Enabled accepts mailboxes (default true; --store=false or OFIMEO_STORE=off disables it).
	Enabled bool `json:"enabled"`
	// DefaultOn tells browsers to use the store unless someone turned it off there.
	DefaultOn bool `json:"default_on"`
	// Size limits, in bytes.
	MaxBlobBytes  int64 `json:"max_blob_bytes"`
	MaxDocBytes   int64 `json:"max_doc_bytes"`
	MaxTotalBytes int64 `json:"max_total_bytes"`
	// MaxBlobsPerDoc forces browsers to compact (push a snapshot) now and then.
	MaxBlobsPerDoc int `json:"max_blobs_per_doc"`
	// TTL: mailboxes without writes for this long are deleted.
	TTL Duration `json:"ttl"`
	// Per client address.
	WritesPerMinute int `json:"writes_per_minute"`
	ReadsPerMinute  int `json:"reads_per_minute"`
}

func defaultStoreConfig() StoreConfig {
	return StoreConfig{
		Enabled:         true,
		MaxBlobBytes:    8 << 20,
		MaxDocBytes:     32 << 20,
		MaxTotalBytes:   4 << 30,
		MaxBlobsPerDoc:  500,
		TTL:             Duration(180 * 24 * time.Hour),
		WritesPerMinute: 600,
		ReadsPerMinute:  1200,
	}
}

func (c *StoreConfig) validate() error {
	if !c.Enabled {
		return nil
	}
	switch {
	case c.MaxBlobBytes < 1024 || c.MaxDocBytes < c.MaxBlobBytes || c.MaxTotalBytes < c.MaxDocBytes:
		return errors.New("store: need 1 KB <= max_blob_bytes <= max_doc_bytes <= max_total_bytes")
	case c.MaxBlobsPerDoc < 10:
		return errors.New("store: max_blobs_per_doc must be at least 10")
	case time.Duration(c.TTL) < time.Hour:
		return errors.New("store: ttl must be at least 1h")
	case c.WritesPerMinute < 1 || c.ReadsPerMinute < 1:
		return errors.New("store: rate limits must be positive")
	}
	return nil
}

// addStoreFlags binds the store options to the command line.
func addStoreFlags(fs *flag.FlagSet, c *StoreConfig) {
	fs.BoolVar(&c.Enabled, "store", c.Enabled, "keep encrypted document mailboxes so devices sync without being online together (store-and-forward)")
	fs.BoolVar(&c.DefaultOn, "store-default-on", c.DefaultOn, "tell browsers to use the mailbox store unless turned off there")
	fs.Func("store-max-doc", "maximum size of one document's mailbox, e.g. 32MB", sizeSetter(&c.MaxDocBytes))
	fs.Func("store-max-total", "maximum disk space for all mailboxes, e.g. 4GB", sizeSetter(&c.MaxTotalBytes))
	fs.Var(&c.TTL, "store-ttl", "delete mailboxes not written for this long (e.g. 4320h = 180 days)")
}

// applyStoreEnv reads OFIMEO_STORE* environment variables (for containers).
func applyStoreEnv(c *StoreConfig) error {
	env := func(k string) (string, bool) {
		v, ok := os.LookupEnv(k)
		return strings.TrimSpace(v), ok && strings.TrimSpace(v) != ""
	}
	if v, ok := env("OFIMEO_STORE"); ok {
		b, err := parseBool(v)
		if err != nil {
			return fmt.Errorf("OFIMEO_STORE: %w", err)
		}
		c.Enabled = b
	}
	if v, ok := env("OFIMEO_STORE_DEFAULT_ON"); ok {
		b, err := parseBool(v)
		if err != nil {
			return fmt.Errorf("OFIMEO_STORE_DEFAULT_ON: %w", err)
		}
		c.DefaultOn = b
	}
	for k, dst := range map[string]*int64{"OFIMEO_STORE_MAX_DOC": &c.MaxDocBytes, "OFIMEO_STORE_MAX_TOTAL": &c.MaxTotalBytes} {
		if v, ok := env(k); ok {
			if err := sizeSetter(dst)(v); err != nil {
				return fmt.Errorf("%s: %w", k, err)
			}
		}
	}
	if v, ok := env("OFIMEO_STORE_TTL"); ok {
		if err := c.TTL.Set(v); err != nil {
			return fmt.Errorf("OFIMEO_STORE_TTL: %w", err)
		}
	}
	return nil
}

func parseBool(v string) (bool, error) {
	switch strings.ToLower(v) {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off":
		return false, nil
	}
	return false, fmt.Errorf("expected on/off, got %q", v)
}

// sizeSetter parses "123", "64KB", "32MB", "4GB".
func sizeSetter(dst *int64) func(string) error {
	return func(v string) error {
		s := strings.ToUpper(strings.TrimSpace(v))
		mult := int64(1)
		for _, u := range []struct {
			suffix string
			mult   int64
		}{{"GB", 1 << 30}, {"MB", 1 << 20}, {"KB", 1 << 10}, {"G", 1 << 30}, {"M", 1 << 20}, {"K", 1 << 10}, {"B", 1}} {
			if strings.HasSuffix(s, u.suffix) {
				s, mult = strings.TrimSpace(strings.TrimSuffix(s, u.suffix)), u.mult
				break
			}
		}
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil || n <= 0 {
			return fmt.Errorf("invalid size %q", v)
		}
		*dst = n * mult
		return nil
	}
}

// ---------- Store ----------

const (
	storeIDPrefix  = "ofimeo-store-id:v1"
	storeSigPrefix = "ofimeo-store:v1"
	storeMaxSkew   = 15 * time.Minute
)

var validStoreID = regexp.MustCompile(`^[0-9a-f]{64}$`)

// StoreID is the mailbox id of a public key.
func StoreID(pub []byte) string {
	h := sha256.New()
	h.Write([]byte(storeIDPrefix))
	h.Write(pub)
	return hex.EncodeToString(h.Sum(nil))
}

// storeSignedMessage is what a writer signs: the mailbox, the time, the
// snapshot base ("" for a plain append) and the body hash.
func storeSignedMessage(id string, unix int64, base string, body []byte) []byte {
	sum := sha256.Sum256(body)
	return []byte(storeSigPrefix + "\n" + id + "\n" + strconv.FormatInt(unix, 10) + "\n" + base + "\n" + hex.EncodeToString(sum[:]))
}

type blobMeta struct {
	Seq  uint64
	Size int64
	Hash string
}

type mailbox struct {
	Pub     string    `json:"pub"`
	NextSeq uint64    `json:"next_seq"`
	Updated time.Time `json:"updated"`
	blobs   []blobMeta
	bytes   int64
	writes  rateWindow
}

// BlobStore keeps the mailboxes on disk, indexed in memory.
type BlobStore struct {
	cfg   StoreConfig
	dir   string
	log   *slog.Logger
	mu    sync.Mutex
	boxes map[string]*mailbox
	total int64
	now   func() time.Time
	rates *rateLimiter
	stop  chan struct{}
	once  sync.Once
}

// Store errors carry the HTTP status they map to.
type storeError struct {
	status int
	msg    string
}

func (e *storeError) Error() string { return e.msg }

func errStore(status int, msg string) error { return &storeError{status, msg} }

// OpenBlobStore loads (or creates) the store in dir and starts the TTL sweeper.
func OpenBlobStore(cfg StoreConfig, dir string, logger *slog.Logger) (*BlobStore, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &BlobStore{cfg: cfg, dir: dir, log: logger, boxes: map[string]*mailbox{}, now: time.Now, rates: newRateLimiter(), stop: make(chan struct{})}
	if err := s.load(); err != nil {
		return nil, err
	}
	s.sweep()
	go s.sweeper()
	return s, nil
}

func (s *BlobStore) Close() {
	s.once.Do(func() { close(s.stop) })
}

func (s *BlobStore) boxDir(id string) string { return filepath.Join(s.dir, id[:2], id) }

func blobName(b blobMeta) string { return fmt.Sprintf("%016d-%s.bin", b.Seq, b.Hash) }

var blobFile = regexp.MustCompile(`^(\d{16})-([0-9a-f]{64})\.bin$`)

func (s *BlobStore) load() error {
	shards, err := os.ReadDir(s.dir)
	if err != nil {
		return err
	}
	for _, shard := range shards {
		if !shard.IsDir() || len(shard.Name()) != 2 {
			continue
		}
		ids, _ := os.ReadDir(filepath.Join(s.dir, shard.Name()))
		for _, entry := range ids {
			id := entry.Name()
			if !entry.IsDir() || !validStoreID.MatchString(id) {
				continue
			}
			box, err := s.loadBox(id)
			if err != nil {
				s.log.Warn("store: skipping unreadable mailbox", "id", id, "error", err)
				continue
			}
			s.boxes[id] = box
			s.total += box.bytes
		}
	}
	return nil
}

func (s *BlobStore) loadBox(id string) (*mailbox, error) {
	dir := s.boxDir(id)
	raw, err := os.ReadFile(filepath.Join(dir, "meta.json"))
	if err != nil {
		return nil, err
	}
	box := &mailbox{}
	if err := json.Unmarshal(raw, box); err != nil {
		return nil, err
	}
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, f := range files {
		m := blobFile.FindStringSubmatch(f.Name())
		if m == nil {
			// Leftover temporary files from an interrupted write.
			if strings.HasPrefix(f.Name(), ".tmp-") {
				_ = os.Remove(filepath.Join(dir, f.Name()))
			}
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}
		seq, _ := strconv.ParseUint(m[1], 10, 64)
		box.blobs = append(box.blobs, blobMeta{Seq: seq, Size: info.Size(), Hash: m[2]})
		box.bytes += info.Size()
		if seq >= box.NextSeq {
			box.NextSeq = seq + 1
		}
	}
	sort.Slice(box.blobs, func(i, j int) bool { return box.blobs[i].Seq < box.blobs[j].Seq })
	if box.NextSeq == 0 {
		box.NextSeq = 1
	}
	return box, nil
}

// writeFile writes atomically (temporary file + rename).
func writeFile(dir, name string, data []byte) error {
	f, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(f.Name())
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return err
	}
	if err := os.Rename(f.Name(), filepath.Join(dir, name)); err != nil {
		os.Remove(f.Name())
		return err
	}
	return nil
}

func (s *BlobStore) saveMeta(id string, box *mailbox) error {
	raw, _ := json.Marshal(box)
	return writeFile(s.boxDir(id), "meta.json", raw)
}

// StoredBlob is one blob in a listing.
type StoredBlob struct {
	Seq  uint64 `json:"seq"`
	Data []byte `json:"data"` // base64 in JSON
}

// Listing is the answer to a read.
type Listing struct {
	Blobs []StoredBlob `json:"blobs"`
	// Last is the highest seq in the mailbox (the cursor for the next read).
	Last  uint64 `json:"last"`
	Count int    `json:"count"`
	Bytes int64  `json:"bytes"`
}

// List returns the blobs after seq `after` (an unknown mailbox is empty).
func (s *BlobStore) List(id string, after uint64) (Listing, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := Listing{Blobs: []StoredBlob{}}
	box := s.boxes[id]
	if box == nil {
		return out, nil
	}
	out.Count, out.Bytes = len(box.blobs), box.bytes
	if n := len(box.blobs); n > 0 {
		out.Last = box.blobs[n-1].Seq
	}
	for _, b := range box.blobs {
		if b.Seq <= after {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.boxDir(id), blobName(b)))
		if err != nil {
			return out, err
		}
		out.Blobs = append(out.Blobs, StoredBlob{Seq: b.Seq, Data: data})
	}
	return out, nil
}

// Append verifies a write and stores the body; returns its seq. base >= 0
// makes it a snapshot that replaces the blobs with seq <= base.
func (s *BlobStore) Append(id string, pub, sig []byte, unix int64, base int64, body []byte) (uint64, error) {
	if !validStoreID.MatchString(id) {
		return 0, errStore(http.StatusNotFound, "unknown mailbox")
	}
	if len(pub) != ed25519.PublicKeySize || StoreID(pub) != id {
		return 0, errStore(http.StatusForbidden, "key does not match the mailbox")
	}
	now := s.now()
	if d := now.Sub(time.Unix(unix, 0)); d > storeMaxSkew || d < -storeMaxSkew {
		return 0, errStore(http.StatusUnauthorized, "request time too far from the relay's clock")
	}
	baseText := ""
	if base >= 0 {
		baseText = strconv.FormatInt(base, 10)
	}
	if len(sig) != ed25519.SignatureSize || !ed25519.Verify(pub, storeSignedMessage(id, unix, baseText, body), sig) {
		return 0, errStore(http.StatusForbidden, "invalid signature")
	}
	if int64(len(body)) > s.cfg.MaxBlobBytes {
		return 0, errStore(http.StatusRequestEntityTooLarge, "blob too large")
	}
	sum := sha256.Sum256(body)
	hash := hex.EncodeToString(sum[:])

	s.mu.Lock()
	defer s.mu.Unlock()
	box := s.boxes[id]
	if box != nil {
		if !box.writes.allow(now, 120) {
			return 0, errStore(http.StatusTooManyRequests, "too many writes to this document")
		}
		for _, b := range box.blobs {
			if b.Hash == hash {
				return b.Seq, nil // already stored (a retried request)
			}
		}
	}
	var dropped []blobMeta
	var droppedBytes int64
	var kept []blobMeta
	if box != nil {
		for _, b := range box.blobs {
			if base >= 0 && b.Seq <= uint64(base) {
				dropped = append(dropped, b)
				droppedBytes += b.Size
			} else {
				kept = append(kept, b)
			}
		}
	}
	current := int64(0)
	if box != nil {
		current = box.bytes
	}
	size := int64(len(body))
	if current-droppedBytes+size > s.cfg.MaxDocBytes || (base < 0 && len(kept) >= s.cfg.MaxBlobsPerDoc) {
		return 0, errStore(http.StatusRequestEntityTooLarge, "document mailbox full: send a snapshot")
	}
	if s.total-droppedBytes+size > s.cfg.MaxTotalBytes {
		return 0, errStore(http.StatusInsufficientStorage, "relay storage full")
	}
	isNew := box == nil
	if isNew {
		box = &mailbox{Pub: base64.RawURLEncoding.EncodeToString(pub), NextSeq: 1}
		if err := os.MkdirAll(s.boxDir(id), 0o700); err != nil {
			return 0, err
		}
	}
	meta := blobMeta{Seq: box.NextSeq, Size: size, Hash: hash}
	if err := writeFile(s.boxDir(id), blobName(meta), body); err != nil {
		return 0, err
	}
	box.NextSeq++
	box.Updated = now.UTC()
	if err := s.saveMeta(id, box); err != nil {
		_ = os.Remove(filepath.Join(s.boxDir(id), blobName(meta)))
		box.NextSeq--
		return 0, err
	}
	for _, b := range dropped {
		_ = os.Remove(filepath.Join(s.boxDir(id), blobName(b)))
	}
	box.blobs = append(kept, meta)
	box.bytes += size - droppedBytes
	s.total += size - droppedBytes
	s.boxes[id] = box
	return meta.Seq, nil
}

// sweep deletes mailboxes whose last write is older than the TTL.
func (s *BlobStore) sweep() {
	s.mu.Lock()
	defer s.mu.Unlock()
	limit := s.now().Add(-time.Duration(s.cfg.TTL))
	for id, box := range s.boxes {
		if box.Updated.Before(limit) {
			if err := os.RemoveAll(s.boxDir(id)); err != nil {
				s.log.Warn("store: cannot delete expired mailbox", "id", id, "error", err)
				continue
			}
			s.total -= box.bytes
			delete(s.boxes, id)
		}
	}
	s.rates.prune(s.now())
}

func (s *BlobStore) sweeper() {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-t.C:
			s.sweep()
		}
	}
}

// StoreStats for the status page.
type StoreStats struct {
	Enabled   bool  `json:"enabled"`
	Mailboxes int   `json:"mailboxes"`
	Bytes     int64 `json:"bytes"`
}

func (s *BlobStore) Stats() StoreStats {
	if s == nil {
		return StoreStats{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return StoreStats{Enabled: true, Mailboxes: len(s.boxes), Bytes: s.total}
}

// ---------- Rate limits ----------

// rateWindow counts events in the current minute.
type rateWindow struct {
	start time.Time
	count int
}

func (w *rateWindow) allow(now time.Time, limit int) bool {
	if now.Sub(w.start) >= time.Minute {
		w.start, w.count = now, 0
	}
	if w.count >= limit {
		return false
	}
	w.count++
	return true
}

type rateLimiter struct {
	mu      sync.Mutex
	windows map[string]*rateWindow
}

func newRateLimiter() *rateLimiter { return &rateLimiter{windows: map[string]*rateWindow{}} }

func (r *rateLimiter) allow(key string, now time.Time, limit int) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	w := r.windows[key]
	if w == nil {
		w = &rateWindow{start: now}
		r.windows[key] = w
	}
	return w.allow(now, limit)
}

func (r *rateLimiter) prune(now time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for k, w := range r.windows {
		if now.Sub(w.start) > 2*time.Minute {
			delete(r.windows, k)
		}
	}
}

// ---------- HTTP ----------

// StoreInfo is what browsers learn about the store (GET /ofimeo/store, and
// the "store" field of /ofimeo/config).
type StoreInfo struct {
	Enabled      bool  `json:"enabled"`
	DefaultOn    bool  `json:"default_on"`
	MaxBlobBytes int64 `json:"max_blob_bytes"`
	MaxDocBytes  int64 `json:"max_doc_bytes"`
	MaxBlobs     int   `json:"max_blobs"`
	TTLDays      int   `json:"ttl_days"`
}

func (s *BlobStore) Info() *StoreInfo {
	if s == nil {
		return &StoreInfo{Enabled: false}
	}
	return &StoreInfo{Enabled: true, DefaultOn: s.cfg.DefaultOn, MaxBlobBytes: s.cfg.MaxBlobBytes, MaxDocBytes: s.cfg.MaxDocBytes,
		MaxBlobs: s.cfg.MaxBlobsPerDoc, TTLDays: int(time.Duration(s.cfg.TTL) / (24 * time.Hour))}
}

// ServeHTTP handles /ofimeo/store and /ofimeo/store/<id>. A nil store
// answers that the feature is off.
func (s *BlobStore) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	// The app may be hosted on any origin; nothing here uses cookies.
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Content-Type, X-Ofimeo-Key, X-Ofimeo-Time, X-Ofimeo-Base, X-Ofimeo-Signature")
	h.Set("Access-Control-Max-Age", "600")
	if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
		h.Set("Access-Control-Allow-Private-Network", "true")
	}
	h.Set("Cache-Control", "no-store")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	rest := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/ofimeo/store"), "/")
	if rest == "" {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, s.Info())
		return
	}
	if s == nil {
		http.Error(w, "the mailbox store is turned off on this relay", http.StatusNotFound)
		return
	}
	id := rest
	if !validStoreID.MatchString(id) {
		http.NotFound(w, r)
		return
	}
	ip := hostIP(r.RemoteAddr).String()
	switch r.Method {
	case http.MethodGet:
		if !s.rates.allow("r:"+ip, s.now(), s.cfg.ReadsPerMinute) {
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		after, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
		list, err := s.List(id, after)
		if err != nil {
			s.log.Warn("store: read failed", "error", err)
			http.Error(w, "read failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, list)
	case http.MethodPost:
		if !s.rates.allow("w:"+ip, s.now(), s.cfg.WritesPerMinute) {
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		pub, err1 := base64.RawURLEncoding.DecodeString(r.Header.Get("X-Ofimeo-Key"))
		sig, err2 := base64.RawURLEncoding.DecodeString(r.Header.Get("X-Ofimeo-Signature"))
		unix, err3 := strconv.ParseInt(r.Header.Get("X-Ofimeo-Time"), 10, 64)
		base := int64(-1)
		var err4 error
		if v := r.Header.Get("X-Ofimeo-Base"); v != "" {
			base, err4 = strconv.ParseInt(v, 10, 64)
			if base < 0 {
				err4 = errors.New("negative base")
			}
		}
		if err := errors.Join(err1, err2, err3, err4); err != nil {
			http.Error(w, "bad request headers", http.StatusBadRequest)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, s.cfg.MaxBlobBytes+1))
		if err != nil {
			http.Error(w, "blob too large", http.StatusRequestEntityTooLarge)
			return
		}
		seq, err := s.Append(id, pub, sig, unix, base, body)
		if err != nil {
			var se *storeError
			if errors.As(err, &se) {
				http.Error(w, se.msg, se.status)
				return
			}
			s.log.Warn("store: write failed", "error", err)
			http.Error(w, "write failed", http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]uint64{"seq": seq})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
