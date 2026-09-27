package main

// One TLS port for everything: after the TLS handshake the first bytes tell
// a STUN/TURN client (TURN over TLS, "turns:") from a web browser request
// (https, wss). This lets a school open a single port (443) for the relay.

import (
	"bufio"
	"crypto/tls"
	"encoding/binary"
	"errors"
	"net"
	"sync"
	"time"
)

const stunMagicCookie = 0x2112A442

// isSTUN reports whether a stream starts with a STUN message header: the
// two top bits of the first byte are zero and bytes 4..8 are the magic cookie.
func isSTUN(head []byte) bool {
	return len(head) >= 8 && head[0]&0xC0 == 0 && binary.BigEndian.Uint32(head[4:8]) == stunMagicCookie
}

// chanListener is a net.Listener fed with connections by the demultiplexer.
type chanListener struct {
	addr   net.Addr
	conns  chan net.Conn
	once   sync.Once
	closed chan struct{}
}

func newChanListener(addr net.Addr) *chanListener {
	return &chanListener{addr: addr, conns: make(chan net.Conn), closed: make(chan struct{})}
}

func (l *chanListener) Accept() (net.Conn, error) {
	select {
	case c := <-l.conns:
		return c, nil
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

func (l *chanListener) Close() error {
	l.once.Do(func() { close(l.closed) })
	return nil
}

func (l *chanListener) Addr() net.Addr { return l.addr }

func (l *chanListener) deliver(c net.Conn) {
	select {
	case l.conns <- c:
	case <-l.closed:
		c.Close()
	}
}

// peekedConn replays the bytes read to classify the connection.
type peekedConn struct {
	net.Conn
	r *bufio.Reader
}

func (c *peekedConn) Read(p []byte) (int, error) { return c.r.Read(p) }

// TLSMux accepts TLS connections and splits them between web and TURN.
type TLSMux struct {
	inner net.Listener
	cfg   *tls.Config
	Web   *chanListener
	TURN  *chanListener
}

func NewTLSMux(inner net.Listener, cfg *tls.Config) *TLSMux {
	return &TLSMux{inner: inner, cfg: cfg, Web: newChanListener(inner.Addr()), TURN: newChanListener(inner.Addr())}
}

// Serve runs until the listener is closed.
func (m *TLSMux) Serve() error {
	for {
		raw, err := m.inner.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				m.Web.Close()
				m.TURN.Close()
			}
			return err
		}
		go m.classify(raw)
	}
}

func (m *TLSMux) classify(raw net.Conn) {
	conn := tls.Server(raw, m.cfg)
	_ = raw.SetDeadline(time.Now().Add(15 * time.Second))
	if err := conn.Handshake(); err != nil {
		raw.Close()
		return
	}
	// ACME TLS-ALPN-01 validation ends with the handshake.
	if conn.ConnectionState().NegotiatedProtocol == "acme-tls/1" {
		conn.Close()
		return
	}
	r := bufio.NewReader(conn)
	head, err := r.Peek(8)
	if err != nil {
		conn.Close()
		return
	}
	_ = raw.SetDeadline(time.Time{})
	pc := &peekedConn{Conn: conn, r: r}
	if isSTUN(head) {
		m.TURN.deliver(pc)
	} else {
		m.Web.deliver(pc)
	}
}

func (m *TLSMux) Close() error {
	m.Web.Close()
	m.TURN.Close()
	return m.inner.Close()
}
