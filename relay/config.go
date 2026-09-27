package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Config is read from <data dir>/ofimeo-relay.json (created on first run with
// the defaults) and can be overridden by command-line flags.
type Config struct {
	// Name shown on the status page and in the app.
	Name string `json:"name"`
	// Host or IP clients use to reach this machine (default: detected LAN IP).
	Host string `json:"host"`
	// HTTPSPort serves the status page, /ofimeo/config, the Nostr relay (wss)
	// and TURN over TLS. 0: 443 if it can be used, else 8443.
	HTTPSPort int `json:"https_port"`
	// HTTPPort serves the certificate download page and redirects to https
	// (and answers Let's Encrypt HTTP-01). 0: 80 if free, else 8080; -1: off.
	HTTPPort int `json:"http_port"`
	// TURNPort is the STUN/TURN port (UDP and TCP).
	TURNPort int `json:"turn_port"`
	// TURNTLSPort is a separate port for TURN over TLS (0: share the HTTPS port; -1: off).
	TURNTLSPort int `json:"turn_tls_port"`
	// RelayPortMin/Max bound the UDP ports used for TURN allocations.
	RelayPortMin int `json:"relay_port_min"`
	RelayPortMax int `json:"relay_port_max"`
	// Domain enables automatic Let's Encrypt certificates for this public name.
	Domain    string `json:"domain"`
	ACMEEmail string `json:"acme_email"`
	// CertFile/KeyFile: certificate provided by the school (PEM).
	CertFile string `json:"cert_file"`
	KeyFile  string `json:"key_file"`
	// ServeApp: "" (off), "embedded", a directory or a .zip with the built web app.
	ServeApp string `json:"serve_app"`
	// AppURL is the public web app, used for the "link for students".
	AppURL string `json:"app_url"`
	// Public accepts clients from any address (default: local network only).
	Public bool `json:"public"`
	// AllowNetworks: extra address ranges (CIDR) treated as the local network.
	AllowNetworks []string `json:"allow_networks"`
	// CredentialTTL is how long TURN credentials handed out by /ofimeo/config last.
	CredentialTTL Duration `json:"credential_ttl"`
	// Limits.
	MaxClients          int `json:"max_clients"`
	MaxSubscriptions    int `json:"max_subscriptions"`
	MaxEventBytes       int `json:"max_event_bytes"`
	EventsPerMinute     int `json:"events_per_minute"`
	MaxAllocations      int `json:"max_allocations"`
	MaxAllocationsPerIP int `json:"max_allocations_per_ip"`
	// LogFile: also write the log to this file ("" = standard error only).
	LogFile string `json:"log_file"`
	// Store: encrypted store-and-forward mailboxes (store.go).
	Store StoreConfig `json:"store"`
	// SchoolConfig: the school's ofimeo.config.json, served to the web app (school.go).
	SchoolConfig string `json:"school_config"`
	// ImportProxy: optional fetch proxy for importing public Google/Microsoft share links (proxy.go); off by default.
	ImportProxy ImportProxyConfig `json:"import_proxy"`
	// Moodle: forwarding to the school's Moodle for the web app (moodle.go); off unless a URL is given.
	Moodle MoodleConfig `json:"moodle"`

	// Not in the file.
	DataDir string `json:"-"`
	Secret  string `json:"-"`
}

func defaultConfig() Config {
	return Config{
		Name:                "Ofimeo Relay",
		TURNPort:            3478,
		RelayPortMin:        49152,
		RelayPortMax:        65535,
		AppURL:              "https://gafapa.github.io/words-online/",
		CredentialTTL:       Duration(24 * time.Hour),
		MaxClients:          2000,
		MaxSubscriptions:    64,
		MaxEventBytes:       64 * 1024,
		EventsPerMinute:     600,
		MaxAllocations:      16000,
		MaxAllocationsPerIP: 600,
		Store:               defaultStoreConfig(),
	}
}

const configFileName = "ofimeo-relay.json"

// defaultDataDir: the system location when running as a service (root),
// else the user's configuration directory.
func defaultDataDir() string {
	switch runtime.GOOS {
	case "linux":
		if os.Geteuid() == 0 {
			return "/var/lib/ofimeo-relay"
		}
	case "darwin":
		if os.Geteuid() == 0 {
			return "/Library/Application Support/Ofimeo Relay"
		}
	case "windows":
		if pd := os.Getenv("ProgramData"); pd != "" && isWindowsService() {
			return filepath.Join(pd, "Ofimeo Relay")
		}
	}
	if dir, err := os.UserConfigDir(); err == nil {
		return filepath.Join(dir, "ofimeo-relay")
	}
	return "ofimeo-relay-data"
}

// loadConfig reads (or creates) the config file and the TURN shared secret.
func loadConfig(dataDir string) (Config, error) {
	cfg := defaultConfig()
	cfg.DataDir = dataDir
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return cfg, err
	}
	path := filepath.Join(dataDir, configFileName)
	raw, err := os.ReadFile(path)
	switch {
	case err == nil:
		if err := json.Unmarshal(raw, &cfg); err != nil {
			return cfg, fmt.Errorf("%s: %w", path, err)
		}
	case errors.Is(err, os.ErrNotExist):
		out, _ := json.MarshalIndent(cfg, "", "  ")
		if err := os.WriteFile(path, append(out, '\n'), 0o600); err != nil {
			return cfg, err
		}
	default:
		return cfg, err
	}
	secret, err := loadOrCreate(filepath.Join(dataDir, "turn-secret"), func() ([]byte, error) {
		b := make([]byte, 32)
		_, err := rand.Read(b)
		return []byte(hex.EncodeToString(b)), err
	})
	if err != nil {
		return cfg, err
	}
	cfg.Secret = strings.TrimSpace(string(secret))
	return cfg, nil
}

// loadOrCreate returns a file's content, creating it (mode 0600) when missing.
func loadOrCreate(path string, create func() ([]byte, error)) ([]byte, error) {
	if b, err := os.ReadFile(path); err == nil {
		return b, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	b, err := create()
	if err != nil {
		return nil, err
	}
	return b, os.WriteFile(path, b, 0o600)
}

func (c *Config) validate() error {
	if c.TURNPort <= 0 || c.TURNPort > 65535 {
		return fmt.Errorf("invalid turn_port %d", c.TURNPort)
	}
	if c.RelayPortMin <= 0 || c.RelayPortMax > 65535 || c.RelayPortMin > c.RelayPortMax {
		return fmt.Errorf("invalid relay port range %d-%d", c.RelayPortMin, c.RelayPortMax)
	}
	if (c.CertFile == "") != (c.KeyFile == "") {
		return errors.New("cert_file and key_file must be given together")
	}
	if err := setExtraLocal(c.AllowNetworks); err != nil {
		return err
	}
	if err := validateMoodle(&c.Moodle); err != nil {
		return err
	}
	if time.Duration(c.CredentialTTL) < 10*time.Minute {
		return errors.New("credential_ttl must be at least 10m")
	}
	return nil
}

// Duration is a time.Duration written as "24h" in JSON.
type Duration time.Duration

func (d Duration) MarshalJSON() ([]byte, error) {
	return json.Marshal(time.Duration(d).String())
}

func (d *Duration) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	v, err := time.ParseDuration(s)
	*d = Duration(v)
	return err
}

func (d *Duration) String() string { return time.Duration(*d).String() }

func (d *Duration) Set(s string) error {
	v, err := time.ParseDuration(s)
	*d = Duration(v)
	return err
}
