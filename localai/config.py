"""Loader and validator for the local-AI backends config."""
import contextlib
import fcntl
import json
import os
import re
import tempfile
import threading
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


def validate_backend(name, spec):
    """Validate one backend spec and return a clean dict."""
    if not isinstance(name, str) or not NAME_RE.match(name):
        _fail(name, "name", "must match ^[a-z0-9_-]{1,32}$")
    kind = _check_fields(name, spec)
    out = {"type": kind, "timeout": _check_timeout(name, spec)}
    if kind == "command":
        out["argv"] = list(_check_argv(name, spec))
        return out
    url, model, env = _check_openai(name, spec)
    out.update(base_url=url, model=model)
    if env is not None:
        out["api_key_env"] = env
    return out


def _build(name, raw):
    """Validate one backend entry and build it."""
    spec = validate_backend(name, raw)
    if spec["type"] == "command":
        return Backend(name, "command", argv=tuple(spec["argv"]), timeout=spec["timeout"])
    return Backend(name, "openai", spec["base_url"], spec["model"],
                   spec.get("api_key_env"), timeout=spec["timeout"])


def _resolve(path):
    """Return the expanded config path."""
    path = path or os.environ.get("NOCTIA_LOCALAI_CONFIG") or DEFAULT_PATH
    return os.path.expanduser(str(path))


def _read_raw(path):
    """Return the raw config dict, or an empty one if the file is missing."""
    if not os.path.exists(path):
        return {"backends": {}}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        raise ConfigError(f"cannot read config: {exc}") from exc
    if not isinstance(data, dict) or set(data) != {"backends"} \
            or not isinstance(data["backends"], dict):
        raise ConfigError("config must be an object with only a 'backends' object")
    return data


_LOCK = threading.Lock()


@contextlib.contextmanager
def _locked(path):
    """Hold a thread lock and a flock on <path>.lock (mode 0600)."""
    os.makedirs(os.path.dirname(path) or ".", mode=0o700, exist_ok=True)
    with _LOCK:
        fd = os.open(f"{path}.lock", os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)


def _write_atomic(path, data):
    """Write data as JSON atomically, file mode 0600, directory 0700."""
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".localai.")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def save_backend(name, spec, path=None):
    """Validate and store one backend in the config file."""
    clean = validate_backend(name, spec)
    path = _resolve(path)
    with _locked(path):
        data = _read_raw(path)
        data["backends"][name] = clean
        _write_atomic(path, data)


def remove_backend(name, path=None):
    """Remove a backend; return False if it was not present."""
    path = _resolve(path)
    with _locked(path):
        data = _read_raw(path)
        if name not in data["backends"]:
            return False
        del data["backends"][name]
        _write_atomic(path, data)
    return True


def load_config(path=None):
    """Load backends from path, env NOCTIA_LOCALAI_CONFIG or the default file."""
    path = _resolve(path)
    if not os.path.exists(path):
        return {}
    data = _read_raw(path)
    return {n: _build(n, raw) for n, raw in data["backends"].items()}


def public_view(backends):
    """Return backend descriptions without secrets, for listing."""
    return [
        {"name": b.name, "type": b.type, "model": b.model,
         "base_url": b.base_url, "timeout": b.timeout}
        for b in backends.values()
    ]
