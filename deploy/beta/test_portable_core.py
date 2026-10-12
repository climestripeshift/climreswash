"""Synthetic transport/session tests only. No model factory, frozen benchmark or real inference."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'research/bhoomi_ai_core_v0/src'))
from bhoomi_ai.agent.session import Session,SessionManager,Turn
from bhoomi_ai.agent.memory import linux_available_mb,MemoryGuard
from bhoomi_ai.server import App
from bhoomi_ai.llm.scripted_backend import ScriptedBackend,call,say
sys.path.insert(0,str(Path(__file__).resolve().parent))
import compatibility_probe as P
from bhoomi_ai.agent.orchestrator import Agent
from bhoomi_ai.data_access import DataStore
from bhoomi_ai.tools import Registry

class Feedback:
    def log_interaction(self,*args,**kwargs):return 'c'*32
class PortableTests(unittest.TestCase):
    def test_real_scientific_tools_and_verifier_across_fresh_Core_instances(self):
        key='local-core-key-'*3
        with tempfile.TemporaryDirectory(dir=P.CORE/'data') as temp,patch.dict(os.environ,{'BHOOMI_GATEWAY_KEY':key}):
            cfg=P.synthetic_config(Path(temp))
            def app():
                backend=ScriptedBackend([call('district_hazard_profile',district='Kota',state='Rajasthan'),say('Kota overall screening index is 2.50 (index, 0-10 scale) [F1].')])
                return App(Agent(backend,Registry(profile='cloud_beta'),DataStore(cfg),cfg,guard=MemoryGuard(reader=lambda:2000)),SessionManager(),Feedback(),cfg)
            state={'id':'a'*24,'turn_count':0,'context':{},'turns':[]}
            for message in ['What is the overall screening index of Kota, Rajasthan?','What about the overall screening index there?']:
                body={'message':message,'session_id':state['id'],'portable_session':state,'deployment':'cloud_beta','user_hash':'b'*32,'deadline_ms':int(time.time()*1000)+30000}
                body['gateway_proof']=hmac.new(key.encode(),('bhoomi-core-v1:'+json.dumps(body,sort_keys=True,separators=(',',':'))).encode(),hashlib.sha256).hexdigest()
                server=app();status,out=server.chat(body)
                self.assertEqual(status,200,out);self.assertTrue(out['verification']['passed'],out);self.assertIn('2.50',out['answer'])
                state=out['portable_session'];self.assertEqual(state['context']['district'],'Kota');self.assertEqual(server.sessions.count(),0)
            self.assertEqual(state['turn_count'],2)
            body['gateway_proof']='forged';self.assertEqual(app().chat(body)[0],403)
            self.assertEqual(app().chat({'message':'unsigned direct request'})[0],403)
    def test_portable_limits_and_history_preserve_tool_entities(self):
        s=Session('a'*24,0,0)
        for i in range(8):s.turns.append(Turn('question', 'answer [F1]', {'district':'Kota','state':'Rajasthan'},'verified'))
        restored=Session.restore(s.portable());self.assertEqual(restored.context(),s.context());self.assertEqual(restored.history_messages(3),s.history_messages(3));self.assertEqual(restored.portable()['turn_count'],8)
        bad=s.portable();bad['context']['path']='/private';
        with self.assertRaises(ValueError):Session.restore(bad)
        bad=s.portable();bad['turn_count']=40
        with self.assertRaises(ValueError):Session.restore(bad)
    def test_relay_helium_transport_matches_gateway_endpoint_restrictions(self):
        from deploy.beta.runpod_relay import Config
        env={'BETA_DB_TRANSPORT':'replit-helium','RELAY_UPSTREAM':'https://api.runpod.ai/v2/localtest/openai/v1','RUNPOD_API_KEY':'local-test','RELAY_MODEL':'checkpoint-160'}
        Config({**env,'BETA_DATABASE_URL':'postgresql://beta@helium/heliumdb'})
        for url in ['postgresql://beta@evil.example/heliumdb','postgresql://beta@helium:1234/heliumdb','postgresql://beta@helium/other']:
            with self.assertRaises(SystemExit):Config({**env,'BETA_DATABASE_URL':url})
    def test_linux_memory_guard_observes_cgroup_headroom(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);proc=root/'meminfo';proc.write_text('MemAvailable: 9999999 kB\n');(root/'memory.max').write_text(str(512*1024*1024));(root/'memory.current').write_text(str(400*1024*1024))
            reader=lambda:linux_available_mb(proc,root)
            self.assertEqual(reader(),112);self.assertEqual(MemoryGuard(reader=reader).check()['level'],'stop')
