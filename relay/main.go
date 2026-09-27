// Ofimeo Relay: lets Ofimeo documents sync on school networks where public
// Nostr relays are blocked or devices cannot reach each other directly. It is
// a Nostr relay (signaling), a STUN/TURN server (relayed WebRTC) and, if
// asked, a web server for the Ofimeo app itself, in one program.
package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/kardianos/service"
)

// Set at build time: -ldflags "-X main.version=1.0.0 -X main.buildDate=2026-09-26".
var (
	version   = "dev"
	buildDate = ""
)

func buildTime() time.Time {
	if t, err := time.Parse("2006-01-02", buildDate); err == nil {
		return t
	}
	return time.Now()
}

func main() {
	args := os.Args[1:]
	cmd := "run"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}
	var err error
	switch cmd {
	case "run":
		err = cmdRun(args)
	case "install-service":
		err = cmdService("install", args)
	case "uninstall-service":
		err = cmdService("uninstall", args)
	case "start-service":
		err = cmdService("start", args)
	case "stop-service":
		err = cmdService("stop", args)
	case "healthcheck":
		err = cmdHealthcheck(args)
	case "version":
		fmt.Println("ofimeo-relay", version, runtime.GOOS+"/"+runtime.GOARCH)
	case "help":
		usage(os.Stdout, false)
	case "ayuda":
		usage(os.Stdout, true)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", cmd)
		usage(os.Stderr, spanish())
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		pauseIfDoubleClicked()
		os.Exit(1)
	}
}

func spanish() bool {
	for _, k := range []string{"LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"} {
		if v := os.Getenv(k); v != "" {
			return strings.HasPrefix(strings.ToLower(v), "es") || strings.HasPrefix(strings.ToLower(v), "gl")
		}
	}
	return false
}

const helpEN = `Ofimeo Relay %s — lets Ofimeo documents sync on school networks.

It runs, in one program:
  - a Nostr relay (how browsers find each other), at wss://<this machine>/nostr
  - a STUN/TURN server (relays connections when devices cannot reach each other)
  - a status page with the relay address to paste in Ofimeo: https://<this machine>/ofimeo/
  - optionally, the Ofimeo web app itself (--serve-app)

Usage:
  ofimeo-relay [run] [options]          run in the foreground (also by double-click)
  ofimeo-relay install-service [options] install and start as a system service
  ofimeo-relay uninstall-service         remove the service
  ofimeo-relay start-service | stop-service
  ofimeo-relay healthcheck [port]       exit 0 when the local HTTPS server answers (containers)
  ofimeo-relay version | help | ayuda (help in Spanish)

Options (saved defaults live in <data dir>/ofimeo-relay.json; options given here win):
%s
Ports to open in the firewall: TCP 443 (or the --https-port), UDP+TCP 3478,
UDP 49152-65535 (relayed traffic; narrow it with --relay-ports), TCP 80 (optional).
Only devices on the local network are accepted unless --public is given.
Guide: https://github.com/gafapa/ofimeo/blob/main/docs/relay.md
`

const helpES = `Ofimeo Relay %s — permite colaborar en Ofimeo en las redes de los centros educativos.

Reúne en un solo programa:
  - un relé Nostr (para que los navegadores se encuentren), en wss://<este equipo>/nostr
  - un servidor STUN/TURN (retransmite las conexiones cuando los equipos no se ven entre sí)
  - una página de estado con la dirección del relé que se pega en Ofimeo: https://<este equipo>/ofimeo/
  - opcionalmente, la propia aplicación web Ofimeo (--serve-app)

Uso:
  ofimeo-relay [run] [opciones]           ejecutar en primer plano (también con doble clic)
  ofimeo-relay install-service [opciones]  instalar e iniciar como servicio del sistema
  ofimeo-relay uninstall-service           quitar el servicio
  ofimeo-relay start-service | stop-service
  ofimeo-relay healthcheck [puerto]        sale con 0 si el servidor HTTPS local responde (contenedores)
  ofimeo-relay version | help (ayuda en inglés) | ayuda

Opciones (los valores guardados están en <carpeta de datos>/ofimeo-relay.json; las opciones indicadas aquí tienen prioridad):
%s
Puertos que hay que abrir en el cortafuegos: TCP 443 (o el de --https-port), UDP+TCP 3478,
UDP 49152-65535 (tráfico retransmitido; se puede acotar con --relay-ports), TCP 80 (opcional).
Solo se aceptan equipos de la red local salvo que se indique --public.
Guía: https://github.com/gafapa/ofimeo/blob/main/docs/relay.md
`

func usage(w io.Writer, es bool) {
	fs, _ := newFlagSet(&Config{}, new(string), new(string))
	var b strings.Builder
	fs.SetOutput(&b)
	fs.PrintDefaults()
	if es {
		fmt.Fprintf(w, helpES, version, b.String())
	} else {
		fmt.Fprintf(w, helpEN, version, b.String())
	}
}

// newFlagSet binds the flags to a Config; only flags that are given override it.
func newFlagSet(cfg *Config, dataDir, relayPorts *string) (*flag.FlagSet, *bool) {
	fs := flag.NewFlagSet("ofimeo-relay", flag.ContinueOnError)
	fs.StringVar(dataDir, "data", "", "data folder (config, certificates, secret); default: "+defaultDataDir())
	fs.StringVar(&cfg.Name, "name", cfg.Name, "name shown on the status page")
	fs.StringVar(&cfg.Host, "host", cfg.Host, "name or IP devices use to reach this machine (default: detected LAN address)")
	fs.IntVar(&cfg.HTTPSPort, "https-port", cfg.HTTPSPort, "HTTPS/WebSocket port, also TURN over TLS (0: 443 if possible, else 8443)")
	fs.IntVar(&cfg.HTTPPort, "http-port", cfg.HTTPPort, "plain HTTP port for the certificate page and Let's Encrypt (0: 80 or 8080, -1: off)")
	fs.IntVar(&cfg.TURNPort, "turn-port", cfg.TURNPort, "STUN/TURN port, UDP and TCP")
	fs.IntVar(&cfg.TURNTLSPort, "turn-tls-port", cfg.TURNTLSPort, "separate TURN over TLS port (0: same as HTTPS, -1: off)")
	fs.StringVar(relayPorts, "relay-ports", "", "UDP port range for relayed traffic, e.g. 50000-50999 (default 49152-65535)")
	fs.StringVar(&cfg.Domain, "domain", cfg.Domain, "public domain name: get a Let's Encrypt certificate automatically")
	fs.StringVar(&cfg.ACMEEmail, "acme-email", cfg.ACMEEmail, "contact e-mail for Let's Encrypt (optional)")
	fs.StringVar(&cfg.CertFile, "cert", cfg.CertFile, "certificate file (PEM, full chain) provided by the school")
	fs.StringVar(&cfg.KeyFile, "key", cfg.KeyFile, "private key file (PEM) for --cert")
	fs.StringVar(&cfg.ServeApp, "serve-app", cfg.ServeApp, `also serve the Ofimeo web app: "embedded", a folder or a .zip of the build`)
	fs.StringVar(&cfg.AppURL, "app-url", cfg.AppURL, "address of the Ofimeo web app, for the link for students")
	fs.BoolVar(&cfg.Public, "public", cfg.Public, "accept devices from any address, not only the local network")
	fs.Func("allow-networks", "extra address ranges treated as the local network, comma-separated CIDRs (e.g. 203.0.113.0/24)", func(v string) error {
		cfg.AllowNetworks = strings.Split(v, ",")
		return nil
	})
	fs.Var(&cfg.CredentialTTL, "credential-ttl", "validity of the TURN credentials given to browsers (e.g. 24h)")
	fs.StringVar(&cfg.LogFile, "log-file", cfg.LogFile, "also write the log to this file")
	addStoreFlags(fs, &cfg.Store)
	addMoodleFlags(fs, &cfg.Moodle)
	fs.StringVar(&cfg.SchoolConfig, "school-config", cfg.SchoolConfig, "the school's ofimeo.config.json, served to the web app (see docs/deploy-school.md)")
	showHelp := fs.Bool("help", false, "show this help")
	fs.Usage = func() {}
	return fs, showHelp
}

// parseArgs loads the config file of the data folder and applies the flags.
func parseArgs(args []string) (Config, []string, error) {
	var dataDir, relayPorts string
	probe := Config{}
	fs, _ := newFlagSet(&probe, &dataDir, &relayPorts)
	fs.SetOutput(io.Discard)
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			usage(os.Stdout, spanish())
			os.Exit(0)
		}
		return Config{}, nil, err
	}
	if dataDir == "" {
		dataDir = defaultDataDir()
	}
	dataDir, _ = filepath.Abs(dataDir)
	cfg, err := loadConfig(dataDir)
	if err != nil {
		return cfg, nil, err
	}
	// Environment (containers) overrides the file; flags override both.
	if err := applyStoreEnv(&cfg.Store); err != nil {
		return cfg, nil, err
	}
	if err := applyDeployEnv(&cfg); err != nil {
		return cfg, nil, err
	}
	if err := applyMoodleEnv(&cfg.Moodle); err != nil {
		return cfg, nil, err
	}
	// Second pass over the loaded config: only the given flags change it.
	fs, showHelp := newFlagSet(&cfg, &dataDir, &relayPorts)
	fs.SetOutput(io.Discard)
	_ = fs.Parse(args)
	if *showHelp {
		usage(os.Stdout, spanish())
		os.Exit(0)
	}
	if relayPorts != "" {
		lo, hi, ok := strings.Cut(relayPorts, "-")
		a, err1 := strconv.Atoi(lo)
		b, err2 := strconv.Atoi(hi)
		if !ok || err1 != nil || err2 != nil {
			return cfg, nil, fmt.Errorf("--relay-ports: expected MIN-MAX, got %q", relayPorts)
		}
		cfg.RelayPortMin, cfg.RelayPortMax = a, b
	}
	cfg.Domain = strings.ToLower(strings.TrimSpace(cfg.Domain))
	return cfg, args, cfg.validate()
}

func cmdRun(args []string) error {
	cfg, _, err := parseArgs(args)
	if err != nil {
		return err
	}
	if !service.Interactive() {
		return runService(cfg, args)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return run(ctx, cfg, true)
}

func newLogger(cfg *Config) (*slog.Logger, func()) {
	var w io.Writer = os.Stderr
	closeFn := func() {}
	if cfg.LogFile != "" {
		if f, err := os.OpenFile(cfg.LogFile, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
			w = io.MultiWriter(os.Stderr, f)
			closeFn = func() { f.Close() }
		} else {
			fmt.Fprintln(os.Stderr, "cannot open log file:", err)
		}
	}
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo})), closeFn
}

// run starts every server and blocks until ctx is cancelled.
func run(ctx context.Context, cfg Config, banner bool) error {
	logger, closeLog := newLogger(&cfg)
	defer closeLog()

	relayIP := net.ParseIP(cfg.Host)
	if relayIP == nil {
		relayIP = primaryIP()
	}
	certs, err := NewCertManager(&cfg, logger)
	if err != nil {
		return err
	}
	var app *AppFiles
	if cfg.ServeApp != "" {
		if app, err = OpenApp(cfg.ServeApp); err != nil {
			return fmt.Errorf("--serve-app: %w", err)
		}
	}
	if err := validateSchoolConfig(&cfg); err != nil {
		return err
	}

	httpsPort := cfg.HTTPSPort
	if httpsPort == 0 {
		httpsPort = 8443
		if portFree(443) {
			httpsPort = 443
		}
	}
	httpPort := cfg.HTTPPort
	if httpPort == 0 {
		httpPort = -1
		for _, p := range []int{80, 8080} {
			if portFree(p) {
				httpPort = p
				break
			}
		}
	}

	httpsLn, err := net.Listen("tcp", net.JoinHostPort("", strconv.Itoa(httpsPort)))
	if err != nil {
		return fmt.Errorf("HTTPS port %d: %w (choose another with --https-port)", httpsPort, err)
	}
	tlsMux := NewTLSMux(httpsLn, certs.TLSConfig())

	var turnTLS []net.Listener
	turnTLSPort := -1
	switch {
	case cfg.TURNTLSPort == 0:
		turnTLS, turnTLSPort = append(turnTLS, tlsMux.TURN), httpsPort
	case cfg.TURNTLSPort > 0:
		ln, err := tls.Listen("tcp", net.JoinHostPort("", strconv.Itoa(cfg.TURNTLSPort)), certs.TLSConfig())
		if err != nil {
			httpsLn.Close()
			return fmt.Errorf("TURN TLS port %d: %w", cfg.TURNTLSPort, err)
		}
		turnTLS, turnTLSPort = append(turnTLS, ln), cfg.TURNTLSPort
	}
	turnSrv, err := StartTURN(&cfg, logger, relayIP, turnTLS...)
	if err != nil {
		httpsLn.Close()
		return err
	}

	nostr := NewNostrRelay(&cfg, logger)
	var store *BlobStore
	if cfg.Store.Enabled {
		if store, err = OpenBlobStore(cfg.Store, filepath.Join(cfg.DataDir, "store"), logger); err != nil {
			httpsLn.Close()
			_ = turnSrv.Close()
			return fmt.Errorf("store: %w", err)
		}
		defer store.Close()
	}
	web := &Web{cfg: &cfg, log: logger, nostr: nostr, turn: turnSrv, certs: certs, app: app, store: store, started: time.Now(),
		httpsPort: httpsPort, httpPort: httpPort, turnTLSPort: turnTLSPort, relayIP: relayIP}
	errLog := log.New(io.Discard, "", 0)
	httpsSrv := &http.Server{Handler: web.HTTPSHandler(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 2 * time.Minute, ErrorLog: errLog}
	errs := make(chan error, 3)
	go func() { errs <- tlsMux.Serve() }()
	go func() { errs <- httpsSrv.Serve(tlsMux.Web) }()
	var httpSrv *http.Server
	if httpPort > 0 {
		if ln, err := net.Listen("tcp", net.JoinHostPort("", strconv.Itoa(httpPort))); err == nil {
			httpSrv = &http.Server{Handler: web.HTTPHandler(), ReadHeaderTimeout: 10 * time.Second, ErrorLog: errLog}
			go func() { errs <- httpSrv.Serve(ln) }()
		} else {
			logger.Warn("plain HTTP port not available", "port", httpPort, "error", err)
			web.httpPort = -1
		}
	}

	logger.Info("Ofimeo Relay started", "version", version, "relay_address", web.RelayAddress(), "https_port", httpsPort,
		"turn_port", cfg.TURNPort, "certificate", certs.Mode, "serve_app", cfg.ServeApp != "", "public", cfg.Public, "data", cfg.DataDir)
	if banner {
		printBanner(web)
	}

	select {
	case <-ctx.Done():
	case err = <-errs:
		if errors.Is(err, net.ErrClosed) || errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
	}
	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go nostr.Close()
	_ = httpsSrv.Shutdown(shutdownCtx)
	if httpSrv != nil {
		_ = httpSrv.Shutdown(shutdownCtx)
	}
	_ = tlsMux.Close()
	_ = turnSrv.Close()
	for _, l := range turnTLS {
		_ = l.Close()
	}
	logger.Info("stopped")
	return err
}

func printBanner(web *Web) {
	fmt.Printf(`
  Ofimeo Relay %s is running. Keep this window open (Ctrl+C stops it).

    Relay address (paste it in Ofimeo, Help → Connection test…):
      %s
    Status page:        %s/ofimeo/
    Link for students:  %s
`, version, web.RelayAddress(), web.RelayAddress(), web.StudentLink())
	if web.certs.Mode == "local-ca" {
		fmt.Printf("    Certificate:        install it on each device from %s/ofimeo/ca\n", web.RelayAddress())
	}
	fmt.Println()
}

// On Windows, a program started by double-click closes its window at once:
// keep error messages readable.
func pauseIfDoubleClicked() {
	if runtime.GOOS == "windows" && service.Interactive() && len(os.Args) == 1 {
		fmt.Fprintln(os.Stderr, "\nPress Enter to close.")
		_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
	}
}
