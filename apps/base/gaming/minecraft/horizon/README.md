# Horizon Minecraft server

Horizon is deployed through Flux using the `thanoslabs/generic` Helm chart.

## Startup and preparation

The HelmRelease is active. The server uses `ghcr.io/thanoslabs/horizon-server:0.0.2` and the init container uses `ghcr.io/thanoslabs/horizon-prepare:0.0.1` (Java 25).

The preparation init container uses the Minecraft 26.3 server JAR and client files already on the NAS, checks the prepared resources and, if absent, runs `horizon-prepare` with Java 25. It writes to `/opt/horizon/resources`, which is the server's working-directory `resources/` path, and the same PVC is mounted there in both containers. The server starts only after preparation passes `--check`. Java is not present in the server runtime. **Separate blocker:** `horizon-server:0.0.2` may contain the supervisor without the required `horizon-engine` binary; verify the image contents and update this HelmRelease if that is still true.

**All Minecraft inputs are supplied on the NAS** under the `ROMS/minecraft` directory:
```text
ROMS/minecraft/
├── client/versions/26.3/26.3.jar
├── client/versions/26.3/26.3.json
├── server/26.3/server.jar
├── assets/
└── libraries/
```
The NAS is mounted read-only at `/minecraft-source` during preparation. The client version is stored under `client/versions/26.3/`, while `assets/` and `libraries/` are at the share root. The init container stages symlinks in its ephemeral work directory to assemble the launcher layout Horizon expects. The NAS is never modified. Supplementary group 988 grants the non-root preparation process read access to the ROMS files. See [Horizon hosting instructions](https://github.com/horizon-rust/horizon/blob/main/docs/hosting.md).

The `horizon-data` PVC is 2Gi and stores world data and server configuration; both client and server installation files stay on the NAS. The `horizon-resources` PVC requests 2Gi for prepared resources and is mounted at `/opt/horizon/resources` in both containers. Preparation scratch space is an ephemeral `emptyDir`. The NAS volume uses `mimir.internal:/var/nfs/shared/ROMS/minecraft`, following the Mimir export paths used elsewhere in the cluster. The `ROMS` export is mounted read-only and is used only by the preparation init container. A pre-existing 500Mi Longhorn claim may require an explicit expansion after applying the updated request.

Review and accept the [Minecraft EULA](https://aka.ms/MinecraftEULA) before running this configuration; `HORIZON_EULA=true` is set. The whitelist defaults to enabled with no pre-authorized users; add Minecraft account names through Horizon's documented commands.

The AI node `k-worker-ai-1` has the `ai=true` label. Required node affinity excludes every node with that label, independently of whether the AI taint is present. Regular workers remain eligible.

The Minecraft service is a MetalLB-backed **LoadBalancer** with internal DNS name **`smp.j6n.internal`** on TCP **25565**. The UniFi external-dns provider watches annotated LoadBalancer Services and updates the LAN record when the assigned IP changes. This is not a public route. A TCP probe checks port availability, not game-level health. Keep regular world backups and test restore procedures before inviting players.
