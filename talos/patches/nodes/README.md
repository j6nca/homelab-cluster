# Per-node patches

One directory per node, named for the node. A node gets a directory whether or
not it has anything unusual about it, so "what is applied where" is answered by
reading this tree rather than by querying a cluster that may not be reachable
when the question comes up.

| Node | Labels | Notes |
|---|---|---|
| `k-controlplane-1` | — | |
| `k-worker-1` | — | |
| `k-worker-2` | — | |
| `k-worker-3` | — | |

Keep the table current when a label is declared. A stub whose comments claim
nothing and a table row that says `—` are both easy to trust; a table that has
quietly gone stale is worse than no table.

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
