# Outside-in availability for the site's own SLO (99.9% over 30 days). Google probes /api/health
# every minute from Singapore, Belgium and Oregon; the API reads the results back for /api/slo.
# About 130,000 checks a month, inside Cloud Monitoring's free allowance.

resource "google_monitoring_uptime_check_config" "site" {
  display_name     = "portfolio /api/health"
  timeout          = "10s"
  period           = "60s"
  selected_regions = ["ASIA_PACIFIC", "EUROPE", "USA_OREGON"]

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = trimprefix(google_cloud_run_v2_service.portfolio.uri, "https://")
    }
  }

  depends_on = [google_project_service.apis]
}

# Read-only access to the check results, for /api/slo. The runtime identity has no other project role.
resource "google_project_iam_member" "runtime_reads_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}
