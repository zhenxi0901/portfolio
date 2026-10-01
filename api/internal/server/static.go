package server

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

// staticHandler serves the Next.js export: `/` -> index.html, `/about` -> about.html,
// immutable caching for hashed assets, and the export's 404 page for misses.
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
