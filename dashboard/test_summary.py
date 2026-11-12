import sys
import time

from summary import Summarizer

OK = [sys.executable, "-c",
      "import sys; sys.stdin.read(); print('Écrit le parseur de config')"]


def make(tmp_path, command=OK, timeout=20):
    return Summarizer(tmp_path / "c.json", command, timeout, tmp_path)


def wait(s, key, secs=15):
    end = time.time() + secs
    while time.time() < end:
        if (v := s.get(key, "brief")) is not None:
            return v
        time.sleep(0.05)
    return None


def test_miss_then_hit(tmp_path):
    s = make(tmp_path)
    assert s.get("k", "brief") is None
    assert wait(s, "k") == "Écrit le parseur de config"


def test_dedupe(tmp_path):
    s = make(tmp_path)
    s.get("k", "b")
    s.get("k", "b")
    assert len(s._pending) <= 1
    assert wait(s, "k")


def test_timeout_no_cache(tmp_path):
    s = make(tmp_path, [sys.executable, "-c", "import time; time.sleep(10)"], 1)
    assert s.get("k", "b") is None
    time.sleep(2.5)
    assert s.get("k", "b") is None
    assert not (tmp_path / "c.json").exists()


def test_empty_output(tmp_path):
    s = make(tmp_path, [sys.executable, "-c", "print('')"])
    s.get("k", "b")
    time.sleep(1.5)
    assert not (tmp_path / "c.json").exists()


def test_persistence(tmp_path):
    s = make(tmp_path)
    s.get("k", "b")
    wait(s, "k")
    assert make(tmp_path, ["false"]).get("k", "b") == "Écrit le parseur de config"


def test_failure_backoff(tmp_path):
    log = tmp_path / "runs"
    cmd = [sys.executable, "-c",
           f"open({str(log)!r}, 'a').write('x'); import sys; sys.exit(1)"]
    s = make(tmp_path, cmd)
    s.get("k", "b")
    time.sleep(1.5)
    s.get("k", "b")
    s.get("k", "b")
    time.sleep(1.5)
    assert log.read_text() == "x"


def test_default_command_is_locked_down():
    from summary import SAFE_COMMAND
    assert "--tools" in SAFE_COMMAND and "--strict-mcp-config" in SAFE_COMMAND


def test_briefs_cap():
    from dashboard import server
    server._BRIEFS.clear()
    for i in range(40):
        server._remember_briefs(f"s{i}", ([], {}))
    assert len(server._BRIEFS) == server.MAX_BRIEFS and "s0" not in server._BRIEFS
