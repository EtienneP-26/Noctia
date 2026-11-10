"""Loader and validator for the local-AI backends config."""
import json
import os
import re
from dataclasses import dataclass
from urllib.parse import urlparse

NAME_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
ENV_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")
DEFAULT_PATH = "~/.config/noctia/localai.json"
COMMON = {"type", "timeout"}
FIELDS = {
    "openai": COMMON | {"base_url", "model", "api_key_env"},
    "command": COMMON | {"argv"},
}


class ConfigError(Exception):
    """Raised when the config is invalid."""


@dataclass(frozen=True)
class Backend:
    """One validated backend."""

    name: str
    type: str
    base_url: str | None = None
    model: str | None = None
    api_key_env: str | None = None
    argv: tuple | None = None
    timeout: int = 60


def _fail(name, field, msg):
    """Raise a ConfigError naming backend and field."""
    raise ConfigError(f"backend '{name}', field '{field}': {msg}")


def _check_fields(name, raw):
    """Validate type and the set of allowed fields."""
    if not isinstance(raw, dict):
        _fail(name, "backend", "must be an object")
    if "api_key" in raw:
        _fail(name, "api_key", "keys are not allowed; use api_key_env (env var name)")
    kind = raw.get("type")
    if kind not in FIELDS:
        _fail(name, "type", "must be 'openai' or 'command'")
    for key in raw:
        if key not in FIELDS[kind]:
            _fail(name, key, "unknown field")
    return kind


def _check_timeout(name, raw):
    """Return a valid timeout (int 1..600, default 60)."""
    value = raw.get("timeout", 60)
    if type(value) is not int or not 1 <= value <= 600:
        _fail(name, "timeout", "must be an integer between 1 and 600")
    return value


def _check_url(name, url):
    """Validate base_url: http(s), a host, a valid port, and no credentials."""
    if not isinstance(url, str):
        _fail(name, "base_url", "must be an http or https URL")
    try:
        parsed = urlparse(url)
        parsed.port  # raises ValueError on a malformed port
    except ValueError:
        _fail(name, "base_url", "malformed URL")
    if parsed.scheme not in ("http", "https"):
        _fail(name, "base_url", "must be an http or https URL")
    if not parsed.hostname:
        _fail(name, "base_url", "missing host")
    if parsed.username is not None or parsed.password is not None:
        _fail(name, "base_url", "credentials in base_url: use api_key_env")


def _check_openai(name, raw):
    """Return base_url, model, api_key_env for an openai backend."""
    url = raw.get("base_url")
    _check_url(name, url)
    model = raw.get("model")
    if not isinstance(model, str) or not model.strip():
        _fail(name, "model", "must be a non-empty string")
    env = raw.get("api_key_env")
    if env is not None and (not isinstance(env, str) or not ENV_RE.match(env)):
        _fail(name, "api_key_env", "must be an env var NAME like MY_KEY")
    return url, model, env


def _check_argv(name, raw):
    """Return argv as a tuple of strings."""
    argv = raw.get("argv")
    if not isinstance(argv, list) or not argv or not all(isinstance(a, str) for a in argv):
        _fail(name, "argv", "must be a non-empty list of strings")
    return tuple(argv)


def _build(name, raw):
    """Validate one backend entry and build it."""
    if not isinstance(name, str) or not NAME_RE.match(name):
        _fail(name, "name", "must match ^[a-z0-9_-]{1,32}$")
    kind = _check_fields(name, raw)
    timeout = _check_timeout(name, raw)
    if kind == "command":
        return Backend(name, kind, argv=_check_argv(name, raw), timeout=timeout)
    url, model, env = _check_openai(name, raw)
    return Backend(name, kind, url, model, env, timeout=timeout)


def load_config(path=None):
    """Load backends from path, env NOCTIA_LOCALAI_CONFIG or the default file."""
    path = path or os.environ.get("NOCTIA_LOCALAI_CONFIG") or DEFAULT_PATH
    path = os.path.expanduser(str(path))
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        raise ConfigError(f"cannot read config: {exc}") from exc
    backends = data.get("backends") if isinstance(data, dict) else None
    if not isinstance(backends, dict) or set(data) != {"backends"}:
        raise ConfigError("config must be an object with only a 'backends' object")
    return {n: _build(n, raw) for n, raw in backends.items()}


def public_view(backends):
    """Return backend descriptions without secrets, for listing."""
    return [
        {"name": b.name, "type": b.type, "model": b.model,
         "base_url": b.base_url, "timeout": b.timeout}
        for b in backends.values()
    ]
