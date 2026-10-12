"""Local Docker boot test with code only, no datasets/weights, and cloud dispatch disarmed."""
import json
import secrets
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
name = "bhoomi-beta-local-smoke-" + secrets.token_hex(4)
image = "bhoomi-beta-local-smoke:test"
with tempfile.TemporaryDirectory(prefix="bhoomi-container-") as tmp:
    context = Path(tmp)
    for rel in ["research/bhoomi_ai_core_v0/src", "research/bhoomi_ai_core_v0/config", "research/bhoomi_ai_core_v0/schemas",
                "server/beta", "server/betaServer.ts", "server/bhoomiAi.ts", "shared/betaFeedback.ts", "scripts/beta-admin.ts",
                "deploy/beta/Dockerfile", "deploy/beta/entrypoint.sh", "deploy/beta/runpod_relay.py"]:
        src, dst = repo / rel, context / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir(): shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.sqlite"))
        else: shutil.copy2(src, dst)
    models = json.loads((repo / "research/bhoomi_llm_v1/registry/models.json").read_text())["models"]
    (context / "registry").mkdir()
    (context / "registry/models.json").write_text(json.dumps({"models": [next(m for m in models if m["id"] == "adapter-B-full2ep-experimental-machine-verified")]}))
    shutil.copy2(repo / "deploy/beta/runtime-package.json", context / "package.json")
    shutil.copy2(repo / "deploy/beta/runtime-package-lock.json", context / "package-lock.json")
    # Startup builds a gazetteer/cache. These are synthetic test records, never real source data.
    data = context / "client/public/data"; data.mkdir(parents=True)
    (data / "india_hex_props.json").write_text(json.dumps([{ "h3_id": "test", "district_name": "Test District", "state": "Test State", "hazard": 0, "population": 0 }]))
    (data / "hex_historical_climatology.json").write_text("{}")
    subprocess.run(["docker", "build", "-t", image, "-f", "deploy/beta/Dockerfile", "."], cwd=context, check=True)
    values = {
        "NODE_ENV": "production", "BETA_AUTH_MODE": "cloudflare", "BETA_INGRESS_MODE": "loopback", "BETA_PUBLIC_ORIGIN": "https://climreswash.in",
        "BETA_ACCESS_TEAM_DOMAIN": "test.cloudflareaccess.com", "BETA_ACCESS_AUD": "test-aud", "BETA_HASH_KEY": secrets.token_hex(32),
        "BETA_DB_PATH": "/data/beta.sqlite", "BETA_CORE_URL": "http://127.0.0.1:8765,http://127.0.0.1:8766", "BETA_CLOUD_APPROVED": "0",
        "BHOOMI_DEPLOYMENT_PROFILE": "cloud_beta", "BHOOMI_LLM_BACKEND": "openai_compat", "BHOOMI_LLM_EXPERIMENTAL": "1",
        "BHOOMI_LLM_MODEL_ID": "adapter-B-full2ep-experimental-machine-verified", "BHOOMI_LLM_REGISTRY": "/app/registry/models.json",
        "BHOOMI_LLM_MODEL": "bhoomi-llm-v1-ckpt160", "BHOOMI_LLM_BASE_URL": "http://127.0.0.1:8081/v1",
        "RELAY_UPSTREAM": "https://api.runpod.ai/v2/abcdef123/openai/v1", "RELAY_MODEL": "bhoomi-llm-v1-ckpt160", "RUNPOD_API_KEY": "mock-no-network-key",
        "RELAY_BUDGET_DB": "/data/relay-budget.sqlite",
    }
    envfile = context / "test.env"; envfile.write_text("\n".join(f"{k}={v}" for k, v in values.items())); envfile.chmod(0o600)
    try:
        subprocess.run(["docker", "run", "-d", "--name", name, "--read-only", "--tmpfs", "/tmp", "--mount", f"type=volume,source={name}-data,target=/data",
                        "--mount", f"type=volume,source={name}-cache,target=/app/research/bhoomi_ai_core_v0/data", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                        "--env-file", str(envfile), image], check=True, stdout=subprocess.DEVNULL)
        for _ in range(30):
            result = subprocess.run(["docker", "exec", name, "node", "-e", "fetch('http://127.0.0.1:5100/bhoomiai/api/me').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"], capture_output=True)
            if result.returncode == 0: break
            time.sleep(0.5)
        else:
            subprocess.run(["docker", "logs", name], check=False)
            raise AssertionError("gateway did not boot")
        for port in [8765, 8766]:
            subprocess.run(["docker", "exec", name, "node", "-e", f"fetch('http://127.0.0.1:{port}/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"], check=True)
        subprocess.run(["docker", "exec", name, "python3", "-c", "import urllib.request,urllib.error;\ntry: urllib.request.urlopen('http://127.0.0.1:8081/v1/models'); raise AssertionError('disarmed relay accepted request')\nexcept urllib.error.HTTPError as e: assert e.code == 503"], check=True)
        # Consistent SQLite backup and restore while the service has an open WAL database.
        subprocess.run(["docker", "exec", name, "python3", "-c", "import sqlite3,os; os.umask(0o077); src=sqlite3.connect('/data/beta.sqlite'); dst=sqlite3.connect('/data/backup.sqlite'); src.backup(dst); src.close(); dst.close(); b=sqlite3.connect('/data/backup.sqlite'); assert b.execute('PRAGMA integrity_check').fetchone()[0]=='ok'; assert b.execute(\"SELECT count(*) FROM sqlite_master WHERE name='users'\").fetchone()[0]==1; b.close()"], check=True)
        print("PASS: persistent named-volume permissions and WAL-safe backup/restore")
        print("PASS: non-root/read-only Node 24 container; both experimental Core workers boot; gateway requires authentication; relay is disarmed; no provider request")
    finally:
        subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        subprocess.run(["docker", "volume", "rm", name + "-data", name + "-cache"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
