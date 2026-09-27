package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// mockMoodle records what reaches it.
type mockMoodle struct {
	srv  *httptest.Server
	hits []string
	form url.Values
	body []byte
}

func newMockMoodle(t *testing.T) *mockMoodle {
	m := &mockMoodle{}
	mux := http.NewServeMux()
	mux.HandleFunc("/moodle/login/token.php", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		m.hits, m.form = append(m.hits, "token"), r.PostForm
		if r.PostForm.Get("password") != "secret" {
			_, _ = io.WriteString(w, `{"error":"Invalid login","errorcode":"invalidlogin"}`)
			return
		}
		_, _ = io.WriteString(w, `{"token":"tok123","privatetoken":null}`)
	})
	mux.HandleFunc("/moodle/webservice/rest/server.php", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		m.hits, m.form = append(m.hits, "rest:"+r.PostForm.Get("wsfunction")), r.PostForm
		_, _ = io.WriteString(w, `{"sitename":"School","userid":7}`)
	})
	mux.HandleFunc("/moodle/webservice/upload.php", func(w http.ResponseWriter, r *http.Request) {
		m.hits = append(m.hits, "upload")
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		f, fh, err := r.FormFile("file_1")
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		m.body, _ = io.ReadAll(f)
		_ = json.NewEncoder(w).Encode([]map[string]any{{"filename": fh.Filename, "itemid": 55, "filearea": "draft"}})
	})
	mux.HandleFunc("/moodle/lib/ajax/service-nologin.php", func(w http.ResponseWriter, r *http.Request) {
		m.hits = append(m.hits, "public:"+r.URL.Query().Get("info"))
		_, _ = io.WriteString(w, `[{"error":false,"data":{"typeoflogin":2,"launchurl":"https://sso"}}]`)
	})
	mux.HandleFunc("/moodle/webservice/pluginfile.php/", func(w http.ResponseWriter, r *http.Request) {
		m.hits = append(m.hits, "file:"+r.URL.Query().Get("token"))
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", `inline; filename="task.pdf"`)
		_, _ = io.WriteString(w, "%PDF-1.4")
	})
	mux.HandleFunc("/moodle/redirect/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://elsewhere.example/", http.StatusFound)
	})
	m.srv = httptest.NewServer(mux)
	t.Cleanup(m.srv.Close)
	return m
}

func moodleHandler(t *testing.T, site string, maxMB int) http.Handler {
	cfg := testConfig(t)
	cfg.Moodle = MoodleConfig{URL: site, MaxUploadMB: maxMB}
	return newTestWeb(t, cfg).HTTPSHandler()
}

func post(h http.Handler, path, contentType string, body io.Reader) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "https://relay.local:8443"+path, body)
	req.RemoteAddr = "192.168.1.20:5000"
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func errorCode(rec *httptest.ResponseRecorder) string {
	var v struct{ Error string }
	_ = json.Unmarshal(rec.Body.Bytes(), &v)
	return v.Error
}

func TestNormalizeMoodleURL(t *testing.T) {
	for in, want := range map[string]string{
		"https://Moodle.School.org/":                "https://moodle.school.org",
		"https://moodle.school.org/moodle/":         "https://moodle.school.org/moodle",
		"https://moodle.school.org/login/index.php": "https://moodle.school.org",
		"http://10.0.0.5:8080/moodle/my":            "http://10.0.0.5:8080/moodle",
		"ftp://moodle.school.org":                   "",
		"moodle.school.org":                         "",
		"https://user:pw@moodle.school.org":         "",
		"":                                          "",
	} {
		if got := normalizeMoodleURL(in); got != want {
			t.Errorf("normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestMoodleOffByDefault(t *testing.T) {
	cfg := testConfig(t)
	web := newTestWeb(t, cfg)
	if web.moodleInfo() != nil || NewMoodleProxy(cfg.Moodle, quiet) != nil {
		t.Fatal("Moodle forwarding must be off unless a URL is configured")
	}
	rec := post(web.HTTPSHandler(), "/ofimeo/moodle/login?site=https://x", "application/x-www-form-urlencoded", strings.NewReader("username=a"))
	if rec.Code == http.StatusOK {
		t.Fatal("no route expected")
	}
}

func TestMoodleConfigAdvertised(t *testing.T) {
	m := newMockMoodle(t)
	h := moodleHandler(t, m.srv.URL+"/moodle/", 0)
	req := httptest.NewRequest(http.MethodGet, "https://relay.local:8443/ofimeo/config", nil)
	req.RemoteAddr = "192.168.1.20:5000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var cc ClientConfig
	if err := json.Unmarshal(rec.Body.Bytes(), &cc); err != nil {
		t.Fatal(err)
	}
	if cc.Moodle == nil || cc.Moodle.URL != m.srv.URL+"/moodle" || cc.Moodle.Path != moodlePath || cc.Moodle.MaxUploadMB != 50 {
		t.Fatalf("moodle info: %+v", cc.Moodle)
	}
}

func TestMoodleForwarding(t *testing.T) {
	m := newMockMoodle(t)
	site := url.QueryEscape(m.srv.URL + "/moodle")
	h := moodleHandler(t, m.srv.URL+"/moodle", 1)
	form := "application/x-www-form-urlencoded"

	// Login: only username and password go on, the service is fixed.
	rec := post(h, "/ofimeo/moodle/login?site="+site, form, strings.NewReader("username=ana&password=secret&service=other&extra=1"))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "tok123") || rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}
	if m.form.Get("service") != "moodle_mobile_app" || m.form.Has("extra") || m.form.Get("username") != "ana" {
		t.Fatalf("login form forwarded: %v", m.form)
	}

	// REST: listed functions only, JSON format forced.
	rec = post(h, "/ofimeo/moodle/rest?site="+site, form, strings.NewReader("wstoken=tok123&wsfunction=core_webservice_get_site_info&moodlewsrestformat=xml"))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "School") || m.form.Get("moodlewsrestformat") != "json" {
		t.Fatalf("rest: %d %s %v", rec.Code, rec.Body, m.form)
	}
	before := len(m.hits)
	rec = post(h, "/ofimeo/moodle/rest?site="+site, form, strings.NewReader("wstoken=tok123&wsfunction=core_user_delete_users"))
	if rec.Code != http.StatusForbidden || errorCode(rec) != "function" || len(m.hits) != before {
		t.Fatalf("unlisted function forwarded: %d %s", rec.Code, rec.Body)
	}

	// Public configuration (SSO detection).
	rec = post(h, "/ofimeo/moodle/public?site="+site, "", nil)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "typeoflogin") || m.hits[len(m.hits)-1] != "public:tool_mobile_get_public_config" {
		t.Fatalf("public: %d %s", rec.Code, rec.Body)
	}

	// Upload: multipart forwarded as is.
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("token", "tok123")
	_ = mw.WriteField("filearea", "draft")
	fw, _ := mw.CreateFormFile("file_1", "work.pdf")
	_, _ = fw.Write([]byte("%PDF-1.7 hello"))
	_ = mw.Close()
	rec = post(h, "/ofimeo/moodle/upload?site="+site, mw.FormDataContentType(), &body)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"itemid":55`) || string(m.body) != "%PDF-1.7 hello" {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}

	// Upload over the limit (1 MB here).
	var big bytes.Buffer
	mw = multipart.NewWriter(&big)
	fw, _ = mw.CreateFormFile("file_1", "big.pdf")
	_, _ = fw.Write(bytes.Repeat([]byte("x"), 2<<20))
	_ = mw.Close()
	before = len(m.hits)
	rec = post(h, "/ofimeo/moodle/upload?site="+site, mw.FormDataContentType(), &big)
	if rec.Code != http.StatusRequestEntityTooLarge || errorCode(rec) != "too-large" || len(m.hits) != before {
		t.Fatalf("large upload: %d %s", rec.Code, rec.Body)
	}

	// Files of the configured Moodle only, served as attachments.
	fileURL := m.srv.URL + "/moodle/webservice/pluginfile.php/12/mod_assign/introattachment/0/task.pdf"
	rec = post(h, "/ofimeo/moodle/file?site="+site, form, strings.NewReader(url.Values{"url": {fileURL}, "token": {"tok123"}}.Encode()))
	if rec.Code != 200 || rec.Body.String() != "%PDF-1.4" || rec.Header().Get("Content-Type") != "application/octet-stream" || rec.Header().Get("X-Ofimeo-Filename") != "task.pdf" {
		t.Fatalf("file: %d %v %s", rec.Code, rec.Header(), rec.Body)
	}
	if m.hits[len(m.hits)-1] != "file:tok123" {
		t.Fatalf("token not passed: %v", m.hits)
	}
	for _, bad := range []string{
		"https://evil.example/moodle/webservice/pluginfile.php/1/x.pdf",
		m.srv.URL + "/moodle/admin/index.php",
		m.srv.URL + "/other/webservice/pluginfile.php/1/x.pdf",
		m.srv.URL + "/moodle/webservice/pluginfile.php/../../admin/x",
	} {
		rec = post(h, "/ofimeo/moodle/file?site="+site, form, strings.NewReader(url.Values{"url": {bad}, "token": {"t"}}.Encode()))
		if rec.Code != http.StatusForbidden {
			t.Errorf("file %s: %d", bad, rec.Code)
		}
	}
}

func TestMoodleRejectsOtherSites(t *testing.T) {
	m := newMockMoodle(t)
	h := moodleHandler(t, m.srv.URL+"/moodle", 0)
	form := "application/x-www-form-urlencoded"
	for _, site := range []string{"", "https://evil.example", m.srv.URL + "/other", "http://127.0.0.1:1/moodle"} {
		rec := post(h, "/ofimeo/moodle/login?site="+url.QueryEscape(site), form, strings.NewReader("username=a&password=secret"))
		if rec.Code != http.StatusForbidden || errorCode(rec) != "site" {
			t.Errorf("site %q: %d %s", site, rec.Code, rec.Body)
		}
	}
	if len(m.hits) != 0 {
		t.Fatalf("nothing may reach Moodle: %v", m.hits)
	}
	// Methods, endpoints and the local-network guard.
	req := httptest.NewRequest(http.MethodGet, "https://relay.local:8443/ofimeo/moodle/login?site="+url.QueryEscape(m.srv.URL+"/moodle"), nil)
	req.RemoteAddr = "192.168.1.20:5000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET: %d", rec.Code)
	}
	rec = post(h, "/ofimeo/moodle/admin?site="+url.QueryEscape(m.srv.URL+"/moodle"), form, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("unknown endpoint: %d", rec.Code)
	}
	req = httptest.NewRequest(http.MethodPost, "https://relay.local:8443/ofimeo/moodle/login?site="+url.QueryEscape(m.srv.URL+"/moodle"), strings.NewReader("username=a"))
	req.RemoteAddr = "8.8.8.8:5000"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("outside the local network: %d", rec.Code)
	}
}

func TestMoodleNoRedirectsNoSecretsInLog(t *testing.T) {
	m := newMockMoodle(t)
	var logs bytes.Buffer
	cfg := testConfig(t)
	cfg.Moodle = MoodleConfig{URL: m.srv.URL + "/moodle"}
	web := newTestWeb(t, cfg)
	web.log = slog.New(slog.NewTextHandler(&logs, nil))
	h := web.HTTPSHandler()
	site := url.QueryEscape(m.srv.URL + "/moodle")
	rec := post(h, "/ofimeo/moodle/login?site="+site, "application/x-www-form-urlencoded", strings.NewReader("username=ana.garcia&password=secret"))
	if rec.Code != 200 {
		t.Fatal(rec.Code)
	}
	fileURL := m.srv.URL + "/moodle/webservice/pluginfile.php/1/x.pdf"
	post(h, "/ofimeo/moodle/file?site="+site, "application/x-www-form-urlencoded", strings.NewReader(url.Values{"url": {fileURL}, "token": {"tok123"}}.Encode()))
	for _, secret := range []string{"ana.garcia", "secret", "tok123"} {
		if strings.Contains(logs.String(), secret) {
			t.Fatalf("log contains %q: %s", secret, logs.String())
		}
	}
	// A redirect (e.g. to a login page elsewhere) is not followed.
	p := NewMoodleProxy(MoodleConfig{URL: m.srv.URL + "/moodle/redirect"}, quiet)
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, moodlePath+"/login?site="+url.QueryEscape(m.srv.URL+"/moodle/redirect"), strings.NewReader("username=a"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	p.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway || errorCode(rec) != "redirect" {
		t.Fatalf("redirect: %d %s", rec.Code, rec.Body)
	}
}

func TestValidateMoodle(t *testing.T) {
	if validateMoodle(&MoodleConfig{}) != nil || validateMoodle(&MoodleConfig{URL: "https://moodle.school.org"}) != nil {
		t.Fatal("valid configurations refused")
	}
	if validateMoodle(&MoodleConfig{URL: "moodle.school.org"}) == nil {
		t.Fatal("an address without scheme must be refused")
	}
}
