# Custom domains for GitHub Pages sites. Keys are repository names under the
# module's owner, values the domain the site serves on.
#
# The DNS record for each domain is NOT created here: it is a DNSEndpoint in
# apps/base/external-dns/records/github-pages.yaml, published by external-dns.
# Add a site there first (or in the same PR); the plan refuses to point a repo
# at a domain until it resolves to the owner's github.io host.
#
# https_enforced can only be turned on once GitHub has issued the site's
# certificate (minutes to an hour after the domain is set), so new sites start
# without it and get it in a follow-up change.

module "thanoslabs" {
  source = "./modules/pages-site"
  providers = {
    github = github.thanoslabs
  }

  target = "thanoslabs.github.io"
  sites = {
    nebula-md          = { domain = "nebula-md.thanoslabs.org" }
    keyboards          = { domain = "keyboards.thanoslabs.org" }
    waypoint           = { domain = "waypoint.thanoslabs.org" }
    getbud             = { domain = "getbud.thanoslabs.org" }
    fruitless-sessions = { domain = "fruitless-sessions.thanoslabs.org" }
  }
}

module "j6nca" {
  source = "./modules/pages-site"
  providers = {
    github = github.j6nca
  }

  target = "j6nca.github.io"
  sites = {
    helm-charts = { domain = "charts.j6n.dev" }
  }
}
