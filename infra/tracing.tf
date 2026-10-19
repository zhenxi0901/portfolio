# The Ask API's OpenTelemetry spans go to Cloud Trace (api/internal/tracing). Writing traces is the
# runtime identity's only permission here. The first 2.5 million spans a month are free; an
# answer is about eight spans.
resource "google_project_iam_member" "runtime_writes_traces" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}
