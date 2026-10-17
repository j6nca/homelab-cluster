output "urls" {
  value = merge(module.thanoslabs.urls, module.j6nca.urls)
}
