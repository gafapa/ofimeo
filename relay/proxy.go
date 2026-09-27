package main

// Import proxy (optional, off by default): lets the Ofimeo app import a file
// from a public Google Docs/Sheets/Slides/Drive or OneDrive/SharePoint share
// link in one click. Browsers cannot download those export URLs themselves
// (no CORS headers), so the app asks the school relay:
//
//	GET /ofimeo/fetch?url=<https export URL>
//
// Safety rules:
//   - off unless "import_proxy": {"enabled": true} is in ofimeo-relay.json;
//     /ofimeo/config then advertises it ("importProxy": "/ofimeo/fetch") and
//     only then does the app use it;
//   - https only, and only hosts of Google Drive/Docs and Microsoft
//     OneDrive/SharePoint (every redirect is checked again); other hosts and
//     addresses that are not public Internet addresses are refused;
//   - no cookies or credentials: requests carry no headers from the browser,
//     so only files shared as "anyone with the link" can be fetched;
//   - size limit (max_mb, default 30) and a few downloads at a time;
//   - the answer is always an attachment (application/octet-stream,
//     nosniff, sandbox), never a page served from the relay's origin;
//   - the usual relay guard applies (local network only unless public).
// The URL is not logged, only the host.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"syscall"
	"time"
)

const importProxyPath = "/ofimeo/fetch"

// ImportProxyConfig is the "import_proxy" section of ofimeo-relay.json.
type ImportProxyConfig struct {
	Enabled bool `json:"enabled"`
	// MaxMB is the largest file accepted (default 30).
	MaxMB int `json:"max_mb,omitempty"`
}

// Hosts (exact, or suffix when starting with a dot) the proxy may contact.
var importHosts = []string{
	"docs.google.com",
	"drive.google.com",
	"drive.usercontent.google.com",
	".googleusercontent.com",
	"onedrive.live.com",
	"1drv.ms",
	"api.onedrive.com",
	".files.1drv.com",
	".sharepoint.com",
	".microsoftpersonalcontent.com",
}

func importHostAllowed(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	for _, h := range importHosts {
		if host == h || (strings.HasPrefix(h, ".") && strings.HasSuffix(host, h) && len(host) > len(h)) {
			return true
		}
	}
	return false
}

// publicAddr: a global unicast Internet address (not loopback, private,
// link-local, CGNAT, documentation or unique-local).
func publicAddr(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	for _, p := range []string{"100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "2001:db8::/32", "64:ff9b::/96"} {
		if netip.MustParsePrefix(p).Contains(ip) {
			return false
		}
	}
	return true
}

var errImportRefused = errors.New("host not allowed")

type ImportProxy struct {
	log      *slog.Logger
	maxBytes int64
	client   *http.Client
	allowed  func(host string) bool
	// anyPort accepts URLs with an explicit port (tests only).
	anyPort bool
	slots   chan struct{}
}

// NewImportProxy returns nil when the proxy is off.
func NewImportProxy(cfg ImportProxyConfig, log *slog.Logger) *ImportProxy {
	if !cfg.Enabled {
		return nil
	}
	dialer := &net.Dialer{
		Timeout: 15 * time.Second,
		// Checked on the resolved address, so DNS names pointing inside the network are refused too.
		Control: func(_, address string, _ syscall.RawConn) error {
			ap, err := netip.ParseAddrPort(address)
			if err != nil || !publicAddr(ap.Addr()) {
				return errImportRefused
			}
			return nil
		},
	}
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		MaxIdleConns:          8,
		IdleConnTimeout:       60 * time.Second,
	}
	return newImportProxy(cfg, log, &http.Client{Transport: transport}, importHostAllowed)
}

func newImportProxy(cfg ImportProxyConfig, log *slog.Logger, client *http.Client, allowed func(string) bool) *ImportProxy {
	maxMB := cfg.MaxMB
	if maxMB <= 0 {
		maxMB = 30
	}
	p := &ImportProxy{log: log, maxBytes: int64(maxMB) << 20, allowed: allowed, slots: make(chan struct{}, 4)}
	c := *client
	c.Jar = nil
	c.Timeout = 90 * time.Second
	c.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("too many redirects")
		}
		if err := p.checkURL(req.URL); err != nil {
			return err
		}
		// Nothing from earlier hops (e.g. cookies set by a redirect) is sent on.
		req.Header.Del("Cookie")
		req.Header.Del("Authorization")
		return nil
	}
	p.client = &c
	return p
}

func (p *ImportProxy) checkURL(u *url.URL) error {
	if u.Scheme != "https" || u.User != nil || u.Hostname() == "" {
		return errImportRefused
	}
	if port := u.Port(); port != "" && port != "443" && !p.anyPort {
		return errImportRefused
	}
	if !p.allowed(u.Hostname()) {
		return errImportRefused
	}
	return nil
}

func importError(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": code})
}

func (p *ImportProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
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
	if r.Method != http.MethodGet {
		importError(w, http.StatusMethodNotAllowed, "method")
		return
	}
	target, err := url.Parse(r.URL.Query().Get("url"))
	if err != nil || p.checkURL(target) != nil {
		importError(w, http.StatusForbidden, "host")
		return
	}
	select {
	case p.slots <- struct{}{}:
		defer func() { <-p.slots }()
	case <-time.After(10 * time.Second):
		importError(w, http.StatusServiceUnavailable, "busy")
		return
	case <-r.Context().Done():
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		importError(w, http.StatusBadRequest, "url")
		return
	}
	req.Header.Set("User-Agent", "OfimeoRelay/"+version+" (import)")
	req.Header.Set("Accept", "*/*")
	resp, err := p.client.Do(req)
	if err != nil {
		if errors.Is(err, errImportRefused) {
			// Usually a redirect to a sign-in page: the file is not public.
			importError(w, http.StatusForbidden, "not-public")
		} else {
			importError(w, http.StatusBadGateway, "unreachable")
		}
		p.logf("import failed", target.Hostname(), err)
		return
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		importError(w, http.StatusNotFound, "not-found")
		return
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		importError(w, http.StatusForbidden, "not-public")
		return
	case resp.StatusCode != http.StatusOK:
		importError(w, http.StatusBadGateway, "upstream")
		return
	}
	contentType := resp.Header.Get("Content-Type")
	if mt, _, _ := mime.ParseMediaType(contentType); mt == "text/html" {
		// A sign-in, "request access" or virus-scan page instead of the file.
		importError(w, http.StatusForbidden, "not-public")
		return
	}
	if resp.ContentLength > p.maxBytes {
		importError(w, http.StatusRequestEntityTooLarge, "too-large")
		return
	}
	var buf bytes.Buffer
	n, err := io.Copy(&buf, io.LimitReader(resp.Body, p.maxBytes+1))
	if err != nil {
		importError(w, http.StatusBadGateway, "unreachable")
		return
	}
	if n > p.maxBytes {
		importError(w, http.StatusRequestEntityTooLarge, "too-large")
		return
	}
	if name := downloadName(resp.Header.Get("Content-Disposition")); name != "" {
		h.Set("X-Ofimeo-Filename", url.PathEscape(name))
	}
	if contentType != "" {
		h.Set("X-Ofimeo-Content-Type", contentType)
	}
	h.Set("Content-Type", "application/octet-stream")
	h.Set("Content-Disposition", "attachment")
	h.Set("Content-Security-Policy", "sandbox; default-src 'none'")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Length", fmt.Sprint(n))
	_, _ = w.Write(buf.Bytes())
	if p.log != nil {
		p.log.Info("import", "host", target.Hostname(), "bytes", n)
	}
}

func (p *ImportProxy) logf(msg, host string, err error) {
	if p.log != nil {
		p.log.Info(msg, "host", host, "error", err)
	}
}

// downloadName is the file name of a Content-Disposition header (UTF-8 aware).
func downloadName(header string) string {
	_, params, err := mime.ParseMediaType(header)
	if err != nil {
		return ""
	}
	name := params["filename"]
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	if len(name) > 200 {
		name = name[:200]
	}
	return strings.TrimSpace(name)
}

// importProxyPath is advertised in /ofimeo/config only when the proxy is on.
func (s *Web) importProxyPath() string {
	if s.cfg.ImportProxy.Enabled {
		return importProxyPath
	}
	return ""
}
