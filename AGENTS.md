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
- New user-facing services are registered on homepage and gatus by annotating their `HTTPRoute`, never by editing either app's config — see Dashboard registration below

## Dashboard registration

Every user-facing service is registered on both dashboards through annotations on its `HTTPRoute` — never by editing homepage's or gatus's own config. Both discover cluster-wide and are annotation-gated, so a route carrying the block below appears on both without touching either app.

- **Gatus**: a `gatus-sidecar` container (`ghcr.io/home-operations/gatus-sidecar`, run with `--enable-service --enable-httproute`) watches Services and HTTPRoutes and writes `/dynamic-config/gatus-sidecar.yaml`; gatus merges every yaml in that directory with its static config
- **Homepage**: homepage 2.1.x gateway-api discovery reads `gethomepage.dev/*` off HTTPRoutes, via a cluster-scoped read-only ClusterRole

Canonical block for a new internal route:

```yaml
metadata:
  annotations:
    gatus.home-operations.com/enabled: "true"
    # Discovered by homepage from this route; group mirrors the gatus
    # endpoint below, so the two dashboards stay in step.
    gethomepage.dev/enabled: "true"
    gethomepage.dev/name: Bazarr
    gethomepage.dev/group: Media
    gethomepage.dev/icon: bazarr.png
    # Without this homepage looks for app.kubernetes.io/name=<the
    # display name above> and renders 'not found' when it misses.
    gethomepage.dev/pod-selector: app.kubernetes.io/instance=bazarr
    # sidecar defaults HTTPRoutes to https; envoy-internal is http-only
    gatus.home-operations.com/endpoint: |
      group: Media
      url: http://bazarr.j6n.internal
```

Failure modes worth knowing, each of which renders a healthy service as broken or absent:

- `gethomepage.dev/pod-selector` is not optional. Omit it and homepage falls back to `app.kubernetes.io/name=<display name>`, which misses whenever the display name is not the chart name (`qBittorrent` vs `qbittorrent`, `LiteLLM` vs `litellm`) and renders 'not found'
- `gatus.home-operations.com/endpoint` is required on `envoy-internal` routes: the sidecar defaults to `https` and `envoy-internal` has no TLS listener, so a discovered endpoint without the override reports permanently down
- `gethomepage.dev/group` should match a key in homepage's `layout` (`apps/base/homepage/release/configmap.yaml`) — unlisted groups still render, just after the listed ones — and should equal the gatus `group:` so the two dashboards agree
- The route only registers the tile. Widgets that pull live data (queue depth, disk usage) are separate config and generally need an API key via ExternalSecret — a tile can render fine while its widget is unconfigured
