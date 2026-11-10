"""Call layer for local AI backends (OpenAI-compatible HTTP or command)."""
from __future__ import annotations

import json
import os
import signal
import subprocess
import urllib.error
import urllib.request
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from localai.config import Backend

MAX_PROMPT = 100_000
MAX_RESPONSE = 50_000
MAX_OUTPUT = 1_000_000


class BackendError(Exception):
    """Raised when a backend call fails."""


def ask(backend: "Backend", prompt: str, system: str | None = None,
        max_tokens: int = 1024) -> str:
    """Send a prompt to the backend and return the (truncated) text."""
    if not isinstance(prompt, str) or not prompt:
        raise BackendError("prompt must be a non-empty string")
    if len(prompt) > MAX_PROMPT:
        raise BackendError(f"prompt exceeds {MAX_PROMPT} chars")
    if backend.type == "openai":
        text = _ask_openai(backend, prompt, system, max_tokens)
    elif backend.type == "command":
        text = _ask_command(backend, prompt, system, max_tokens)
    else:
        raise BackendError(f"unknown backend type: {backend.type!r}")
    return text[:MAX_RESPONSE]


def _build_request(backend, prompt, system, max_tokens) -> urllib.request.Request:
    """Build the chat/completions HTTP request."""
    messages = [{"role": "system", "content": system}] if system else []
    messages.append({"role": "user", "content": prompt})
    body = json.dumps({"model": backend.model, "messages": messages,
                       "max_tokens": max_tokens}).encode()
    headers = {"Content-Type": "application/json"}
    key = os.environ.get(backend.api_key_env) if backend.api_key_env else None
    if key:
        headers["Authorization"] = f"Bearer {key}"
    url = backend.base_url.rstrip("/") + "/chat/completions"
    return urllib.request.Request(url, data=body, headers=headers, method="POST")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse every redirect so credentials never leave the configured host."""

    def redirect_request(self, *args, **kwargs):
        """Always refuse."""
        raise BackendError("redirect refused")


def _ask_openai(backend, prompt, system, max_tokens) -> str:
    """Call an OpenAI-compatible endpoint."""
    req = _build_request(backend, prompt, system, max_tokens)
    try:
        opener = urllib.request.build_opener(_NoRedirect)
        with opener.open(req, timeout=backend.timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        raise BackendError(f"HTTP error {e.code}") from None
    except urllib.error.URLError as e:
        raise BackendError(f"connection error: {e.reason}") from None
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        raise BackendError("invalid response from backend") from None
    if not isinstance(text, str):
        raise BackendError("invalid response from backend")
    return text


def _run_limited(argv, payload, timeout):
    """Run argv in its own session; kill the whole group on timeout."""
    proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, shell=False,
                            start_new_session=True)
    try:
        out, err = proc.communicate(payload, timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise BackendError("command timed out") from None
    if len(out) > MAX_OUTPUT:
        raise BackendError("command output too large")
    return subprocess.CompletedProcess(argv, proc.returncode, out, err)


def _ask_command(backend, prompt, system, max_tokens) -> str:
    """Run a local command exchanging JSON over stdin/stdout."""
    payload = json.dumps({"prompt": prompt, "system": system,
                          "max_tokens": max_tokens})
    try:
        proc = _run_limited(list(backend.argv), payload, backend.timeout)
    except OSError as e:
        raise BackendError(f"command failed to start: {e.strerror}") from None
    if proc.returncode != 0:
        raise BackendError(f"command exit {proc.returncode}: {proc.stderr[:200]}")
    return _parse_command_output(proc)


def _parse_command_output(proc) -> str:
    """Extract the text field from command stdout."""
    try:
        text = json.loads(proc.stdout)["text"]
    except (ValueError, KeyError, TypeError):
        raise BackendError(f"bad command output: {proc.stderr[:200]}") from None
    if not isinstance(text, str):
        raise BackendError(f"bad command output: {proc.stderr[:200]}")
    return text
