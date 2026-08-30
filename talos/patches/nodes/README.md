# Per-node patches

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

`talosconfig` can hold hostnames instead of IPs, and on this cluster that
works without any patch: Talos manages certificate SANs itself and already
includes each node's addresses and name. Verify rather than assume, since it
is one command:

```bash
talosctl -n <ip> get certsans
talosctl -e k-controlplane-1 -n k-worker-2 version
```

Then point `talosconfig` at the names:

```bash
talosctl config endpoint k-controlplane-1
talosctl config node k-worker-1 k-worker-2 k-worker-3
```

`machine.certSANs` is only needed for names Talos cannot know about — an
external DNS name, a load balancer VIP, an address reached from outside the
cluster. Adding one here is what produces

```
x509: certificate is valid for <ip>, not <name>
```

for that name and not for the node's own. Worth knowing which case you are in
before reaching for it, because the error is identical either way.

Two details that make hostnames behave unevenly if only half of it is set up:

- `-e` names are resolved by **your workstation**; `-n` names are resolved by
  **the endpoint node**, since that is what proxies the request onward. A name
  your laptop resolves can still fail if the control plane cannot. Check with
  `talosctl -n <ip> get resolvers`.
- Both hops validate certificates independently, so a failure on one says
  nothing about the other. `-e <name> -n <ip>` and `-e <ip> -n <name>` isolate
  them.

## Applying

Node patches target one node, so the `-n` is the whole point — a node patch
applied to every node is usually wrong in a way nothing complains about:

```bash
talosctl -n <node> patch mc --patch @talos/patches/nodes/<node>/labels.yaml
kubectl get nodes --show-labels
```

Labels apply immediately -- they are a Kubernetes write, not a machine change.
Patches that touch the kernel are not: `machine.kernel.modules` needs a reboot
and is refused in immediate mode, so `--mode=try` fails there with "this config
change can't be applied in immediate mode". Check with `--dry-run` first; it
says whether a reboot is required before anything is written.

Cluster-wide settings belong in `../global/` instead.

## New nodes

Add a directory with a stub `labels.yaml` when the node is built, not when it
first needs a label. An absent directory reads as "this node does not exist"
rather than "nobody got round to it".
