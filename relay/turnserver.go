package main

// STUN/TURN server (pion/turn) on UDP and TCP (3478) and over TLS (on the
// HTTPS port or a separate one). Credentials are time-limited (TURN REST API:
// username "<expiry>:ofimeo", password HMAC-SHA1 of the username with a shared
// secret that never leaves this machine), handed out by /ofimeo/config.

import (
	"fmt"
	"log/slog"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/pion/logging"
	"github.com/pion/turn/v4"
)

const turnRealm = "ofimeo"

type TURNServer struct {
	cfg     *Config
	log     *slog.Logger
	server  *turn.Server
	relayIP net.IP

	mu    sync.Mutex
	perIP map[string]int
	total int
}

// Credentials returns a fresh username/password pair valid for the configured TTL.
func Credentials(secret string, ttl time.Duration) (username, password string, expires time.Time, err error) {
	expires = time.Now().Add(ttl)
	username, password, err = turn.GenerateLongTermTURNRESTCredentials(secret, "ofimeo", ttl)
	return
}

// StartTURN listens on UDP and TCP turnPort plus any extra TLS listeners.
func StartTURN(cfg *Config, log *slog.Logger, relayIP net.IP, tlsListeners ...net.Listener) (*TURNServer, error) {
	t := &TURNServer{cfg: cfg, log: log, relayIP: relayIP, perIP: map[string]int{}}
	addr := net.JoinHostPort("", strconv.Itoa(cfg.TURNPort))
	udp, err := net.ListenPacket("udp", addr)
	if err != nil {
		return nil, fmt.Errorf("TURN UDP port %d: %w", cfg.TURNPort, err)
	}
	tcp, err := net.Listen("tcp", addr)
	if err != nil {
		udp.Close()
		return nil, fmt.Errorf("TURN TCP port %d: %w", cfg.TURNPort, err)
	}
	gen := func() turn.RelayAddressGenerator {
		return &turn.RelayAddressGeneratorPortRange{
			RelayAddress: relayIP,
			Address:      "0.0.0.0",
			MinPort:      uint16(cfg.RelayPortMin),
			MaxPort:      uint16(cfg.RelayPortMax),
		}
	}
	listeners := []turn.ListenerConfig{{Listener: tcp, RelayAddressGenerator: gen(), PermissionHandler: t.permit}}
	for _, l := range tlsListeners {
		listeners = append(listeners, turn.ListenerConfig{Listener: l, RelayAddressGenerator: gen(), PermissionHandler: t.permit})
	}
	lf := logging.NewDefaultLoggerFactory()
	lf.DefaultLogLevel = logging.LogLevelWarn
	restAuth := turn.LongTermTURNRESTAuthHandler(cfg.Secret, lf.NewLogger("turn"))
	t.server, err = turn.NewServer(turn.ServerConfig{
		Realm:             turnRealm,
		LoggerFactory:     lf,
		PacketConnConfigs: []turn.PacketConnConfig{{PacketConn: udp, RelayAddressGenerator: gen(), PermissionHandler: t.permit}},
		ListenerConfigs:   listeners,
		AuthHandler: func(username, realm string, src net.Addr) ([]byte, bool) {
			if !t.clientAllowed(src) {
				return nil, false
			}
			return restAuth(username, realm, src)
		},
		QuotaHandler: t.quota,
		EventHandler: turn.EventHandler{
			OnAllocationCreated: func(src, _ net.Addr, _ string, _, _ string, _ net.Addr, _ int) { t.count(src, 1) },
			OnAllocationDeleted: func(src, _ net.Addr, _ string, _, _ string) { t.count(src, -1) },
		},
	})
	if err != nil {
		udp.Close()
		tcp.Close()
		return nil, err
	}
	return t, nil
}

func (t *TURNServer) clientAllowed(src net.Addr) bool {
	return t.cfg.Public || isLocalIP(addrIP(src))
}

// permit decides which peers an allocation may send to: devices on the local
// network (and this relay's own address), or anyone in public mode. Loopback
// and other special addresses are never allowed, so the relay cannot be used
// to reach services on this machine.
func (t *TURNServer) permit(_ net.Addr, peer net.IP) bool {
	if peer.Equal(t.relayIP) {
		return true
	}
	if peer.IsLoopback() || peer.IsUnspecified() || peer.IsMulticast() || peer.IsLinkLocalMulticast() {
		return false
	}
	return t.cfg.Public || isLocalIP(peer)
}

func (t *TURNServer) quota(_, _ string, src net.Addr) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	ip := addrIP(src).String()
	return t.total < t.cfg.MaxAllocations && t.perIP[ip] < t.cfg.MaxAllocationsPerIP
}

func (t *TURNServer) count(src net.Addr, delta int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	ip := addrIP(src).String()
	t.perIP[ip] += delta
	t.total += delta
	if t.perIP[ip] <= 0 {
		delete(t.perIP, ip)
	}
}

func (t *TURNServer) Allocations() int {
	if t == nil {
		return 0
	}
	return t.server.AllocationCount()
}

func (t *TURNServer) Close() error {
	return t.server.Close()
}
