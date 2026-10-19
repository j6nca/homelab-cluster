terraform {
  required_providers {
    github = {
      source = "integrations/github"
    }
    dns = {
      source = "hashicorp/dns"
    }
  }
}
