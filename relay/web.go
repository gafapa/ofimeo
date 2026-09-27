package main

import (
	"encoding/json"
	"html/template"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

// Web serves the relay's HTTPS endpoints (and the plain-http helper port).
type Web struct {
	cfg     *Config
	log     *slog.Logger
	nostr   *NostrRelay
	turn    *TURNServer
	certs   *CertManager
	app     *AppFiles
	store   *BlobStore // nil: store-and-forward mailboxes are off
	started time.Time
	// Ports actually in use (after "auto" was resolved).
	httpsPort, httpPort, turnTLSPort int
	relayIP                          net.IP
}

// ClientConfig is what /ofimeo/config returns to the web app.
type ClientConfig struct {
	Name       string      `json:"name"`
	Version    string      `json:"version"`
	Relays     []string    `json:"relays"`
	ICEServers []ICEServer `json:"iceServers"`
	TTL        int64       `json:"ttl"`
	Expires    int64       `json:"expires"`
	Store      *StoreInfo  `json:"store,omitempty"`
	// ImportProxy is the path of the import proxy (proxy.go) when it is on.
	ImportProxy string `json:"importProxy,omitempty"`
	// Moodle forwarding (moodle.go), when a Moodle is configured.
	Moodle *MoodleInfo `json:"moodle,omitempty"`
	// School is the school's ofimeo.config.json (school.go), when given.
	School json.RawMessage `json:"school,omitempty"`
}

type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

var validHost = regexp.MustCompile(`^[A-Za-z0-9.\-]+$|^\[[0-9A-Fa-f:.%]+\]$`)

// requestHost is the host (and port) the client used to reach us, if sane.
func (s *Web) requestHost(r *http.Request) string {
	host, port, err := net.SplitHostPort(r.Host)
	if err != nil {
		host, port = r.Host, ""
	}
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		host = "[" + host + "]"
	}
	if !validHost.MatchString(host) {
		host = s.advertisedHost()
		port = strconv.Itoa(s.httpsPort)
	}
	if port == "" || port == "443" {
		return host
	}
	return host + ":" + port
}

// advertisedHost is the name or address shown to people and put in links.
func (s *Web) advertisedHost() string {
	switch {
	case s.cfg.Domain != "":
		return s.cfg.Domain
	case s.cfg.Host != "":
		return s.cfg.Host
	}
	if s.relayIP.To4() == nil {
		return "[" + s.relayIP.String() + "]"
	}
	return s.relayIP.String()
}

// RelayAddress is what people paste in the app ("Use a school relay").
func (s *Web) RelayAddress() string {
	if s.httpsPort == 443 {
		return "https://" + s.advertisedHost()
	}
	return "https://" + s.advertisedHost() + ":" + strconv.Itoa(s.httpsPort)
}

// StudentLink opens the app with this relay configured.
func (s *Web) StudentLink() string {
	if s.app != nil {
		return s.RelayAddress() + "/"
	}
	u := s.cfg.AppURL
	sep := "?"
	if strings.Contains(u, "?") {
		sep = "&"
	}
	return u + sep + "relay=" + url.QueryEscape(s.RelayAddress())
}

func (s *Web) clientConfig(r *http.Request) (ClientConfig, error) {
	ttl := time.Duration(s.cfg.CredentialTTL)
	user, pass, expires, err := Credentials(s.cfg.Secret, ttl)
	if err != nil {
		return ClientConfig{}, err
	}
	host := s.requestHost(r)
	hostOnly := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		hostOnly = h
		if strings.Contains(h, ":") {
			hostOnly = "[" + h + "]"
		}
	}
	turnHost := s.cfg.Host
	if turnHost == "" {
		turnHost = s.relayIP.String()
	}
	if strings.Contains(turnHost, ":") {
		turnHost = "[" + turnHost + "]"
	}
	tp := strconv.Itoa(s.cfg.TURNPort)
	urls := []string{"turn:" + turnHost + ":" + tp + "?transport=udp", "turn:" + turnHost + ":" + tp + "?transport=tcp"}
	if s.turnTLSPort > 0 {
		urls = append(urls, "turns:"+hostOnly+":"+strconv.Itoa(s.turnTLSPort)+"?transport=tcp")
	}
	return ClientConfig{
		Name:    s.cfg.Name,
		Version: version,
		Relays:  []string{"wss://" + host + "/nostr"},
		ICEServers: []ICEServer{
			{URLs: []string{"stun:" + turnHost + ":" + tp}},
			{URLs: urls, Username: user, Credential: pass},
		},
		TTL:         int64(ttl.Seconds()),
		Expires:     expires.Unix(),
		Store:       s.store.Info(),
		ImportProxy: s.importProxyPath(),
		Moodle:      s.moodleInfo(),
		School:      s.schoolJSON(),
	}, nil
}

// allowed: local network only, unless the relay runs in public mode.
func (s *Web) allowed(r *http.Request) bool {
	return s.cfg.Public || isLocalIP(hostIP(r.RemoteAddr))
}

func (s *Web) guard(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.allowed(r) {
			http.Error(w, "Ofimeo Relay only accepts devices on the local network.", http.StatusForbidden)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		h.ServeHTTP(w, r)
	})
}

// HTTPSHandler serves everything on the TLS port.
func (s *Web) HTTPSHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ofimeo/config", s.handleConfig)
	mux.HandleFunc("/ofimeo/status.json", s.handleStatusJSON)
	mux.HandleFunc("/ofimeo/qr.png", s.handleQR)
	mux.HandleFunc("/ofimeo/ca", s.handleCAPage)
	mux.HandleFunc("/ofimeo/ca.crt", s.handleCA)
	mux.HandleFunc("/ofimeo/ca.cer", s.handleCA)
	mux.HandleFunc("/ofimeo/", s.handleStatus)
	mux.HandleFunc("/ofimeo", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/ofimeo/", http.StatusFound) })
	mux.Handle("/ofimeo/store", s.store)
	mux.Handle("/ofimeo/store/", s.store)
	if p := NewImportProxy(s.cfg.ImportProxy, s.log); p != nil {
		mux.Handle(importProxyPath, p)
	}
	s.registerSchoolRoutes(mux)
	s.registerMoodleRoutes(mux)
	mux.Handle("/nostr", s.nostr)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.EqualFold(r.Header.Get("Upgrade"), "websocket") || strings.Contains(r.Header.Get("Accept"), "application/nostr+json"):
			s.nostr.ServeHTTP(w, r)
		case s.app != nil:
			s.app.ServeHTTP(w, r)
		case r.URL.Path == "/":
			http.Redirect(w, r, "/ofimeo/", http.StatusFound)
		default:
			http.NotFound(w, r)
		}
	})
	return s.guard(mux)
}

// HTTPHandler serves the plain-http port: certificate download (needed before
// the certificate is trusted) and a redirect to https for everything else.
func (s *Web) HTTPHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ofimeo/ca", s.handleCAPage)
	mux.HandleFunc("/ofimeo/ca.crt", s.handleCA)
	mux.HandleFunc("/ofimeo/ca.cer", s.handleCA)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		host := s.requestHost(r)
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
			host = "[" + host + "]"
		}
		if s.httpsPort != 443 {
			host += ":" + strconv.Itoa(s.httpsPort)
		}
		http.Redirect(w, r, "https://"+host+r.URL.RequestURI(), http.StatusFound)
	})
	return s.guard(s.certs.HTTPHandler(mux))
}

func (s *Web) handleConfig(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	// Any web origin may ask (the app may be hosted anywhere); nothing here
	// depends on cookies. Private Network Access preflights are allowed too.
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Content-Type")
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
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, err := s.clientConfig(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cfg)
}

type Status struct {
	Name         string     `json:"name"`
	Version      string     `json:"version"`
	Uptime       string     `json:"uptime"`
	RelayAddress string     `json:"relay_address"`
	StudentLink  string     `json:"student_link"`
	ServingApp   bool       `json:"serving_app"`
	Public       bool       `json:"public"`
	Nostr        NostrStats `json:"nostr"`
	Store        StoreStats `json:"store"`
	Allocations  int        `json:"turn_allocations"`
	Cert         CertStatus `json:"certificate"`
	Ports        PortStatus `json:"ports"`
}

type PortStatus struct {
	HTTPS   int `json:"https"`
	HTTP    int `json:"http,omitempty"`
	TURN    int `json:"turn"`
	TURNTLS int `json:"turn_tls,omitempty"`
}

func (s *Web) Status() Status {
	return Status{
		Name:         s.cfg.Name,
		Version:      version,
		Uptime:       time.Since(s.started).Round(time.Second).String(),
		RelayAddress: s.RelayAddress(),
		StudentLink:  s.StudentLink(),
		ServingApp:   s.app != nil,
		Public:       s.cfg.Public,
		Nostr:        s.nostr.Stats(),
		Store:        s.store.Stats(),
		Allocations:  s.turn.Allocations(),
		Cert:         s.certs.Status(),
		Ports:        PortStatus{HTTPS: s.httpsPort, HTTP: max(s.httpPort, 0), TURN: s.cfg.TURNPort, TURNTLS: max(s.turnTLSPort, 0)},
	}
}

func (s *Web) handleStatusJSON(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(s.Status())
}

func (s *Web) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/ofimeo/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := statusPage.Execute(w, s.Status()); err != nil {
		s.log.Warn("status page", "error", err)
	}
}

func (s *Web) handleQR(w http.ResponseWriter, r *http.Request) {
	text := s.StudentLink()
	if r.URL.Query().Get("for") == "relay" {
		text = s.RelayAddress()
	}
	png, err := qrcode.Encode(text, qrcode.Medium, 320)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(png)
}

func (s *Web) handleCA(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/x-x509-ca-cert")
	if strings.HasSuffix(r.URL.Path, ".cer") {
		w.Header().Set("Content-Disposition", `attachment; filename="ofimeo-relay-ca.cer"`)
		_, _ = w.Write(s.certs.CADER())
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="ofimeo-relay-ca.crt"`)
	_, _ = w.Write(s.certs.CAPEM())
}

func (s *Web) handleCAPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	data := map[string]any{
		"Name":         s.cfg.Name,
		"Fingerprint":  s.certs.CAFingerprint(),
		"RelayAddress": s.RelayAddress(),
		"Mode":         s.certs.Mode,
	}
	if err := caPage.Execute(w, data); err != nil {
		s.log.Warn("certificate page", "error", err)
	}
}

func mustTemplate(name, text string) *template.Template {
	return template.Must(template.New(name).Funcs(template.FuncMap{
		"date": func(t time.Time) string { return t.Format("2006-01-02") },
		"join": func(list []string) string { return strings.Join(list, ", ") },
		"modeLabel": func(m string) string {
			switch m {
			case "letsencrypt":
				return "Let's Encrypt (trusted everywhere)"
			case "files":
				return "Certificate files provided by the school"
			}
			return "Local certificate authority (install it on every device)"
		},
	}).Parse(text))
}
