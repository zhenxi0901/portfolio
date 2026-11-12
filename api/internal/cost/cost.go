// Package cost estimates what this site costs to run this month: its own usage, read from Cloud
// Monitoring, priced at Google's list prices for a Cloud Run service with request-based billing in
// asia-southeast1. It is an estimate: the bill itself is only visible in the billing console.
package cost

import (
	"context"
	"log/slog"
	"math"
	"sync"
	"time"
)

// List prices in USD, read from Google's pricing pages on PricesAsOf.
const (
	PricesAsOf = "2026-11-12"

	// Cloud Run, request-based billing, Singapore (asia-southeast1 is a Tier 2 region):
	// https://cloud.google.com/run/pricing
	PriceVCPUSecond         = 0.0000336
	PriceGiBSecond          = 0.0000035
	PricePerMillionRequests = 0.40

	// Premium Tier internet data transfer out of Singapore to North America, Europe and most of Asia,
	// first TiB: https://cloud.google.com/vpc/network-pricing. Cloud Run's free GiB of egress is
	// within North America only, so none of it applies to a service in Singapore.
	PricePerGiBEgress = 0.12

	// The free tier is per billing account per month and is applied as a spending discount at Tier 1
	// prices (us-central1), so it is worth the same in dollars in every region.
	FreeVCPUSeconds = 180_000
	FreeGiBSeconds  = 360_000
	FreeRequests    = 2_000_000
	tier1VCPUSecond = 0.000024
	tier1GiBSecond  = 0.0000025

	// Cloud Run bills instance time rounded up to the nearest 100 ms.
	BillingStepSeconds = 0.1
)

// The service's size and limits, as infra/main.tf and infra/variables.tf set them, and the uptime
// check's schedule from infra/slo.tf. TestConstantsMatchInfra fails if they drift apart.
const (
	VCPU         = 1.0
	MemoryGiB    = 0.25 // 256Mi
	MaxInstances = 3
	Concurrency  = 80
	// One check a minute from each of three regions.
	ProbesPerMinute = 3
)

const (
	cacheFor   = time.Hour // usage metrics arrive minutes late; an hour keeps API reads rare
	retryAfter = time.Minute
	gib        = 1 << 30
)

// Usage is what the service consumed in a period, as Cloud Monitoring counts it.
type Usage struct {
	Requests        int64   `json:"requests"`
	BillableSeconds float64 `json:"billable_seconds"`
	VCPUSeconds     float64 `json:"vcpu_seconds"`
	GiBSeconds      float64 `json:"gib_seconds"`
	EgressBytes     int64   `json:"egress_bytes"` // to the internet
}

// Line is one row of the receipt, at list price.
type Line struct {
	Item     string  `json:"item"`
	Quantity float64 `json:"quantity"`
	Unit     string  `json:"unit"`
	Price    float64 `json:"price"` // USD per unit
	Cost     float64 `json:"cost"`  // USD
	Free     float64 `json:"free"`  // USD of it the free tier covers
}

// Prices is the price list and the service's limits, so the page can price a what-if with the
// same numbers the receipt uses.
type Prices struct {
	AsOf                    string  `json:"as_of"`
	VCPUSecond              float64 `json:"vcpu_second"`
	GiBSecond               float64 `json:"gib_second"`
	PerMillionRequests      float64 `json:"per_million_requests"`
	PerGiBEgress            float64 `json:"per_gib_egress"`
	FreeVCPUSeconds         float64 `json:"free_vcpu_seconds"`
	FreeGiBSeconds          float64 `json:"free_gib_seconds"`
	FreeRequests            float64 `json:"free_requests"`
	FreeCreditVCPU          float64 `json:"free_credit_vcpu"` // the free tier's CPU allowance, in USD
	FreeCreditMemory        float64 `json:"free_credit_memory"`
	FreeCreditRequests      float64 `json:"free_credit_requests"`
	BillingStepSeconds      float64 `json:"billing_step_seconds"`
	VCPU                    float64 `json:"vcpu"`
	MemoryGiB               float64 `json:"memory_gib"`
	MaxInstances            int     `json:"max_instances"`
	Concurrency             int     `json:"concurrency"`
	ProbesPerMinute         int     `json:"probes_per_minute"`
	CeilingPerMonth         float64 `json:"ceiling_per_month"` // compute if every instance were busy for 30 days
	InstanceSecondListPrice float64 `json:"instance_second"`   // one instance busy for a second
}

// PriceList is the current price list.
func PriceList() Prices {
	perInstanceSecond := VCPU*PriceVCPUSecond + MemoryGiB*PriceGiBSecond
	return Prices{
		AsOf:                    PricesAsOf,
		VCPUSecond:              PriceVCPUSecond,
		GiBSecond:               PriceGiBSecond,
		PerMillionRequests:      PricePerMillionRequests,
		PerGiBEgress:            PricePerGiBEgress,
		FreeVCPUSeconds:         FreeVCPUSeconds,
		FreeGiBSeconds:          FreeGiBSeconds,
		FreeRequests:            FreeRequests,
		FreeCreditVCPU:          FreeVCPUSeconds * tier1VCPUSecond,
		FreeCreditMemory:        FreeGiBSeconds * tier1GiBSecond,
		FreeCreditRequests:      FreeRequests / 1e6 * PricePerMillionRequests,
		BillingStepSeconds:      BillingStepSeconds,
		VCPU:                    VCPU,
		MemoryGiB:               MemoryGiB,
		MaxInstances:            MaxInstances,
		Concurrency:             Concurrency,
		ProbesPerMinute:         ProbesPerMinute,
		CeilingPerMonth:         MaxInstances * perInstanceSecond * 30 * 24 * 3600,
		InstanceSecondListPrice: perInstanceSecond,
	}
}

// Report is this month's receipt so far, and where the time and money went.
type Report struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
	// The calendar month in UTC (Google's billing month runs on Pacific time, so the bill's month
	// starts eight hours later).
	Start     time.Time `json:"start"`
	End       time.Time `json:"end"`
	Days      float64   `json:"days"`
	MonthDays float64   `json:"month_days"`
	Usage     Usage     `json:"usage"`
	Lines     []Line    `json:"lines"`
	ListPrice float64   `json:"list_price"`
	FreeTier  float64   `json:"free_tier"`
	Bill      float64   `json:"bill"` // list price less the free tier
	// The month so far scaled to the whole month; zero before a full day is measured.
	ProjectedListPrice float64 `json:"projected_list_price"`
	ProjectedBill      float64 `json:"projected_bill"`
	// List price per 10,000 requests, at this month's mix of traffic.
	PerTenThousand float64 `json:"per_ten_thousand"`
	// Instance time billed per request: each lone request is billed at least BillingStepSeconds.
	BilledSecondsPerRequest float64 `json:"billed_seconds_per_request"`
	// Requests from the site's own uptime checks this month (ProbesPerMinute since the month began),
	// their share of all requests, and roughly how much of the billed time they account for.
	ProbeRequests    float64   `json:"probe_requests"`
	ProbeShare       float64   `json:"probe_share"`
	ProbeBilledShare float64   `json:"probe_billed_share"`
	Prices           Prices    `json:"prices"`
	Updated          time.Time `json:"updated"`
	// Set when the latest read failed and this is the last good report.
	Stale bool `json:"stale,omitempty"`
}

// Estimate prices usage measured from start to now, in the month that starts at start.
func Estimate(u Usage, start, now time.Time) Report {
	monthEnd := start.AddDate(0, 1, 0)
	r := Report{
		Available: true,
		Start:     start.UTC(),
		End:       now.UTC(),
		Days:      now.Sub(start).Hours() / 24,
		MonthDays: monthEnd.Sub(start).Hours() / 24,
		Usage:     u,
		Prices:    PriceList(),
		Updated:   now.UTC(),
	}
	r.Lines = lines(u)
	r.ListPrice, r.FreeTier = totals(r.Lines)
	r.Bill = r.ListPrice - r.FreeTier
	if r.Days >= 1 {
		scale := r.MonthDays / r.Days
		projected := Usage{
			Requests:        int64(math.Round(float64(u.Requests) * scale)),
			BillableSeconds: u.BillableSeconds * scale,
			VCPUSeconds:     u.VCPUSeconds * scale,
			GiBSeconds:      u.GiBSeconds * scale,
			EgressBytes:     int64(math.Round(float64(u.EgressBytes) * scale)),
		}
		list, free := totals(lines(projected))
		r.ProjectedListPrice, r.ProjectedBill = list, list-free
	}
	if u.Requests > 0 {
		r.PerTenThousand = r.ListPrice / float64(u.Requests) * 10_000
		r.BilledSecondsPerRequest = u.BillableSeconds / float64(u.Requests)
		r.ProbeRequests = math.Min(float64(ProbesPerMinute)*now.Sub(start).Minutes(), float64(u.Requests))
		r.ProbeShare = r.ProbeRequests / float64(u.Requests)
	}
	if u.BillableSeconds > 0 {
		r.ProbeBilledShare = math.Min(1, r.ProbeRequests*BillingStepSeconds/u.BillableSeconds)
	}
	return r
}

// lines prices each kind of usage and how much of it the free tier covers. The free tier is a
// dollar allowance (its quantities at Tier 1 prices), so here it covers up to that many dollars.
func lines(u Usage) []Line {
	p := PriceList()
	cpu := u.VCPUSeconds * PriceVCPUSecond
	mem := u.GiBSeconds * PriceGiBSecond
	req := float64(u.Requests) / 1e6 * PricePerMillionRequests
	egressGiB := float64(u.EgressBytes) / gib
	return []Line{
		{Item: "CPU", Quantity: u.VCPUSeconds, Unit: "vCPU-seconds", Price: PriceVCPUSecond, Cost: cpu, Free: math.Min(cpu, p.FreeCreditVCPU)},
		{Item: "Memory", Quantity: u.GiBSeconds, Unit: "GiB-seconds", Price: PriceGiBSecond, Cost: mem, Free: math.Min(mem, p.FreeCreditMemory)},
		{Item: "Requests", Quantity: float64(u.Requests), Unit: "requests", Price: PricePerMillionRequests / 1e6, Cost: req, Free: math.Min(req, p.FreeCreditRequests)},
		{Item: "Data to the internet", Quantity: egressGiB, Unit: "GiB", Price: PricePerGiBEgress, Cost: egressGiB * PricePerGiBEgress},
	}
}

func totals(ls []Line) (list, free float64) {
	for _, l := range ls {
		list += l.Cost
		free += l.Free
	}
	return list, free
}

// MonthStart is the start of now's calendar month in UTC.
func MonthStart(now time.Time) time.Time {
	now = now.UTC()
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
}

// Source reports the service's usage between start and end.
type Source interface {
	Usage(ctx context.Context, start, end time.Time) (Usage, error)
}

type Service struct {
	src Source
	log *slog.Logger
	now func() time.Time

	mu   sync.Mutex
	last Report
	next time.Time
}

// New returns a service that reads from src; a nil src means there is nothing to measure here
// (anywhere but Cloud Run), and the report carries only the price list.
func New(src Source, log *slog.Logger) *Service {
	return &Service{src: src, log: log, now: time.Now}
}

func unavailable(reason string) Report {
	return Report{Reason: reason, Lines: []Line{}, Prices: PriceList()}
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
	// Shared by every caller waiting on it, so it gets its own deadline rather than the first
	// caller's.
	fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
	defer cancel()
	start := MonthStart(now)
	u, err := s.src.Usage(fctx, start, now)
	if err != nil {
		s.log.Warn("cost: could not read usage", "err", err)
		s.next = now.Add(retryAfter)
		if s.last.Available {
			s.last.Stale = true
			return s.last
		}
		s.last = unavailable("Usage is unavailable right now.")
		return s.last
	}
	s.last = Estimate(u, start, now)
	s.next = now.Add(cacheFor)
	return s.last
}
