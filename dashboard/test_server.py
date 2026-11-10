"""Tests for server.py using a synthetic projects dir."""
import http.client
import json
import os
import tempfile
import threading
import unittest
from unittest import mock
from pathlib import Path

from dashboard import server


def rec(role, text, ts):
    """Return one synthetic transcript line."""
    return json.dumps({"type": role, "timestamp": ts,
                       "message": {"role": role, "content": text}}) + "\n"


class ServerTest(unittest.TestCase):
    """End-to-end tests against a thread-run server."""

    def setUp(self):
        """Create fake transcripts and start the server on a free port."""
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.main = self.root / "abc-1.jsonl"
        self.main.write_text(rec("user", "hello", "2026-01-01T00:00:01Z"))
        sub = self.root / "abc-1" / "subagents"
        sub.mkdir(parents=True)
        (sub / "agent-x.jsonl").write_text(rec("assistant", "hi", "2026-01-01T00:00:02Z"))
        self.agents = self.root / "agents"
        self.agents.mkdir()
        (self.agents / "dev.md").write_text("---\nname: dev\nmodel: sonnet\n---\nbody\n")
        env = mock.patch.dict(os.environ, {"NOCTIA_AGENTS_SETTINGS": str(self.root / "a.json")})
        env.start()
        self.addCleanup(env.stop)
        self.srv = server.make_server(self.root, 0, self.agents)
        self.port = self.srv.server_port
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        """Stop the server and drop temp files."""
        self.srv.shutdown()
        self.srv.server_close()
        self.tmp.cleanup()

    def get(self, path, host=None):
        """Return (status, body) for a GET with an optional Host header."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.putrequest("GET", path, skip_host=True)
        conn.putheader("Host", host or f"127.0.0.1:{self.port}")
        conn.endheaders()
        resp = conn.getresponse()
        body = resp.read()
        conn.close()
        return resp.status, body

    def test_sessions(self):
        """Sessions list has id and title."""
        code, body = self.get("/api/sessions")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)[0]["id"], "abc-1")
        self.assertEqual(json.loads(body)[0]["title"], "hello")

    def usage(self, content):
        """Write content to a temp usage file (None = none) and GET /api/usage."""
        path = self.root / "usage.json"
        if content is not None:
            path.write_text(content)
        with mock.patch.dict(os.environ, {"NOCTIA_USAGE_FILE": str(path)}):
            code, body = self.get("/api/usage")
        self.assertEqual(code, 200)
        return json.loads(body)

    def test_usage_valid(self):
        """A valid file is returned, unknown keys dropped."""
        win = {"used_percentage": 42.5, "resets_at": 1900000000, "x": 1}
        got = self.usage(json.dumps({"updated_at": 1800000000, "five_hour": win,
                                     "seven_day": None, "extra": 1}))
        self.assertEqual(got, {"updated_at": 1800000000, "seven_day": None,
                               "five_hour": {"used_percentage": 42.5, "resets_at": 1900000000}})

    def test_usage_missing(self):
        """A missing file gives all nulls."""
        self.assertEqual(self.usage(None),
                         {"updated_at": None, "five_hour": None, "seven_day": None})

    def test_usage_garbage(self):
        """Garbage or oversized content gives all nulls."""
        empty = {"updated_at": None, "five_hour": None, "seven_day": None}
        self.assertEqual(self.usage("not json{"), empty)
        self.assertEqual(self.usage(json.dumps({"updated_at": 1, "pad": "x" * 5000})), empty)

    def test_usage_clamped(self):
        """Out-of-range percentages are clamped to 0..100."""
        win = lambda p: {"used_percentage": p, "resets_at": 5}
        got = self.usage(json.dumps({"updated_at": 1, "five_hour": win(150), "seven_day": win(-3)}))
        self.assertEqual(got["five_hour"]["used_percentage"], 100)
        self.assertEqual(got["seven_day"]["used_percentage"], 0)

    def test_events(self):
        """Events merge main and subagent, sorted."""
        code, body = self.get("/api/events?session=abc-1")
        self.assertEqual(code, 200)
        self.assertEqual([e["text"] for e in json.loads(body)], ["hello", "hi"])

    def test_bad_session(self):
        """Invalid session id gives 400."""
        self.assertEqual(self.get("/api/events?session=../x")[0], 400)
        self.assertEqual(self.get("/api/events")[0], 400)

    def test_bad_host(self):
        """Foreign Host gives 403."""
        self.assertEqual(self.get("/api/sessions", host="evil.com")[0], 403)

    def test_traversal(self):
        """Path traversal gives 404."""
        self.assertEqual(self.get("/static/../server.py")[0], 404)
        self.assertEqual(self.get("/static/%2e%2e/server.py")[0], 404)

    def post(self, path, body, origin="ok", ctype="application/json", host=None):
        """Return (status, body) for a POST; origin 'ok' means the local one."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Content-Type": ctype}
        if host:
            headers["Host"] = host
        if origin == "ok":
            origin = f"http://127.0.0.1:{self.port}"
        if origin:
            headers["Origin"] = origin
        conn.request("POST", path, body=body, headers=headers)
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        return resp.status, data

    def test_agents_list(self):
        """GET /api/agents lists agents."""
        code, body = self.get("/api/agents")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)[0]["name"], "dev")

    def test_set_model(self):
        """POST model updates the agent."""
        code, body = self.post("/api/agents/dev/model", '{"model": "opus"}')
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["model"], "opus")

    def test_bad_model(self):
        """Unknown model gives 400 with error."""
        code, body = self.post("/api/agents/dev/model", '{"model": "gpt"}')
        self.assertEqual(code, 400)
        self.assertIn("error", json.loads(body))

    def test_set_enabled(self):
        """POST enabled toggles the agent."""
        code, body = self.post("/api/agents/dev/enabled", '{"enabled": false}')
        self.assertEqual(code, 200)
        self.assertFalse(json.loads(body)["enabled"])

    def test_post_origin(self):
        """Missing or foreign Origin gives 403."""
        self.assertEqual(self.post("/api/agents/dev/model", "{}", origin=None)[0], 403)
        self.assertEqual(self.post("/api/agents/dev/model", "{}", origin="http://evil.com")[0], 403)

    def test_post_content_type(self):
        """Non-JSON content type gives 400."""
        code = self.post("/api/agents/dev/model", "{}", ctype="text/plain")[0]
        self.assertEqual(code, 400)

    def test_post_too_large(self):
        """Body over 4 KB gives 413."""
        big = json.dumps({"model": "x" * 5000})
        self.assertEqual(self.post("/api/agents/dev/model", big)[0], 413)

    def test_sse(self):
        """SSE delivers an appended line."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/api/stream?session=abc-1")
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        with self.main.open("a") as fh:
            fh.write(rec("user", "appended", "2026-01-01T00:00:03Z"))
        data = resp.fp.readline().decode()
        conn.close()
        self.assertIn("appended", data)

    def open_stream(self):
        """Open an SSE stream and return (connection, response)."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/api/stream?session=abc-1")
        return conn, conn.getresponse()

    def test_sse_preexisting_brief(self):
        """A report of a brief written before the stream keeps its task id."""
        use = {"type": "assistant", "timestamp": "2026-01-01T00:00:04Z", "message": {
            "role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "Agent",
            "input": {"description": "W1\u00b7T1 do it", "subagent_type": "developer", "prompt": "p"}}]}}
        with self.main.open("a") as fh:
            fh.write(json.dumps(use) + "\n")
        conn, resp = self.open_stream()
        res = {"type": "user", "timestamp": "2026-01-01T00:00:05Z", "message": {
            "role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "done"}]}}
        with self.main.open("a") as fh:
            fh.write(json.dumps(res) + "\n")
        event = json.loads(resp.fp.readline().decode()[6:])
        conn.close()
        self.assertEqual(event["kind"], "report")
        self.assertTrue(event["task"])

    def test_stream_cap(self):
        """The 9th concurrent stream gets 503."""
        conns = [self.open_stream() for _ in range(8)]
        self.assertEqual([r.status for _, r in conns], [200] * 8)
        conn, resp = self.open_stream()
        self.assertEqual(resp.status, 503)
        for c, _ in [*conns, (conn, resp)]:
            c.close()

    def test_enabled_not_bool(self):
        """Non-boolean enabled gives 400."""
        self.assertEqual(self.post("/api/agents/dev/enabled", '{"enabled": "no"}')[0], 400)

    def allow(self, *names):
        """Set the allowed host names on the running handler class."""
        self.srv.RequestHandlerClass.allow_hosts = frozenset(names)

    def test_allowed_host(self):
        """Allowed Host passes with or without port and trailing dot."""
        self.allow("m.tn.ts.net")
        for host in ("m.tn.ts.net", "m.tn.ts.net:8443", "M.TN.ts.net.", "m.tn.ts.net.:443"):
            self.assertEqual(self.get("/api/sessions", host)[0], 200, host)

    def test_unknown_host(self):
        """Unlisted or malformed host gives 403."""
        self.allow("m.tn.ts.net")
        for host in ("evil.ts.net", "m.tn.ts.net:abc", "x.m.tn.ts.net"):
            self.assertEqual(self.get("/api/sessions", host)[0], 403, host)
        self.allow()
        self.assertEqual(self.get("/api/sessions", "m.tn.ts.net")[0], 403)

    def test_post_allowed_origin(self):
        """POST with https origin of an allowed name passes; http fails."""
        self.allow("m.tn.ts.net")
        url = "/api/agents/dev/enabled"
        for origin in ("https://m.tn.ts.net", "https://m.tn.ts.net:8443"):
            self.assertEqual(self.post(url, '{"enabled": true}', origin, host="m.tn.ts.net")[0], 200)
        for origin in ("http://m.tn.ts.net", "https://evil.net"):
            self.assertEqual(self.post(url, '{"enabled": true}', origin, host="m.tn.ts.net")[0], 403)

    def test_parse_hosts(self):
        """Valid names are lowercased; wildcards, ports, schemes are rejected."""
        self.assertEqual(server.parse_hosts(["A.Ts.Net"]), ["a.ts.net"])
        for bad in ("*.ts.net", "a.ts.net:443", "https://a.ts.net", "", "a..b", "-a.net"):
            with self.assertRaises(ValueError):
                server.parse_hosts([bad])


class LocalAiTest(ServerTest):
    """Tests for /api/localai."""

    def api(self, backends):
        """Write a config with backends and return the parsed /api/localai reply."""
        path = self.root / "localai.json"
        path.write_text(backends if isinstance(backends, str) else json.dumps({"backends": backends}))
        server._LOCALAI_CACHE.clear()
        with mock.patch.dict(os.environ, {"NOCTIA_LOCALAI_CONFIG": str(path)}):
            code, body = self.get("/api/localai")
        self.assertEqual(code, 200)
        return json.loads(body)

    def stub(self):
        """Start a stub HTTP server answering 200 and return its port."""
        from http.server import BaseHTTPRequestHandler, HTTPServer

        class H(BaseHTTPRequestHandler):
            """Answer every GET with 200."""

            def do_GET(self):
                """Reply 200."""
                self.send_response(200)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *a):
                """Silence logs."""

        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        return srv.server_port

    def openai(self, port):
        """Return an openai backend config on a local port."""
        return {"type": "openai", "base_url": f"http://127.0.0.1:{port}/v1", "model": "m"}

    def test_openai_up(self):
        """A reachable openai backend is up."""
        got = self.api({"a": self.openai(self.stub())})
        self.assertEqual(got["backends"][0]["status"], "up")

    def test_openai_down(self):
        """A closed port is down."""
        import socket
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()
        self.assertEqual(self.api({"a": self.openai(port)})["backends"][0]["status"], "down")

    def test_command_ready_missing(self):
        """Command backends are ready or missing; argv is never exposed."""
        got = self.api({"r": {"type": "command", "argv": ["env", "A=1", "/bin/sh", "-c", "x"]},
                        "m": {"type": "command", "argv": ["/nonexistent/zzz"]}})
        self.assertEqual([b["status"] for b in got["backends"]], ["ready", "missing"])
        self.assertNotIn("argv", json.dumps(got))

    def test_bad_config(self):
        """An invalid config gives an error and no backends."""
        got = self.api("{not json")
        self.assertEqual(got["backends"], [])
        self.assertIn("error", got)


if __name__ == "__main__":
    unittest.main()
