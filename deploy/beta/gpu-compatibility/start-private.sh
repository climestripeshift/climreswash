#!/usr/bin/env bash
# One attended compatibility attempt; provider compute must also be stopped externally.
set -Eeuo pipefail
umask 077
: "${PUBLIC_KEY:?Existing approved SSH public key required}"
[[ "$PUBLIC_KEY" == ssh-ed25519\ * && "$PUBLIC_KEY" != *$'\n'* ]] || exit 64
sshd_pid=''; model_pid=''; timer_pid=''
cleanup() {
  trap - EXIT TERM INT
  [[ -z "$model_pid" ]] || kill "$model_pid" 2>/dev/null || true
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
vllm serve Qwen/Qwen3-4B-Instruct-2507   --revision cdbee75f17c01a7cc42f958dc650907174af0554   --tokenizer /workspace/bhoomi-compatibility/adapter   --chat-template /workspace/bhoomi-compatibility/adapter/chat_template.jinja   --host 127.0.0.1 --port 8000 --dtype bfloat16   --enable-lora --max-loras 1 --max-lora-rank 16   --lora-modules '{"name":"bhoomi-llm-v1-ckpt160","path":"/workspace/bhoomi-compatibility/adapter","base_model_name":"Qwen/Qwen3-4B-Instruct-2507"}'   --max-model-len 6144 --max-num-seqs 2 --gpu-memory-utilization 0.85   --enable-auto-tool-choice --tool-call-parser hermes --enforce-eager   > /run/bhoomi/vllm.log 2>&1 &
model_pid=$!
# Either service failure closes both. Container exit does NOT stop provider compute billing.
set +e
wait -n "$sshd_pid" "$model_pid"
status=$?
exit "$status"
