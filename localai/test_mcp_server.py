"""Tests for localai.server (driven over stdio)."""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, "server.py")


def rpc(id_, method, params=None):
    """Build a JSON-RPC request line."""
    return json.dumps({"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}})


class ServerTest(unittest.TestCase):
    """End-to-end server behaviour."""

    def setUp(self):
        """Create a temp config with a command backend."""
        self.tmp = tempfile.TemporaryDirectory()
        script = os.path.join(self.tmp.name, "echo.py")
        with open(script, "w") as fh:
            fh.write("import sys\nimport json\nprint(json.dumps({'text': 'echo:' + json.load(sys.stdin)['prompt']}))\n")
        self.cfg = os.path.join(self.tmp.name, "c.json")
        with open(self.cfg, "w") as fh:
            json.dump({"backends": {"echo": {"type": "command",
                                             "argv": [sys.executable, script],
                                             "timeout": 10}}}, fh)

    def tearDown(self):
        """Remove temp files."""
        self.tmp.cleanup()

    def run_server(self, lines):
        """Send lines (str or bytes) to the server, return parsed responses."""
        env = dict(os.environ, NOCTIA_LOCALAI_CONFIG=self.cfg)
        data = b"\n".join(x if isinstance(x, bytes) else x.encode() for x in lines) + b"\n"
        proc = subprocess.run([sys.executable, SERVER], input=data,
                              capture_output=True, env=env, timeout=30)
        return [json.loads(x) for x in proc.stdout.decode().splitlines()]

    def call(self, name, args):
        """Call one tool and return its result."""
        out = self.run_server([rpc(1, "tools/call", {"name": name, "arguments": args})])
        return out[0]["result"]

    def test_initialize_and_list(self):
        """initialize echoes version; tools/list has two tools; notifications are silent."""
        out = self.run_server([
            rpc(1, "initialize", {"protocolVersion": "2024-11-05"}),
            json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}),
            rpc(2, "tools/list")])
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(out[0]["result"]["serverInfo"]["name"], "noctia-localai")
        self.assertEqual([t["name"] for t in out[1]["result"]["tools"]],
                         ["list_local", "ask_local"])

    def test_list_local(self):
        """list_local returns the public view."""
        res = self.call("list_local", {})
        self.assertFalse(res["isError"])
        self.assertIn("echo", res["content"][0]["text"])

    def test_ask_local(self):
        """ask_local reaches a command backend."""
        res = self.call("ask_local", {"backend": "echo", "prompt": "hi"})
        self.assertFalse(res["isError"])
        self.assertIn("echo:", res["content"][0]["text"])

    def test_unknown_backend_and_bad_args(self):
        """Errors are isError results."""
        self.assertTrue(self.call("ask_local", {"backend": "nope", "prompt": "x"})["isError"])
        self.assertTrue(self.call("ask_local", {"backend": "echo"})["isError"])
        self.assertTrue(self.call("ask_local", {"backend": "echo", "prompt": "x",
                                                "max_tokens": 99999})["isError"])

    def test_protocol_errors(self):
        """Bad JSON gives -32700, unknown method -32601."""
        out = self.run_server(["{nope", rpc(3, "bogus")])
        self.assertEqual(out[0]["error"]["code"], -32700)
        self.assertEqual(out[1]["error"]["code"], -32601)

    def test_invalid_utf8_then_ping(self):
        """Invalid UTF-8 gives -32700 and the server still answers the next ping."""
        out = self.run_server([b"\xff\xfe{\"jsonrpc\": \"2.0\"}", rpc(5, "ping")])
        self.assertEqual(out[0]["error"]["code"], -32700)
        self.assertEqual(out[1]["id"], 5)
        self.assertEqual(out[1]["result"], {})

    def test_deep_nesting_then_ping(self):
        """Deeply nested JSON gives -32700 and the server still answers the next ping."""
        out = self.run_server(["[" * 100000, rpc(6, "ping")])
        self.assertEqual(out[0]["error"]["code"], -32700)
        self.assertEqual(out[1]["id"], 6)
        self.assertEqual(out[1]["result"], {})

    def test_oversized_line_then_ping(self):
        """A line over 1 MB gives -32700, its remainder is discarded, and the next ping works."""
        big = '"' + "a" * (1024 * 1024 + 10) + '"'
        out = self.run_server([big, rpc(7, "ping")])
        self.assertEqual(out[0]["error"]["code"], -32700)
        self.assertEqual(out[1]["id"], 7)
        self.assertEqual(out[1]["result"], {})


if __name__ == "__main__":
    unittest.main()
