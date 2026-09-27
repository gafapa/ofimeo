package main

// TLS certificates. Browsers on an https page can only use wss:// and https://
// with a certificate they trust, so three options are supported:
//   - Let's Encrypt for a public domain (autocert, TLS-ALPN-01 or HTTP-01);
//   - certificate files provided by the school (reloaded when they change,
//     e.g. renewed by certbot or lego with DNS-01);
//   - a local certificate authority generated on first run. Devices trust it
//     once it is installed (by hand from the relay's page, or pushed by IT).
//     The CA is name-constrained to local names and private addresses, so
//     installing it cannot be abused to impersonate Internet sites.

import (
	"bytes"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/acme/autocert"
)

const (
	caValidity     = 10 * 365 * 24 * time.Hour
	serverValidity = 397 * 24 * time.Hour
	renewBefore    = 30 * 24 * time.Hour
)

// DNS suffixes the local CA may issue for (besides the machine's own name).
var caDNSDomains = []string{"localhost", "local", "lan", "home.arpa", "internal", "intranet", "localdomain"}

type CertManager struct {
	cfg  *Config
	log  *slog.Logger
	Mode string // "letsencrypt", "files" or "local-ca"

	mu        sync.Mutex
	local     *tls.Certificate
	checked   time.Time
	caCert    *x509.Certificate
	caKey     crypto.Signer
	caPEM     []byte
	files     *tls.Certificate
	filesTime time.Time
	acme      *autocert.Manager
	lastErr   string
}

func NewCertManager(cfg *Config, log *slog.Logger) (*CertManager, error) {
	m := &CertManager{cfg: cfg, log: log, Mode: "local-ca"}
	// The local CA is always available: it covers access by IP address even
	// when a domain certificate is used.
	if err := m.loadCA(); err != nil {
		return nil, fmt.Errorf("local CA: %w", err)
	}
	if _, err := m.localCert(); err != nil {
		return nil, fmt.Errorf("server certificate: %w", err)
	}
	switch {
	case cfg.CertFile != "":
		m.Mode = "files"
		if _, err := m.fileCert(); err != nil {
			return nil, err
		}
	case cfg.Domain != "":
		m.Mode = "letsencrypt"
		m.acme = &autocert.Manager{
			Prompt:     autocert.AcceptTOS,
			HostPolicy: autocert.HostWhitelist(cfg.Domain),
			Cache:      autocert.DirCache(filepath.Join(cfg.DataDir, "acme")),
			Email:      cfg.ACMEEmail,
		}
	}
	return m, nil
}

func (m *CertManager) TLSConfig() *tls.Config {
	protos := []string{"http/1.1"}
	if m.acme != nil {
		protos = append(protos, "acme-tls/1")
	}
	return &tls.Config{MinVersion: tls.VersionTLS12, NextProtos: protos, GetCertificate: m.GetCertificate}
}

func (m *CertManager) GetCertificate(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	name := strings.ToLower(strings.TrimSuffix(hello.ServerName, "."))
	switch m.Mode {
	case "files":
		if c, err := m.fileCert(); err == nil && (name == "" || c.Leaf == nil || c.Leaf.VerifyHostname(name) == nil) {
			return c, nil
		}
	case "letsencrypt":
		if name == m.cfg.Domain || slices.Contains(hello.SupportedProtos, "acme-tls/1") {
			c, err := m.acme.GetCertificate(hello)
			if err == nil {
				return c, nil
			}
			m.mu.Lock()
			m.lastErr = err.Error()
			m.mu.Unlock()
			m.log.Warn("Let's Encrypt certificate not available, using the local one", "error", err)
		}
	}
	return m.localCert()
}

// HTTPHandler wraps the plain-http handler to answer HTTP-01 challenges.
func (m *CertManager) HTTPHandler(h http.Handler) http.Handler {
	if m.acme == nil {
		return h
	}
	return m.acme.HTTPHandler(h)
}

// ---------- local CA ----------

func (m *CertManager) loadCA() error {
	dir := m.cfg.DataDir
	certPath, keyPath := filepath.Join(dir, "ca-cert.pem"), filepath.Join(dir, "ca-key.pem")
	certPEM, err1 := os.ReadFile(certPath)
	keyPEM, err2 := os.ReadFile(keyPath)
	if err1 == nil && err2 == nil {
		cert, key, err := parsePair(certPEM, keyPEM)
		if err != nil {
			return err
		}
		m.caCert, m.caKey, m.caPEM = cert, key, certPEM
		return nil
	}
	if !errors.Is(err1, os.ErrNotExist) && err1 != nil {
		return err1
	}
	cert, key, err := createCA(hostname(), m.cfg.Host)
	if err != nil {
		return err
	}
	keyDER, err := x509.MarshalECPrivateKey(key.(*ecdsa.PrivateKey))
	if err != nil {
		return err
	}
	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw})
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0o600); err != nil {
		return err
	}
	if err := os.WriteFile(certPath, certPEM, 0o644); err != nil {
		return err
	}
	// A new CA invalidates the previous server certificate.
	os.Remove(filepath.Join(dir, "server-cert.pem"))
	m.log.Info("created a local certificate authority", "file", certPath)
	m.caCert, m.caKey, m.caPEM = cert, key, certPEM
	return nil
}

func createCA(host, extra string) (*x509.Certificate, crypto.Signer, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	domains := append([]string{host}, caDNSDomains...)
	if extra != "" && net.ParseIP(extra) == nil && !slices.Contains(domains, extra) {
		domains = append(domains, extra)
	}
	var ranges []*net.IPNet
	for _, p := range append(localPrefixes, extraLocal...) {
		_, n, _ := net.ParseCIDR(p.String())
		ranges = append(ranges, n)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          randomSerial(),
		Subject:               pkix.Name{CommonName: "Ofimeo Relay local CA (" + host + ")", Organization: []string{"Ofimeo Relay"}},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(caValidity),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLenZero:        true,
		PermittedDNSDomains:   domains,
		PermittedIPRanges:     ranges,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, nil, err
	}
	cert, err := x509.ParseCertificate(der)
	return cert, key, err
}

// wantedNames: names and addresses the server certificate should cover.
func (m *CertManager) wantedNames() ([]string, []net.IP) {
	host := hostname()
	names := []string{host, host + ".local", "localhost"}
	if h := m.cfg.Host; h != "" && net.ParseIP(h) == nil {
		names = append(names, strings.ToLower(h))
	}
	ips := []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}
	ips = append(ips, localAddresses()...)
	if ip := net.ParseIP(m.cfg.Host); ip != nil {
		ips = append(ips, ip)
	}
	// Only what the CA's name constraints allow.
	var okNames []string
	for _, n := range names {
		if m.caPermitsName(n) && !slices.Contains(okNames, n) {
			okNames = append(okNames, n)
		}
	}
	var okIPs []net.IP
	for _, ip := range ips {
		if m.caPermitsIP(ip) && !slices.ContainsFunc(okIPs, ip.Equal) {
			okIPs = append(okIPs, ip)
		}
	}
	sort.Strings(okNames)
	sort.Slice(okIPs, func(i, j int) bool { return bytes.Compare(okIPs[i].To16(), okIPs[j].To16()) < 0 })
	return okNames, okIPs
}

func (m *CertManager) caPermitsName(name string) bool {
	if len(m.caCert.PermittedDNSDomains) == 0 {
		return true
	}
	for _, d := range m.caCert.PermittedDNSDomains {
		if name == d || strings.HasSuffix(name, "."+d) {
			return true
		}
	}
	return false
}

func (m *CertManager) caPermitsIP(ip net.IP) bool {
	if len(m.caCert.PermittedIPRanges) == 0 {
		return isLocalIP(ip)
	}
	for _, n := range m.caCert.PermittedIPRanges {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// localCert returns the server certificate signed by the local CA, issuing a
// new one when missing, expiring or not covering the current addresses.
func (m *CertManager) localCert() (*tls.Certificate, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.local != nil && time.Since(m.checked) < time.Minute {
		return m.local, nil
	}
	m.checked = time.Now()
	names, ips := m.wantedNames()
	covers := func(c *x509.Certificate) bool {
		if time.Until(c.NotAfter) < renewBefore || c.CheckSignatureFrom(m.caCert) != nil {
			return false
		}
		for _, n := range names {
			if !slices.Contains(c.DNSNames, n) {
				return false
			}
		}
		for _, ip := range ips {
			if !slices.ContainsFunc(c.IPAddresses, ip.Equal) {
				return false
			}
		}
		return true
	}
	if m.local != nil && covers(m.local.Leaf) {
		return m.local, nil
	}
	certPath, keyPath := filepath.Join(m.cfg.DataDir, "server-cert.pem"), filepath.Join(m.cfg.DataDir, "server-key.pem")
	if certPEM, err := os.ReadFile(certPath); err == nil {
		if keyPEM, err := os.ReadFile(keyPath); err == nil {
			if c, err := tls.X509KeyPair(certPEM, keyPEM); err == nil && c.Leaf != nil && covers(c.Leaf) {
				m.local = &c
				return m.local, nil
			}
		}
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: randomSerial(),
		Subject:      pkix.Name{CommonName: hostname()},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(serverValidity),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     names,
		IPAddresses:  ips,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, m.caCert, &key.PublicKey, m.caKey)
	if err != nil {
		return nil, err
	}
	keyDER, _ := x509.MarshalECPrivateKey(key)
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	if err := os.WriteFile(keyPath, keyPEM, 0o600); err != nil {
		return nil, err
	}
	if err := os.WriteFile(certPath, certPEM, 0o644); err != nil {
		return nil, err
	}
	c, err := tls.X509KeyPair(append(certPEM, m.caPEM...), keyPEM)
	if err != nil {
		return nil, err
	}
	m.log.Info("issued a server certificate from the local CA", "names", names, "ips", ips)
	m.local = &c
	return m.local, nil
}

// ---------- certificate files ----------

func (m *CertManager) fileCert() (*tls.Certificate, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	st, err := os.Stat(m.cfg.CertFile)
	if err != nil {
		if m.files != nil {
			return m.files, nil
		}
		return nil, err
	}
	if m.files != nil && st.ModTime().Equal(m.filesTime) {
		return m.files, nil
	}
	c, err := tls.LoadX509KeyPair(m.cfg.CertFile, m.cfg.KeyFile)
	if err != nil {
		if m.files != nil {
			m.log.Warn("could not reload the certificate files, keeping the previous ones", "error", err)
			return m.files, nil
		}
		return nil, fmt.Errorf("certificate files: %w", err)
	}
	m.files, m.filesTime = &c, st.ModTime()
	m.log.Info("loaded certificate files", "names", c.Leaf.DNSNames, "expires", c.Leaf.NotAfter.Format(time.DateOnly))
	return m.files, nil
}

// ---------- status ----------

type CertStatus struct {
	Mode          string    `json:"mode"`
	Names         []string  `json:"names"`
	Issuer        string    `json:"issuer"`
	NotAfter      time.Time `json:"not_after"`
	CAFingerprint string    `json:"ca_fingerprint"`
	Error         string    `json:"error,omitempty"`
}

func (m *CertManager) Status() CertStatus {
	var leaf *x509.Certificate
	switch m.Mode {
	case "files":
		if c, err := m.fileCert(); err == nil {
			leaf = c.Leaf
		}
	case "letsencrypt":
		if c, err := m.acme.GetCertificate(&tls.ClientHelloInfo{ServerName: m.cfg.Domain, CipherSuites: []uint16{tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256}}); err == nil {
			leaf = c.Leaf
		}
	}
	if leaf == nil {
		if c, err := m.localCert(); err == nil {
			leaf = c.Leaf
		}
	}
	s := CertStatus{Mode: m.Mode, CAFingerprint: m.CAFingerprint()}
	if leaf != nil {
		s.Names = append(append([]string{}, leaf.DNSNames...), ipStrings(leaf.IPAddresses)...)
		s.Issuer = leaf.Issuer.CommonName
		s.NotAfter = leaf.NotAfter
	}
	m.mu.Lock()
	s.Error = m.lastErr
	m.mu.Unlock()
	return s
}

func (m *CertManager) CAPEM() []byte { return m.caPEM }
func (m *CertManager) CADER() []byte { return m.caCert.Raw }

// CAFingerprint is the SHA-256 fingerprint of the local CA, to check it by eye.
func (m *CertManager) CAFingerprint() string {
	sum := sha256.Sum256(m.caCert.Raw)
	h := strings.ToUpper(hex.EncodeToString(sum[:]))
	var parts []string
	for i := 0; i < len(h); i += 2 {
		parts = append(parts, h[i:i+2])
	}
	return strings.Join(parts, ":")
}

func ipStrings(ips []net.IP) []string {
	out := make([]string, len(ips))
	for i, ip := range ips {
		out[i] = ip.String()
	}
	return out
}

func randomSerial() *big.Int {
	n, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 127))
	return n
}

func parsePair(certPEM, keyPEM []byte) (*x509.Certificate, crypto.Signer, error) {
	pair, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, nil, err
	}
	signer, ok := pair.PrivateKey.(crypto.Signer)
	if !ok {
		return nil, nil, errors.New("unsupported key type")
	}
	return pair.Leaf, signer, nil
}
