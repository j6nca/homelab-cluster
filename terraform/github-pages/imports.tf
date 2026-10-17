# Adopt the Pages sites that were configured by hand. Safe to leave in place
# after the first apply: importing an address already in state is a no-op.
import {
  for_each = toset(["nebula-md", "keyboards", "waypoint", "getbud", "fruitless-sessions"])
  to       = module.thanoslabs.github_repository_pages.site[each.key]
  id       = each.key
}

import {
  to = module.j6nca.github_repository_pages.site["helm-charts"]
  id = "helm-charts"
}
