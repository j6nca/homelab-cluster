# Horizon Minecraft server

Horizon is deployed through Flux using the `thanoslabs/generic` Helm chart.

## Startup and preparation

The HelmRelease is active. The server uses `ghcr.io/thanoslabs/horizon-server:0.0.2` and the init container uses `ghcr.io/thanoslabs/horizon-prepare:0.0.1` (Java 25).

The first init container fetches and SHA-1-verifies the official Minecraft 26.3 server JAR from Mojang's version manifest and caches it at `/data/minecraft/server_26.3.jar`. The second init container checks the prepared resources and, if absent, runs `horizon-prepare` with Java 25. The server starts only after preparation passes `--check`. Java is not present in the server runtime. **Separate blocker:** `horizon-server:0.0.2` currently contains the supervisor but not the required `horizon-engine` binary; rebuild/publish a corrected server image and update this HelmRelease before expecting the server to start.

**Client inputs are not downloaded automatically.** The preparation init container mounts the NAS `ROMS` export read-only at `/minecraft-client`. Before the first successful startup, supply Minecraft 26.3 client installation files directly under that export: `versions/26.3/26.3.jar`, `versions/26.3/26.3.json`, and matching `libraries/` and `assets/` directories from an official launcher installation. See [Horizon hosting instructions](https://github.com/horizon-rust/horizon/blob/main/docs/hosting.md). The init container fails with a clear message until these files exist. The server JAR alone is insufficient.

The `horizon-data` PVC is 2Gi and stores world data, server configuration, and the cached server JAR; the client installation stays on the NAS. The `horizon-resources` PVC requests 2Gi for prepared resources. Preparation scratch space is an ephemeral `emptyDir`. The NAS volume uses the same `nasj6n.home` server as RomM, with an **assumed** NFS export path `/volume2/ROMS`. Verify that path is actually exported/mountable from Kubernetes before merging; update `volumes.minecraft-client.nfs.path` if the real export differs. The `ROMS` export is mounted read-only and is used only by the preparation init container. A pre-existing 500Mi Longhorn claim may require an explicit expansion after applying the updated request.

Review and accept the [Minecraft EULA](https://aka.ms/MinecraftEULA) before running this configuration; `HORIZON_EULA=true` is set. The whitelist defaults to enabled with no pre-authorized users; add Minecraft account names through Horizon's documented commands.

The AI node `k-worker-ai-1` has the `ai=true` label. Required node affinity excludes every node with that label, independently of whether the AI taint is present. Regular workers remain eligible.

The Minecraft service is a MetalLB-backed **LoadBalancer** with internal DNS name **`smp.j6n.internal`** on TCP **25565**. The UniFi external-dns provider watches annotated LoadBalancer Services and updates the LAN record when the assigned IP changes. This is not a public route. A TCP probe checks port availability, not game-level health. Keep regular world backups and test restore procedures before inviting players.
