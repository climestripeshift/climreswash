"""CPU-only Docker/real-SSH wrapper tests; no weights, Runpod calls or CUDA."""
import hashlib,json,pathlib,subprocess,tempfile,time,uuid
ROOT=pathlib.Path(__file__).resolve().parent
IMAGE='bhoomi-ssh-wrapper-cpu:test'
def run(*args,check=True):
 return subprocess.run(args,text=True,capture_output=True,check=check,timeout=40)
def docker(*args,check=True):return run('docker',*args,check=check)
checks=[]
with tempfile.TemporaryDirectory(prefix='bhoomi-wrapper-') as temp:
 t=pathlib.Path(temp);run('ssh-keygen','-q','-t','ed25519','-N','','-f',str(t/'key'))
 public=(t/'key.pub').read_text().strip()
 script=(ROOT/'start-private.sh').read_text()
 original=json.loads((ROOT/'pod-update.preview.json').read_text())
 assert original['dockerEntrypoint']==['/bin/bash','-c'] and original['dockerStartCmd']==[script] and original['ports']==['22/tcp']
 checks.append('API payload separates ENTRYPOINT/CMD; only SSH exposed')
 files=json.loads((ROOT/'adapter-manifest.json').read_text())['adapter_files']
 # Replace ONLY weights/tokenizer hashes with tiny synthetic fixtures for CPU tests.
 fixture=t/'adapter';fixture.mkdir()
 for row in files:
  data=('synthetic '+row['name']).encode();(fixture/row['name']).write_bytes(data)
  script=script.replace(row['sha256'],hashlib.sha256(data).hexdigest())
 (t/'test-start.sh').write_text(script)
 stub=t/'bin';stub.mkdir()
 (stub/'nvidia-smi').write_text('#!/bin/sh\necho "CPU TEST, 0 MiB, no CUDA"\n')
 (stub/'vllm').write_text('#!/usr/bin/python3\nimport os,json,time,pathlib\nassert len(os.environ["VLLM_API_KEY"])>=32\npathlib.Path("/run/bhoomi/args.json").write_text(json.dumps(__import__("sys").argv[1:]))\ntime.sleep(600)\n')
 for f in stub.iterdir():f.chmod(0o755)
 containers=[]
 def start(key,entry=True):
  name='bhoomi-local-'+uuid.uuid4().hex[:8];containers.append(name)
  args=['run','-d','--name',name,'-p','127.0.0.1::22','-e','PUBLIC_KEY='+key,'-e','PATH=/testbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','-v',str(t/'test-start.sh')+':/test-start.sh:ro','-v',str(stub)+':/testbin:ro','-v',str(fixture)+':/workspace/bhoomi-compatibility/adapter:ro']
  if entry:args+=['--entrypoint','/bin/bash']
  args += [IMAGE,'-c','exec bash /test-start.sh']
  docker(*args);return name
 def wait_file(n,path):
  for _ in range(40):
   if docker('exec',n,'test','-f',path,check=False).returncode==0:return
   time.sleep(.25)
  raise AssertionError('container readiness timeout')
 try:
  # Docker's ENTRYPOINT override executes a shell CMD as intended.
  proof=docker('run','--rm','--entrypoint','/bin/bash',IMAGE,'-c','printf ENTRYPOINT_OVERRIDE_OK')
  assert proof.stdout=='ENTRYPOINT_OVERRIDE_OK'
  checks.append('real Docker ENTRYPOINT override executes supplied CMD')
  n=start(public);wait_file(n,'/run/bhoomi/api-key')
  host=docker('exec',n,'cat','/run/bhoomi/ssh_host_ed25519_key.pub').stdout.strip().split()
  port=docker('port',n,'22/tcp').stdout.strip().rsplit(':',1)[1]
  known=t/'known_hosts';known.write_text('[127.0.0.1]:'+port+' '+' '.join(host[:2])+'\n')
  opts=['-p',port,'-i',str(t/'key'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(known),'-o','ConnectTimeout=5']
  run('ssh',*opts,'root@127.0.0.1','true');checks.append('real key-authenticated SSH login and strict host-key verification')
  bad=run('ssh',*opts,'-o','PubkeyAuthentication=no','-o','PreferredAuthentications=password','root@127.0.0.1','true',check=False)
  assert bad.returncode!=0;checks.append('password-only login denied')
  config=docker('exec',n,'/usr/sbin/sshd','-T','-f','/run/bhoomi/sshd_config').stdout
  assert 'passwordauthentication no' in config and 'gatewayports no' in config and 'permitopen 127.0.0.1:8000' in config
  checks.append('SSH forwarding limited to loopback inference; password and remote-forward exposure disabled')
  assert docker('exec',n,'test','-f','/run/bhoomi/args.json',check=False).returncode!=0
  checks.append('vLLM cannot start before artifact-ready marker')
  docker('exec',n,'bash','-c','mkdir -p /usr/local/lib/python3.12/dist-packages/vllm-0.30.0.dist-info; printf "Name: vllm\\nVersion: 0.30.0\\n" > /usr/local/lib/python3.12/dist-packages/vllm-0.30.0.dist-info/METADATA; touch /run/bhoomi/artifacts-ready')
  wait_file(n,'/run/bhoomi/args.json')
  args=json.loads(docker('exec',n,'cat','/run/bhoomi/args.json').stdout)
  assert args[0:2]==['serve','Qwen/Qwen3-4B-Instruct-2507']
  assert args[args.index('--revision')+1]=='cdbee75f17c01a7cc42f958dc650907174af0554'
  assert args[args.index('--host')+1]=='127.0.0.1' and args[args.index('--tool-call-parser')+1]=='hermes'
  assert '--enable-lora' in args and json.loads(args[args.index('--lora-modules')+1])['name']=='bhoomi-llm-v1-ckpt160'
  assert '--api-key' not in args
  checks.append('checksum gate admits synthetic artifacts; exact base/LoRA/parser args and secret-free argv verified')
  assert docker('exec',n,'stat','-c','%a','/run/bhoomi/api-key').stdout.strip()=='600'
  checks.append('bearer credential generated privately with mode 0600')
  docker('exec',n,'bash','-c','kill $(pgrep -f "^/usr/bin/python3 /testbin/vllm" | head -1)')
  for _ in range(20):
   if docker('inspect','-f','{{.State.Running}}',n).stdout.strip()=='false':break
   time.sleep(.2)
  assert docker('inspect','-f','{{.State.Running}}',n).stdout.strip()=='false'
  checks.append('model process failure shuts down wrapper and SSH')
  (fixture/'adapter_model.safetensors').write_text('corrupt')
  n=start(public);wait_file(n,'/run/bhoomi/api-key');docker('exec',n,'touch','/run/bhoomi/artifacts-ready')
  for _ in range(20):
   if docker('inspect','-f','{{.State.Running}}',n).stdout.strip()=='false':break
   time.sleep(.2)
  assert docker('inspect','-f','{{.State.Running}}',n).stdout.strip()=='false'
  checks.append('corrupt adapter hash fails closed before model execution')
  n=start('invalid');time.sleep(.3)
  assert docker('inspect','-f','{{.State.Running}}',n).stdout.strip()=='false'
  checks.append('invalid SSH public key rejected before service startup')
  # Shorten only the local test copy's cutoff, never the deployment wrapper.
  (t/'test-start.sh').write_text(script.replace('sleep 1680;', 'sleep 2;'))
  n=start(public)
  for _ in range(30):
   if docker('inspect','-f','{{.State.Running}}',n).stdout.strip()=='false':break
   time.sleep(.2)
  assert docker('inspect','-f','{{.State.Running}}',n).stdout.strip()=='false'
  checks.append('container safety timer shuts down SSH while awaiting artifacts')
 finally:
  for n in containers:docker('rm','-f',n,check=False)
report={'passed':True,'checks':checks,'count':len(checks),'limits':'CPU-only Ubuntu/SSH integration with synthetic files and stubbed vLLM; exact CUDA image/model execution not tested; no Runpod mutation','wrapper_sha256':hashlib.sha256((ROOT/'start-private.sh').read_bytes()).hexdigest()}
import os
if os.environ.get('BHOOMI_WRITE_TEST_REPORT'):(ROOT/'startup-local-tests.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=1))
print(json.dumps(report,indent=2))
