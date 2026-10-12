"""Linux-container Core + public-server memory probe. Network disabled by the test runner.
Reads only the two explicit local scientific source mounts; never loads model weights or benchmarks.
"""
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import time
import urllib.request
sys.path.insert(0,'/app/research/bhoomi_ai_core_v0/src')
from bhoomi_ai.config import load_config
from bhoomi_ai.data_access import DataStore
from bhoomi_ai.agent.memory import linux_available_mb
from bhoomi_ai.agent.orchestrator import Agent
from bhoomi_ai.agent.session import SessionManager
from bhoomi_ai.tools import Registry
from bhoomi_ai.llm.scripted_backend import ScriptedBackend,call,say

public = subprocess.Popen(['node','/app/dist/index.cjs'],cwd='/app',env={**os.environ,'NODE_ENV':'production','DATABASE_URL':'postgresql://synthetic@127.0.0.1/unavailable','PORT':'5000'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    for _ in range(100):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5000/',timeout=.3) as r: assert r.status==200
            break
        except Exception:time.sleep(.1)
    else:
        public.terminate();diagnostic=public.communicate(timeout=5)[1].decode()
        raise RuntimeError('Public server did not boot: '+diagnostic[-1800:])
    for route in ['/grid','/grid-v2','/methodology','/bhoomiai']:
        with urllib.request.urlopen('http://127.0.0.1:5000'+route,timeout=1) as r:assert r.status==200
    os.environ['BHOOMI_DEPLOYMENT_PROFILE']='cloud_beta'
    cfg=load_config();cfg['doc_sources']=[]
    cfg['paths']['district_cache']=Path('/app/research/bhoomi_ai_core_v0/data/memory-cache.json')
    store=DataStore(cfg);data=store.cache();store.gazetteer()
    backend=ScriptedBackend([call("district_hazard_profile",district="Kota",state="Rajasthan"),say("Jaipur index is 99.99 [F1].")])
    agent=Agent(backend,Registry(profile="cloud_beta"),store,cfg)
    result=agent.run_turn(SessionManager().create(),"What is the overall screening index of Kota, Rajasthan?")
    peak=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024
    rss=next(int(line.split()[1])/1024 for line in Path(f'/proc/{public.pid}/status').read_text().splitlines() if line.startswith('VmRSS:'))
    usage=int(Path('/sys/fs/cgroup/memory.current').read_text())/(1024*1024)
    print(json.dumps({'core_cold_cache_peak_mb':round(peak,1),'public_server_rss_mb':round(rss,1),'combined_cgroup_current_mb':round(usage,1),
                      'available_mb':round(linux_available_mb(),1),'district_count':len(data.get('districts',{})),
                      'turn_status':result.status,'verifier_passed':result.verification.get('passed'),'fallback_used':result.fallback_used,'model_loaded':False,'network':'disabled','source_scope':'two explicit local data files; no benchmarks'}))
finally:
    public.terminate();public.wait(timeout=5)
