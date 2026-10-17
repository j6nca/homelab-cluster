output "urls" {
  value = { for repo, pages in github_repository_pages.site : repo => pages.html_url }
}
