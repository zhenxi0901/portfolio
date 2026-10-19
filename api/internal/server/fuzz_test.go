package server

import (
	"net"
	"testing"
)

// On Cloud Run the rate-limit key comes from X-Forwarded-For, which a client can fill with anything.
// Whatever it holds, the key must not panic, non-IPv6 input must key as itself, and two addresses in
// one IPv6 /64 must share a bucket.
func FuzzRateKey(f *testing.F) {
	f.Add("203.0.113.7")
	f.Add("2001:db8:1:2:3:4:5:6")
	f.Add("::ffff:192.0.2.1")
	f.Add("fe80::1%eth0")
	f.Add("not an address")
	f.Fuzz(func(t *testing.T, ip string) {
		k := rateKey(ip)
		a := net.ParseIP(ip)
		if a == nil || a.To4() != nil {
			if k != ip {
				t.Fatalf("rateKey(%q) = %q, want the input unchanged", ip, k)
			}
			return
		}
		b := make(net.IP, len(a))
		copy(b, a)
		b[15] ^= 0xff // same /64, different host
		if got := rateKey(b.String()); got != k {
			t.Fatalf("%s and %s share a /64 but key as %q and %q", a, b, k, got)
		}
	})
}
