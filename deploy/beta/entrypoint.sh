#!/usr/bin/env bash
# Starts relay -> Core workers -> gateway in one container. Any process exiting stops the container (restart policy brings it back).
set -euo pipefail
cd /app
: "${BETA_CORE_URL:?}" "${RELAY_UPSTREAM:?}" "${RUNPOD_API_KEY:?}" "${BETA_HASH_KEY:?}"
[ "${BHOOMI_DEPLOYMENT_PROFILE:-}" = "cloud_beta" ] || { echo "refusing to start: BHOOMI_DEPLOYMENT_PROFILE must be cloud_beta" >&2; exit 1; }
python3 deploy/beta/runpod_relay.py & pids=($!)
IFS=',' read -ra urls <<<"$BETA_CORE_URL"
for u in "${urls[@]}"; do
  port="${u##*:}"
  mkdir -p "/app/research/bhoomi_ai_core_v0/data/worker-$port"
  (cd research/bhoomi_ai_core_v0 && NODE_ENV=research BHOOMI_AI_ENV=research BHOOMI_CORE_DATA_DIR="/app/research/bhoomi_ai_core_v0/data/worker-$port" PYTHONPATH=src python3 -m bhoomi_ai --port "$port") & pids+=($!)
done
node_modules/.bin/tsx server/betaServer.ts & pids+=($!)
wait -n
kill "${pids[@]}" 2>/dev/null || true
exit 1
