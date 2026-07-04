#!/usr/bin/env python3
"""Render every manifest the Flux cluster graph would apply.

Mimics kustomize-controller's behavior starting from the cluster sync path
(clusters/homelab): directories containing a kustomization.yaml are built as
kustomize roots (with LoadRestrictionsNone, matching Flux); loose YAML files
are included as-is. Flux Kustomization CRs discovered along the way have
their spec.path built too, recursively, until the whole graph is rendered.

With --helm, HelmReleases are additionally rendered via `helm template`,
resolving charts from the HelmRepository/OCIRepository sources defined in
the repo.

Secret data/stringData values are always masked, so output is safe to post
in PR comments and CI logs.

Usage:
  render-manifests.py [--helm] [--output-dir DIR] [REPO_ROOT]

Without --output-dir, prints a single YAML stream to stdout. With it, writes
one file per render root (stable names) for easy directory diffing.
"""

import argparse
import pathlib
import shutil
import subprocess
import sys
import tempfile

import yaml

SYNC_PATH = "clusters/homelab"
KUBE_VERSION = "1.33.0"
KUSTOMIZATION_FILES = {"kustomization.yaml", "kustomization.yml", "Kustomization"}


def run(cmd: list[str]) -> str:
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"$ {' '.join(cmd)}\n{res.stderr.strip()}")
    return res.stdout


def kustomize_build(path: pathlib.Path) -> str:
    if shutil.which("kustomize"):
        return run(["kustomize", "build", "--load-restrictor=LoadRestrictionsNone", str(path)])
    return run(["kubectl", "kustomize", "--load-restrictor=LoadRestrictionsNone", str(path)])


def load_docs(text: str) -> list[dict]:
    try:
        return [d for d in yaml.safe_load_all(text) if isinstance(d, dict)]
    except yaml.YAMLError as err:
        raise RuntimeError(f"invalid YAML: {err}") from err


def mask_secrets(docs: list[dict]) -> list[dict]:
    for doc in docs:
        if doc.get("kind") == "Secret":
            for field in ("data", "stringData"):
                if isinstance(doc.get(field), dict):
                    doc[field] = {k: "**MASKED**" for k in doc[field]}
    return docs


def discover_sync_root(root: pathlib.Path, errors: list[str]) -> dict[str, list[dict]]:
    """Emulate Flux's generated kustomization at the sync path."""
    rendered: dict[str, list[dict]] = {}

    def walk(d: pathlib.Path) -> None:
        if {p.name for p in d.iterdir()} & KUSTOMIZATION_FILES:
            try:
                rendered[str(d)] = load_docs(kustomize_build(d))
            except RuntimeError as err:
                errors.append(str(err))
            return
        loose: list[dict] = []
        for p in sorted(d.iterdir()):
            if p.is_dir():
                walk(p)
            elif p.suffix in (".yaml", ".yml"):
                try:
                    loose.extend(load_docs(p.read_text()))
                except RuntimeError as err:
                    errors.append(f"{p}: {err}")
        if loose:
            rendered[str(d)] = loose

    walk(root)
    return rendered


def is_flux_kustomization(doc: dict) -> bool:
    return doc.get("kind") == "Kustomization" and str(doc.get("apiVersion", "")).startswith(
        "kustomize.toolkit.fluxcd.io"
    )


def render_graph(repo: pathlib.Path, errors: list[str]) -> tuple[dict[str, list[dict]], dict[str, str]]:
    """Render the sync root, then every Flux Kustomization spec.path (recursively).

    Returns (rendered docs per root, helm namespace per root) where the
    namespace map records each root's Flux targetNamespace for helm rendering.
    """
    rendered = {
        f"sync/{k.removeprefix(str(repo) + '/')}": v
        for k, v in discover_sync_root(repo / SYNC_PATH, errors).items()
    }
    namespaces: dict[str, str] = {}
    seen_paths: set[str] = set()

    while True:
        pending: list[tuple[str, str]] = []  # (spec.path, targetNamespace)
        for docs in rendered.values():
            for doc in docs:
                if is_flux_kustomization(doc):
                    path = doc.get("spec", {}).get("path", "").strip("/").removeprefix("./")
                    if path and path not in seen_paths:
                        pending.append((path, doc["spec"].get("targetNamespace", "default")))
                        seen_paths.add(path)
        if not pending:
            return rendered, namespaces
        for path, namespace in pending:
            key = f"ks/{path}"
            namespaces[key] = namespace
            target = repo / path
            if not target.is_dir():
                errors.append(f"Flux Kustomization spec.path does not exist: {path}")
                continue
            try:
                rendered[key] = load_docs(kustomize_build(target))
            except RuntimeError as err:
                errors.append(str(err))


def collect_helm_sources(rendered: dict[str, list[dict]]) -> dict[tuple[str, str], dict]:
    sources = {}
    for docs in rendered.values():
        for doc in docs:
            if doc.get("kind") in ("HelmRepository", "OCIRepository"):
                sources[(doc["kind"], doc["metadata"]["name"])] = doc
    return sources


def helm_template(hr: dict, sources: dict, namespace: str) -> str:
    spec = hr["spec"]
    name = hr["metadata"]["name"]
    args = ["helm", "template", name]

    if "chartRef" in spec:
        ref = spec["chartRef"]
        src = sources.get((ref["kind"], ref["name"]))
        if src is None:
            raise RuntimeError(f"HelmRelease {name}: unknown chartRef {ref['kind']}/{ref['name']}")
        src_ref = src["spec"]["ref"]
        version = src_ref.get("tag") or src_ref.get("semver")
        if version is None:
            raise RuntimeError(f"HelmRelease {name}: OCIRepository {ref['name']} has no ref.tag/ref.semver")
        args += [src["spec"]["url"], "--version", str(version)]
    else:
        chart_spec = spec["chart"]["spec"]
        src_ref = chart_spec["sourceRef"]
        src = sources.get((src_ref["kind"], src_ref["name"]))
        if src is None:
            raise RuntimeError(f"HelmRelease {name}: unknown sourceRef {src_ref['kind']}/{src_ref['name']}")
        url = src["spec"]["url"]
        if url.startswith("oci://"):
            args += [f"{url.rstrip('/')}/{chart_spec['chart']}", "--version", str(chart_spec["version"])]
        else:
            args += [chart_spec["chart"], "--repo", url, "--version", str(chart_spec["version"])]

    if "valuesFrom" in spec:
        print(f"warning: HelmRelease {name} uses valuesFrom; rendering with inline values only", file=sys.stderr)

    args += ["--namespace", namespace, "--kube-version", KUBE_VERSION, "--include-crds"]
    with tempfile.NamedTemporaryFile("w", suffix=".yaml") as f:
        yaml.safe_dump(spec.get("values", {}), f)
        f.flush()
        try:
            return run(args + ["--values", f.name])
        except RuntimeError as err:
            # Flux's semver matching tolerates a leading v where helm's OCI tag
            # lookup wants the literal tag (and vice versa) — retry toggled.
            version_idx = args.index("--version") + 1
            version = args[version_idx]
            if "not found" not in str(err):
                raise
            args[version_idx] = version.lstrip("v") if version.startswith("v") else f"v{version}"
            return run(args + ["--values", f.name])


def render_helm(rendered: dict[str, list[dict]], namespaces: dict[str, str], errors: list[str]) -> dict[str, list[dict]]:
    sources = collect_helm_sources(rendered)
    out: dict[str, list[dict]] = {}
    for root, docs in sorted(rendered.items()):
        for doc in docs:
            if doc.get("kind") == "HelmRelease" and str(doc.get("apiVersion", "")).startswith("helm.toolkit.fluxcd.io"):
                namespace = doc.get("metadata", {}).get("namespace") or namespaces.get(root, "default")
                key = f"helm/{namespace}/{doc['metadata']['name']}"
                try:
                    out[key] = load_docs(helm_template(doc, sources, namespace))
                except RuntimeError as err:
                    errors.append(f"{key}: {err}")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo", nargs="?", default=".", help="repo root (default: cwd)")
    parser.add_argument("--helm", action="store_true", help="also render HelmReleases via helm template")
    parser.add_argument("--output-dir", help="write one file per render root instead of stdout")
    args = parser.parse_args()

    repo = pathlib.Path(args.repo).resolve()
    errors: list[str] = []
    rendered, namespaces = render_graph(repo, errors)
    if args.helm:
        rendered |= render_helm(rendered, namespaces, errors)

    for root in rendered:
        mask_secrets(rendered[root])

    if args.output_dir:
        out = pathlib.Path(args.output_dir)
        out.mkdir(parents=True, exist_ok=True)
        for root, docs in sorted(rendered.items()):
            path = out / (root.replace("/", "__") + ".yaml")
            path.write_text(yaml.safe_dump_all(docs, sort_keys=True))
    else:
        for root, docs in sorted(rendered.items()):
            sys.stdout.write(f"# --- render root: {root}\n")
            sys.stdout.write(yaml.safe_dump_all(docs, sort_keys=True))
            sys.stdout.write("\n")

    if errors:
        print(f"\n{len(errors)} render error(s):", file=sys.stderr)
        for err in errors:
            print(f"--- {err}", file=sys.stderr)
        return 1
    print(f"rendered {len(rendered)} roots OK", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
