package server

import "testing"

func TestMethodLabelIsBounded(t *testing.T) {
	for in, want := range map[string]string{"GET": "GET", "POST": "POST", "HEAD": "HEAD", "OPTIONS": "OPTIONS", "FOO1": "other", "PURGE": "other"} {
		if got := methodLabel(in); got != want {
			t.Errorf("methodLabel(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRateKeyGroupsIPv6By64(t *testing.T) {
	a, b := rateKey("2001:db8:1:2::1"), rateKey("2001:db8:1:2:ffff::9")
	if a != b || a != "2001:db8:1:2::/64" {
		t.Errorf("same /64 should share a key: %q %q", a, b)
	}
	if rateKey("2001:db8:1:3::1") == a {
		t.Error("a different /64 must not share the key")
	}
	if got := rateKey("203.0.113.7"); got != "203.0.113.7" {
		t.Errorf("IPv4 keys stay whole, got %q", got)
	}
}
