#!/usr/bin/env python3
"""Minimal stdlib MCP server (stdio, newline-delimited JSON-RPC) for local AIs."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backends  # noqa: E402
import config  # noqa: E402

MAX_LINE = 1024 * 1024  # bytes; longer stdin lines are rejected with -32700

DESCRIPTION = ("Ask a local/self-hosted AI configured in ~/.config/noctia/localai.json. "
               "Use for cheap, simple or private sub-tasks; results are unverified.")
TOOLS = [
    {"name": "list_local", "description": "List configured local AI backends.",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "ask_local", "description": DESCRIPTION,
     "inputSchema": {"type": "object", "required": ["backend", "prompt"], "properties": {
         "backend": {"type": "string"}, "prompt": {"type": "string"},
         "system": {"type": "string"},
         "max_tokens": {"type": "integer", "minimum": 1, "maximum": 8192}}}},
]


def result(text, error=False):
    """Build a tools/call result."""
    return {"content": [{"type": "text", "text": text}], "isError": error}


def run_ask(args, cfgs):
    """Validate ask_local arguments and query the backend."""
    name, prompt = args.get("backend"), args.get("prompt")
    system, mt = args.get("system"), args.get("max_tokens", 1024)
    if not isinstance(name, str) or not isinstance(prompt, str):
        return result("backend and prompt must be strings", True)
    if system is not None and not isinstance(system, str):
        return result("system must be a string", True)
    if isinstance(mt, bool) or not isinstance(mt, int) or not 1 <= mt <= 8192:
        return result("max_tokens must be an integer between 1 and 8192", True)
    if name not in cfgs:
        return result("unknown backend: " + name[:64], True)
    return result(backends.ask(cfgs[name], prompt, system, mt))


def call_tool(params):
    """Run a tool call, turning expected failures into isError results."""
    name, args = params.get("name"), params.get("arguments") or {}
    if not isinstance(args, dict):
        return result("arguments must be an object", True)
    try:
        cfgs = config.load_config()
        if name == "list_local":
            return result(json.dumps(config.public_view(cfgs), indent=2))
        if name == "ask_local":
            return run_ask(args, cfgs)
        return result("unknown tool", True)
    except (config.ConfigError, backends.BackendError) as exc:
        return result(str(exc)[:500], True)
    except Exception:  # never crash the server
        return result("internal error", True)


def handle(method, params):
    """Return the result for a method, or raise KeyError if unknown."""
    if method == "initialize":
        return {"protocolVersion": params.get("protocolVersion") or "2025-06-18",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "noctia-localai", "version": "0.1.0"}}
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        return call_tool(params)
    raise KeyError(method)


def respond(msg):
    """Process one parsed message; return a response dict or None."""
    if not isinstance(msg, dict) or not isinstance(msg.get("method"), str):
        return {"jsonrpc": "2.0", "id": None,
                "error": {"code": -32600, "message": "Invalid Request"}}
    method, mid = msg["method"], msg.get("id")
    if method.startswith("notifications/") or "id" not in msg:
        return None
    params = msg.get("params") if isinstance(msg.get("params"), dict) else {}
    try:
        return {"jsonrpc": "2.0", "id": mid, "result": handle(method, params)}
    except KeyError:
        return {"jsonrpc": "2.0", "id": mid,
                "error": {"code": -32601, "message": "Method not found"}}


def parse_error():
    """Build the -32700 Parse error response."""
    return {"jsonrpc": "2.0", "id": None,
            "error": {"code": -32700, "message": "Parse error"}}


def read_line(stream):
    """Read one line of at most MAX_LINE bytes; discard the rest of a longer line."""
    raw = stream.readline(MAX_LINE + 1)
    tail = raw
    while tail and not tail.endswith(b"\n"):
        tail = stream.readline(MAX_LINE)
    return raw, len(raw) > MAX_LINE


def process(raw):
    """Decode and answer one raw line; return a response dict or None."""
    try:
        msg = json.loads(raw.decode("utf-8"))
    except (ValueError, RecursionError):  # bad UTF-8, bad JSON, or too deep
        return parse_error()
    return respond(msg)


def serve():
    """Read byte lines from stdin and write responses to stdout."""
    stdin = sys.stdin.buffer
    while True:
        raw, too_long = read_line(stdin)
        if not raw:
            break
        if not raw.strip():
            continue
        out = parse_error() if too_long else process(raw)
        if out is not None:
            sys.stdout.write(json.dumps(out) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    serve()
