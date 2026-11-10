"""Turn Claude Code transcript JSONL lines into flat events for a dashboard."""
import json
import re
from pathlib import Path

MAX_TEXT = 2000
MAX_LINE = 5 * 1024 * 1024
_ASYNC_ACK = "Async agent launched"
_AGENT_ID = re.compile(r"agentId:\s*([\w-]+)")


def _clip(value):
    """Return value as a string truncated to MAX_TEXT chars."""
    if not isinstance(value, str):
        try:
            value = json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            value = str(value)
    return value[:MAX_TEXT]


def _task_id(description):
    """Extract the leading 'W<n>·T<n>' id from a description, or None."""
    head = (description or "").split(" ")[0]
    parts = head.split("·")
    if len(parts) == 2 and parts[0][:1] == "W" and parts[1][:1] == "T":
        if parts[0][1:].isdigit() and parts[1][1:].isdigit():
            return head
    return None


def _tokens(message):
    """Return {in, out} from a message usage block, or None."""
    usage = message.get("usage")
    if not isinstance(usage, dict):
        return None
    total_in = sum(usage.get(k) or 0 for k in (
        "input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
    return {"in": total_in, "out": usage.get("output_tokens") or 0}


def _result_text(content):
    """Flatten a tool_result content (str or list of blocks) to text."""
    if isinstance(content, list):
        content = "\n".join(
            b.get("text", "") for b in content if isinstance(b, dict))
    return _clip(content)


def _event(base, kind, text, tool=None, task=None, target=None, call=None):
    """Build one event dict from the shared base fields."""
    return {**base, "kind": kind, "text": _clip(text), "tool": tool,
            "task": task, "target": target, "call": call}


def _target(inp):
    """Receiving subagent type without 'plugin:' prefix, default general-purpose."""
    name = inp.get("subagent_type")
    if not isinstance(name, str) or not name:
        return "general-purpose"
    return name.split(":")[-1] or "general-purpose"


def _tool_use_event(base, block, briefs):
    """Make a brief (Agent) or tool_call event; remember briefs by id."""
    inp = block.get("input") or {}
    if block.get("name") == "Agent":
        desc = inp.get("description") or ""
        task = _task_id(desc)
        target = _target(inp)
        briefs[block.get("id")] = (desc, task, target, block.get("id"))
        text = f"[{inp.get('subagent_type')}] {desc}\n{inp.get('prompt') or ''}"
        return _event(base, "brief", text, "Agent", task, target, block.get("id"))
    return _event(base, "tool_call", _clip(inp), block.get("name"))


def _block_event(base, block, briefs):
    """Convert one content block into an event, or None."""
    kind = block.get("type")
    if kind == "text":
        return _event(base, base["kind"], block.get("text", ""))
    if kind == "tool_use":
        return _tool_use_event(base, block, briefs)
    if kind == "tool_result":
        desc, task, target, call = briefs.get(block.get("tool_use_id"), (None,) * 4)
        text = _result_text(block.get("content"))
        label = "report" if desc is not None else "tool_result"
        if desc is not None and _ASYNC_ACK in text:
            label = "launch"
            match = _AGENT_ID.search(text)
            if match:
                briefs[match.group(1)] = briefs[block.get("tool_use_id")]
        tool = "Agent" if desc is not None else None
        return _event(base, label, text, tool, task, target, call)
    return None


def _tag(text, name):
    """First <name>...</name> body in text, or None."""
    match = re.search(rf"<{name}>(.*?)</{name}>", text, re.S)
    return match.group(1).strip() if match else None


def _flat_text(content):
    """Text of a message content (str or blocks), tool_result contents included."""
    if isinstance(content, str):
        return content
    parts = []
    for b in content if isinstance(content, list) else []:
        if not isinstance(b, dict):
            continue
        parts.append(b.get("text", "") if b.get("type") == "text" else "")
        if b.get("type") == "tool_result":
            parts.append(_flat_text(b.get("content")))
    return "\n".join(p for p in parts if isinstance(p, str))


_HAND = re.compile(r'<agent-message from="([^"]+)">(.*?)</agent-message>', re.S)
_NOTE = re.compile(r"<task-notification>(.*?)</task-notification>", re.S)


def _once(briefs, info, ids):
    """True the first time a completion is seen for this task."""
    key = ("done", id(info) if info[0] is not None else next((i for i in ids if i), None))
    if key in briefs:
        return False
    briefs[key] = True
    return True


def _note_event(base, note, briefs):
    """report event for one task-notification body, or None if duplicate."""
    ids = [_tag(note, "tool-use-id"), _tag(note, "task-id")]
    info = next((briefs[i] for i in ids if i in briefs), (None,) * 4)
    if not _once(briefs, info, ids):
        return None
    event = _event(base, "report", _tag(note, "summary") or "", "Agent", info[1], info[2], info[3])
    event["status"] = _tag(note, "status")
    return event


def _hand_events(base, agent_id, body, briefs):
    """report (if none yet) and report_text events for one hand-back."""
    info = briefs.get(agent_id)
    if not info:
        return []
    out = []
    if _once(briefs, info, [agent_id]):
        done = _event(base, "report", body, "Agent", info[1], info[2], info[3])
        done["status"] = "completed"
        out.append(done)
    out.append(_event(base, "report_text", body, "Agent", info[1], info[2], info[3]))
    return out


def _notification_events(base, text, briefs):
    """Events for every task-notification / agent-message block in text."""
    events = [_note_event(base, n, briefs) for n in _NOTE.findall(text)]
    for agent_id, body in _HAND.findall(text):
        events += _hand_events(base, agent_id, body.strip(), briefs)
    return [e for e in events if e]


def _extra_text(data):
    """Text of top-level string fields (queue-operation, attachment lines)."""
    att = data.get("attachment")
    parts = [data.get("content"), att.get("prompt") if isinstance(att, dict) else None]
    return "\n".join(p for p in parts if isinstance(p, str))


def _message_events(data, base, briefs):
    """Events of a user/assistant line: notifications, plus normal blocks."""
    msg = data["message"]
    content = msg.get("content")
    found = []
    if data["type"] == "user":
        text = _flat_text(content)
        found = _notification_events(base, text, briefs)
        marked = "<task-notification>" in text or "<agent-message" in text
        plain = isinstance(content, str) or not any(
            isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
        if marked and plain:
            return found
    if isinstance(content, str):
        return found + [_event(base, data["type"], content)]
    events = (_block_event(base, b, briefs) for b in content if isinstance(b, dict))
    return found + [e for e in events if e]


def parse_line(line, session, agent="chief", briefs=None):
    """Parse one JSONL line into a list of events; bad lines give []."""
    briefs = {} if briefs is None else briefs
    if len(line) > MAX_LINE:
        return []
    try:
        data = json.loads(line)
        msg = data.get("message")
        ts = data.get("timestamp")
        base = {"ts": "" if ts is None else str(ts), "session": session, "agent": agent,
                "kind": data["type"], "model": None, "tokens": None}
        if data["type"] in ("user", "assistant") and isinstance(msg, dict):
            base.update(model=msg.get("model"), tokens=_tokens(msg))
            return _message_events(data, base, briefs)
        return _notification_events(base, _extra_text(data), briefs)
    except (ValueError, KeyError, TypeError, AttributeError, RecursionError):
        return []


def agent_name(path):
    """Agent label for a transcript: meta.json type/description, else 'chief'."""
    if path.parent.name != "subagents":
        return "chief"
    try:
        meta = json.loads(path.with_suffix(".meta.json").read_text("utf-8"))
        return meta.get("description") or meta.get("agentType") or path.stem
    except (OSError, ValueError, AttributeError):
        return path.stem


def _session_id(path):
    """Session id: the main file stem, or the folder above 'subagents'."""
    if path.parent.name == "subagents":
        return path.parent.parent.name
    return path.stem


def _agent_calls(path):
    """Map agentId -> Agent tool_use id from the main transcript of a subagent file."""
    main = path.parent.parent.with_suffix(".jsonl")
    briefs = {}
    try:
        for ln in main.open(encoding="utf-8", errors="replace"):
            parse_line(ln, "", "chief", briefs)
    except OSError:
        pass
    return {k: v[3] for k, v in briefs.items() if isinstance(k, str) and k != v[3]}


def _tag_calls(events, call):
    """Set the call id on a subagent's tool_call events."""
    for e in events:
        if e["kind"] == "tool_call":
            e["call"] = call


def parse_file(path):
    """Parse a transcript file into events; unreadable files give []."""
    path = Path(path)
    agent, session, briefs, events = agent_name(path), _session_id(path), {}, []
    try:
        with path.open(encoding="utf-8", errors="replace") as fh:
            for line in fh:
                events += parse_line(line, session, agent, briefs)
    except OSError:
        pass
    if path.parent.name == "subagents":
        _tag_calls(events, _agent_calls(path).get(path.stem.replace("agent-", "", 1)))
    return events


def find_transcripts(project_dir):
    """List main and subagent transcript files, newest first."""
    root = Path(project_dir)
    files = list(root.glob("*.jsonl")) + list(root.glob("*/subagents/*.jsonl"))
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)
