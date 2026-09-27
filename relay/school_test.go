package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func schoolGet(t *testing.T, h http.Handler, path string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "https://relay.local:8443"+path, nil)
	req.RemoteAddr = "192.168.1.20:5000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

func schoolBody(t *testing.T, r *http.Response) string {
	t.Helper()
	b, _ := io.ReadAll(r.Body)
	return string(b)
}

func writeSchoolFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// The app served from a folder (--serve-app), with the school configuration
// (--school-config) replacing the app's own ofimeo.config.json.
func TestServeAppWithSchoolConfig(t *testing.T) {
	app := t.TempDir()
	writeSchoolFile(t, filepath.Join(app, "index.html"), "<html><head><title>Ofimeo</title></head><body></body></html>")
	writeSchoolFile(t, filepath.Join(app, "ofimeo.config.json"), `{"_help":"default"}`)
	writeSchoolFile(t, filepath.Join(app, "assets", "harper_wasm_bg.wasm"), "\x00asm")
	writeSchoolFile(t, filepath.Join(app, "sw.js"), "self")
	conf := t.TempDir()
	schoolFile := filepath.Join(conf, "ofimeo.config.json")
	writeSchoolFile(t, schoolFile, `{"school": {"name": "IES Test"}, "locked": ["webmcp"]}`)
	writeSchoolFile(t, filepath.Join(conf, "school", "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>")
	writeSchoolFile(t, filepath.Join(conf, "secret.key"), "do not serve")

	cfg := testConfig(t)
	web := newTestWeb(t, cfg)
	files, err := OpenApp(app)
	if err != nil {
		t.Fatal(err)
	}
	web.app = files

	// Without --school-config: the app's own file.
	h := web.HTTPSHandler()
	if r := schoolGet(t, h, "/ofimeo.config.json"); r.StatusCode != 200 || !strings.Contains(schoolBody(t, r), "default") {
		t.Fatalf("app's own config not served: %d", r.StatusCode)
	}

	// Configured but not written yet: still the app's own file.
	cfg.SchoolConfig = filepath.Join(conf, "missing.json")
	if err := validateSchoolConfig(cfg); err != nil {
		t.Fatal(err)
	}
	if r := schoolGet(t, web.HTTPSHandler(), "/ofimeo.config.json"); r.StatusCode != 200 || !strings.Contains(schoolBody(t, r), "default") {
		t.Fatalf("missing school config: app's file not served: %d", r.StatusCode)
	}

	cfg.SchoolConfig = schoolFile
	if err := validateSchoolConfig(cfg); err != nil {
		t.Fatal(err)
	}
	h = web.HTTPSHandler()

	r := schoolGet(t, h, "/")
	if html := schoolBody(t, r); r.StatusCode != 200 || !strings.Contains(html, relayMarker) {
		t.Fatalf("index.html without the relay marker: %d %q", r.StatusCode, html)
	}
	if r := schoolGet(t, h, "/assets/harper_wasm_bg.wasm"); r.Header.Get("Content-Type") != "application/wasm" {
		t.Errorf("wasm MIME type: %q", r.Header.Get("Content-Type"))
	}
	if r := schoolGet(t, h, "/sw.js"); r.Header.Get("Cache-Control") != "no-cache" {
		t.Errorf("service worker must be revalidated: %q", r.Header.Get("Cache-Control"))
	}

	r = schoolGet(t, h, "/ofimeo.config.json")
	got := schoolBody(t, r)
	if r.StatusCode != 200 || !strings.Contains(got, "IES Test") || r.Header.Get("Content-Type") != "application/json" {
		t.Fatalf("school config: %d %q %q", r.StatusCode, r.Header.Get("Content-Type"), got)
	}

	// Inside /ofimeo/config for apps hosted elsewhere.
	var cc struct {
		School map[string]any `json:"school"`
	}
	if err := json.Unmarshal([]byte(schoolBody(t, schoolGet(t, h, "/ofimeo/config"))), &cc); err != nil {
		t.Fatal(err)
	}
	if name, _ := cc.School["school"].(map[string]any)["name"].(string); name != "IES Test" {
		t.Fatalf("school member of /ofimeo/config: %v", cc.School)
	}

	// The logo folder, and nothing else next to the file.
	if r := schoolGet(t, h, "/school/logo.svg"); r.StatusCode != 200 || !strings.Contains(r.Header.Get("Content-Security-Policy"), "default-src 'none'") {
		t.Errorf("logo: %d", r.StatusCode)
	}
	for _, p := range []string{"/school/../secret.key", "/school/%2e%2e/secret.key", "/school/.hidden", "/secret.key"} {
		if r := schoolGet(t, h, p); r.StatusCode == 200 && strings.Contains(schoolBody(t, r), "do not serve") {
			t.Errorf("%s served a file outside the school folder", p)
		}
	}

	// Edited without a restart.
	time.Sleep(10 * time.Millisecond)
	writeSchoolFile(t, schoolFile, `{"school": {"name": "IES Changed"}}`)
	future := time.Now().Add(time.Second)
	_ = os.Chtimes(schoolFile, future, future)
	if got := schoolBody(t, schoolGet(t, h, "/ofimeo.config.json")); !strings.Contains(got, "IES Changed") {
		t.Errorf("changed file not reloaded: %q", got)
	}

	// A broken file is reported at startup.
	writeSchoolFile(t, schoolFile, `{"school": `)
	_ = os.Chtimes(schoolFile, future.Add(time.Second), future.Add(time.Second))
	if err := validateSchoolConfig(cfg); err == nil {
		t.Error("invalid JSON not reported")
	}
}

func TestDeployEnv(t *testing.T) {
	t.Setenv("OFIMEO_NAME", "Relay del centro")
	t.Setenv("OFIMEO_HTTPS_PORT", "8443")
	t.Setenv("OFIMEO_PUBLIC", "true")
	t.Setenv("OFIMEO_SERVE_APP", "/app")
	t.Setenv("OFIMEO_SCHOOL_CONFIG", "/config/ofimeo.config.json")
	cfg := defaultConfig()
	if err := applyDeployEnv(&cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.Name != "Relay del centro" || cfg.HTTPSPort != 8443 || !cfg.Public || cfg.ServeApp != "/app" || cfg.SchoolConfig != "/config/ofimeo.config.json" {
		t.Fatalf("environment not applied: %+v", cfg)
	}
	t.Setenv("OFIMEO_TURN_PORT", "abc")
	if err := applyDeployEnv(&cfg); err == nil {
		t.Fatal("invalid number accepted")
	}
}
