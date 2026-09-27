package main

import (
	"fmt"
	"net"
	"net/netip"
	"os"
	"sort"
	"strconv"
	"strings"
)

// Address ranges treated as "local network": private IPv4, carrier-grade NAT,
// loopback, link-local and IPv6 unique-local addresses.
var localPrefixes = func() []netip.Prefix {
	var out []netip.Prefix
	for _, s := range []string{
		"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10",
		"127.0.0.0/8", "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10",
	} {
		out = append(out, netip.MustParsePrefix(s))
	}
	return out
}()

// extraLocal: networks the school declares local too (allow_networks), e.g.
// public address ranges used inside the school network.
var extraLocal []netip.Prefix

func setExtraLocal(cidrs []string) error {
	extraLocal = nil
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		p, err := netip.ParsePrefix(c)
		if err != nil {
			if a, err2 := netip.ParseAddr(c); err2 == nil {
				p = netip.PrefixFrom(a, a.BitLen())
			} else {
				return fmt.Errorf("allow_networks: %w", err)
			}
		}
		extraLocal = append(extraLocal, p.Masked())
	}
	return nil
}

// isLocalIP reports whether ip belongs to a private, loopback or link-local
// range, or to a network listed in allow_networks.
func isLocalIP(ip net.IP) bool {
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	addr = addr.Unmap()
	for _, p := range append(localPrefixes, extraLocal...) {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// hostIP extracts the IP of a "host:port" address (nil if it is not an IP).
func hostIP(addr string) net.IP {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	return net.ParseIP(strings.Trim(host, "[]"))
}

func addrIP(a net.Addr) net.IP {
	switch v := a.(type) {
	case *net.UDPAddr:
		return v.IP
	case *net.TCPAddr:
		return v.IP
	}
	return hostIP(a.String())
}

// localAddresses lists the non-loopback unicast IPs of this machine, IPv4 first.
func localAddresses() []net.IP {
	var out []net.IP
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok || ipnet.IP.IsLoopback() || ipnet.IP.IsLinkLocalUnicast() || ipnet.IP.IsMulticast() {
				continue
			}
			out = append(out, ipnet.IP)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].To4() != nil && out[j].To4() == nil })
	return out
}

// primaryIP is the address other machines on the LAN most likely reach us at:
// the source address of the default route, else the first interface address.
func primaryIP() net.IP {
	if c, err := net.Dial("udp", "192.0.2.1:9"); err == nil {
		defer c.Close()
		if ip := addrIP(c.LocalAddr()); ip != nil && !ip.IsLoopback() && !ip.IsUnspecified() {
			return ip
		}
	}
	if list := localAddresses(); len(list) > 0 {
		return list[0]
	}
	return net.IPv4(127, 0, 0, 1)
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "ofimeo-relay"
	}
	return strings.ToLower(strings.TrimSuffix(h, ".local"))
}

// portFree reports whether a TCP port can be bound on all interfaces.
func portFree(port int) bool {
	l, err := net.Listen("tcp", net.JoinHostPort("", strconv.Itoa(port)))
	if err != nil {
		return false
	}
	l.Close()
	return true
}
