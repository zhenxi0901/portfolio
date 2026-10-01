variable "project_id" {
  description = "GCP project to deploy into."
  type        = string
}

variable "region" {
  description = "Cloud Run and Artifact Registry region."
  type        = string
  default     = "asia-southeast1"
}

variable "image" {
  description = "Initial container image. CI replaces it on every deploy."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "max_instances" {
  description = "Upper bound on Cloud Run instances, which also caps cost."
  type        = number
  default     = 3
}

variable "allowed_origins" {
  description = "Origins allowed to call /api (for example a GitHub Pages copy of the site)."
  type        = list(string)
  default     = ["https://zhenxi0901.github.io"]
}

variable "github_repo" {
  description = "owner/name of the repository allowed to deploy."
  type        = string
  default     = "zhenxi0901/portfolio"
}

variable "enable_contact_webhook" {
  description = "Forward contact-form messages to the webhook in the portfolio-contact-webhook secret. Add a secret version first: Cloud Run will not start a revision that reads an empty secret."
  type        = bool
  default     = false
}

variable "enable_llm" {
  description = "Wire an OpenAI-compatible LLM into the Ask console (key goes in Secret Manager)."
  type        = bool
  default     = false
}

variable "llm_base_url" {
  type    = string
  default = ""
}

variable "llm_model" {
  type    = string
  default = ""
}
