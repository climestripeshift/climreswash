#!/usr/bin/env python3
"""Assemble the Docker build context for Dockerfile.worker from the registered adapter, refusing on any hash mismatch."""
import hashlib
import json
import pathlib
import shutil
import sys

REPO = pathlib.Path(__file__).resolve().parents[3]
ADAPTER = REPO / "research/bhoomi_llm_v1/adapters/Bhoomi-LLM-v1-experimental-machine-verified-full2ep/runs/full_2ep/adapter"
PREP = REPO / "deploy/beta/gpu-compatibility/adapter-manifest.json"


def main(argv):
    if len(argv) != 2:
        raise SystemExit("usage: build_worker_context.py EMPTY_OUTPUT_DIR")
    out = pathlib.Path(argv[1])
    if out.exists() and any(out.iterdir()):
        raise SystemExit("output directory must be empty")
    files = json.loads(PREP.read_text())["adapter_files"]
    (out / "adapter").mkdir(parents=True, exist_ok=True)
    lines = []
    for row in files:
        src = ADAPTER / row["name"]
        digest = hashlib.sha256(src.read_bytes()).hexdigest()
        if digest != row["sha256"]:
            raise SystemExit(f"hash mismatch for {row['name']}: refusing to build")
        shutil.copyfile(src, out / "adapter" / row["name"])
        lines.append(f"{digest}  {row['name']}")
    (out / "adapter.SHA256SUMS").write_text("\n".join(lines) + "\n")
    print(f"context ready: {len(files)} files, {sum(r['bytes'] for r in files)} bytes verified")


if __name__ == "__main__":
    main(sys.argv)
