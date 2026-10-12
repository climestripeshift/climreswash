#!/usr/bin/env bash
# POD-PROXY VARIANT of the verified private wrapper: the ONLY HTTP port is an authenticating gate (pod_gate.py) in front of a
# loopback vLLM; vLLM's own --api-key is not sufficient (it leaves /invocations unauthenticated). SSH stays for operator upload.
# One attended compatibility attempt; provider compute must also be stopped externally.
set -Eeuo pipefail
umask 077
: "${PUBLIC_KEY:?Existing approved SSH public key required}"
[[ "$PUBLIC_KEY" == ssh-ed25519\ * && "$PUBLIC_KEY" != *$'\n'* ]] || exit 64
sshd_pid=''; model_pid=''; timer_pid=''; gate_pid=''
cleanup() {
  trap - EXIT TERM INT
  [[ -z "$model_pid" ]] || kill "$model_pid" 2>/dev/null || true
  [[ -z "$gate_pid" ]] || kill "$gate_pid" 2>/dev/null || true
  [[ -z "$sshd_pid" ]] || kill "$sshd_pid" 2>/dev/null || true
  [[ -z "$timer_pid" ]] || kill "$timer_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM INT
# Additional container-side shutdown. The operator's provider stop deadline is
# measured from the start request, including image pull, and remains mandatory.
(sleep 1680; kill -TERM "$$") &
timer_pid=$!
if [[ ! -x /usr/sbin/sshd ]]; then
  timeout 120 bash -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y --no-install-recommends openssh-server' >&2
fi
install -d -m 700 /root/.ssh /run/sshd /run/bhoomi /workspace/bhoomi-compatibility
printf '%s\n' "$PUBLIC_KEY" > /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
unset PUBLIC_KEY
ssh-keygen -q -t ed25519 -N '' -f /run/bhoomi/ssh_host_ed25519_key
ssh-keygen -lf /run/bhoomi/ssh_host_ed25519_key.pub
cat > /run/bhoomi/sshd_config <<'SSHCONFIG'
Port 22
ListenAddress 0.0.0.0
HostKey /run/bhoomi/ssh_host_ed25519_key
AuthorizedKeysFile /root/.ssh/authorized_keys
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
AuthenticationMethods publickey
UsePAM no
AllowUsers root
AllowTcpForwarding local
PermitOpen 127.0.0.1:8000
AllowAgentForwarding no
X11Forwarding no
PermitTunnel no
GatewayPorts no
Subsystem sftp internal-sftp
PidFile /run/bhoomi/sshd.pid
SSHCONFIG
/usr/sbin/sshd -t -f /run/bhoomi/sshd_config
/usr/sbin/sshd -D -e -f /run/bhoomi/sshd_config > /run/bhoomi/ssh.log 2>&1 &
sshd_pid=$!
python3 -c 'import secrets,pathlib; pathlib.Path("/run/bhoomi/api-key").write_text(secrets.token_urlsafe(32))'
chmod 600 /run/bhoomi/api-key
: "${BHOOMI_EDGE_KEY:?Pod proxy mode needs BHOOMI_EDGE_KEY (32+ chars; the bearer key the relay presents)}"
[[ ${#BHOOMI_EDGE_KEY} -ge 32 && "$BHOOMI_EDGE_KEY" =~ ^[A-Za-z0-9_-]+$ ]] || exit 65
printf '%s' "$BHOOMI_EDGE_KEY" > /run/bhoomi/edge-key
chmod 600 /run/bhoomi/edge-key
unset BHOOMI_EDGE_KEY
cat > /run/bhoomi/pod_gate.py <<'GATEPY'
#!/usr/bin/env python3
"""Authenticating gate that runs INSIDE the GPU Pod in front of vLLM (Option A: Pod behind Runpod's HTTPS proxy).

Why: vLLM's --api-key only guards /v1, /v2 and /inference. Other routes (notably /invocations, which exposes the same inference)
remain unauthenticated, and vLLM's own documentation says not to rely on --api-key alone. Runpod's HTTP proxy publishes the port
on a public URL, so the only thing reachable from outside must be this gate:

  * listens on 0.0.0.0:GATE_PORT (the only HTTP port the Pod exposes); vLLM listens on 127.0.0.1 only
  * ONLY POST /v1/chat/completions and GET /v1/models are forwarded; every other path/method is 404/405 without reaching vLLM
  * every forwarded request must carry `Authorization: Bearer <edge key>` (constant-time compare); the edge key is NOT the vLLM key
  * request size cap; stream is refused; the vLLM internal key is injected here and never leaves the Pod
  * no redirects followed, upstream errors are generic, nothing about vLLM (version, routes, docs) is exposed
Standard library only (python3 is present in the vllm-openai image).
"""
from __future__ import annotations

import hmac
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 256 * 1024
ALLOWED = {("POST", "/v1/chat/completions"), ("GET", "/v1/models")}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def make_server(listen_host: str, listen_port: int, upstream: str, edge_key: str, vllm_key: str, timeout_s: float = 170.0):
    if len(edge_key) < 32 or not vllm_key or edge_key == vllm_key:
        raise SystemExit("edge key (32+ chars) and a different internal vLLM key are required")
    opener = urllib.request.build_opener(_NoRedirect)
    expected = edge_key.encode()

    class H(BaseHTTPRequestHandler):
        server_version = "gate"
        sys_version = ""

        def log_message(self, *a):
            pass

        def _send(self, code: int, body: bytes = b"{}"):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _do(self, method: str):
            path = self.path.split("?")[0]
            if (method, path) not in ALLOWED:
                return self._send(404 if method in ("GET", "POST") else 405, b'{"error":"not found"}')
            supplied = (self.headers.get("Authorization") or "")
            if not supplied.startswith("Bearer ") or not hmac.compare_digest(supplied[7:].encode(), expected):
                return self._send(401, b'{"error":"unauthorized"}')
            data = None
            if method == "POST":
                n = int(self.headers.get("Content-Length") or 0)
                if n <= 0 or n > MAX_BODY:
                    return self._send(413 if n > MAX_BODY else 400, b'{"error":"bad size"}')
                data = self.rfile.read(n)
                try:
                    req = json.loads(data)
                    if not isinstance(req, dict) or req.get("stream") not in (None, False):
                        return self._send(400, b'{"error":"streaming is not supported"}')
                except ValueError:
                    return self._send(400, b'{"error":"bad request"}')
            r = urllib.request.Request(upstream + path, data=data, method=method,
                                       headers={"Content-Type": "application/json", "Authorization": f"Bearer {vllm_key}"})
            try:
                with opener.open(r, timeout=timeout_s) as resp:   # noqa: S310 - upstream is loopback, fixed at start-up
                    return self._send(resp.status, resp.read(4 * 1024 * 1024))
            except urllib.error.HTTPError as e:
                return self._send(e.code if e.code in (400, 404, 429, 500, 503) else 502, b'{"error":"upstream error"}')
            except Exception:  # noqa: BLE001
                return self._send(503, b'{"error":"model is not ready"}')

        def do_GET(self):
            self._do("GET")

        def do_POST(self):
            self._do("POST")

        do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = lambda self: self._send(405, b'{"error":"method not allowed"}')

    srv = ThreadingHTTPServer((listen_host, listen_port), H)
    srv.daemon_threads = True
    return srv


def main() -> int:
    key_file = os.environ.get("GATE_EDGE_KEY_FILE", "/run/bhoomi/edge-key")
    vllm_key_file = os.environ.get("GATE_VLLM_KEY_FILE", "/run/bhoomi/api-key")
    with open(key_file) as f:
        edge = f.read().strip()
    with open(vllm_key_file) as f:
        internal = f.read().strip()
    upstream = os.environ.get("GATE_UPSTREAM", "http://127.0.0.1:8001")
    if not upstream.startswith("http://127.0.0.1:"):
        raise SystemExit("the model server must be on loopback")
    srv = make_server(os.environ.get("GATE_HOST", "0.0.0.0"), int(os.environ.get("GATE_PORT", "8000")), upstream, edge, internal)
    srv.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
GATEPY
python3 /run/bhoomi/pod_gate.py > /run/bhoomi/gate.log 2>&1 &
gate_pid=$!
# Owner uploads exactly the approved artifacts over SSH, then creates this marker.
# Waiting, package installation and model startup all count toward the provider timer.
end=$((SECONDS + 600))
until [[ -f /run/bhoomi/artifacts-ready ]]; do
  kill -0 "$sshd_pid" 2>/dev/null || exit 70
  (( SECONDS < end )) || exit 124
  sleep 1
done
cd /workspace/bhoomi-compatibility/adapter
sha256sum --strict --check <<'CHECKSUMS'
462270265fafcdf6fa52d136b556926d357f9aa6710f72a8fbc934f04a3c65ed  adapter_model.safetensors
d63e9102e596de5cca7d5e9217a0659f4950ccc6161f2199b090199afe14248f  adapter_config.json
64f85b198065d0fba2a81f37e10ed68161ce2c19a754c7100e67e0ca2ee9c326  chat_template.jinja
4b5f2f80f84faefe8420e1616671adb1dd3d7e632038d34b1f0e3a1363a51059  tokenizer_config.json
aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4  tokenizer.json
8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5  merges.txt
ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910  vocab.json
76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd  special_tokens_map.json
CHECKSUMS
python3 -c 'import importlib.metadata; assert importlib.metadata.version("vllm") == "0.30.0"'
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader > /run/bhoomi/gpu-before.csv
export VLLM_API_KEY
VLLM_API_KEY=$(cat /run/bhoomi/api-key)
export VLLM_ALLOW_RUNTIME_LORA_UPDATING=False
vllm serve Qwen/Qwen3-4B-Instruct-2507   --revision cdbee75f17c01a7cc42f958dc650907174af0554   --tokenizer /workspace/bhoomi-compatibility/adapter   --chat-template /workspace/bhoomi-compatibility/adapter/chat_template.jinja   --host 127.0.0.1 --port 8001 --dtype bfloat16   --enable-lora --max-loras 1 --max-lora-rank 16   --lora-modules '{"name":"bhoomi-llm-v1-ckpt160","path":"/workspace/bhoomi-compatibility/adapter","base_model_name":"Qwen/Qwen3-4B-Instruct-2507"}'   --max-model-len 6144 --max-num-seqs 2 --gpu-memory-utilization 0.85   --enable-auto-tool-choice --tool-call-parser hermes --enforce-eager   > /run/bhoomi/vllm.log 2>&1 &
model_pid=$!
# Either service failure closes both. Container exit does NOT stop provider compute billing.
set +e
wait -n "$sshd_pid" "$model_pid" "$gate_pid"
status=$?
exit "$status"
