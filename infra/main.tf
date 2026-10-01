# Cloud Run hosting for the portfolio, plus keyless GitHub deploys.
#   cd infra && terraform init && terraform apply -var project_id=<your-project>

terraform {
  required_version = ">= 1.9"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "secretmanager.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "portfolio" {
  repository_id = "portfolio"
  format        = "DOCKER"
  location      = var.region
  description   = "Portfolio site images"

  # Keep the ten newest images; anything older and untagged is removed.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions { keep_count = 10 }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition { older_than = "2592000s" }
  }
  depends_on = [google_project_service.apis]
}

# The service runs as its own identity with no project roles.
resource "google_service_account" "runtime" {
  account_id   = "portfolio-runtime"
  display_name = "Portfolio Cloud Run runtime"
}

resource "google_secret_manager_secret" "llm_key" {
  count     = var.enable_llm ? 1 : 0
  secret_id = "portfolio-llm-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "runtime_reads_llm_key" {
  count     = var.enable_llm ? 1 : 0
  secret_id = google_secret_manager_secret.llm_key[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# Discord/Slack webhook for contact-form messages. Terraform creates the empty secret and never
# sees the URL: add it as a secret version yourself, then set enable_contact_webhook (README).
resource "google_secret_manager_secret" "contact_webhook" {
  secret_id = "portfolio-contact-webhook"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "runtime_reads_contact_webhook" {
  secret_id = google_secret_manager_secret.contact_webhook.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "portfolio" {
  name                = "portfolio"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 80
    scaling {
      min_instance_count = 0 # scale to zero: a portfolio does not need a warm instance
      max_instance_count = var.max_instances
    }
    containers {
      image = var.image
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "256Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      env {
        name  = "REGION"
        value = var.region
      }
      env {
        name  = "TRUST_PROXY"
        value = "true"
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = join(",", var.allowed_origins)
      }
      dynamic "env" {
        for_each = var.enable_llm ? [1] : []
        content {
          name = "LLM_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.llm_key[0].secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.enable_llm ? { LLM_BASE_URL = var.llm_base_url, LLM_MODEL = var.llm_model } : {}
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.enable_contact_webhook ? [1] : []
        content {
          name = "CONTACT_WEBHOOK_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.contact_webhook.secret_id
              version = "latest"
            }
          }
        }
      }
      startup_probe {
        http_get { path = "/readyz" }
        period_seconds    = 2
        failure_threshold = 10
      }
      liveness_probe {
        http_get { path = "/healthz" }
        period_seconds = 30
      }
    }
  }

  # CI deploys new images by digest; Terraform owns everything else. `gcloud run deploy` also
  # writes a service-level scaling block of zeros (same as unset; the real limits are in
  # template.scaling), which would otherwise show as drift after every deploy.
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version, scaling]
  }
  # A revision that reads a secret fails unless the runtime identity can already read it.
  depends_on = [google_project_service.apis, google_secret_manager_secret_iam_member.runtime_reads_contact_webhook]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.portfolio.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
