package server

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
)

// encodings are the precompressed variants the web build writes next to each text file
// (web/scripts/precompress.mjs), best first.
var encodings = []struct{ name, ext string }{{"br", ".br"}, {"gzip", ".gz"}}

// contentTypes covers every extension the build precompresses. It is explicit because the
// distroless image has no /etc/mime.types, and a sniffed type would describe the compressed bytes.
var contentTypes = map[string]string{
	".html": "text/html; charset=utf-8",
	".js":   "text/javascript; charset=utf-8",
	".css":  "text/css; charset=utf-8",
	".json": "application/json",
	".txt":  "text/plain; charset=utf-8",
	".svg":  "image/svg+xml",
	".xml":  "text/xml; charset=utf-8",
}

// staticHandler serves the Next.js export: `/` -> index.html, `/about` -> about.html,
// immutable caching for hashed assets, precompressed variants when the client accepts
// them, and the export's 404 page for misses.
func staticHandler(dir string) http.Handler {
	root := os.DirFS(dir)
	files := http.FileServerFS(root)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		switch {
		case name == "" || name == ".":
			name = "index.html"
		case !exists(root, name) && exists(root, name+".html"):
			name += ".html"
		}
		if !exists(root, name) {
			serve404(w, root)
			return
		}

		switch {
		case strings.HasPrefix(name, "_next/static/"):
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasSuffix(name, ".html"):
			w.Header().Set("Cache-Control", "public, max-age=0, must-revalidate")
		default:
			w.Header().Set("Cache-Control", "public, max-age=3600")
		}

		variant, encoding, varies := precompressed(root, name, r)
		if varies {
			w.Header().Add("Vary", "Accept-Encoding")
		}
		if variant != "" {
			// Type comes from the original file; the variant only supplies the bytes.
			w.Header().Set("Content-Type", contentTypes[path.Ext(name)])
			w.Header().Set("Content-Encoding", encoding)
			// net/http omits Content-Length once Content-Encoding is set, assuming the body is
			// compressed on the fly. These bytes are already on disk, so send the size.
			if st, err := fs.Stat(root, variant); err == nil {
				w.Header().Set("Content-Length", strconv.FormatInt(st.Size(), 10))
			}
			http.ServeFileFS(w, r, root, variant)
			return
		}

		if name == "index.html" {
			// Pass the original request: both FileServer and ServeFileFS redirect paths ending in /index.html.
			http.ServeFileFS(w, r, root, name)
			return
		}
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/" + name
		files.ServeHTTP(w, r2)
	})
}

// precompressed returns the best variant of name that the client accepts, if any, and
// whether any variant exists at all (so the response must carry Vary either way).
func precompressed(root fs.FS, name string, r *http.Request) (variant, encoding string, varies bool) {
	if contentTypes[path.Ext(name)] == "" {
		return "", "", false
	}
	accepted := acceptedEncodings(r.Header.Get("Accept-Encoding"))
	// A byte range of compressed bytes is rarely what a client wants: serve ranges uncompressed.
	ranged := r.Header.Get("Range") != ""
	for _, e := range encodings {
		if !exists(root, name+e.ext) {
			continue
		}
		varies = true
		if variant == "" && accepted[e.name] && !ranged {
			variant, encoding = name+e.ext, e.name
		}
	}
	return variant, encoding, varies
}

// acceptedEncodings reports which of our encodings an Accept-Encoding header allows,
// treating q=0 as a refusal and "*" as covering anything not listed.
func acceptedEncodings(header string) map[string]bool {
	weights := map[string]float64{}
	for _, part := range strings.Split(header, ",") {
		coding, params, _ := strings.Cut(part, ";")
		coding = strings.ToLower(strings.TrimSpace(coding))
		if coding == "" {
			continue
		}
		q := 1.0
		for _, p := range strings.Split(params, ";") {
			if v, ok := strings.CutPrefix(strings.ToLower(strings.TrimSpace(p)), "q="); ok {
				if f, err := strconv.ParseFloat(v, 64); err == nil {
					q = f
				}
			}
		}
		weights[coding] = q
	}
	accepted := map[string]bool{}
	for _, e := range encodings {
		q, listed := weights[e.name]
		if !listed {
			q, listed = weights["*"]
		}
		accepted[e.name] = listed && q > 0
	}
	return accepted
}

func exists(root fs.FS, name string) bool {
	st, err := fs.Stat(root, name)
	return err == nil && !st.IsDir()
}

func serve404(w http.ResponseWriter, root fs.FS) {
	body, err := fs.ReadFile(root, "404.html")
	if err != nil {
		http.NotFound(w, nil)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write(body)
}
