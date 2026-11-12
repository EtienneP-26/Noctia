"""Noctia settings store (~/.claude/noctia/settings.json)."""
import contextlib
import copy
import fcntl
import json
import os
import sys
import tempfile
import threading
from pathlib import Path

DEFAULTS = {
    "dashboard": {"autostart": False, "port": 7777, "summaries": False,
                  "retire_seconds": 10},
    "workflow": {"pentest": True, "designer": True, "legal": True,
                 "docs": True},
    "git": {"default_mode": "locked", "default_coauthor": "ask"},
}
RANGES = {("dashboard", "port"): (1024, 65535),
          ("dashboard", "retire_seconds"): (0, 3600)}
CHOICES = {("git", "default_mode"): ("locked", "ask", "auto"),
           ("git", "default_coauthor"): ("ask", "yes", "no")}


def _path(path=None):
    """Resolve the settings file path."""
    if path:
        return Path(path)
    env = os.environ.get("NOCTIA_SETTINGS")
    return Path(env) if env else Path.home() / ".claude" / "noctia" / "settings.json"


def _check(section, key, value):
    """Validate one value against the default's type and limits."""
    default = DEFAULTS[section][key]
    name = f"{section}.{key}"
    if isinstance(default, bool):
        if not isinstance(value, bool):
            raise ValueError(f"{name}: must be a boolean")
    elif isinstance(default, int):
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f"{name}: must be an integer")
        lo, hi = RANGES[(section, key)]
        if not lo <= value <= hi:
            raise ValueError(f"{name}: must be between {lo} and {hi}")
    elif value not in CHOICES[(section, key)] or not isinstance(value, str):
        raise ValueError(f"{name}: must be one of {CHOICES[(section, key)]}")


def validate(partial):
    """Return partial if valid, else raise ValueError."""
    if not isinstance(partial, dict):
        raise ValueError("settings must be an object")
    for section, keys in partial.items():
        if section not in DEFAULTS or not isinstance(keys, dict):
            raise ValueError(f"unknown section: {section}")
        for key, value in keys.items():
            if key not in DEFAULTS[section]:
                raise ValueError(f"unknown key: {section}.{key}")
            _check(section, key, value)
    return partial


def _merge(base, partial):
    """Merge valid values of partial into base, ignoring invalid ones."""
    for section, keys in (partial.items() if isinstance(partial, dict) else []):
        if section not in base or not isinstance(keys, dict):
            continue
        for key, value in keys.items():
            try:
                _check(section, key, value)
            except (ValueError, KeyError):
                continue
            base[section][key] = value
    return base


def load(path=None):
    """Load settings merged over defaults; never raises."""
    try:
        data = json.loads(_path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    return _merge(copy.deepcopy(DEFAULTS), data)


_LOCK = threading.Lock()


@contextlib.contextmanager
def _locked(target):
    """Hold a thread lock and a flock on <target>.lock (mode 0600)."""
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with _LOCK:
        fd = os.open(f"{target}.lock", os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)


def _write_atomic(target, full):
    """Write full as JSON to target via a unique 0600 temp file."""
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".settings.")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(full, fh, indent=2)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, target)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def save(partial, path=None):
    """Validate, merge into current settings, write atomically, return all."""
    validate(partial)
    target = _path(path)
    with _locked(target):
        full = _merge(load(target), partial)
        _write_atomic(target, full)
    return full


def _parse(section, key, raw):
    """Parse a CLI string by the type of the default."""
    default = DEFAULTS[section][key]
    if isinstance(default, bool):
        if raw not in ("true", "false"):
            raise ValueError(f"{section}.{key}: must be true or false")
        return raw == "true"
    if isinstance(default, int):
        try:
            return int(raw)
        except ValueError:
            raise ValueError(f"{section}.{key}: must be an integer") from None
    return raw


def _split(name):
    """Split 'section.key' and verify it exists."""
    section, _, key = name.partition(".")
    if key not in DEFAULTS.get(section, {}):
        raise ValueError(f"unknown setting: {name}")
    return section, key


def _fmt(value):
    """Format a value for CLI output."""
    return json.dumps(value) if not isinstance(value, str) else value


def main(argv):
    """CLI entry: get <section.key> | set <section.key> <value>."""
    try:
        if len(argv) == 2 and argv[0] == "get":
            section, key = _split(argv[1])
            print(_fmt(load()[section][key]))
        elif len(argv) == 3 and argv[0] == "set":
            section, key = _split(argv[1])
            save({section: {key: _parse(section, key, argv[2])}})
        else:
            raise ValueError("usage: settings.py get K | set K V")
    except (ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
