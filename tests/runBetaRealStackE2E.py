"""Zero-cost real-stack run: disposable local PostgreSQL + real gateway/Core/relay + the locally served checkpoint-160 model.
No provider credential, cloud resource or production URL is read. LOCAL_MODEL_URL must be a loopback llama.cpp/vLLM server."""
import os
import subprocess
import sys
import time
import uuid

name = 'bhoomi-real-stack-' + uuid.uuid4().hex[:10]
try:
    subprocess.run(['docker', 'run', '--detach', '--name', name, '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
                    '--env', 'POSTGRES_DB=bhoomi_beta_test', 'postgres:16'], check=True, stdout=subprocess.DEVNULL)
    for _ in range(80):
        if subprocess.run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(.25)
    else:
        raise RuntimeError('Local postgres did not start')
    time.sleep(1)
    port = subprocess.check_output(['docker', 'port', name, '5432']).decode().strip().split(':')[-1]
    env = {**os.environ, 'BETA_TEST_DATABASE_URL': f'postgresql://postgres@127.0.0.1:{port}/bhoomi_beta_test'}
    for key in ['DATABASE_URL', 'BETA_DATABASE_URL', 'RELAY_DATABASE_URL', 'RUNPOD_API_KEY', 'RUNPOD_MONITOR_API_KEY', 'RELAY_UPSTREAM_KEY']:
        env.pop(key, None)
    sys.exit(subprocess.run(['node', '--import', 'tsx', 'tests/betaRealStackE2E.ts'], env=env).returncode)
finally:
    subprocess.run(['docker', 'rm', '--force', '--volumes', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
