# Single container on purpose: the gateway only talks to a loopback Core and the Core only to a loopback model server, so the
# gateway, the Core workers and the relay share one network namespace. cloudflared joins it via network_mode (docker-compose.yml).
# Build context: the bundle produced by `python3 deploy/beta/build_cloud_bundle.py build` (dist/beta-bundle), NOT the repository.
# Base digest verified in the local container smoke test. Pin cloudflared/worker-vLLM separately before release.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN apt-get update && apt-get install -y --no-install-recommends python3 tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app
# Only what the gateway imports at runtime; versions are copied from the repository package.json by the build step.
RUN npm ci --omit=dev --no-audit --no-fund && useradd -r -u 10001 beta && mkdir -p /data /app/research/bhoomi_ai_core_v0/data && chown -R beta /data /app/research/bhoomi_ai_core_v0/data
USER beta
ENV PYTHONDONTWRITEBYTECODE=1 NODE_ENV=production
ENTRYPOINT ["/usr/bin/tini", "--", "/app/deploy/beta/entrypoint.sh"]
