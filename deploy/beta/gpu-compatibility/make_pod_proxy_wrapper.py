#!/usr/bin/env python3
"""Derive start-pod-proxy.sh from the VERIFIED start-private.sh + pod_gate.py with a fixed list of reviewed substitutions.
Every substitution must apply exactly once; anything else fails. Re-run after changing either source."""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
src = (HERE / "start-private.sh").read_text()
gate = (HERE / "pod_gate.py").read_text()
assert "GATEPY" not in gate

SUBS = [
    ("# One attended compatibility attempt; provider compute must also be stopped externally.",
     "# POD-PROXY VARIANT of the verified private wrapper: the ONLY HTTP port is an authenticating gate (pod_gate.py) in front of a\n"
     "# loopback vLLM; vLLM's own --api-key is not sufficient (it leaves /invocations unauthenticated). SSH stays for operator upload.\n"
     "# One attended compatibility attempt; provider compute must also be stopped externally."),
    ("sshd_pid=''; model_pid=''; timer_pid=''", "sshd_pid=''; model_pid=''; timer_pid=''; gate_pid=''"),
    ("  [[ -z \"$sshd_pid\" ]] || kill \"$sshd_pid\" 2>/dev/null || true\n",
     "  [[ -z \"$gate_pid\" ]] || kill \"$gate_pid\" 2>/dev/null || true\n  [[ -z \"$sshd_pid\" ]] || kill \"$sshd_pid\" 2>/dev/null || true\n"),
    ("chmod 600 /run/bhoomi/api-key\n",
     "chmod 600 /run/bhoomi/api-key\n"
     ": \"${BHOOMI_EDGE_KEY:?Pod proxy mode needs BHOOMI_EDGE_KEY (32+ chars; the bearer key the relay presents)}\"\n"
     "[[ ${#BHOOMI_EDGE_KEY} -ge 32 && \"$BHOOMI_EDGE_KEY\" =~ ^[A-Za-z0-9_-]+$ ]] || exit 65\n"
     "printf '%s' \"$BHOOMI_EDGE_KEY\" > /run/bhoomi/edge-key\nchmod 600 /run/bhoomi/edge-key\nunset BHOOMI_EDGE_KEY\n"
     "cat > /run/bhoomi/pod_gate.py <<'GATEPY'\n" + gate + ("" if gate.endswith("\n") else "\n") + "GATEPY\n"
     "python3 /run/bhoomi/pod_gate.py > /run/bhoomi/gate.log 2>&1 &\ngate_pid=$!\n"),
    ("--host 127.0.0.1 --port 8000", "--host 127.0.0.1 --port 8001"),
    ("wait -n \"$sshd_pid\" \"$model_pid\"", "wait -n \"$sshd_pid\" \"$model_pid\" \"$gate_pid\""),
]
out = src
for old, new in SUBS:
    assert out.count(old) == 1, f"substitution must apply exactly once: {old[:70]!r} ({out.count(old)})"
    out = out.replace(old, new)
(HERE / "start-pod-proxy.sh").write_text(out)
print(f"start-pod-proxy.sh written ({len(out)} chars, {len(SUBS)} substitutions)")
