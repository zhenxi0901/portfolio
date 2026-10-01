package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The variants hold marker bytes rather than real compressed data, so each test can see
// exactly which file was served.
func newStaticSite(t *testing.T) http.Handler {
	t.Helper()
	site := t.TempDir()
	write := func(name, body string) {
		p := filepath.Join(site, filepath.FromSlash(name))
		must(t, os.MkdirAll(filepath.Dir(p), 0o755))
		must(t, os.WriteFile(p, []byte(body), 0o644))
	}
	write("index.html", "home")
	write("index.html.br", "home-br")
	write("404.html", "lost")
	write("_next/static/app.js", "app")
	write("_next/static/app.js.br", "app-br")
	write("_next/static/app.js.gz", "app-gz")
	write("_next/static/old.js", "old")
	write("_next/static/old.js.gz", "old-gz")
	write("img/photo.jpg", "jpg")
	return staticHandler(site)
}

func get(t *testing.T, h http.Handler, path string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestStaticServesPrecompressedVariants(t *testing.T) {
	h := newStaticSite(t)
	cases := []struct {
		name, path, accept, wantBody, wantEncoding string
	}{
		{"brotli preferred", "/_next/static/app.js", "gzip, deflate, br, zstd", "app-br", "br"},
		{"gzip when brotli not offered", "/_next/static/app.js", "gzip", "app-gz", "gzip"},
		{"q=0 refuses brotli", "/_next/static/app.js", "br;q=0, gzip", "app-gz", "gzip"},
		{"wildcard covers brotli", "/_next/static/app.js", "*", "app-br", "br"},
		{"no header means original", "/_next/static/app.js", "", "app", ""},
		{"identity only means original", "/_next/static/app.js", "identity", "app", ""},
		{"falls back to the variant that exists", "/_next/static/old.js", "br, gzip", "old-gz", "gzip"},
		{"home page", "/", "br", "home-br", "br"},
		{"binary files are never varied", "/img/photo.jpg", "br, gzip", "jpg", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := get(t, h, c.path, map[string]string{"Accept-Encoding": c.accept})
			if rec.Code != http.StatusOK {
				t.Fatalf("status %d", rec.Code)
			}
			if body := rec.Body.String(); body != c.wantBody {
				t.Errorf("body %q, want %q", body, c.wantBody)
			}
			if enc := rec.Header().Get("Content-Encoding"); enc != c.wantEncoding {
				t.Errorf("Content-Encoding %q, want %q", enc, c.wantEncoding)
			}
		})
	}
}

func TestStaticCompressedHeaders(t *testing.T) {
	h := newStaticSite(t)

	rec := get(t, h, "/_next/static/app.js", map[string]string{"Accept-Encoding": "br"})
	if ct := rec.Header().Get("Content-Type"); ct != "text/javascript; charset=utf-8" {
		t.Errorf("Content-Type %q should describe the original file", ct)
	}
	if cl := rec.Header().Get("Content-Length"); cl != "6" {
		t.Errorf("Content-Length %q should be the compressed size", cl)
	}
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("hashed assets stay immutable when compressed, got %q", cc)
	}

	home := get(t, h, "/", map[string]string{"Accept-Encoding": "br"})
	if ct := home.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Errorf("home Content-Type %q", ct)
	}

	// Caches must key on Accept-Encoding whenever a variant exists, even for a client that
	// got the original, and must not when none does.
	for path, want := range map[string]string{"/_next/static/app.js": "Accept-Encoding", "/img/photo.jpg": ""} {
		rec := get(t, h, path, nil)
		if v := rec.Header().Get("Vary"); v != want {
			t.Errorf("%s Vary %q, want %q", path, v, want)
		}
	}
}

func TestStaticRangeAndHeadStayCorrect(t *testing.T) {
	h := newStaticSite(t)

	rec := get(t, h, "/_next/static/app.js", map[string]string{"Accept-Encoding": "br", "Range": "bytes=0-1"})
	if rec.Code != http.StatusPartialContent || rec.Body.String() != "ap" || rec.Header().Get("Content-Encoding") != "" {
		t.Errorf("range should come from the original file: %d %q %q", rec.Code, rec.Body.String(), rec.Header().Get("Content-Encoding"))
	}

	req := httptest.NewRequest(http.MethodHead, "/_next/static/app.js", nil)
	req.Header.Set("Accept-Encoding", "br")
	head := httptest.NewRecorder()
	h.ServeHTTP(head, req)
	if head.Header().Get("Content-Encoding") != "br" || head.Body.Len() != 0 {
		t.Errorf("HEAD should describe the brotli variant with no body")
	}
}

func TestAcceptedEncodings(t *testing.T) {
	for header, want := range map[string][2]bool{
		"":                      {false, false},
		"br":                    {true, false},
		"GZIP":                  {false, true},
		"gzip;q=0.5, br;q=1.0":  {true, true},
		"br; q=0":               {false, false},
		"*;q=0.1":               {true, true},
		"*, gzip;q=0":           {true, false},
		"deflate, identity":     {false, false},
		"br;level=5;q=0, gzip ": {false, true},
	} {
		got := acceptedEncodings(header)
		if got["br"] != want[0] || got["gzip"] != want[1] {
			t.Errorf("%q: br=%v gzip=%v, want %v", header, got["br"], got["gzip"], want)
		}
	}
}

// The real server should also hand compressed assets to a normal HTTP client.
func TestServerSendsCompressedAssets(t *testing.T) {
	ts, cfg := newTestServer(t)
	must(t, os.WriteFile(filepath.Join(cfg.StaticDir, "_next", "static", "app.js.br"), []byte("br"), 0o644))
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/_next/static/app.js", nil)
	req.Header.Set("Accept-Encoding", "br")
	resp, err := http.DefaultClient.Do(req)
	must(t, err)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.Header.Get("Content-Encoding") != "br" || string(body) != "br" {
		t.Errorf("got %q encoding %q", body, resp.Header.Get("Content-Encoding"))
	}
}
