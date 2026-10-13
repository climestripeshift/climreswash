"""Clean-checkout cloud startup: tracked permitted data, no inference or frozen evaluation data."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from support import ROOT
from bhoomi_ai.config import _active_profile, load_config
from bhoomi_ai.data_access import RESTRICTED_KEYS
from bhoomi_ai.llm.factory import make_backend
from bhoomi_ai.server import serve

REPO = ROOT.parents[1]
_reads = None


def _audit(event, args):
    if _reads is not None and event == "open" and args and isinstance(args[0], (str, bytes, Path)):
        _reads.append(Path(os.fsdecode(args[0])).resolve())


sys.addaudithook(_audit)


class ReleaseStartup(unittest.TestCase):
    def test_cloud_starts_with_tracked_permitted_sources_and_a_fresh_private_cache(self):
        global _reads
        tracked = set(subprocess.check_output(["git", "ls-files", "-z"], cwd=REPO).decode().split("\0"))
        data_root = ROOT / "data"
        data_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="release-startup-", dir=data_root) as temp:
            env = {"BHOOMI_DEPLOYMENT_PROFILE": "cloud_beta", "BHOOMI_CORE_DATA_DIR": temp,
                   "BHOOMI_GATEWAY_KEY": "synthetic-gateway-" * 3, "NODE_ENV": "research", "BHOOMI_AI_ENV": "research",
                   "BHOOMI_LLM_BACKEND": "openai_compat", "BHOOMI_LLM_EXPERIMENTAL": "1",
                   "BHOOMI_LLM_BASE_URL": "http://127.0.0.1:1/v1", "BHOOMI_LLM_MODEL": "bhoomi-llm-v1-ckpt160",
                   "BHOOMI_LLM_MODEL_ID": "adapter-B-full2ep-experimental-machine-verified",
                   "BHOOMI_LLM_REGISTRY": str(REPO / "research/bhoomi_llm_v1/registry/models.json")}
            server = None
            try:
                _reads = []
                with patch.dict(os.environ, env, clear=True):
                    cfg = load_config()
                    self.assertEqual(cfg["deployment_profile"], "cloud_beta")
                    cfg["server"]["port"] = 0
                    backend = make_backend(cfg)
                    # Startup must not even ask the relay for model metadata or inference.
                    with patch.object(backend, "_request", side_effect=AssertionError("No model calls during startup")):
                        server, app = serve(cfg=cfg, backend=backend)
                        self.assertEqual(server.server_address[0], "127.0.0.1")
                        self.assertGreater(server.server_address[1], 0)
                        self.assertEqual(app.agent.registry.profile, "cloud_beta")
                        store = app.agent.store
                        self.assertTrue(store.cache()["districts"])
                        for key in RESTRICTED_KEYS | {"forecast"}:
                            with self.assertRaises(PermissionError):
                                store.path(key)
                        for key in ("hex_props", "hist_climate"):
                            self.assertIn(store.path(key).relative_to(REPO).as_posix(), tracked)
                        self.assertEqual(cfg["doc_sources"], [REPO / "METHODOLOGY.md"])
                        for source in _reads:
                            if REPO not in source.parents or source.suffix not in {".json", ".csv", ".md", ".txt"}:
                                continue
                            self.assertNotIn("test_v3", source.as_posix())
                            self.assertNotIn("bhoomi_flood_v0", source.as_posix())
                            self.assertNotIn("bhoomi_monsoon_v0", source.as_posix())
                            if Path(temp) not in source.parents:
                                self.assertIn(source.relative_to(REPO).as_posix(), tracked)
            finally:
                _reads = None
                _active_profile["name"] = None
                if server:
                    server.server_close()
