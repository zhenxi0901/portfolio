// Package slo reports this site's own availability, measured from outside by Cloud Monitoring
// uptime checks, against a 99.9% objective over a rolling 30 days.
package slo

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"sync"
	"time"
)

const (
	Target     = 0.999
	WindowDays = 30
	day        = 24 * time.Hour
	cacheFor   = 5 * time.Minute
	// After a failed fetch, wait this long before asking the Monitoring API again.
	retryAfter = 30 * time.Second
)

// Day is one 24-hour bucket of uptime-check results, ending at End.
type Day struct {
	End    time.Time `json:"end"`
	Checks int64     `json:"checks"`
	Passed int64     `json:"passed"`
}

type Report struct {
	Available  bool    `json:"available"`
	Reason     string  `json:"reason,omitempty"`
	Target     float64 `json:"target"`
	WindowDays int     `json:"window_days"`
	// Samples of uptime_check/check_passed, not probes: Monitoring records several per probe (about
	// one every 10 s per location), so these are only meaningful as a ratio.
	Checks int64 `json:"checks"`
	Passed int64 `json:"passed"`
	// Share of checks that passed.
	Availability float64 `json:"availability"`
	// The error budget for a full window, and how much of it is left (negative once overspent).
	BudgetMinutes   float64 `json:"budget_minutes"`
	BudgetRemaining float64 `json:"budget_remaining"`
	// Failed share of the time measured so far, in minutes.
	DowntimeMinutes float64    `json:"downtime_minutes"`
	Since           *time.Time `json:"since,omitempty"`
	Days            []Day      `json:"days"`
	Updated         time.Time  `json:"updated"`
	// Set when the latest fetch failed and this is the last good report.
	Stale bool `json:"stale,omitempty"`
	// The error-budget policy for releases, which the deploy pipeline enforces: "open" while budget
	// is left, "frozen" once it is spent (only commits marked as reliability fixes ship), "unknown"
	// when nothing is measured. Unknown does not block: losing the measurement should not stop a fix.
	Releases string `json:"releases"`
}

const (
	ReleasesOpen    = "open"
	ReleasesFrozen  = "frozen"
	ReleasesUnknown = "unknown"
)

// Source returns per-day check counts for the WindowDays days ending at end, oldest first, and
// when the first check in the window ran (zero if none did).
type Source interface {
	Days(ctx context.Context, end time.Time) ([]Day, time.Time, error)
}

type Service struct {
	src Source
	log *slog.Logger
	now func() time.Time

	mu   sync.Mutex
	last Report
	next time.Time // when to fetch again
}

// New returns a service that reads from src; a nil src means there is nothing to measure here
// (anywhere but Cloud Run).
func New(src Source, log *slog.Logger) *Service {
	return &Service{src: src, log: log, now: time.Now}
}

func (s *Service) Report(ctx context.Context) Report {
	if s.src == nil {
		return unavailable("Measured on the live site only.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if now.Before(s.next) {
		return s.last
	}
	// The fetch is shared by every caller that waits on it, so it must not die with the first
	// caller's connection; it gets its own deadline instead.
	fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
	defer cancel()
	days, first, err := s.src.Days(fctx, now)
	if err != nil {
		s.log.Warn("slo: could not read uptime checks", "err", err)
		s.next = now.Add(retryAfter)
		if s.last.Available {
			s.last.Stale = true
			return s.last
		}
		s.last = unavailable("Measurements are unavailable right now.")
		return s.last
	}
	s.last = Summarise(days, first, now)
	s.next = now.Add(cacheFor)
	return s.last
}

// ShieldsBadge is the JSON a shields.io endpoint badge reads (https://shields.io/badges/endpoint-badge).
type ShieldsBadge struct {
	SchemaVersion int    `json:"schemaVersion"`
	Label         string `json:"label"`
	Message       string `json:"message"`
	Color         string `json:"color"`
	CacheSeconds  int    `json:"cacheSeconds"`
}

// Badge shows the availability over the window so far, coloured against the objective.
func Badge(r Report) ShieldsBadge {
	b := ShieldsBadge{SchemaVersion: 1, Label: "uptime, 30 days", Message: "measuring", Color: "lightgrey", CacheSeconds: 300}
	if !r.Available {
		return b
	}
	b.Message = fmt.Sprintf("%.2f%%", math.Floor(r.Availability*10000)/100)
	switch {
	case r.Availability >= Target:
		b.Color = "brightgreen"
	case r.Availability >= 0.99:
		b.Color = "yellow"
	default:
		b.Color = "red"
	}
	return b
}

func unavailable(reason string) Report {
	return Report{Reason: reason, Target: Target, WindowDays: WindowDays, BudgetMinutes: budgetMinutes(), Days: []Day{}, Releases: ReleasesUnknown}
}

func budgetMinutes() float64 { return (1 - Target) * WindowDays * 24 * 60 }

// Summarise turns daily counts into the report: availability, error budget and downtime. first is
// when the earliest check in the window ran; downtime is the failed share of the time since then.
func Summarise(days []Day, first, now time.Time) Report {
	r := Report{
		Available:     true,
		Target:        Target,
		WindowDays:    WindowDays,
		BudgetMinutes: budgetMinutes(),
		Days:          days,
		Updated:       now.UTC(),
		Releases:      ReleasesOpen,
	}
	for _, d := range days {
		r.Checks += d.Checks
		r.Passed += d.Passed
	}
	if r.Checks == 0 || first.IsZero() {
		r.Available = false
		r.Reason = "No checks recorded yet."
		r.Releases = ReleasesUnknown
		return r
	}
	since := first.UTC()
	r.Since = &since
	r.Availability = float64(r.Passed) / float64(r.Checks)
	failed := 1 - r.Availability
	measured := now.Sub(since).Minutes()
	if limit := float64(WindowDays * 24 * 60); measured > limit {
		measured = limit
	}
	r.DowntimeMinutes = failed * measured
	r.BudgetRemaining = 1 - r.DowntimeMinutes/r.BudgetMinutes
	if r.BudgetRemaining <= 0 {
		r.Releases = ReleasesFrozen
	}
	return r
}
