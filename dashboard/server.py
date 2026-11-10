"""Local read-only dashboard server for Claude Code transcripts (stdlib only)."""
import argparse
import json
import math
import os
import http.client
import importlib.util
import re
import shutil
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    from dashboard import agents, transcript
except ImportError:  # run as a script: dashboard/ is sys.path[0]
    import agents
    import transcript

STATIC = Path(__file__).resolve().parent / "static"
SESSION_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8"}
POLL, HEARTBEAT = 0.5, 5
MAX_STREAMS = 8
AGENTS_DIR = Path(__file__).resolve().parent.parent / "agents"
LOCALAI_CONFIG = Path(__file__).resolve().parent.parent / "localai" / "config.py"
PROBE_TIMEOUT, CACHE_TTL = 1.5, 30
_LOCALAI_CACHE = {}
_LOCALAI_LOCK = threading.Lock()
MAX_BODY = 4096
MAX_USAGE = 4096
AGENT_POST_RE = re.compile(r"^/api/agents/([A-Za-z0-9_-]{1,64})/(model|enabled)$")


HOST_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9-]{0,62})(\.[A-Za-z0-9]([A-Za-z0-9-]{0,62}))*$")


def transcripts_dir(project):
    """Return ~/.claude/projects/<absolute project path with '/' as '-'>."""
    name = str(Path(project).resolve()).replace("/", "-")
    return Path.home() / ".claude" / "projects" / name


def session_files(root, session):
    """List the main and subagent jsonl files of one session."""
    root = Path(root)
    return [p for p in [root / f"{session}.jsonl",
                        *sorted((root / session / "subagents").glob("*.jsonl"))]
            if p.is_file()]


def list_sessions(root):
    """Return [{id, mtime, title}] for main transcripts, newest first."""
    out = []
    for path in Path(root).glob("*.jsonl"):
        events = transcript.parse_file(path)
        title = next((e["text"] for e in events if e["kind"] == "user" and e["text"]), "")
        out.append({"id": path.stem, "mtime": path.stat().st_mtime, "title": title[:80]})
    return sorted(out, key=lambda s: s["mtime"], reverse=True)


def session_events(root, session):
    """Return all events of a session (main + subagents) sorted by ts."""
    events = [e for p in session_files(root, session) for e in transcript.parse_file(p)]
    return sorted(events, key=lambda e: e.get("ts") or "")


def _num(value):
    """Return value as a finite number, or None (booleans are rejected)."""
    ok = isinstance(value, (int, float)) and not isinstance(value, bool)
    return value if ok and math.isfinite(value) else None


def _window(win):
    """Return a validated usage window, or None if malformed."""
    if not isinstance(win, dict):
        return None
    used, reset = _num(win.get("used_percentage")), _num(win.get("resets_at"))
    if used is None or reset is None:
        return None
    return {"used_percentage": min(100, max(0, used)), "resets_at": reset}


def read_usage():
    """Return the sanitized usage snapshot; all null if missing or invalid."""
    empty = {"updated_at": None, "five_hour": None, "seven_day": None}
    path = os.environ.get("NOCTIA_USAGE_FILE") or Path.home() / ".claude" / "noctia" / "usage.json"
    try:
        with open(path, "rb") as fh:
            raw = fh.read(MAX_USAGE + 1)
        data = json.loads(raw) if len(raw) <= MAX_USAGE else None
    except (OSError, ValueError):
        return empty
    if not isinstance(data, dict):
        return empty
    return {"updated_at": _num(data.get("updated_at")),
            "five_hour": _window(data.get("five_hour")),
            "seven_day": _window(data.get("seven_day"))}


def _load_localai_config():
    """Import localai/config.py by path, without touching sys.path."""
    spec = importlib.util.spec_from_file_location("noctia_localai_config", LOCALAI_CONFIG)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _probe_openai(base_url):
    """Return 'up' if GET {base_url}/models answers with a status < 500, else 'down'."""
    url = urlparse(base_url)
    cls = http.client.HTTPSConnection if url.scheme == "https" else http.client.HTTPConnection
    try:
        conn = cls(url.hostname, url.port, timeout=PROBE_TIMEOUT)
        try:
            conn.request("GET", url.path.rstrip("/") + "/models")
            return "up" if conn.getresponse().status < 500 else "down"
        finally:
            conn.close()
    except (OSError, http.client.HTTPException, ValueError):
        return "down"


def _command_ready(argv):
    """Return 'ready' if the real command (after env VAR=val) is an executable file."""
    items = list(argv)
    if items and items[0] == "env":
        items.pop(0)
        while items and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", items[0]):
            items.pop(0)
    exe = items[0] if items else ""
    found = exe if "/" in exe else shutil.which(exe)
    ok = bool(found) and os.path.isfile(found) and os.access(found, os.X_OK)
    return "ready" if ok else "missing"


def _localai_status(backend):
    """Return the status string of one backend."""
    if backend.type == "openai":
        return _probe_openai(backend.base_url)
    return _command_ready(backend.argv)


def _localai_build():
    """Return the public backends list with status, or an error object."""
    module = _load_localai_config()
    try:
        backends = module.load_config()
    except module.ConfigError as exc:
        return {"backends": [], "error": str(exc)[:200]}
    views = module.public_view(backends)
    return {"backends": [dict(v, status=_localai_status(backends[v["name"]])) for v in views]}


def localai_info():
    """Return the localai payload, cached for CACHE_TTL seconds per config path."""
    key = os.environ.get("NOCTIA_LOCALAI_CONFIG", "")
    with _LOCALAI_LOCK:
        hit = _LOCALAI_CACHE.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_TTL:
            return hit[1]
        data = _localai_build()
        _LOCALAI_CACHE[key] = (time.monotonic(), data)
        return data


class Tailer:
    """Reads only newly appended complete lines of a session's files."""

    def __init__(self, root, session):
        """Remember the session and start with no known files."""
        self.root, self.session = root, session
        self.offsets, self.briefs = {}, {}

    def skip_existing(self):
        """Mark existing content as read, remembering its briefs."""
        self.poll()

    def _read_new(self, path):
        """Return new complete lines of one file, advancing its offset."""
        start = self.offsets.get(path, 0)
        with path.open("rb") as fh:
            fh.seek(start)
            data = fh.read()
        end = data.rfind(b"\n") + 1
        self.offsets[path] = start + end
        return data[:end].decode("utf-8", errors="replace").splitlines()

    def poll(self):
        """Return events appended since the last call, sorted by ts."""
        events = []
        for path in session_files(self.root, self.session):
            agent = transcript.agent_name(path)
            briefs = self.briefs.setdefault(path, {})
            try:
                lines = self._read_new(path)
            except OSError:
                continue
            for ln in lines:
                events += transcript.parse_line(ln, self.session, agent, briefs)
        return sorted(events, key=lambda e: e.get("ts") or "")


class Handler(BaseHTTPRequestHandler):
    """GET-only handler; class attrs `root` and `port` are set by make_server."""

    root = Path(".")
    port = 0
    agents_dir = AGENTS_DIR
    allow_hosts = frozenset()
    streams = {"n": 0, "lock": threading.Lock()}

    def log_message(self, *args):
        """Silence default request logging."""

    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8"):
        """Send a complete response."""
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj):
        """Send obj as a JSON 200 response."""
        self._send(200, json.dumps(obj).encode(), "application/json")

    def _host_name_ok(self, host):
        """True if host is an allowed name, with or without a numeric port."""
        name, _, port = host.lower().partition(":")
        return name.rstrip(".") in self.allow_hosts and (not port or port.isdigit())

    def _origin_ok(self, origin):
        """True if origin is local http or https on an allowed name."""
        if origin in (f"http://localhost:{self.port}", f"http://127.0.0.1:{self.port}"):
            return True
        scheme, sep, host = origin.partition("://")
        return bool(sep) and scheme == "https" and self._host_name_ok(host)

    def _host_ok(self):
        """True if Host and optional Origin point at this server."""
        local = {f"localhost:{self.port}", f"127.0.0.1:{self.port}"}
        origin = self.headers.get("Origin")
        if origin is not None and not self._origin_ok(origin):
            return False
        host = self.headers.get("Host") or ""
        return host in local or self._host_name_ok(host)

    def do_GET(self):
        """Check the request origin, then dispatch by path."""
        if not self._host_ok():
            return self._send(403, b"forbidden")
        url = urlparse(self.path)
        if url.path in ("/", "/index.html"):
            return self._static("index.html")
        if url.path == "/agents":
            return self._static("agents.html")
        if url.path == "/api/usage":
            return self._json(read_usage())
        if url.path == "/api/localai":
            return self._json(localai_info())
        if url.path == "/api/agents":
            return self._json(agents.list_agents(self.agents_dir))
        if url.path.startswith("/static/"):
            return self._static(url.path[len("/static/"):])
        if url.path == "/api/sessions":
            return self._json(list_sessions(self.root))
        if url.path in ("/api/events", "/api/stream"):
            return self._session_route(url)
        self._send(404, b"not found")

    def do_POST(self):
        """Validate origin, content type and body, then update an agent."""
        match = AGENT_POST_RE.match(urlparse(self.path).path)
        origin = self.headers.get("Origin")
        if not self._host_ok() or origin is None or not self._origin_ok(origin):
            return self._send(403, b"forbidden")
        if not match:
            return self._send(404, b"not found")
        body = self._read_body()
        if body is None:
            return
        name, field = match.groups()
        try:
            if field == "model":
                agents.set_model(self.agents_dir, name, body.get("model"))
            elif isinstance(body.get("enabled"), bool):
                agents.set_enabled(self.agents_dir, name, body["enabled"])
            else:
                raise ValueError("enabled must be a boolean")
        except ValueError as exc:
            return self._send(400, json.dumps({"error": str(exc)}).encode(), "application/json")
        found = [a for a in agents.list_agents(self.agents_dir) if a.get("name") == name]
        self._json(found[0] if found else {})

    def _read_body(self):
        """Return the JSON object body, or send an error and return None."""
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if ctype != "application/json" or length < 0:
            self._send(400, b"bad content type or length")
        elif length > MAX_BODY:
            self._send(413, b"too large")
        else:
            try:
                data = json.loads(self.rfile.read(length) or b"null")
            except ValueError:
                data = None
            if isinstance(data, dict):
                return data
            self._send(400, b"bad json")
        return None

    def _session_route(self, url):
        """Validate the session id and serve events or the SSE stream."""
        ids = parse_qs(url.query).get("session", [""])
        if not SESSION_RE.match(ids[0]):
            return self._send(400, b"bad session")
        if url.path == "/api/events":
            return self._json(session_events(self.root, ids[0]))
        self._stream(ids[0])

    def _static(self, name):
        """Serve a file located inside dashboard/static only."""
        path = (STATIC / name).resolve()
        if STATIC not in path.parents or not path.is_file() or path.suffix not in TYPES:
            return self._send(404, b"not found")
        self._send(200, path.read_bytes(), TYPES[path.suffix])

    def _stream(self, session):
        """Serve one SSE stream, refusing more than MAX_STREAMS at once."""
        with self.streams["lock"]:
            ok = self.streams["n"] < MAX_STREAMS
            self.streams["n"] += ok
        if not ok:
            return self._send(503, b"too many streams")
        try:
            self._tail(session)
        finally:
            with self.streams["lock"]:
                self.streams["n"] -= 1

    def _tail(self, session):
        """Send new events as SSE until the client disconnects."""
        tailer = Tailer(self.root, session)
        tailer.skip_existing()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        last = time.monotonic()
        try:
            while True:
                chunk = "".join(f"data: {json.dumps(e)}\n\n" for e in tailer.poll())
                if not chunk and time.monotonic() - last >= HEARTBEAT:
                    chunk = ": heartbeat\n\n"
                if chunk:
                    self.wfile.write(chunk.encode())
                    self.wfile.flush()
                    last = time.monotonic()
                time.sleep(POLL)
        except (BrokenPipeError, ConnectionError, OSError):
            return


def make_server(root, port=7777, agents_dir=None, allow_hosts=()):
    """Create a ThreadingHTTPServer bound to 127.0.0.1 only."""
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    handler = type("BoundHandler", (Handler,), {"root": Path(root), "port": server.server_port,
                    "agents_dir": Path(agents_dir or AGENTS_DIR),
                    "allow_hosts": frozenset(allow_hosts),
                    "streams": {"n": 0, "lock": threading.Lock()}})
    server.RequestHandlerClass = handler
    return server


def parse_hosts(values):
    """Validate and lowercase hostnames; raise ValueError on a bad one."""
    hosts = []
    for value in values:
        name = value.strip().lower()
        if not HOST_RE.match(name):
            raise ValueError(f"invalid host name: {value!r}")
        hosts.append(name)
    return hosts


def main():
    """Parse CLI args and serve forever."""
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", type=int, default=7777)
    ap.add_argument("--project", default=".")
    ap.add_argument("--agents-dir", default=None)
    ap.add_argument("--allow-host", action="append", default=[], metavar="NAME")
    args = ap.parse_args()
    env = [h for h in os.environ.get("NOCTIA_DASHBOARD_ALLOW_HOSTS", "").split(",") if h.strip()]
    try:
        hosts = parse_hosts(args.allow_host + env)
    except ValueError as exc:
        ap.error(str(exc))
    server = make_server(transcripts_dir(args.project), args.port, args.agents_dir, hosts)
    print(f"Dashboard on http://127.0.0.1:{server.server_port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
