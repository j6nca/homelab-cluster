# CLAUDE.md

## Purpose

A personal homelab Kubernetes cluster managed via GitOps. Used for learning and running self-hosted apps (media, observability, identity, AI tooling, etc.).

## Tech stack

- **GitOps**: Flux (flux-operator + flux-instance pattern), version pinned in `.tool-versions`
- **Manifests**: Kustomize overlays referencing reusable base modules
- **Secrets**: External Secrets Operator backed by 1Password Connect
- **Networking / ingress**: Envoy Gateway, Istio, Cloudflare Tunnel, external-dns
- **Storage**: Longhorn, CSI NFS, Volsync (backup/restore)
- **Databases**: CloudNativePG, Dragonfly
- **Observability**: Victoria Metrics k8s stack, Victoria Logs, Grafana Operator, Gatus, Goldpinger
- **Policy**: Gatekeeper, OPA
- **Identity**: Authentik

## Structure

- `apps/base/` — reusable per-app Kustomize bases (HelmRelease + resources)
- `clusters/homelab/apps/` — per-cluster overlays that wire bases into namespaces
- `clusters/homelab/repos/` — Flux `HelmRepository` (`helm/`) and `OCIRepository` (`oci/`) sources
- `components/` — shared building blocks (e.g. `postgres`, `dragonfly`) composed into apps
- `dashboards/` — Grafana dashboards organized by domain (kubernetes, observability, storage, fitness, system)
- `apps/base/flux-system/` — Flux operator + instance + monitoring bootstrap

## Conventions

- Each app base has `kustomize.yaml` defining Flux `Kustomization`(s) with explicit `dependsOn` chains; the cluster overlay only adds namespace + common labels
- Helm charts are pulled via Flux `HelmRepository`/`OCIRepository` defined in `clusters/homelab/repos/`, then referenced by `HelmRelease` in `apps/base/<app>/release/`
- Secrets never committed: managed through ExternalSecret resources pulling from 1Password Connect
- Renovate + a scheduled GitHub Action (`.github/workflows/update_flux.yaml`) keep Flux components current via PRs
