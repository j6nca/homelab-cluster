# All supplied by the github-pages-terraform Secret (ExternalSecret from
# 1Password) through varsFrom on the Terraform CR.

variable "github_app_id" {
  type = string
}

variable "github_app_pem" {
  type      = string
  sensitive = true
}

variable "github_installation_id_thanoslabs" {
  type = string
}

variable "github_installation_id_j6nca" {
  type = string
}
