"""Agent mission summarizer: one short sentence per brief, via Claude CLI."""
import json
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path

PROMPT = ("Summarize in one sentence (max 110 characters), in French, what this "
          "agent has been asked to do. Output only the sentence.\n\n")
MAX_BRIEF = 4000
MAX_SUMMARY = 140
MAX_KEYS = 500
MAX_JOBS = 2
BACKOFF = 600
SAFE_COMMAND = ("claude", "-p", "--model", "haiku", "--tools", "",
                "--strict-mcp-config", "--setting-sources", "",
                "--disable-slash-commands")


def _default_workdir():
    """Return the dedicated headless working dir, created with mode 0700."""
    path = Path.home() / ".claude" / "noctia" / "summarizer"
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def _clean(output):
    """Keep the first non-empty line, capped; empty string if none."""
    for line in output.strip().splitlines():
        if line.strip():
            return line.strip()[:MAX_SUMMARY]
    return ""


class Summarizer:
    """Cache-backed, non-blocking brief summarizer."""

    def __init__(self, cache_path, command=SAFE_COMMAND,
                 timeout=60, workdir=None):
        """Configure the cache file, CLI command, timeout and cwd."""
        self.cache_path = Path(cache_path)
        self.command = list(command)
        self.timeout = timeout
        self.workdir = workdir
        self._lock = threading.Lock()
        self._cache = None
        self._pending = set()
        self._failed = {}
        self._slots = threading.Semaphore(MAX_JOBS)

    def get(self, key, brief):
        """Return the cached summary, or schedule a job and return None."""
        with self._lock:
            self._load()
            if key in self._cache:
                return self._cache[key]
            if key in self._pending or self._backing_off(key):
                return None
            self._pending.add(key)
        threading.Thread(target=self._job, args=(key, brief), daemon=True).start()
        return None

    def _backing_off(self, key):
        """True if key failed less than BACKOFF seconds ago (lock held)."""
        return time.monotonic() - self._failed.get(key, -BACKOFF) < BACKOFF

    def _load(self):
        """Load the cache file lazily (lock held)."""
        if self._cache is not None:
            return
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
            ok = isinstance(data, dict)
        except (OSError, ValueError):
            ok = False
        self._cache = {k: v for k, v in data.items()
                       if isinstance(v, str)} if ok else {}

    def _job(self, key, brief):
        """Worker: wait for a slot, summarize, store, release the key."""
        with self._slots:
            try:
                summary = self._run(brief)
                if summary:
                    self._store(key, summary)
                else:
                    with self._lock:
                        self._failed[key] = time.monotonic()
            finally:
                with self._lock:
                    self._pending.discard(key)

    def _run(self, brief):
        """Run the CLI on the brief; return the summary or ''."""
        try:
            cwd = self.workdir or _default_workdir()
            env = dict(os.environ, NOCTIA_DASHBOARD_AUTOSTART="0")
            res = subprocess.run(
                self.command, input=PROMPT + brief[:MAX_BRIEF], cwd=cwd, env=env,
                capture_output=True, text=True, timeout=self.timeout, check=False)
        except (OSError, subprocess.SubprocessError, ValueError):
            return ""
        return _clean(res.stdout) if res.returncode == 0 else ""

    def _store(self, key, summary):
        """Add to the cache, bound it, and persist atomically."""
        with self._lock:
            self._cache.pop(key, None)
            self._cache[key] = summary
            while len(self._cache) > MAX_KEYS:
                self._cache.pop(next(iter(self._cache)))
            self._write(json.dumps(self._cache, ensure_ascii=False).encode())

    def _write(self, data):
        """Atomic write with mode 0600; ignore I/O errors."""
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.cache_path.parent, prefix=".tmp-")
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.cache_path)
        except OSError:
            pass
