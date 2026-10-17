# Fails the plan (lookup error) while external-dns has yet to publish the record
data "dns_cname_record_set" "site" {
  for_each = var.sites

  host = each.value.domain
}

resource "github_repository_pages" "site" {
  for_each = var.sites

  repository     = each.key
  build_type     = "workflow"
  cname          = each.value.domain
  https_enforced = each.value.https_enforced

  lifecycle {
    # GitHub checks the domain when it is set and only issues a certificate
    # if it points here; a proxied or mistargeted record would leave the site
    # stuck without HTTPS
    precondition {
      condition     = trimsuffix(data.dns_cname_record_set.site[each.key].cname, ".") == var.target
      error_message = "${each.value.domain} must be a DNS-only CNAME to ${var.target}; check its DNSEndpoint."
    }
  }
}
