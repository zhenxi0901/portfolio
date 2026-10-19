# Scheduled checks from GitHub Actions (.github/workflows/synthetic.yml), the follow-up to the
# contact-form postmortem: every hour, read Cloud Run's logs for contact messages that could not be
# delivered; twice a day, send a marked message through the real form and webhook. A failed check
# fails the workflow, and GitHub emails the owner. Alert policies in Cloud Monitoring would do the
# same, but they are billed per condition and this project's budget is S$1 a month.

# Its own identity, so the deployer gains nothing: it can read logs and nothing else.
resource "google_service_account" "watcher" {
  account_id   = "portfolio-watcher"
  display_name = "Portfolio scheduled checks (read-only)"
}

resource "google_service_account_iam_member" "github_impersonates_watcher" {
  service_account_id = google_service_account.watcher.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

resource "google_project_iam_member" "watcher_reads_logs" {
  project = var.project_id
  role    = "roles/logging.viewer"
  member  = "serviceAccount:${google_service_account.watcher.email}"
}

# The synthetic check proves itself with this token, so its message is posted silently and marked
# as a check. Terraform creates the empty secret; add a version yourself (README), then set
# enable_synthetic_check.
resource "google_secret_manager_secret" "synthetic_token" {
  secret_id = "portfolio-contact-synthetic-token"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "runtime_reads_synthetic_token" {
  secret_id = google_secret_manager_secret.synthetic_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

output "watcher_sa" {
  description = "Set as the WATCHER_SA repository secret."
  value       = google_service_account.watcher.email
}
