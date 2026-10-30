#!/usr/bin/env python3
"""Validate Grafana dashboard JSON files without requiring a running Grafana instance."""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1] / "dashboards"
errors = []
files = sorted(ROOT.rglob("*.json"))
uids = {}
for path in files:
    rel = path.relative_to(ROOT)
    try:
        with path.open(encoding="utf-8") as stream:
            doc = json.load(stream)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"{rel}: invalid JSON: {exc}")
        continue
    if not isinstance(doc, dict):
        errors.append(f"{rel}: dashboard root must be an object")
        continue
    # Community/exported dashboards sometimes wrap the model in a dashboard key.
    model = doc.get("dashboard", doc)
    if not isinstance(model, dict):
        errors.append(f"{rel}: dashboard model must be an object")
        continue
    if not isinstance(model.get("title"), str) or not model["title"].strip():
        errors.append(f"{rel}: missing nonempty dashboard title")
    panels = model.get("panels")
    if not isinstance(panels, list):
        errors.append(f"{rel}: panels must be an array")
    else:
        ids = set()
        def inspect(items):
            for panel in items:
                if not isinstance(panel, dict):
                    errors.append(f"{rel}: panel must be an object")
                    continue
                pid = panel.get("id")
                if pid is not None:
                    if not isinstance(pid, int) or isinstance(pid, bool) or pid in ids:
                        errors.append(f"{rel}: duplicate or invalid panel id {pid!r}")
                    ids.add(pid)
                if panel.get("type") == "row" and isinstance(panel.get("panels"), list):
                    inspect(panel["panels"])
        inspect(panels)
    uid = model.get("uid")
    if uid is not None:
        if not isinstance(uid, str) or not uid.strip():
            errors.append(f"{rel}: uid must be a nonempty string")
        elif uid in uids:
            errors.append(f"{rel}: duplicate uid {uid!r} (also {uids[uid]})")
        else:
            uids[uid] = rel
if not files:
    errors.append("No dashboard JSON files found")
for error in errors:
    print(f"ERROR: {error}", file=sys.stderr)
print(f"Checked {len(files)} Grafana dashboard JSON files; {len(errors)} error(s).")
sys.exit(bool(errors))
