"""Durable relay reservation tests against the same disposable LOCAL Postgres as the gateway suite."""
import concurrent.futures
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from urllib.parse import urlparse
from deploy.beta.runpod_relay import Config, Relay

@unittest.skipUnless(os.environ.get("BETA_TEST_DATABASE_URL"), "Run the disposable PostgreSQL suite for this test")
class PostgresRelayTests(unittest.TestCase):
    def test_durable_atomic_reservations_pause_and_stale_billing(self):
        url = os.environ['BETA_TEST_DATABASE_URL']
        assert urlparse(url).hostname == '127.0.0.1' and urlparse(url).path == '/bhoomi_beta_test'
        with tempfile.TemporaryDirectory() as temp:
            a,b = Path(temp)/'approval.json',Path(temp)/'billing.json'
            endpoint='https://api.runpod.ai/v2/localtest/openai/v1'
            a.write_text(json.dumps({'approved':True,'approved_by':'local-test','endpoint':endpoint,'served_model':'checkpoint-160',
                                     'data_bundle_sha256':'synthetic','model':{'adapter_sha256':'local-test'}}))
            billing={'observed_at':time.time(),'endpoint':endpoint,'month':time.strftime('%Y-%m',time.gmtime()),
                     'shutdown_verified':True,'auto_pay_disabled':True,'spent_micro_usd':0}
            b.write_text(json.dumps(billing))
            env={'RELAY_DATABASE_URL':url,'RELAY_UPSTREAM':endpoint,'RELAY_MODEL':'checkpoint-160','RUNPOD_API_KEY':'test-only-not-a-provider-key',
                 'RELAY_APPROVAL_FILE':str(a),'RELAY_BILLING_FILE':str(b),'RELAY_DAILY_REQUEST_CAP':'3','RELAY_MONTHLY_CAP_MICRO_USD':'300',
                 'RELAY_CALL_RESERVATION_MICRO_USD':'100'}
            r1,r2=Relay(Config(env)),Relay(Config(env))
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                results=list(pool.map(lambda n:(r1 if n%2 else r2).reserve_cloud_call(),range(20)))
            self.assertEqual(sum(results),3)
            self.assertFalse(Relay(Config(env)).reserve_cloud_call())
            with r1._pg() as db:
                row=db.execute('SELECT SUM(reservation_micro_usd),COUNT(*) FROM relay_spending').fetchone()
                self.assertEqual(row,(300,3))
            r1.pause()
            self.assertFalse(r2.reserve_cloud_call())
            billing['observed_at']=time.time()-301;b.write_text(json.dumps(billing))
            self.assertFalse(r2.reserve_cloud_call())

if __name__=='__main__': unittest.main()
