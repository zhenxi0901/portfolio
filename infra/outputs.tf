output "url" {
  description = "Public URL of the Cloud Run service."
  value       = google_cloud_run_v2_service.portfolio.uri
}

output "wif_provider" {
  description = "Set as the WIF_PROVIDER repository variable."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_sa" {
  description = "Set as the DEPLOYER_SA repository variable."
  value       = google_service_account.deployer.email
}

output "image_repository" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.portfolio.repository_id}/site"
}
