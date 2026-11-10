"""Tests for localai.config."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import ConfigError, load_config, public_view  # noqa: E402

OPENAI = {"type": "openai", "base_url": "http://127.0.0.1:8000/v1", "model": "qwen",
          "api_key_env": "VLLM_API_KEY", "timeout": 60}
COMMAND = {"type": "command", "argv": ["python3", "run.py"], "timeout": 30}


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
        cfg = self.load({"vllm": OPENAI, "laya": COMMAND})
        self.assertEqual(cfg["vllm"].model, "qwen")
        self.assertEqual(cfg["laya"].argv, ("python3", "run.py"))
        self.assertEqual(cfg["laya"].timeout, 30)

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
