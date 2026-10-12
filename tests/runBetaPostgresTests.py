"""Run on a disposable LOCAL PostgreSQL container. No production URL/credentials are read."""
import os
import sys
import subprocess
import time
import uuid

name = 'bhoomi-beta-test-' + uuid.uuid4().hex[:12]
try:
    subprocess.run(['docker','run','--detach','--name',name,'--publish','127.0.0.1::5432',
                    '--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB=bhoomi_beta_test','postgres:16'], check=True, stdout=subprocess.DEVNULL)
    for _ in range(40):
        if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0: break
        time.sleep(.25)
    else: raise RuntimeError('Local postgres did not start')
    port = subprocess.check_output(['docker','port',name,'5432']).decode().strip().split(':')[-1]
    env = {**os.environ, 'BETA_TEST_DATABASE_URL':f'postgresql://postgres@127.0.0.1:{port}/bhoomi_beta_test'}
    for key in ['DATABASE_URL','BETA_DATABASE_URL','RELAY_DATABASE_URL','RUNPOD_API_KEY']:
        env.pop(key,None)
    subprocess.run(['node','--import','tsx','--test','tests/betaPostgres.test.ts'],env=env,check=True)
    if env.get('PLAYWRIGHT_MODULE'):
        subprocess.run(['node','--import','tsx','tests/betaCodeE2E.ts'],env=env,check=True)
    subprocess.run([sys.executable,'-m','unittest','deploy.beta.test_relay_postgres'],env=env,check=True)
    # WAL-safe PostgreSQL backup/restore into a separate database on this disposable server.
    subprocess.run(['docker','exec',name,'psql','-U','postgres','-d','bhoomi_beta_test','-c',"UPDATE bhoomi_beta.settings SET value='true' WHERE key='paused'"],check=True,stdout=subprocess.DEVNULL)
    dump = subprocess.check_output(['docker','exec',name,'pg_dump','-U','postgres','-d','bhoomi_beta_test','--schema=bhoomi_beta','--format=custom'])
    subprocess.run(['docker','exec',name,'createdb','-U','postgres','bhoomi_beta_restore'],check=True)
    subprocess.run(['docker','exec','-i',name,'pg_restore','-U','postgres','--dbname=bhoomi_beta_restore','--no-owner','--no-privileges'],input=dump,check=True)
    query = "SELECT (SELECT count(*) FROM bhoomi_beta.users),(SELECT count(*) FROM bhoomi_beta.interactions),(SELECT count(*) FROM bhoomi_beta.feedback),(SELECT sum(requests) FROM bhoomi_beta.usage),(SELECT sum(reservation_micro_usd) FROM bhoomi_beta.relay_spending),(SELECT value FROM bhoomi_beta.settings WHERE key='paused')"
    totals = [subprocess.check_output(['docker','exec',name,'psql','-U','postgres','-d',database,'-At','-c',query]) for database in ['bhoomi_beta_test','bhoomi_beta_restore']]
    if totals[0] != totals[1] or b'true' not in totals[1]: raise RuntimeError('Isolated backup restore failed')
    print('PASS: isolated PostgreSQL backup/restore preserves users, interactions, feedback, quotas, spending and pause')

finally:
    subprocess.run(['docker','rm','--force','--volumes',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
