# Talos machine configuration

Everything here configures the **nodes**, not the cluster running on them.
Nothing in this directory is applied by Flux — `clusters/homelab` is the only
path Flux syncs. These files are applied with `talosctl`, by a person, and are
versioned so that a rebuild does not depend on remembering what was done by
hand.

## Layout

```
talos/
  patches/
    global/     applied to every node
    nodes/      applied to specific nodes
  secrets/      SOPS-encrypted; see below
```

`patches/global` is the default. Prefer it unless a patch genuinely cannot
apply everywhere: a node-scoped patch means a node has to be prepared before
it can take on a role, which turns "move the USB stick" into "patch a node,
wait for it to settle, then move the USB stick".

The zigbee pair shows where the line falls. `global/zigbee-usb.yaml` loads the
serial drivers on every node, so any of them *could* host the coordinator —
harmless where no dongle exists. `nodes/k-worker-2/labels.yaml` says which
one actually does, and would be actively wrong applied everywhere: the scheduler
would be free to place Home Assistant on a machine with no radio.

## Node labels

Labels go in `machine.nodeLabels` here rather than being applied with
`kubectl label`, so a rebuilt node comes back already carrying them instead of
a workload sitting `Pending` until someone remembers the command. Once a label
is declared here Talos owns it — one added out of band gets reconciled away.

Talos writes them using the node's own kubelet identity, so the
NodeRestriction admission plugin applies. It rejects the
`node-restriction.kubernetes.io/` and `node-role.kubernetes.io/` prefixes,
which is why node roles cannot be set this way. Bare keys are unaffected.

## Applying

```bash
talosctl -n <node-ip> patch mc --patch @talos/patches/global/<file>.yaml
```

Patches are additive against the running config. Confirm the result rather
than assuming — a patch that parses is not a patch that did what you meant:

```bash
talosctl -n <node-ip> get machineconfig -o yaml
talosctl -n <node-ip> dmesg | tail
```

## Secrets

Not committed in the clear. Two things need protecting, and neither is a
Kubernetes secret:

| File | What it is | Why it matters |
|---|---|---|
| `secrets/talosconfig.sops.yaml` | client credentials | full Talos API access to every node |
| `secrets/talsecret.sops.yaml` | cluster CA keys, bootstrap tokens | reissues node certificates; joins new nodes |

These are encrypted with [SOPS](https://github.com/getsops/sops) and an
[age](https://github.com/FiloSottile/age) key.

**This is deliberately separate from how the cluster gets its secrets.**
Workloads use External Secrets against 1Password, and that stays. SOPS here is
at-rest protection for files a human decrypts locally before running
`talosctl` — Flux never reads them, so no `decryption` provider is configured
on any Kustomization and no age key needs to exist inside the cluster. Adding
one would mean a second secret path in the cluster earning its keep only for
files the cluster never reads.

### Setting it up

```bash
age-keygen -o ~/.config/sops/age/keys.txt     # keep this OUT of the repo
grep 'public key' ~/.config/sops/age/keys.txt # -> age1...
```

Then `.sops.yaml` at the repo root, so encryption rules apply by path rather
than being remembered per command:

```yaml
creation_rules:
  - path_regex: talos/secrets/.*\.sops\.yaml$
    age: age1...
```

```bash
sops --encrypt --in-place talos/secrets/talosconfig.sops.yaml
sops talos/secrets/talosconfig.sops.yaml     # edit in place, re-encrypts on save
```

Losing the age key means losing the ability to reissue node certificates.
Back it up somewhere that is not this repository — 1Password is the obvious
place given it already holds everything else.
