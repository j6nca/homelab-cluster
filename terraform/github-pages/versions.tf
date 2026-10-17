terraform {
  required_version = ">= 1.9"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
    # read-only lookups to confirm external-dns has published a site's record
    dns = {
      source  = "hashicorp/dns"
      version = "~> 3.6"
    }
  }

  # no backend block: tofu-controller injects a kubernetes backend
  # (Secret tfstate-default-github-pages in flux-system)
}
