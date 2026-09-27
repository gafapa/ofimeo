package main

// School configuration and container deployment helpers (docs/deploy-school.md).
//
//   - --school-config <file> (config "school_config", env OFIMEO_SCHOOL_CONFIG):
//     the school's ofimeo.config.json (schema: docs/ofimeo.config.schema.json).
//     It is served at /ofimeo.config.json, where the web app looks for it when
//     the relay serves the app (--serve-app), and inside /ofimeo/config as
//     "school" for apps hosted elsewhere that use this relay. Images next to it
//     in a "school" folder (e.g. the logo) are served at /school/. The file is
//     read again when it changes: no restart is needed.
//   - OFIMEO_* environment variables for the main options (containers); flags
//     still win.
//   - "ofimeo-relay healthcheck": exits 0 when the local HTTPS server answers
//     (Docker HEALTHCHECK in images without curl).

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const schoolConfigPath = "/ofimeo.config.json"

// schoolConfigFile reads the school configuration, again only when it changed.
type schoolConfigFile struct {
	path string
	mu   sync.Mutex
	mod  time.Time
	size int64
	data []byte // compact JSON object, nil when missing or invalid
	err  error
}

var (
	schoolFilesMu sync.Mutex
	schoolFiles   = map[string]*schoolConfigFile{}
)

func schoolConfigFor(p string) *schoolConfigFile {
	if p == "" {
		return nil
	}
	schoolFilesMu.Lock()
	defer schoolFilesMu.Unlock()
	f := schoolFiles[p]
	if f == nil {
		f = &schoolConfigFile{path: p}
		schoolFiles[p] = f
	}
	return f
}

// Load returns the configuration as compact JSON (an object).
func (f *schoolConfigFile) Load() ([]byte, error) {
	if f == nil {
		return nil, nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	st, err := os.Stat(f.path)
	if err != nil {
		f.data, f.err, f.mod, f.size = nil, err, time.Time{}, 0
		return nil, err
	}
	if f.data != nil && st.ModTime().Equal(f.mod) && st.Size() == f.size {
		return f.data, nil
	}
	f.mod, f.size = st.ModTime(), st.Size()
	f.data, f.err = readSchoolConfig(f.path)
	return f.data, f.err
}

func readSchoolConfig(p string) ([]byte, error) {
	raw, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}
	if len(raw) > 256*1024 {
		return nil, fmt.Errorf("%s: larger than 256 KB", p)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("%s: not a JSON object: %w", p, err)
	}
	var out bytes.Buffer
	if err := json.Compact(&out, raw); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// validateSchoolConfig is called at startup: a broken file is reported at once.
func validateSchoolConfig(cfg *Config) error {
	if cfg.SchoolConfig == "" {
		return nil
	}
	// A missing file is not an error (a container may be started before it is
	// written): the app's own ofimeo.config.json answers until it exists.
	if _, err := schoolConfigFor(cfg.SchoolConfig).Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("--school-config: %w", err)
	}
	return nil
}

// schoolJSON is the "school" member of /ofimeo/config (nil: none).
func (s *Web) schoolJSON() json.RawMessage {
	data, err := schoolConfigFor(s.cfg.SchoolConfig).Load()
	if err != nil || data == nil {
		return nil
	}
	return data
}

// handleSchoolConfig serves /ofimeo.config.json; without --school-config the
// app's own file (if the app is served) answers.
func (s *Web) handleSchoolConfig(w http.ResponseWriter, r *http.Request) {
	var data []byte
	var err error
	if s.cfg.SchoolConfig != "" {
		data, err = schoolConfigFor(s.cfg.SchoolConfig).Load()
	}
	if s.cfg.SchoolConfig == "" || errors.Is(err, os.ErrNotExist) {
		if s.app != nil {
			s.app.ServeHTTP(w, r)
		} else {
			http.NotFound(w, r)
		}
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err != nil {
		s.log.Warn("school configuration", "error", err)
		http.Error(w, "the school configuration file is not valid JSON", http.StatusInternalServerError)
		return
	}
	h := w.Header()
	h.Set("Content-Type", "application/json")
	h.Set("Cache-Control", "no-cache")
	h.Set("Access-Control-Allow-Origin", "*")
	http.ServeContent(w, r, "ofimeo.config.json", time.Time{}, bytes.NewReader(data))
}

// handleSchoolFiles serves <folder of the configuration>/school/* at /school/
// (the logo). Nothing else next to the configuration file is served.
func (s *Web) handleSchoolFiles(w http.ResponseWriter, r *http.Request) {
	if s.cfg.SchoolConfig == "" {
		if s.app != nil {
			s.app.ServeHTTP(w, r)
		} else {
			http.NotFound(w, r)
		}
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+strings.TrimPrefix(r.URL.Path, "/school/")), "/")
	if name == "" || strings.HasPrefix(name, ".") || strings.Contains(name, "/.") {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join(filepath.Dir(s.cfg.SchoolConfig), "school", filepath.FromSlash(name))
	st, err := os.Stat(full)
	if err != nil || st.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	// SVG logos: no scripts when opened directly.
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
	http.ServeFile(w, r, full)
}

// registerSchoolRoutes adds the school configuration routes to the HTTPS mux.
func (s *Web) registerSchoolRoutes(mux *http.ServeMux) {
	mux.HandleFunc(schoolConfigPath, s.handleSchoolConfig)
	mux.HandleFunc("/school/", s.handleSchoolFiles)
}

// ---------- Environment (containers) ----------

// applyDeployEnv reads OFIMEO_* environment variables for the main options.
func applyDeployEnv(cfg *Config) error {
	env := func(k string) (string, bool) {
		v, ok := os.LookupEnv(k)
		return strings.TrimSpace(v), ok && strings.TrimSpace(v) != ""
	}
	for k, dst := range map[string]*string{
		"OFIMEO_NAME":          &cfg.Name,
		"OFIMEO_HOST":          &cfg.Host,
		"OFIMEO_DOMAIN":        &cfg.Domain,
		"OFIMEO_ACME_EMAIL":    &cfg.ACMEEmail,
		"OFIMEO_CERT":          &cfg.CertFile,
		"OFIMEO_KEY":           &cfg.KeyFile,
		"OFIMEO_SERVE_APP":     &cfg.ServeApp,
		"OFIMEO_APP_URL":       &cfg.AppURL,
		"OFIMEO_SCHOOL_CONFIG": &cfg.SchoolConfig,
		"OFIMEO_LOG_FILE":      &cfg.LogFile,
	} {
		if v, ok := env(k); ok {
			*dst = v
		}
	}
	for k, dst := range map[string]*int{
		"OFIMEO_HTTPS_PORT":     &cfg.HTTPSPort,
		"OFIMEO_HTTP_PORT":      &cfg.HTTPPort,
		"OFIMEO_TURN_PORT":      &cfg.TURNPort,
		"OFIMEO_TURN_TLS_PORT":  &cfg.TURNTLSPort,
		"OFIMEO_RELAY_PORT_MIN": &cfg.RelayPortMin,
		"OFIMEO_RELAY_PORT_MAX": &cfg.RelayPortMax,
	} {
		if v, ok := env(k); ok {
			n, err := strconv.Atoi(v)
			if err != nil {
				return fmt.Errorf("%s: %w", k, err)
			}
			*dst = n
		}
	}
	if v, ok := env("OFIMEO_PUBLIC"); ok {
		b, err := parseBool(v)
		if err != nil {
			return fmt.Errorf("OFIMEO_PUBLIC: %w", err)
		}
		cfg.Public = b
	}
	if v, ok := env("OFIMEO_ALLOW_NETWORKS"); ok {
		cfg.AllowNetworks = strings.Split(v, ",")
	}
	if v, ok := env("OFIMEO_CREDENTIAL_TTL"); ok {
		if err := cfg.CredentialTTL.Set(v); err != nil {
			return fmt.Errorf("OFIMEO_CREDENTIAL_TTL: %w", err)
		}
	}
	return nil
}

// ---------- Health check ----------

// cmdHealthcheck asks the local HTTPS server for its status (any certificate:
// it is this machine). Port: the argument, else OFIMEO_HTTPS_PORT, else 443.
func cmdHealthcheck(args []string) error {
	port := os.Getenv("OFIMEO_HTTPS_PORT")
	if len(args) > 0 {
		port = args[0]
	}
	if port == "" || port == "0" {
		port = "443"
	}
	client := &http.Client{
		Timeout:   5 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}, //nolint:gosec // loopback probe of our own server
	}
	resp, err := client.Get("https://127.0.0.1:" + port + "/ofimeo/status.json")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	return nil
}
