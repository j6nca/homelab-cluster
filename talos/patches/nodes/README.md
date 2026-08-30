# Per-node patches

One directory per node, named for the node. Each holds `labels.yaml` (what
this node is *for*) and `certsans.yaml` (what names its API certificate
answers to).

One directory per node, named for the node. A node gets a directory whether or
not it has anything unusual about it, so "what is applied where" is answered by
reading this tree rather than by querying a cluster that may not be reachable
when the question comes up.

| Node | Labels | Notes |
|---|---|---|
| `k-controlplane-1` | — | |
| `k-worker-1` | — | |
| `k-worker-2` | `zigbee=true` | Zigbee coordinator; home-assistant pins here |
| `k-worker-3` | — | |

Keep the table current when a label is declared. A stub whose comments claim
nothing and a table row that says `—` are both easy to trust; a table that has
quietly gone stale is worse than no table.

## Addressing nodes by name

`talosconfig` can hold hostnames instead of IPs, but three things have to line
up and only one of them is DNS:

1. **The name resolves** from wherever `talosctl` runs.
2. **The name is in that node's `certSANs`** — see `certsans.yaml`. Without it
   the TLS handshake fails with `x509: certificate is valid for <ip>, not
   <hostname>`. A certificate is issued for what was listed when it was
   issued, so this is not something DNS can paper over.
3. **`talosconfig` is updated** to use the names.

Order matters: patch `certSANs` and confirm with `talosctl get certsans`
*before* switching `talosconfig` over, or the next command fails and the
error points at the certificate rather than at the step that was skipped.

```bash
talosctl --talosconfig ~/.talos/config config endpoint k-controlplane-1
talosctl --talosconfig ~/.talos/config config node k-worker-1 k-worker-2 k-worker-3
talosctl version                                   # proves all three
```

Keep the IPs in `certSANs` alongside the names. Removing them means a DNS
outage takes the Talos API with it, which is when it is most wanted.

## Applying

Node patches target one node, so the `-n` is the whole point — a node patch
applied to every node is usually wrong in a way nothing complains about:

```bash
talosctl -n <ip-of-that-node> patch mc --patch @talos/patches/nodes/<node>/labels.yaml
kubectl get nodes --show-labels
```

Cluster-wide settings belong in `../global/` instead.

## New nodes

Add a directory with a stub `labels.yaml` when the node is built, not when it
first needs a label. An absent directory reads as "this node does not exist"
rather than "nobody got round to it".
