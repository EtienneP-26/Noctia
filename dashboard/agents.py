"""Agents page backend: list agents, change model, enable/disable."""
import json
import os
import re
import tempfile
from pathlib import Path

MODELS = {"haiku", "sonnet", "opus", "fable", "inherit"}
LOCALAI_TOOLS = ("mcp__noctia-localai__list_local", "mcp__noctia-localai__ask_local")
NAME_RE =re.compile(r"^[a-z][a-z0-9-]{0,31}$")


def _settings_file(settings_path=None):
    """Return the settings path (arg, env, or default)."""
    if settings_path:
        return Path(settings_path)
    env = os.environ.get("NOCTIA_AGENTS_SETTINGS")
    return Path(env) if env else Path.home() / ".claude" / "noctia" / "agents.json"


def _atomic_write(path, data, mode=None):
    """Write bytes to path atomically (temp file + os.replace)."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        if mode is not None:
            os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _parse_frontmatter(text):
    """Parse simple 'key: value' frontmatter lines into a dict."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}
    meta = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        key, sep, value = line.partition(":")
        if sep:
            meta[key.strip()] = value.strip()
    return meta


def _disabled(settings_path=None):
    """Return the set of disabled agent names."""
    path = _settings_file(settings_path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {str(n) for n in data.get("disabled", [])}
    except (OSError, ValueError, AttributeError):
        return set()


def _localai_state(meta):
    """Return True/False if a tools line exists, None if it inherits all."""
    if "tools" not in meta:
        return None
    tools = [t.strip() for t in meta["tools"].split(",")]
    return all(t in tools for t in LOCALAI_TOOLS)


def list_agents(agents_dir, settings_path=None):
    """List agents with name, description, model, tools, enabled, localai."""
    off = _disabled(settings_path)
    result = []
    for f in sorted(Path(agents_dir).glob("*.md")):
        meta = _parse_frontmatter(f.read_text(encoding="utf-8"))
        name = meta.get("name", f.stem)
        result.append({
            "name": name,
            "description": meta.get("description", ""),
            "model": meta.get("model", ""),
            "tools": [t.strip() for t in meta.get("tools", "").split(",") if t.strip()],
            "enabled": name not in off,
            "localai": _localai_state(meta),
        })
    return result


def _agent_path(agents_dir, name):
    """Validate name and return the safe path of agents/<name>.md."""
    if not isinstance(name, str) or not NAME_RE.match(name):
        raise ValueError(f"invalid agent name: {name!r}")
    base = Path(agents_dir).resolve()
    path = (base / f"{name}.md").resolve()
    if path.parent != base or not path.is_file():
        raise ValueError(f"unknown agent: {name}")
    return path


def set_model(agents_dir, name, model):
    """Rewrite only the frontmatter model: line of an agent."""
    if model not in MODELS:
        raise ValueError(f"invalid model: {model!r}")
    path = _agent_path(agents_dir, name)
    mode = os.stat(path).st_mode & 0o777
    lines = path.read_bytes().decode("utf-8").split("\n")
    if lines[0].rstrip("\r") != "---":
        raise ValueError(f"no frontmatter in {name}")
    for i in range(1, len(lines)):
        if lines[i].rstrip("\r") == "---":
            raise ValueError(f"no model line in {name}")
        if lines[i].startswith("model:"):
            eol = "\r" if lines[i].endswith("\r") else ""
            lines[i] = f"model: {model}{eol}"
            _atomic_write(path, "\n".join(lines).encode("utf-8"), mode)
            return
    raise ValueError(f"no model line in {name}")


def _toggle_tools(value, enabled):
    """Add or remove the local AI tools in a comma-separated tools value."""
    tools = [t.strip() for t in value.split(",") if t.strip()]
    if enabled:
        tools += [t for t in LOCALAI_TOOLS if t not in tools]
    else:
        tools = [t for t in tools if t not in LOCALAI_TOOLS]
        if not tools:
            raise ValueError("removing local AI would leave the agent with no tools")
    return ", ".join(tools)


def set_localai(agents_dir, name, enabled):
    """Add or remove the local AI tools on the frontmatter tools: line."""
    if not isinstance(enabled, bool):
        raise ValueError(f"enabled must be a bool: {enabled!r}")
    path = _agent_path(agents_dir, name)
    mode = os.stat(path).st_mode & 0o777
    lines = path.read_bytes().decode("utf-8").split("\n")
    if lines[0].rstrip("\r") != "---":
        raise ValueError(f"no frontmatter in {name}")
    for i in range(1, len(lines)):
        if lines[i].rstrip("\r") == "---":
            break
        if lines[i].startswith("tools:"):
            eol = "\r" if lines[i].endswith("\r") else ""
            value = _toggle_tools(lines[i][6:], enabled)
            lines[i] = f"tools: {value}{eol}"
            _atomic_write(path, "\n".join(lines).encode("utf-8"), mode)
            return
    raise ValueError("agent inherits all tools")


def set_enabled(agents_dir, name, enabled, settings_path=None):
    """Enable or disable a known agent in the settings file."""
    if not isinstance(enabled, bool):
        raise ValueError(f"enabled must be a bool: {enabled!r}")
    _agent_path(agents_dir, name)
    if name == "chief" and not enabled:
        raise ValueError("chief cannot be disabled")
    path = _settings_file(settings_path)
    off = _disabled(path)
    off.discard(name) if enabled else off.add(name)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    data = json.dumps({"disabled": sorted(off)}, indent=2).encode("utf-8")
    _atomic_write(path, data, 0o600)
