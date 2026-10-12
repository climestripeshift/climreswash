"""CPU-only Docker test of the Pod-proxy wrapper: real SSH bring-up, the embedded gate, and a stub vLLM that, like the real one,
leaves /invocations unauthenticated. No weights, CUDA or Runpod calls. Exits non-zero on any failed check."""
import hashlib, json, pathlib, subprocess, tempfile, time, urllib.request, urllib.error, uuid

ROOT = pathlib.Path(__file__).resolve().parent
IMAGE = 'bhoomi-ssh-wrapper-cpu:test'
EDGE = 'E' * 40
checks = []


def run(*a, check=True):
    return subprocess.run(a, text=True, capture_output=True, check=check, timeout=60)


def docker(*a, check=True):
    return run('docker', *a, check=check)


def http(url, method='GET', key=None, body=None):
    h = {'Content-Type': 'application/json'}
    if key is not None:
        h['Authorization'] = 'Bearer ' + key
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


with tempfile.TemporaryDirectory(prefix='bhoomi-podproxy-') as temp:
    t = pathlib.Path(temp)
    run('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(t / 'key'))
    public = (t / 'key.pub').read_text().strip()
    script = (ROOT / 'start-pod-proxy.sh').read_text()
    assert subprocess.run(['python3', str(ROOT / 'make_pod_proxy_wrapper.py')], capture_output=True).returncode == 0
    assert (ROOT / 'start-pod-proxy.sh').read_text() == script, 'wrapper is not the reviewed derivation of the verified one'
    checks.append('start-pod-proxy.sh equals the mechanical derivation of the verified wrapper')
    files = json.loads((ROOT / 'adapter-manifest.json').read_text())['adapter_files']
    fixture = t / 'adapter'; fixture.mkdir()
    for row in files:
        data = ('synthetic ' + row['name']).encode(); (fixture / row['name']).write_bytes(data)
        script = script.replace(row['sha256'], hashlib.sha256(data).hexdigest())
    (t / 'test-start.sh').write_text(script)
    stub = t / 'bin'; stub.mkdir()
    (stub / 'nvidia-smi').write_text('#!/bin/sh\necho "CPU TEST, 0 MiB, no CUDA"\n')
    (stub / 'vllm').write_text('''#!/usr/bin/python3
import json, os, sys, pathlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
a = sys.argv[1:]; host = a[a.index('--host') + 1]; port = int(a[a.index('--port') + 1]); key = os.environ['VLLM_API_KEY']
pathlib.Path('/run/bhoomi/args.json').write_text(json.dumps(a))
pathlib.Path('/run/bhoomi/stub-env-has-edge.txt').write_text(str('BHOOMI_EDGE_KEY' in os.environ))
class H(BaseHTTPRequestHandler):
    def log_message(self, *x): pass
    def out(self, c, o):
        b = json.dumps(o).encode(); self.send_response(c); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def authed(self): return self.headers.get('Authorization') == 'Bearer ' + key
    def do_GET(self):
        if self.path.startswith('/v1/') and not self.authed(): return self.out(401, {})
        self.out(200, {'data': [{'id': 'bhoomi-llm-v1-ckpt160', 'parent': 'Qwen/Qwen3-4B-Instruct-2507'}]} if self.path == '/v1/models' else {'leak': 'open vllm route'})
    def do_POST(self):
        self.rfile.read(int(self.headers.get('Content-Length') or 0))
        if self.path.startswith('/v1/') and not self.authed(): return self.out(401, {})
        self.out(200, {'model': 'bhoomi-llm-v1-ckpt160', 'choices': [{'message': {'role': 'assistant', 'content': 'ok'}}]} if self.path.startswith('/v1/') else {'leak': 'invocations answered without a key'})
ThreadingHTTPServer((host, port), H).serve_forever()
''')
    for f in stub.iterdir():
        f.chmod(0o755)
    name = 'bhoomi-podproxy-' + uuid.uuid4().hex[:8]
    try:
        docker('run', '-d', '--name', name, '-p', '127.0.0.1::22', '-p', '127.0.0.1::8000', '--entrypoint', '/bin/bash',
               '-e', 'PUBLIC_KEY=' + public, '-e', 'BHOOMI_EDGE_KEY=' + EDGE,
               '-e', 'PATH=/testbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
               '-v', str(t / 'test-start.sh') + ':/test-start.sh:ro', '-v', str(stub) + ':/testbin:ro',
               '-v', str(fixture) + ':/workspace/bhoomi-compatibility/adapter:ro', IMAGE, '-c', 'exec bash /test-start.sh')
        def wait_file(path, tries=60):
            for _ in range(tries):
                if docker('exec', name, 'test', '-f', path, check=False).returncode == 0:
                    return
                time.sleep(.25)
            raise AssertionError('timeout waiting for ' + path)
        wait_file('/run/bhoomi/edge-key')
        port = docker('port', name, '8000/tcp').stdout.strip().rsplit(':', 1)[1]
        base = f'http://127.0.0.1:{port}'
        # gate is up BEFORE artifacts exist: authenticated requests get a generic 503, unauthenticated 401, nothing leaks
        for _ in range(40):
            code, _ = http(base + '/v1/models', key=EDGE)
            if code == 503:
                break
            time.sleep(.25)
        assert code == 503, code
        assert http(base + '/v1/models')[0] == 401
        checks.append('gate listens before the model exists: 503 with the edge key, 401 without; vLLM not started yet')
        assert docker('exec', name, 'test', '-f', '/run/bhoomi/args.json', check=False).returncode != 0
        docker('exec', name, 'bash', '-c', 'mkdir -p /usr/local/lib/python3.12/dist-packages/vllm-0.30.0.dist-info; '
               'printf "Name: vllm\\nVersion: 0.30.0\\n" > /usr/local/lib/python3.12/dist-packages/vllm-0.30.0.dist-info/METADATA; touch /run/bhoomi/artifacts-ready')
        wait_file('/run/bhoomi/args.json')
        args = json.loads(docker('exec', name, 'cat', '/run/bhoomi/args.json').stdout)
        assert args[args.index('--host') + 1] == '127.0.0.1' and args[args.index('--port') + 1] == '8001'
        checks.append('vLLM is bound to 127.0.0.1:8001 only')
        for _ in range(40):
            if http(base + '/v1/models', key=EDGE)[0] == 200:
                break
            time.sleep(.25)
        code, out = http(base + '/v1/models', key=EDGE)
        assert code == 200 and out['data'][0]['parent'] == 'Qwen/Qwen3-4B-Instruct-2507'
        assert http(base + '/v1/chat/completions', 'POST', key=EDGE, body={'messages': [{'role': 'user', 'content': 'hi'}]})[0] == 200
        checks.append('authenticated chat and model list work through the exposed port')
        for key in (None, 'wrong', 'I' * 43):
            assert http(base + '/v1/models', key=key)[0] == 401
        checks.append('missing, wrong and internal-vLLM keys are rejected at the edge')
        for method, path in (('POST', '/invocations'), ('GET', '/health'), ('GET', '/docs'), ('GET', '/metrics'), ('POST', '/v1/completions')):
            code, out = http(base + path, method, key=EDGE, body={'messages': []} if method == 'POST' else None)
            assert code in (404, 405) and 'leak' not in out, (path, code)
        checks.append('unauthenticated vLLM routes (/invocations, /health, /docs, /metrics) are unreachable from outside, even with the edge key')
        listeners = docker('exec', name, 'python3', '-c',
                           "print(sorted({(l.split()[1].split(':')[1], l.split()[1].split(':')[0]) for f in ('/proc/net/tcp',) "
                           "for l in open(f).read().splitlines()[1:] if l.split()[3]=='0A'}))").stdout
        assert "('1F41', '0100007F')" in listeners and "('1F40', '00000000')" in listeners, listeners   # 8001 loopback, 8000 all
        assert not any(p in listeners for p in ("('1F41', '00000000')",))
        checks.append('only the gate (8000) listens on all interfaces; vLLM (8001) is loopback')
        assert docker('exec', name, 'cat', '/run/bhoomi/stub-env-has-edge.txt').stdout.strip() == 'False'
        mode = docker('exec', name, 'stat', '-c', '%a', '/run/bhoomi/edge-key').stdout.strip()
        assert mode == '600'
        checks.append('the edge key is not in vLLM\'s environment and its file is 0600')
        # crash of the gate stops the whole wrapper (no half-open server)
        docker('exec', name, 'pkill', '-f', '/run/bhoomi/pod_gate.py')
        for _ in range(40):
            if docker('inspect', '-f', '{{.State.Running}}', name).stdout.strip() == 'false':
                break
            time.sleep(.25)
        assert docker('inspect', '-f', '{{.State.Running}}', name).stdout.strip() == 'false'
        checks.append('gate failure shuts the wrapper down')
    finally:
        docker('rm', '-f', name, check=False)
print(json.dumps({'passed': True, 'count': len(checks), 'checks': checks}, indent=1))
