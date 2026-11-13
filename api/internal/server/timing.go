package server

import (
	"fmt"
	"net/http"
	"time"
)

// timing adds a Server-Timing header to every response. Browsers expose it to the page (unlike
// other response headers on a navigation), and the "your visit" trace on the status section
// draws it: how long this server took to start answering, which revision answered, and, on an
// instance's first visitor request, how long the process had been up. On Cloud Run, which scales
// to zero, that first visitor is the one who waited for the container to start.
func (s *Server) timing(next http.Handler) http.Handler {
	var rev string
	if s.cfg.Revision != "" {
		rev = fmt.Sprintf(`, rev;desc=%q`, s.cfg.Revision)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		tail := rev
		// Probes, health checks and scrapes are not visitors: they must not use up the first request.
		if !machineRoutes[r.URL.Path] && s.visits.Add(1) == 1 {
			tail = fmt.Sprintf(`, cold;dur=%.0f;desc="process age at first request"`, ms(start.Sub(s.started))) + tail
		}
		next.ServeHTTP(&timingWriter{ResponseWriter: w, start: start, tail: tail}, r)
	})
}

// timingWriter stamps Server-Timing at the moment the status line is written, so "app" is the
// time the server took to start answering.
type timingWriter struct {
	http.ResponseWriter
	start time.Time
	tail  string
	done  bool
}

func (t *timingWriter) WriteHeader(code int) {
	if !t.done {
		t.done = true
		t.Header().Set("Server-Timing", fmt.Sprintf(`app;dur=%.2f;desc="Go server"`, ms(time.Since(t.start)))+t.tail)
	}
	t.ResponseWriter.WriteHeader(code)
}

func (t *timingWriter) Write(b []byte) (int, error) {
	if !t.done {
		t.WriteHeader(http.StatusOK)
	}
	return t.ResponseWriter.Write(b)
}

func (t *timingWriter) Unwrap() http.ResponseWriter { return t.ResponseWriter }

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }
