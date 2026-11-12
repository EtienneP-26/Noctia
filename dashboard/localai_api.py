"""Local AI backend management used by the dashboard POST routes (stdlib only)."""
import importlib.util
import os
import re
import time
from pathlib import Path

LOCALAI_DIR = Path(__file__).resolve().parent.parent / "localai"
TEST_PROMPT, TEST_TOKENS, MAX_ANSWER = "Reply with OK.", 8, 200
ENV_RE = re.compile(r"^NOCTIA_LOCALAI_[A-Z0-9_]{1,48}$")
SCRIPT_MSG = "les backends script se configurent dans ~/.config/noctia/localai.json"
_MODULES = {}


def _load(name):
    """Import localai/<name>.py by path, once."""
    if name not in _MODULES:
        spec = importlib.util.spec_from_file_location(f"noctia_localai_{name}",
                                                      LOCALAI_DIR / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _MODULES[name] = module
    return _MODULES[name]


def check_name(name):
    """Raise ValueError unless name follows the backend name rule."""
    if not _load("config").NAME_RE.match(name or ""):
        raise ValueError("invalid backend name")


def spec(name):
    """Return the editable spec of a backend (env var name only), or None if unknown."""
    cfg = _load("config")
    check_name(name)
    try:
        b = cfg.load_config().get(name)
    except cfg.ConfigError as exc:
        raise ValueError(str(exc)[:200]) from None
    if b is None:
        return None
    return {"name": b.name, "type": b.type, "base_url": b.base_url, "model": b.model,
            "api_key_env": b.api_key_env, "timeout": b.timeout, "argv": list(b.argv or [])}


def _existing(cfg, name):
    """Return the stored backend called name (or None); ConfigError becomes ValueError."""
    try:
        return cfg.load_config().get(name)
    except cfg.ConfigError as exc:
        raise ValueError(str(exc)[:200]) from None


def _check_spec(cfg, name, spec):
    """Reject command backends, command overwrites and unsafe api_key_env names."""
    if not isinstance(spec, dict):
        raise ValueError("invalid spec")
    old = _existing(cfg, name)
    if spec.get("type") == "command" or (old is not None and old.type == "command"):
        raise ValueError(SCRIPT_MSG)
    env = spec.get("api_key_env")
    if env is not None and not (isinstance(env, str) and ENV_RE.match(env)):
        raise ValueError("api_key_env doit correspondre à NOCTIA_LOCALAI_[A-Z0-9_]{1,48}")


def save(name, spec):
    """Validate and store an openai backend; raise ValueError on a bad spec."""
    cfg = _load("config")
    check_name(name)
    _check_spec(cfg, name, spec)
    try:
        cfg.save_backend(name, spec)
    except cfg.ConfigError as exc:
        raise ValueError(str(exc)[:200]) from None
    return {"ok": True}


def delete(name):
    """Remove a backend; return {'ok': bool} (False if it did not exist)."""
    cfg = _load("config")
    check_name(name)
    try:
        return {"ok": cfg.remove_backend(name)}
    except cfg.ConfigError as exc:
        raise ValueError(str(exc)[:200]) from None


def _scrub(message, backend):
    """Drop the api key value from an error message and cap its length."""
    key = os.environ.get(backend.api_key_env or "") if backend.type == "openai" else None
    if key:
        message = message.replace(key, "***")
    return message[:MAX_ANSWER]


def test(name):
    """Ask a saved backend for OK; return (found, {'ok', 'ms', 'error'})."""
    cfg, backends = _load("config"), _load("backends")
    check_name(name)
    try:
        backend = cfg.load_config().get(name)
    except cfg.ConfigError as exc:
        return True, {"ok": False, "ms": 0, "error": str(exc)[:MAX_ANSWER]}
    if backend is None:
        return False, {}
    if backend.type != "openai":
        raise ValueError("seuls les backends openai sont testables depuis le dashboard")
    start, error = time.monotonic(), None
    try:
        backends.ask(backend, TEST_PROMPT, max_tokens=TEST_TOKENS)
    except Exception as exc:  # any failure is reported, never raised
        error = _scrub(str(exc) or type(exc).__name__, backend)
    return True, {"ok": error is None, "ms": int((time.monotonic() - start) * 1000),
                  "error": error}
