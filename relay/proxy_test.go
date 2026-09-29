package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
)

func TestImportProxyNoSecretsInLog(t *testing.T) {
	var logs bytes.Buffer
	p := &ImportProxy{log: slog.New(slog.NewTextHandler(&logs, nil))}
	p.logf("import failed", "docs.google.com", &url.Error{
		Op: "Get", URL: "https://docs.google.com/private-share?token=secret-token",
		Err: errors.New("connection refused"),
	})
	for _, secret := range []string{"private-share", "secret-token", "https://"} {
		if strings.Contains(logs.String(), secret) {
			t.Fatalf("log contains private URL: %s", logs.String())
		}
	}
	if !strings.Contains(logs.String(), "connection refused") {
		t.Fatal("log must preserve the failure reason")
	}
}

func TestImportHostAllowed(t *testing.T) {
	for _, h := range []string{"docs.google.com", "drive.google.com", "doc-0s-8c-docs.googleusercontent.com", "contoso.sharepoint.com", "contoso-my.sharepoint.com", "1drv.ms", "api.onedrive.com", "public.bn1304.files.1drv.com", "my.microsoftpersonalcontent.com", "DOCS.GOOGLE.COM."} {
		if !importHostAllowed(h) {
			t.Errorf("%s should be allowed", h)
		}
	}
	for _, h := range []string{"google.com", "evil.com", "docs.google.com.evil.com", "sharepoint.com", "xsharepoint.com", "localhost", "127.0.0.1", "accounts.google.com", "login.live.com"} {
		if importHostAllowed(h) {
			t.Errorf("%s should be refused", h)
		}
	}
}

func TestPublicAddr(t *testing.T) {
	for _, a := range []string{"8.8.8.8", "142.250.184.14", "2a00:1450:4003::200e"} {
		if !publicAddr(netip.MustParseAddr(a)) {
			t.Errorf("%s is public", a)
		}
	}
	for _, a := range []string{"127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "0.0.0.0", "::ffff:127.0.0.1"} {
		if publicAddr(netip.MustParseAddr(a)) {
			t.Errorf("%s is not public", a)
		}
	}
}

func TestImportProxyOffByDefault(t *testing.T) {
	if NewImportProxy(ImportProxyConfig{}, quiet) != nil {
		t.Fatal("the import proxy must be off unless enabled")
	}
	// The real client refuses local addresses even for allowed names.
	p := NewImportProxy(ImportProxyConfig{Enabled: true}, quiet)
	p.allowed = func(string) bool { return true }
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, importProxyPath+"?url="+url.QueryEscape("https://localhost/x"), nil))
	if rec.Code == http.StatusOK {
		t.Fatal("local addresses must be refused")
	}
}

func TestImportProxy(t *testing.T) {
	var gotCookie, gotAuth string
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotCookie, gotAuth = r.Header.Get("Cookie"), r.Header.Get("Authorization")
		switch r.URL.Path {
		case "/document/d/abc/export":
			w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
			w.Header().Set("Content-Disposition", `attachment; filename="x.docx"; filename*=UTF-8''Tema%201%20%C3%91and%C3%BA.docx`)
			http.SetCookie(w, &http.Cookie{Name: "NID", Value: "tracking"})
			_, _ = w.Write([]byte("PK\x03\x04docx"))
		case "/private":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<html>Sign in</html>"))
		case "/login-redirect":
			http.Redirect(w, r, "https://accounts.google.com/ServiceLogin", http.StatusFound)
		case "/big":
			_, _ = w.Write(make([]byte, 2<<20))
		case "/forbidden":
			http.Error(w, "no", http.StatusForbidden)
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	host := strings.TrimPrefix(upstream.URL, "https://")
	hostname := strings.Split(host, ":")[0]
	p := newImportProxy(ImportProxyConfig{Enabled: true, MaxMB: 1}, quiet, upstream.Client(), func(h string) bool { return h == hostname })
	p.anyPort = true

	get := func(target string, header http.Header) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, importProxyPath+"?url="+url.QueryEscape(target), nil)
		for k, v := range header {
			req.Header[k] = v
		}
		rec := httptest.NewRecorder()
		p.ServeHTTP(rec, req)
		return rec
	}
	errorCode := func(rec *httptest.ResponseRecorder) string {
		var body struct{ Error string }
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		return body.Error
	}

	rec := get(upstream.URL+"/document/d/abc/export?format=docx", http.Header{"Cookie": {"SID=secret"}, "Authorization": {"Bearer x"}})
	if rec.Code != http.StatusOK || rec.Body.String() != "PK\x03\x04docx" {
		t.Fatalf("download: %d %q", rec.Code, rec.Body.String())
	}
	if gotCookie != "" || gotAuth != "" {
		t.Fatal("browser credentials must not be forwarded")
	}
	if name, _ := url.PathUnescape(rec.Header().Get("X-Ofimeo-Filename")); name != "Tema 1 Ñandú.docx" {
		t.Fatalf("file name: %q", name)
	}
	if rec.Header().Get("Content-Type") != "application/octet-stream" || rec.Header().Get("Set-Cookie") != "" || rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("headers: %v", rec.Header())
	}
	if !strings.Contains(rec.Header().Get("Access-Control-Expose-Headers"), "X-Ofimeo-Filename") {
		t.Fatal("file name header not exposed to the app")
	}

	cases := []struct {
		target string
		status int
		code   string
	}{
		{upstream.URL + "/private", http.StatusForbidden, "not-public"},
		{upstream.URL + "/login-redirect", http.StatusForbidden, "not-public"},
		{upstream.URL + "/forbidden", http.StatusForbidden, "not-public"},
		{upstream.URL + "/missing", http.StatusNotFound, "not-found"},
		{upstream.URL + "/big", http.StatusRequestEntityTooLarge, "too-large"},
		{"http://" + host + "/document/d/abc/export", http.StatusForbidden, "host"},
		{"https://evil.example/x", http.StatusForbidden, "host"},
		{"https://user:pw@" + host + "/x", http.StatusForbidden, "host"},
		{"file:///etc/passwd", http.StatusForbidden, "host"},
	}
	for _, c := range cases {
		rec := get(c.target, nil)
		if rec.Code != c.status || errorCode(rec) != c.code {
			t.Errorf("%s: got %d %q, want %d %q", c.target, rec.Code, errorCode(rec), c.status, c.code)
		}
	}

	// Only GET (and the CORS preflight).
	rec = httptest.NewRecorder()
	p.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, importProxyPath, nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST: %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	p.ServeHTTP(rec, httptest.NewRequest(http.MethodOptions, importProxyPath, nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS: %d", rec.Code)
	}
	// Explicit ports are refused outside tests.
	p.anyPort = false
	if rec := get(upstream.URL+"/document/d/abc/export", nil); rec.Code != http.StatusForbidden {
		t.Fatalf("explicit port accepted: %d", rec.Code)
	}
}

func TestImportProxyAdvertised(t *testing.T) {
	cfg := testConfig(t)
	serve := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "https://relay.local:8443"+path, nil)
		req.RemoteAddr = "192.168.1.20:5000"
		rec := httptest.NewRecorder()
		newTestWeb(t, cfg).HTTPSHandler().ServeHTTP(rec, req)
		return rec
	}
	advertised := func() string {
		var cc ClientConfig
		_ = json.Unmarshal(serve("/ofimeo/config").Body.Bytes(), &cc)
		return cc.ImportProxy
	}
	if advertised() != "" {
		t.Fatal("import proxy advertised while off")
	}
	if rec := serve(importProxyPath + "?url=https%3A%2F%2Fdocs.google.com%2Fx"); rec.Code == http.StatusOK || rec.Header().Get("X-Ofimeo-Filename") != "" || strings.Contains(rec.Header().Get("Access-Control-Expose-Headers"), "Ofimeo") {
		t.Fatalf("import proxy answered while off: %d", rec.Code)
	}
	cfg.ImportProxy.Enabled = true
	if advertised() != importProxyPath {
		t.Fatal("import proxy not advertised while on")
	}
	if rec := serve(importProxyPath + "?url=https%3A%2F%2Fevil.example%2Fx"); rec.Code != http.StatusForbidden {
		t.Fatalf("disallowed host: %d", rec.Code)
	}
}
