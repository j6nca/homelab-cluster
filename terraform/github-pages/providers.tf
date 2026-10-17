# One GitHub App, one installation per account; the provider is bound to a
# single owner, so each account gets its own aliased provider.
provider "github" {
  alias = "thanoslabs"
  owner = "thanoslabs"

  app_auth {
    id              = var.github_app_id
    installation_id = var.github_installation_id_thanoslabs
    pem_file        = var.github_app_pem
  }
}

provider "github" {
  alias = "j6nca"
  owner = "j6nca"

  app_auth {
    id              = var.github_app_id
    installation_id = var.github_installation_id_j6nca
    pem_file        = var.github_app_pem
  }
}
