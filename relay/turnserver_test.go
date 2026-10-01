package main

import (
	"net"
	"testing"
)

func TestTURNPeerPermissions(t *testing.T) {
	for _, tc := range []struct {
		name            string
		public, private bool
		peer            string
		allowed         bool
	}{
		{"public Internet", true, false, "8.8.8.8", true},
		{"public private IPv4", true, false, "10.0.0.10", false},
		{"public private IPv6", true, false, "fd00::10", false},
		{"explicit private access", true, true, "192.168.1.10", true},
		{"local private access", false, false, "192.168.1.10", true},
		{"local Internet denied", false, false, "8.8.8.8", false},
		{"metadata denied", true, true, "169.254.169.254", false},
		{"IPv6 link local denied", true, true, "fe80::1", false},
		{"loopback denied", true, true, "127.0.0.1", false},
		{"multicast denied", true, true, "224.0.0.1", false},
		{"unspecified denied", true, true, "0.0.0.0", false},
		{"relay peer", true, false, "10.0.0.1", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := TURNServer{cfg: &Config{Public: tc.public, AllowPrivatePeers: tc.private}, relayIP: net.ParseIP("10.0.0.1")}
			if got := server.permit(nil, net.ParseIP(tc.peer)); got != tc.allowed {
				t.Fatalf("permit(%s) = %v, want %v", tc.peer, got, tc.allowed)
			}
		})
	}
}
