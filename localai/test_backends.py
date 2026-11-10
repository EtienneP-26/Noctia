"""Tests for localai.backends."""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from localai.backends import BackendError, ask  # noqa: E402


@dataclass(frozen=True)
class Backend:
    """Stand-in for localai.config.Backend."""
    name: str = "t"
    type: str = "openai"
    base_url: str = ""
    model: str = "m"
    api_key_env: str = ""
    argv: list = field(default_factory=list)
    timeout: int = 5


SEEN = {}


class Handler(BaseHTTPRequestHandler):
    """Stub chat/completions server."""

    def do_POST(self):
        """Record the request and answer."""
        n = int(self.headers["Content-Length"])
        SEEN["body"] = json.loads(self.rfile.read(n))
        SEEN["auth"] = self.headers.get("Authorization")
        SEEN["path"] = self.path
        out = json.dumps({"choices": [{"message": {"content": "hi"}}]}).encode()
        self.send_response(200)
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        """Silence logs."""


class OpenAITest(unittest.TestCase):
    """OpenAI-compatible path."""

    def setUp(self):
        """Start the stub server."""
        self.srv = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_port}/v1"

    def tearDown(self):
        """Stop the stub server."""
        self.srv.shutdown()
        self.srv.server_close()

    def test_ok(self):
        """Sends auth and body, returns content."""
        os.environ["TEST_KEY_X"] = "secret"
        b = Backend(base_url=self.url, api_key_env="TEST_KEY_X")
        self.assertEqual(ask(b, "q", system="s", max_tokens=7), "hi")
        self.assertEqual(SEEN["auth"], "Bearer secret")
        self.assertEqual(SEEN["path"], "/v1/chat/completions")
        self.assertEqual(SEEN["body"]["max_tokens"], 7)
        self.assertEqual(SEEN["body"]["messages"][0]["role"], "system")

    def test_connection_error(self):
        """Unreachable server raises BackendError."""
        with self.assertRaises(BackendError):
            ask(Backend(base_url="http://127.0.0.1:1/v1"), "q")

    def test_prompt_too_long(self):
        """Oversized prompt is rejected."""
        with self.assertRaises(BackendError):
            ask(Backend(base_url=self.url), "x" * 100_001)


class RedirectTest(unittest.TestCase):
    """Redirects must not leak the key."""

    def test_redirect_refused(self):
        """302 to another port: key never sent there."""
        SEEN.clear()
        target = HTTPServer(("127.0.0.1", 0), Handler)
        loc = f"http://127.0.0.1:{target.server_port}/x"

        class Redir(BaseHTTPRequestHandler):
            """Redirect everything."""

            def do_POST(self):
                """Answer 302."""
                self.send_response(302)
                self.send_header("Location", loc)
                self.end_headers()

            def log_message(self, *a):
                """Silence logs."""

        src = HTTPServer(("127.0.0.1", 0), Redir)
        for s in (src, target):
            threading.Thread(target=s.serve_forever, daemon=True).start()
        os.environ["TEST_KEY_X"] = "secret"
        b = Backend(base_url=f"http://127.0.0.1:{src.server_port}/v1",
                    api_key_env="TEST_KEY_X")
        with self.assertRaises(BackendError):
            ask(b, "q")
        for s in (src, target):
            s.shutdown()
            s.server_close()
        self.assertNotIn("auth", SEEN)


class CommandTest(unittest.TestCase):
    """Command path."""

    def run_script(self, code, timeout=5):
        """Write code to a temp script and ask it."""
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "s.py")
            with open(p, "w") as f:
                f.write(code)
            b = Backend(type="command", argv=[sys.executable, p], timeout=timeout)
            return ask(b, "hello")

    def test_ok(self):
        """Valid JSON output is returned."""
        code = ("import sys,json\nd=json.load(sys.stdin)\n"
                "print(json.dumps({'text': d['prompt']+'!'}))")
        self.assertEqual(self.run_script(code), "hello!")

    def test_truncate(self):
        """Response is cut to 50000 chars."""
        code = "import json\nprint(json.dumps({'text': 'a'*60000}))"
        self.assertEqual(len(self.run_script(code)), 50_000)

    def test_bad_json(self):
        """Non-JSON stdout raises BackendError."""
        with self.assertRaises(BackendError):
            self.run_script("print('nope')")

    def test_nonzero(self):
        """Non-zero exit raises BackendError."""
        with self.assertRaises(BackendError):
            self.run_script("import sys\nsys.exit(3)")

    def test_timeout(self):
        """Timeout raises BackendError."""
        with self.assertRaises(BackendError):
            self.run_script("import time\ntime.sleep(5)", timeout=1)

    def test_timeout_kills_children(self):
        """No child survives a timeout."""
        with tempfile.TemporaryDirectory() as d:
            pidf = os.path.join(d, "pid")
            code = ("import subprocess,time\n"
                    f"p=subprocess.Popen(['sleep','30'])\n"
                    f"open({pidf!r},'w').write(str(p.pid))\n"
                    "time.sleep(30)")
            with self.assertRaises(BackendError):
                self.run_script(code, timeout=1)
            pid = int(open(pidf).read())
            time.sleep(0.3)
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_output_too_large(self):
        """Output over 1 MB is rejected."""
        with self.assertRaises(BackendError):
            self.run_script("print('a'*1_100_000)")


if __name__ == "__main__":
    unittest.main()
