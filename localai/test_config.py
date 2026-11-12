"""Tests for localai.config."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (ConfigError, load_config, public_view,  # noqa: E402
                    remove_backend, save_backend, validate_backend)

OPENAI = {"type": "openai", "base_url": "http://127.0.0.1:8000/v1", "model": "qwen",
          "api_key_env": "VLLM_API_KEY", "timeout": 60}
COMMAND = {"type": "command", "argv": ["python3", "run.py"], "timeout": 30}


class WriteTest(unittest.TestCase):
    """Config writing."""

    def setUp(self):
        """Create a temp config path."""
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "sub", "c.json")

    def test_save_new_and_roundtrip(self):
        """A saved backend loads back."""
        save_backend("a", OPENAI, self.path)
        save_backend("b", COMMAND, self.path)
        got = load_config(self.path)
        self.assertEqual(got["a"].model, "qwen")
        self.assertEqual(got["b"].argv, ("python3", "run.py"))

    def test_update(self):
        """Saving an existing name replaces it."""
        save_backend("a", OPENAI, self.path)
        save_backend("a", dict(OPENAI, model="other"), self.path)
        self.assertEqual(load_config(self.path)["a"].model, "other")

    def test_remove(self):
        """Remove returns True then False."""
        save_backend("a", OPENAI, self.path)
        self.assertTrue(remove_backend("a", self.path))
        self.assertFalse(remove_backend("a", self.path))
        self.assertEqual(load_config(self.path), {})

    def test_remove_missing_file(self):
        """Remove on a missing file is False and creates nothing."""
        self.assertFalse(remove_backend("a", self.path))
        self.assertFalse(os.path.exists(self.path))

    def test_invalid_inputs(self):
        """Bad name, api_key, URL and userinfo are rejected."""
        for name, spec in [("Bad Name", OPENAI), ("a", dict(OPENAI, api_key="x")),
                           ("a", dict(OPENAI, base_url="ftp://h")),
                           ("a", dict(OPENAI, base_url="http://u:p@h/v1")),
                           ("a", dict(OPENAI, extra=1))]:
            with self.assertRaises(ConfigError):
                save_backend(name, spec, self.path)
        self.assertFalse(os.path.exists(self.path))

    def test_modes(self):
        """File is 0600 and directory 0700."""
        save_backend("a", OPENAI, self.path)
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(os.path.dirname(self.path)).st_mode & 0o777, 0o700)

    def test_validate_returns_dict(self):
        """validate_backend returns a plain dict."""
        self.assertEqual(validate_backend("b", COMMAND)["argv"], ["python3", "run.py"])


class ConfigTest(unittest.TestCase):
    """Config loading and validation."""

    def load(self, backends):
        """Write backends to a temp file and load it."""
        with tempfile.TemporaryDirectory() as tmp:
            p = os.path.join(tmp, "c.json")
            with open(p, "w") as fh:
                json.dump({"backends": backends}, fh)
            return load_config(p)

    def bad(self, backends, word):
        """Assert a ConfigError mentioning word."""
        with self.assertRaises(ConfigError) as ctx:
            self.load(backends)
        self.assertIn(word, str(ctx.exception))

    def test_valid(self):
        """Both types load."""
        cfg = self.load({"vllm": OPENAI, "script": COMMAND})
        self.assertEqual(cfg["vllm"].model, "qwen")
        self.assertEqual(cfg["script"].argv, ("python3", "run.py"))
        self.assertEqual(cfg["script"].timeout, 30)

    def test_default_timeout(self):
        """Timeout defaults to 60."""
        cfg = self.load({"a": {"type": "command", "argv": ["x"]}})
        self.assertEqual(cfg["a"].timeout, 60)

    def test_missing_file(self):
        """Missing file gives empty config."""
        self.assertEqual(load_config("/nonexistent/x.json"), {})

    def test_env_path(self):
        """Env var selects the file."""
        with tempfile.TemporaryDirectory() as tmp:
            p = os.path.join(tmp, "c.json")
            with open(p, "w") as fh:
                json.dump({"backends": {"a": COMMAND}}, fh)
            os.environ["NOCTIA_LOCALAI_CONFIG"] = p
            try:
                self.assertIn("a", load_config())
            finally:
                del os.environ["NOCTIA_LOCALAI_CONFIG"]

    def test_bad_name(self):
        """Invalid name rejected."""
        self.bad({"Bad Name": COMMAND}, "name")

    def test_bad_type(self):
        """Invalid type rejected."""
        self.bad({"a": {"type": "ftp"}}, "type")

    def test_bad_scheme(self):
        """Non-http scheme rejected."""
        self.bad({"a": dict(OPENAI, base_url="file:///etc")}, "base_url")

    def test_url_credentials_rejected(self):
        """Userinfo in base_url rejected, so it never reaches the model view."""
        self.bad({"a": dict(OPENAI, base_url="http://user:pass@host/v1")}, "credentials")
        self.bad({"a": dict(OPENAI, base_url="http://user@host/v1")}, "credentials")

    def test_malformed_url_rejected(self):
        """Malformed URL gives ConfigError, not ValueError."""
        self.bad({"a": dict(OPENAI, base_url="http://[::1")}, "base_url")
        self.bad({"a": dict(OPENAI, base_url="http://host:99999/v1")}, "base_url")

    def test_missing_host_rejected(self):
        """URL without hostname rejected."""
        self.bad({"a": dict(OPENAI, base_url="http://:8000/v1")}, "missing host")

    def test_empty_model(self):
        """Empty model rejected."""
        self.bad({"a": dict(OPENAI, model="")}, "model")

    def test_bad_env_name(self):
        """Key value instead of env name rejected."""
        self.bad({"a": dict(OPENAI, api_key_env="sk-abc123")}, "api_key_env")

    def test_api_key_rejected(self):
        """api_key field rejected."""
        self.bad({"a": dict(OPENAI, api_key="sk-x")}, "api_key")

    def test_bad_argv(self):
        """Empty or non-string argv rejected."""
        self.bad({"a": {"type": "command", "argv": []}}, "argv")
        self.bad({"a": {"type": "command", "argv": [1]}}, "argv")

    def test_bad_timeout(self):
        """Out of range timeout rejected."""
        self.bad({"a": dict(COMMAND, timeout=0)}, "timeout")
        self.bad({"a": dict(COMMAND, timeout=601)}, "timeout")

    def test_unknown_field(self):
        """Unknown field rejected, including cross-type fields."""
        self.bad({"a": dict(COMMAND, foo=1)}, "foo")
        self.bad({"a": dict(COMMAND, model="m")}, "model")

    def test_public_view(self):
        """Public view has no secrets or env names."""
        view = public_view(self.load({"v": OPENAI}))
        self.assertNotIn("api_key_env", view[0])
        self.assertEqual(view[0]["name"], "v")


if __name__ == "__main__":
    unittest.main()


def test_concurrent_saves_keep_all(tmp_path):
    """20 parallel saves leave valid JSON with every backend."""
    import json
    import threading
    path = str(tmp_path / "localai.json")
    spec = {"type": "command", "argv": ["echo"]}
    threads = [threading.Thread(target=save_backend, args=(f"b{i}", spec, path))
               for i in range(20)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    data = json.load(open(path))
    assert set(data["backends"]) == {f"b{i}" for i in range(20)}
