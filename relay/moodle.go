package main

// Moodle forwarding (optional, off by default): lets the Ofimeo app talk to
// the school's Moodle when the Moodle site does not allow calls from the
// browser (no CORS headers, or a filter strips them). See docs/moodle.md.
//
//	POST /ofimeo/moodle/public?site=<Moodle URL>  → lib/ajax/service-nologin.php (tool_mobile_get_public_config only)
//	POST /ofimeo/moodle/login?site=…              → login/token.php (service moodle_mobile_app)
//	POST /ofimeo/moodle/rest?site=…               → webservice/rest/server.php (listed functions only)
//	POST /ofimeo/moodle/upload?site=…             → webservice/upload.php (draft files)
//	POST /ofimeo/moodle/file?site=…               → webservice/pluginfile.php (files of assignments)
//
// Safety rules:
//   - off unless a Moodle address is configured ("moodle": {"url": …} in
//     ofimeo-relay.json, --moodle-url or OFIMEO_MOODLE_URL); /ofimeo/config then
//     advertises it ("moodle": {"url", "path"});
//   - requests go ONLY to that Moodle: the browser names the site it is
//     connected to (?site=) and anything else is refused, so the relay can
//     never be used to reach another server;
//   - only the web service functions Ofimeo uses are forwarded;
//   - nothing is stored and nothing is logged but the endpoint, the status and
//     the size (never bodies, user names, passwords or tokens);
//   - size limits (upload: max_upload_mb, default 50; answers: 10 MB, files:
//     the same as uploads), timeouts and a few requests at a time;
//   - redirects are not followed (a redirect to another address is an error);
//   - the usual relay guard applies (local network only unless public).

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const moodlePath = "/ofimeo/moodle"

// MoodleConfig is the "moodle" section of ofimeo-relay.json.
type MoodleConfig struct {
	// URL of the school's Moodle (https://moodle.school.example or with a path, …/moodle).
	URL string `json:"url,omitempty"`
	// MaxUploadMB is the largest file handed in or downloaded through the relay (default 50).
	MaxUploadMB int `json:"max_upload_mb,omitempty"`
}

// MoodleInfo is advertised in /ofimeo/config when forwarding is on.
type MoodleInfo struct {
	URL         string `json:"url"`
	Path        string `json:"path"`
	MaxUploadMB int    `json:"maxUploadMB"`
}

// Web service functions the app uses; nothing else is forwarded.
var moodleFunctions = map[string]bool{
	"core_webservice_get_site_info":    true,
	"core_enrol_get_users_courses":     true,
	"mod_assign_get_assignments":       true,
	"mod_assign_get_submission_status": true,
	"mod_assign_save_submission":       true,
	"mod_assign_submit_for_grading":    true,
}

func addMoodleFlags(fs *flag.FlagSet, c *MoodleConfig) {
	fs.StringVar(&c.URL, "moodle-url", c.URL, "the school's Moodle address: lets the web app reach it through this relay (see docs/moodle.md)")
	fs.IntVar(&c.MaxUploadMB, "moodle-max-upload", c.MaxUploadMB, "largest file (MB) handed in to Moodle through this relay (default 50)")
}

// applyMoodleEnv reads OFIMEO_MOODLE_URL and OFIMEO_MOODLE_MAX_UPLOAD (containers).
func applyMoodleEnv(c *MoodleConfig) error {
	if v := strings.TrimSpace(os.Getenv("OFIMEO_MOODLE_URL")); v != "" {
		c.URL = v
	}
	if v := strings.TrimSpace(os.Getenv("OFIMEO_MOODLE_MAX_UPLOAD")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return fmt.Errorf("OFIMEO_MOODLE_MAX_UPLOAD: %w", err)
		}
		c.MaxUploadMB = n
	}
	return nil
}

// normalizeMoodleURL: scheme://host[:port][/path] without a trailing slash,
// query or fragment; "" when it is not an http(s) address.
func normalizeMoodleURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return ""
	}
	p := strings.TrimRight(u.EscapedPath(), "/")
	for _, suffix := range []string{"/login/index.php", "/index.php", "/my", "/login"} {
		p = strings.TrimSuffix(p, suffix)
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host) + p
}

// validateMoodle checks the configured address at startup.
func validateMoodle(c *MoodleConfig) error {
	if strings.TrimSpace(c.URL) == "" {
		return nil
	}
	if normalizeMoodleURL(c.URL) == "" {
		return fmt.Errorf("moodle url %q: expected https://moodle.school.example", c.URL)
	}
	if c.MaxUploadMB < 0 {
		return errors.New("moodle max_upload_mb must be positive")
	}
	return nil
}

type MoodleProxy struct {
	log      *slog.Logger
	base     string // normalized Moodle URL
	maxBytes int64
	client   *http.Client
	slots    chan struct{}
}

// NewMoodleProxy returns nil when no Moodle is configured.
func NewMoodleProxy(cfg MoodleConfig, log *slog.Logger) *MoodleProxy {
	base := normalizeMoodleURL(cfg.URL)
	if base == "" {
		return nil
	}
	maxMB := cfg.MaxUploadMB
	if maxMB <= 0 {
		maxMB = 50
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 120 * time.Second
	transport.MaxIdleConns = 8
	client := &http.Client{
		Transport: transport,
		// Redirects are answered to the browser as errors, never followed.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return &MoodleProxy{log: log, base: base, maxBytes: int64(maxMB) << 20, client: client, slots: make(chan struct{}, 8)}
}

func (s *Web) moodleInfo() *MoodleInfo {
	base := normalizeMoodleURL(s.cfg.Moodle.URL)
	if base == "" {
		return nil
	}
	maxMB := s.cfg.Moodle.MaxUploadMB
	if maxMB <= 0 {
		maxMB = 50
	}
	return &MoodleInfo{URL: base, Path: moodlePath, MaxUploadMB: maxMB}
}

// registerMoodleRoutes adds /ofimeo/moodle/ when a Moodle is configured.
func (s *Web) registerMoodleRoutes(mux *http.ServeMux) {
	if p := NewMoodleProxy(s.cfg.Moodle, s.log); p != nil {
		mux.Handle(moodlePath+"/", p)
	}
}

func moodleError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code, "source": "relay"})
}

func (p *MoodleProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	h.Set("Access-Control-Expose-Headers", "X-Ofimeo-Filename, X-Ofimeo-Content-Type")
	h.Set("Access-Control-Max-Age", "600")
	if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
		h.Set("Access-Control-Allow-Private-Network", "true")
	}
	h.Set("Cache-Control", "no-store")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		moodleError(w, http.StatusMethodNotAllowed, "method")
		return
	}
	// The browser says which Moodle it is connected to: only the configured one is served.
	if normalizeMoodleURL(r.URL.Query().Get("site")) != p.base {
		moodleError(w, http.StatusForbidden, "site")
		return
	}
	endpoint := strings.TrimPrefix(r.URL.Path, moodlePath+"/")
	switch endpoint {
	case "public", "login", "rest", "upload", "file":
	default:
		moodleError(w, http.StatusNotFound, "endpoint")
		return
	}
	select {
	case p.slots <- struct{}{}:
		defer func() { <-p.slots }()
	case <-time.After(15 * time.Second):
		moodleError(w, http.StatusServiceUnavailable, "busy")
		return
	case <-r.Context().Done():
		return
	}
	timeout := 60 * time.Second
	if endpoint == "upload" || endpoint == "file" {
		timeout = 180 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	var req *http.Request
	var err error
	switch endpoint {
	case "public":
		body := `[{"index":0,"methodname":"tool_mobile_get_public_config","args":{}}]`
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, p.base+"/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config", strings.NewReader(body))
		if req != nil {
			req.Header.Set("Content-Type", "application/json")
		}
	case "login":
		form, ok := p.readForm(w, r)
		if !ok {
			return
		}
		out := url.Values{"username": {form.Get("username")}, "password": {form.Get("password")}, "service": {"moodle_mobile_app"}}
		req, err = formRequest(ctx, p.base+"/login/token.php", out)
	case "rest":
		form, ok := p.readForm(w, r)
		if !ok {
			return
		}
		if !moodleFunctions[form.Get("wsfunction")] {
			moodleError(w, http.StatusForbidden, "function")
			return
		}
		form.Set("moodlewsrestformat", "json")
		req, err = formRequest(ctx, p.base+"/webservice/rest/server.php", form)
	case "upload":
		mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if mt != "multipart/form-data" {
			moodleError(w, http.StatusBadRequest, "body")
			return
		}
		if r.ContentLength > p.maxBytes+64<<10 {
			moodleError(w, http.StatusRequestEntityTooLarge, "too-large")
			return
		}
		var buf bytes.Buffer
		n, rerr := io.Copy(&buf, io.LimitReader(r.Body, p.maxBytes+64<<10+1))
		if rerr != nil {
			moodleError(w, http.StatusBadRequest, "body")
			return
		}
		if n > p.maxBytes+64<<10 {
			moodleError(w, http.StatusRequestEntityTooLarge, "too-large")
			return
		}
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, p.base+"/webservice/upload.php", &buf)
		if req != nil {
			req.Header.Set("Content-Type", r.Header.Get("Content-Type"))
		}
	case "file":
		form, ok := p.readForm(w, r)
		if !ok {
			return
		}
		target, ok := p.fileURL(form.Get("url"))
		if !ok {
			moodleError(w, http.StatusForbidden, "site")
			return
		}
		q := target.Query()
		q.Set("token", form.Get("token"))
		target.RawQuery = q.Encode()
		req, err = http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	}
	if err != nil {
		moodleError(w, http.StatusBadRequest, "request")
		return
	}
	req.Header.Set("User-Agent", "OfimeoRelay/"+version+" (moodle)")
	resp, err := p.client.Do(req)
	if err != nil {
		p.logf(endpoint, 0, 0, err)
		moodleError(w, http.StatusBadGateway, "unreachable")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		p.logf(endpoint, resp.StatusCode, 0, nil)
		moodleError(w, http.StatusBadGateway, "redirect")
		return
	}
	limit := int64(10 << 20)
	if endpoint == "file" {
		limit = p.maxBytes
	}
	if resp.ContentLength > limit {
		moodleError(w, http.StatusRequestEntityTooLarge, "too-large")
		return
	}
	var buf bytes.Buffer
	n, err := io.Copy(&buf, io.LimitReader(resp.Body, limit+1))
	if err != nil {
		moodleError(w, http.StatusBadGateway, "unreachable")
		return
	}
	if n > limit {
		moodleError(w, http.StatusRequestEntityTooLarge, "too-large")
		return
	}
	if endpoint == "file" {
		if resp.StatusCode != http.StatusOK {
			moodleError(w, http.StatusBadGateway, "upstream")
			return
		}
		if name := downloadName(resp.Header.Get("Content-Disposition")); name != "" {
			h.Set("X-Ofimeo-Filename", url.PathEscape(name))
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			h.Set("X-Ofimeo-Content-Type", ct)
		}
		// Never a page served from the relay's origin.
		h.Set("Content-Type", "application/octet-stream")
		h.Set("Content-Disposition", "attachment")
		h.Set("Content-Security-Policy", "sandbox; default-src 'none'")
	} else {
		// Moodle answers JSON (errors too, with status 200).
		h.Set("Content-Type", "application/json")
	}
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Length", strconv.FormatInt(n, 10))
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(buf.Bytes())
	p.logf(endpoint, resp.StatusCode, n, nil)
}

// readForm parses a small urlencoded body (no files).
func (p *MoodleProxy) readForm(w http.ResponseWriter, r *http.Request) (url.Values, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := r.ParseForm(); err != nil {
		moodleError(w, http.StatusBadRequest, "body")
		return nil, false
	}
	return r.PostForm, true
}

// fileURL accepts only files of the configured Moodle (pluginfile.php).
func (p *MoodleProxy) fileURL(raw string) (*url.URL, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || u.Fragment != "" {
		return nil, false
	}
	base, _ := url.Parse(p.base)
	if !strings.EqualFold(u.Scheme, base.Scheme) || !strings.EqualFold(u.Host, base.Host) {
		return nil, false
	}
	// Inspect decoded segments too: upstream servers normalize encoded dot
	// segments and backslashes before routing the request.
	decoded := u.Path
	for depth := 0; ; depth++ {
		if depth >= 8 {
			return nil, false
		}
		if strings.Contains(decoded, "\\") {
			return nil, false
		}
		for _, segment := range strings.Split(decoded, "/") {
			if segment == "." || segment == ".." {
				return nil, false
			}
		}
		next, err := url.PathUnescape(decoded)
		if err != nil || next == decoded {
			break
		}
		decoded = next
	}
	path := u.EscapedPath()
	for _, prefix := range []string{"/webservice/pluginfile.php/", "/pluginfile.php/", "/tokenpluginfile.php/"} {
		if strings.HasPrefix(path, base.EscapedPath()+prefix) {
			return u, true
		}
	}
	return nil, false
}

func formRequest(ctx context.Context, target string, form url.Values) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, strings.NewReader(form.Encode()))
	if err == nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	return req, err
}

// Only the endpoint, the status and the size: never bodies, names or tokens.
func (p *MoodleProxy) logf(endpoint string, status int, bytes int64, err error) {
	if p.log == nil {
		return
	}
	if err != nil {
		// Transport errors name the URL; keep only the kind of failure.
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		p.log.Info("moodle", "endpoint", endpoint, "error", err)
		return
	}
	p.log.Info("moodle", "endpoint", endpoint, "status", status, "bytes", bytes)
}
