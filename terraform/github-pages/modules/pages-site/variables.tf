variable "target" {
  description = "The owner's Pages host every domain must CNAME to, e.g. thanoslabs.github.io."
  type        = string
}

variable "sites" {
  description = "Repository name => the custom domain its Pages site serves on."
  type = map(object({
    domain         = string
    https_enforced = optional(bool, false)
  }))
}
