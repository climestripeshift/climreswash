#!/usr/bin/env python3
"""Assemble (and verify) the cloud package for the research beta from an explicit allowlist. Local only: nothing is uploaded.

    python3 deploy/beta/build_cloud_bundle.py build [--out dist/beta-bundle]   # copy allowlisted files, write MANIFEST.json, then check
    python3 deploy/beta/build_cloud_bundle.py check dist/beta-bundle           # re-verify a bundle (also run before any upload)

The allowlist is the only way a file enters the bundle. The checker then independently refuses the bundle if any path or content
matches a restricted-source, secret, evaluation-set or model-weight pattern. Exit code 0 = clean, 1 = findings.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CORE = "research/bhoomi_ai_core_v0"
REGISTRY_ID = "adapter-B-full2ep-experimental-machine-verified"

# (source relative to the repo, destination relative to the bundle). Directories are copied recursively minus IGNORE.
ALLOW = [
    (f"{CORE}/src", f"{CORE}/src"), (f"{CORE}/config", f"{CORE}/config"), (f"{CORE}/schemas", f"{CORE}/schemas"),
    (f"{CORE}/requirements.txt", f"{CORE}/requirements.txt"),
    # data: only what the 'allowed' / 'allowed_with_attribution' tools read
    ("client/public/data/india_hex_props.json", "client/public/data/india_hex_props.json"),
    ("client/public/data/hex_historical_climatology.json", "client/public/data/hex_historical_climatology.json"),
    # documents the cloud profile may quote (config/agent.json -> cloud.doc_sources_cleared; default METHODOLOGY.md)
    ("METHODOLOGY.md", "METHODOLOGY.md"),
    # beta gateway (+ the production bridge's pure response-shaping helpers, unchanged) and the built beta client
    ("server/betaServer.ts", "server/betaServer.ts"), ("server/beta", "server/beta"), ("server/bhoomiAi.ts", "server/bhoomiAi.ts"),
    ("shared/betaFeedback.ts", "shared/betaFeedback.ts"), ("scripts/beta-admin.ts", "scripts/beta-admin.ts"),
    ("scripts/beta-migrate.ts", "scripts/beta-migrate.ts"),
    ("scripts/beta-pin.ts", "scripts/beta-pin.ts"),
    # deployment files
    ("deploy/beta", "deploy/beta"),
]
IGNORE = re.compile(r"(__pycache__|\.pyc$|\.DS_Store$|/data/cache/|\.sqlite|test_.*\.py$|\.test\.ts$|\.secret$|/private-state/|/(beta\.env|approval\.json|billing-attestation\.json|source-clearance\.json)$)")

FORBIDDEN_PATH = re.compile(
    r"(private-state/|monsoon_v0|flood_v0|forecast_risk|chirps|lgd_|/lgd|\.sqlite|\.db$|(^|/)\.env(\.|$)|test_v3|dev_v3|test_v4|train\.jsonl|"
    r"/adapters/|\.safetensors|\.gguf|\.pt$|\.bin$|\.pem$|id_ed25519|CDS data|(^|/)IMN/|node_modules|\.git/|\.pptx$)", re.I)
FORBIDDEN_CONTENT = [
    (re.compile(r"/Users/[A-Za-z0-9_.-]+/"), "absolute local path"),
    (re.compile(r"\b(hf_[A-Za-z0-9]{20,}|rpa_[A-Za-z0-9]{20,}|rp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})\b"), "API token"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "private key"),
    (re.compile(r"(RUNPOD_API_KEY|HF_TOKEN|BETA_HASH_KEY|BETA_ORIGIN_KEY)\s*=\s*[A-Za-z0-9_\-]{12,}"), "inline secret value"),
]
DOC_TERMS = re.compile(r"\b(IFI|IFI-Impacts|LGD|CHIRPS)\b", re.I)
PROP_KEY_BAD = re.compile(r"(monsoon|chirps|ifi_|lgd|flood_event|reported_flood)", re.I)
TEXT_EXT = {".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".txt", ".yml", ".yaml", ".env", ".example", ".sh", ".html", ".css", ".toml", ".conf", ".service"}
MAX_SCAN = 3 * 1024 * 1024
DOC_EXT = {".md", ".txt"}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def files_of(root: Path):
    return sorted(p for p in root.rglob("*") if p.is_file() and p.name != "MANIFEST.json")


def check(bundle: Path) -> list[str]:
    problems: list[str] = []
    if not bundle.is_dir():
        return [f"{bundle} is not a directory"]
    man = bundle / "MANIFEST.json"
    listed = {}
    if man.exists():
        listed = {e["path"]: e["sha256"] for e in json.loads(man.read_text())["files"]}
    else:
        problems.append("MANIFEST.json missing")
    seen = set()
    for p in files_of(bundle):
        rel = p.relative_to(bundle).as_posix()
        if p.is_symlink(): problems.append(f"symlink forbidden: {rel}")
        seen.add(rel)
        if FORBIDDEN_PATH.search("/" + rel):
            problems.append(f"forbidden path: {rel}")
        if rel not in listed:
            problems.append(f"not in manifest: {rel}")
        elif listed[rel] != sha256(p):
            problems.append(f"hash differs from manifest: {rel}")
        if p.suffix.lower() in TEXT_EXT :
            text = p.read_text(encoding="utf-8", errors="replace")
            if rel == "deploy/beta/beta.env.example":
                text = re.sub(r"(?m)^(BETA_HASH_KEY|RUNPOD_API_KEY|HF_TOKEN)=CHANGE_ME[A-Z0-9_]*$", "", text)
            for rx, what in FORBIDDEN_CONTENT:
                if rx.search(text):
                    problems.append(f"{what} in {rel}")
            if p.suffix.lower() in DOC_EXT and DOC_TERMS.search(text) and "/deploy/" not in "/" + rel:
                problems.append(f"document names a restricted source: {rel}")
    for rel in listed:
        if rel not in seen:
            problems.append(f"listed but missing: {rel}")
    props = bundle / "client/public/data/india_hex_props.json"
    if props.exists():
        records = json.loads(props.read_text())
        bad = sorted({k for rec in records for k in rec if PROP_KEY_BAD.search(k)})
        if bad:
            problems.append(f"hex properties carry restricted-looking fields: {bad}")
    else:
        problems.append("india_hex_props.json missing from the bundle")
    return problems


def build(out: Path) -> int:
    clearance = REPO / "deploy/beta/source-clearance.json"
    if not clearance.exists():
        print("source-clearance.json missing: data remains local; do not upload", file=sys.stderr)
        return 1
    approved = json.loads(clearance.read_text())
    for required in ("client/public/data/india_hex_props.json", "client/public/data/hex_historical_climatology.json", "METHODOLOGY.md"):
        entry = next((x for x in approved.get("sources", []) if x.get("path") == required), {})
        if not entry.get("approved_by") or not entry.get("licence_url") or entry.get("sha256") != sha256(REPO / required):
            print(f"source not approved at current checksum: {required}", file=sys.stderr)
            return 1
    if out.exists():
        if not (out / "MANIFEST.json").is_file():
            raise SystemExit("refusing to replace a directory that is not an existing generated bundle")
        shutil.rmtree(out)
    for src_rel, dst_rel in ALLOW:
        src, dst = REPO / src_rel, out / dst_rel
        if not src.exists():
            print(f"missing allowlisted source: {src_rel}", file=sys.stderr)
            return 1
        items = [src] if src.is_file() else [p for p in sorted(src.rglob("*")) if p.is_file()]
        for p in items:
            if p.is_symlink():
                raise SystemExit(f"symlink source refused: {p.name}")
            rel = (dst / p.relative_to(src)) if src.is_dir() else dst
            if IGNORE.search("/" + p.relative_to(REPO).as_posix()):
                continue
            rel.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, rel)
    shutil.copy2(REPO / "deploy/beta/runtime-package.json", out / "package.json")
    shutil.copy2(REPO / "deploy/beta/runtime-package-lock.json", out / "package-lock.json")
    # The Core's experimental gate reads a registry file. Ship ONLY the one experimental entry, verbatim (status stays
    # experimental_*, deployable stays false): the gate is not bypassed and no other model/dataset record leaves the machine.
    reg = json.loads((REPO / "research/bhoomi_llm_v1/registry/models.json").read_text())
    entry = next(m for m in reg["models"] if m.get("id") == REGISTRY_ID)
    assert str(entry["status"]).startswith("experimental") and entry.get("deployable") is False
    (out / "registry").mkdir()
    (out / "registry/models.json").write_text(json.dumps({"models": [entry]}, indent=1))
    files = [{"path": p.relative_to(out).as_posix(), "bytes": p.stat().st_size, "sha256": sha256(p)} for p in files_of(out)]
    (out / "MANIFEST.json").write_text(json.dumps({"purpose": "research beta cloud package (local build; not uploaded)", "files": files}, indent=1))
    problems = check(out)
    print(f"{len(files)} files, {sum(f['bytes'] for f in files) / 1e6:.1f} MB -> {out}")
    for pr in problems:
        print("FINDING:", pr)
    print("CLEAN" if not problems else f"{len(problems)} finding(s): do not upload")
    return 0 if not problems else 1


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["check"] and len(a) == 2:
        pr = check(Path(a[1]))
        for x in pr:
            print("FINDING:", x)
        print("CLEAN" if not pr else f"{len(pr)} finding(s)")
        sys.exit(0 if not pr else 1)
    out = Path(a[a.index("--out") + 1]) if "--out" in a else REPO / "dist" / "beta-bundle"
    sys.exit(build(out))
