# Intel iGPU (Quick Sync)

Not a machine config patch. Unlike the Zigbee drivers beside this, Intel
graphics support is not a kernel module Talos can be told to load: the driver
and its firmware ship as **system extensions**, which are baked into the
installer image rather than applied to a running system. There is nothing here
Flux or `talosctl patch` can do — the node is upgraded onto a different image.

## Why

Software x264 uses every core for the length of a film and, on the N100, can
encode 4K slower than it plays: the conversion never finishes and the file
reads as broken rather than slow. The same chip has a fixed-function encoder
that will do several 4K streams at a few watts. Without these extensions
`/dev/dri` does not exist on the node and none of it is reachable.

## Schematic

Build one at https://factory.talos.dev, or POST the schematic below, and keep
the id it returns — the id *is* the configuration, and a node upgraded onto a
different one silently loses these.

```yaml
customization:
  systemExtensions:
    officialExtensions:
      # The driver and its firmware. Without this there is no /dev/dri.
      - siderolabs/i915
      # CPU microcode. Not strictly required for the GPU, but Alder Lake-N
      # wants it and it is the same upgrade either way.
      - siderolabs/intel-ucode
```

## Applying

One node at a time. The node reboots.

```sh
talosctl -n <node-ip> upgrade \
  --image factory.talos.dev/installer/<schematic-id>:<talos-version>
```

Then confirm, from the node rather than from a pod:

```sh
talosctl -n <node-ip> ls /dev/dri          # renderD128 and card0 present
talosctl -n <node-ip> dmesg | grep -i i915 # the driver bound
```

`renderD128` is the one that matters. `card0` is the display device and is not
what an encoder uses.

## Then, and only then

The `intel-gpu-plugin` DaemonSet advertises the device to Kubernetes as
`gpu.intel.com/i915`, and a pod asks for it as a resource. Deploying the plugin
before the extensions is harmless — it reports nothing and no pod is affected.

**Adding the resource request to an app before the node advertises it is not
harmless**: the pod becomes unschedulable and the app goes down. Check first:

```sh
kubectl get node <node> -o jsonpath='{.status.capacity}' | tr ',' '\n' | grep i915
```
