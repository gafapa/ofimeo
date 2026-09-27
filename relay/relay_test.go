package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pion/turn/v4"
)

func TestLocalCA(t *testing.T) {
	cfg := testConfig(t)
	m, err := NewCertManager(cfg, quiet)
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(m.caCert)
	c, err := m.GetCertificate(&tls.ClientHelloInfo{ServerName: "localhost"})
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"localhost", "127.0.0.1", hostname()} {
		if _, err := c.Leaf.Verify(x509.VerifyOptions{DNSName: name, Roots: pool}); err != nil {
			t.Errorf("server certificate not valid for %s: %v", name, err)
		}
	}
	// Name constraints: a certificate for an Internet name signed by this CA is not valid.
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, _ := x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: randomSerial(), Subject: pkix.Name{CommonName: "www.example.com"}, DNSNames: []string{"www.example.com"},
		NotBefore: time.Now(), NotAfter: time.Now().Add(time.Hour), ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}, m.caCert, &key.PublicKey, m.caKey)
	evil, _ := x509.ParseCertificate(der)
	if _, err := evil.Verify(x509.VerifyOptions{DNSName: "www.example.com", Roots: pool}); err == nil {
		t.Fatal("the local CA must not be able to issue certificates for Internet names")
	}
	// Reloaded from disk on the next start.
	m2, err := NewCertManager(cfg, quiet)
	if err != nil || m2.CAFingerprint() != m.CAFingerprint() {
		t.Fatalf("CA not reused: %v", err)
	}
}

func TestIsSTUN(t *testing.T) {
	if !isSTUN([]byte{0x00, 0x03, 0x00, 0x00, 0x21, 0x12, 0xA4, 0x42}) {
		t.Fatal("STUN allocate header not detected")
	}
	if isSTUN([]byte("GET / HTTP/1.1")) {
		t.Fatal("HTTP detected as STUN")
	}
}

func TestLocalIP(t *testing.T) {
	for ip, want := range map[string]bool{"192.168.1.5": true, "10.1.2.3": true, "127.0.0.1": true, "fd00::1": true, "8.8.8.8": false, "203.0.113.9": false} {
		if isLocalIP(net.ParseIP(ip)) != want {
			t.Errorf("isLocalIP(%s) != %v", ip, want)
		}
	}
	if err := setExtraLocal([]string{"203.0.113.0/24"}); err != nil {
		t.Fatal(err)
	}
	defer setExtraLocal(nil)
	if !isLocalIP(net.ParseIP("203.0.113.9")) {
		t.Fatal("allow_networks not applied")
	}
}

func newTestWeb(t *testing.T, cfg *Config) *Web {
	certs, err := NewCertManager(cfg, quiet)
	if err != nil {
		t.Fatal(err)
	}
	return &Web{cfg: cfg, log: quiet, nostr: NewNostrRelay(cfg, quiet), certs: certs, started: time.Now(),
		httpsPort: 8443, turnTLSPort: 8443, relayIP: net.IPv4(192, 168, 1, 10)}
}

func TestConfigEndpoint(t *testing.T) {
	cfg := testConfig(t)
	web := newTestWeb(t, cfg)
	h := web.HTTPSHandler()

	// Private Network Access preflight.
	req := httptest.NewRequest(http.MethodOptions, "https://relay.local:8443/ofimeo/config", nil)
	req.RemoteAddr = "192.168.1.20:5000"
	req.Header.Set("Origin", "https://gafapa.github.io")
	req.Header.Set("Access-Control-Request-Private-Network", "true")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent || rec.Header().Get("Access-Control-Allow-Private-Network") != "true" || rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("bad preflight: %d %v", rec.Code, rec.Header())
	}

	req = httptest.NewRequest(http.MethodGet, "https://relay.local:8443/ofimeo/config", nil)
	req.RemoteAddr = "192.168.1.20:5000"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var cc ClientConfig
	if err := json.Unmarshal(rec.Body.Bytes(), &cc); err != nil {
		t.Fatal(err, rec.Body.String())
	}
	if cc.Relays[0] != "wss://relay.local:8443/nostr" {
		t.Errorf("relays: %v", cc.Relays)
	}
	turnURLs := strings.Join(cc.ICEServers[1].URLs, " ")
	if !strings.Contains(turnURLs, "turn:192.168.1.10:3478?transport=udp") || !strings.Contains(turnURLs, "turns:relay.local:8443?transport=tcp") {
		t.Errorf("ice servers: %v", turnURLs)
	}
	if cc.Expires-time.Now().Unix() < 86000 || !strings.HasSuffix(cc.ICEServers[1].Username, ":ofimeo") {
		t.Errorf("credentials: %+v", cc.ICEServers[1])
	}

	// Devices outside the local network are refused.
	req = httptest.NewRequest(http.MethodGet, "https://relay.local:8443/ofimeo/config", nil)
	req.RemoteAddr = "8.8.8.8:5000"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("public client got %d", rec.Code)
	}
}

func TestServeApp(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html><head><title>x</title></head><body></body></html>"), 0o644)
	_ = os.MkdirAll(filepath.Join(dir, "assets"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "assets", "a.js"), []byte("console.log(1)"), 0o644)
	app, err := OpenApp(dir)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig(t)
	web := newTestWeb(t, cfg)
	web.app = app
	h := web.HTTPSHandler()
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "https://relay.local"+path, nil)
		req.RemoteAddr = "10.0.0.2:1"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	if body := get("/").Body.String(); !strings.Contains(body, relayMarker) {
		t.Fatalf("index.html without the relay marker: %s", body)
	}
	if rec := get("/assets/a.js"); rec.Code != 200 || !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("asset: %d %v", rec.Code, rec.Header())
	}
	if rec := get("/ofimeo/"); rec.Code != 200 || !strings.Contains(rec.Body.String(), "Relay address") {
		t.Fatalf("status page: %d", rec.Code)
	}
	if rec := get("/../../etc/passwd"); rec.Code == 200 {
		t.Fatalf("path traversal: %d", rec.Code)
	}
}

// End to end: the TURN server (UDP) hands out an allocation with credentials
// from the config endpoint, and refuses expired ones.
func TestTURNAllocation(t *testing.T) {
	cfg := testConfig(t)
	cfg.TURNPort = freeUDPPort(t)
	cfg.RelayPortMin, cfg.RelayPortMax = 40000, 40100
	srv, err := StartTURN(cfg, quiet, net.IPv4(127, 0, 0, 1))
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()

	allocate := func(user, pass string) error {
		conn, err := net.ListenPacket("udp4", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		addr := "127.0.0.1:" + itoa64(int64(cfg.TURNPort))
		client, err := turn.NewClient(&turn.ClientConfig{STUNServerAddr: addr, TURNServerAddr: addr, Conn: conn, Username: user, Password: pass, Realm: turnRealm})
		if err != nil {
			t.Fatal(err)
		}
		defer client.Close()
		if err := client.Listen(); err != nil {
			t.Fatal(err)
		}
		relayConn, err := client.Allocate()
		if err != nil {
			return err
		}
		relayConn.Close()
		return nil
	}
	user, pass, _, _ := Credentials(cfg.Secret, time.Hour)
	if err := allocate(user, pass); err != nil {
		t.Fatalf("allocation with fresh credentials failed: %v", err)
	}
	old, oldPass, _, _ := Credentials(cfg.Secret, -time.Minute)
	if allocate(old, oldPass) == nil {
		t.Fatal("expired credentials accepted")
	}
	if allocate(user, "wrong") == nil {
		t.Fatal("wrong password accepted")
	}
}

func freeUDPPort(t *testing.T) int {
	c, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	return c.LocalAddr().(*net.UDPAddr).Port
}

// The TLS port serves https and TURN over TLS at the same time.
func TestTLSMux(t *testing.T) {
	cfg := testConfig(t)
	certs, _ := NewCertManager(cfg, quiet)
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	mux := NewTLSMux(ln, certs.TLSConfig())
	go mux.Serve()
	defer mux.Close()
	go http.Serve(mux.Web, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "web") }))
	got := make(chan []byte, 1)
	go func() {
		c, err := mux.TURN.Accept()
		if err != nil {
			return
		}
		b := make([]byte, 8)
		io.ReadFull(c, b)
		got <- b
	}()
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	resp, err := client.Get("https://" + ln.Addr().String() + "/")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "web" {
		t.Fatalf("web: %q", body)
	}
	c, err := tls.Dial("tcp", ln.Addr().String(), &tls.Config{InsecureSkipVerify: true})
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	header := []byte{0x00, 0x01, 0x00, 0x00, 0x21, 0x12, 0xA4, 0x42}
	c.Write(header)
	select {
	case b := <-got:
		if string(b) != string(header) {
			t.Fatalf("TURN got %x", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("STUN connection not routed to TURN")
	}
}
