# Horizon Minecraft server

Horizon is deployed through Flux using the `thanoslabs/generic` Helm chart.

## Before enabling

The HelmRelease is intentionally **suspended** until these dependencies are satisfied:

1. Merge [thanoslabs/containers#3](https://github.com/thanoslabs/containers/pull/3), confirm its image build and release, then pin the published image by its digest.
2. Prepare Minecraft Java Edition 26.3 game resources from a legitimately owned copy, following [Horizon hosting instructions](https://github.com/horizon-rust/horizon/blob/main/docs/hosting.md). Populate the `horizon-resources` Longhorn PVC with the prepared 26.3 directory contents. It is mounted read-only in the server pod.
3. Confirm you accept the Minecraft EULA. The manifest sets `HORIZON_EULA=true` to initialize the server.
4. Confirm that the MetalLB `lan` pool has a free address and the UniFi internal DNS provider resolves `horizon.j6n.internal` to it. Do not expose Horizon's admin panel/API.
5. Unsuspend the HelmRelease after verification.

The `horizon-data` PVC starts at **2Gi** and stores world data and `server.toml`. The server initializes this configuration only on first start; later changes should preserve the existing file. The whitelist is enabled by default with no pre-authorized users; add Minecraft account names using Horizon's documented whitelist commands.

The AI node `k-worker-ai-1` has the `ai=true` label. Required node affinity excludes every node with that label, independently of whether the AI taint is present. Regular workers remain eligible.

The Minecraft service is a MetalLB-backed **LoadBalancer** with internal DNS name **`horizon.j6n.internal`** on TCP **25565**. The UniFi external-dns provider watches annotated LoadBalancer Services and updates the LAN record when the assigned IP changes. This is not a public route. A TCP probe checks port availability, not game-level health. Keep regular world backups and test restore procedures before inviting players.
