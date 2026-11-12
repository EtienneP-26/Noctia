"""Tests for dashboard/settings.py."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import settings  # noqa: E402


class SettingsTest(unittest.TestCase):
    """Settings store tests on a temp file."""

    def setUp(self):
        """Create temp dir and path."""
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "n" / "settings.json"

    def tearDown(self):
        """Remove temp dir."""
        self.tmp.cleanup()

    def cli(self, *args):
        """Run the CLI against the temp file."""
        env = dict(os.environ, NOCTIA_SETTINGS=str(self.path))
        return subprocess.run([sys.executable, str(HERE / "settings.py"), *args],
                              capture_output=True, text=True, env=env)

    def test_defaults_missing(self):
        """Missing file gives defaults."""
        self.assertEqual(settings.load(self.path), settings.DEFAULTS)

    def test_malformed(self):
        """Malformed file gives defaults."""
        self.path.parent.mkdir()
        self.path.write_text("{nope")
        self.assertEqual(settings.load(self.path), settings.DEFAULTS)

    def test_partial_merge(self):
        """Saves merge into existing values."""
        settings.save({"dashboard": {"port": 8000}}, self.path)
        full = settings.save({"dashboard": {"autostart": True}}, self.path)
        self.assertEqual(full["dashboard"]["port"], 8000)
        self.assertTrue(settings.load(self.path)["dashboard"]["autostart"])
        self.assertTrue(full["workflow"]["pentest"])

    def test_validation_errors(self):
        """Bad input raises ValueError."""
        bad = [{"x": {}}, {"git": {"nope": 1}}, {"git": {"default_mode": "yolo"}},
               {"dashboard": {"port": 80}}, {"dashboard": {"port": 70000}},
               {"dashboard": {"port": True}}, {"dashboard": {"retire_seconds": 3601}},
               {"dashboard": {"autostart": "true"}},
               {"git": {"default_coauthor": "maybe"}}, {"git": 3}]
        for partial in bad:
            with self.assertRaises(ValueError, msg=str(partial)):
                settings.save(partial, self.path)
        self.assertFalse(self.path.exists())

    def test_mode(self):
        """File is 0600 and dir 0700."""
        settings.save({"git": {"default_mode": "ask"}}, self.path)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.path.parent.stat().st_mode & 0o777, 0o700)

    def test_invalid_stored_value_ignored(self):
        """Invalid stored value falls back to default."""
        self.path.parent.mkdir()
        self.path.write_text('{"git": {"default_mode": "yolo"}}')
        self.assertEqual(settings.load(self.path)["git"]["default_mode"], "locked")

    def test_auto_mode_valid(self):
        """Auto is an accepted default_mode value."""
        full = settings.save({"git": {"default_mode": "auto"}}, self.path)
        self.assertEqual(full["git"]["default_mode"], "auto")

    def test_cli(self):
        """CLI get and set."""
        self.assertEqual(self.cli("get", "dashboard.port").stdout.strip(), "7777")
        self.assertEqual(self.cli("set", "dashboard.port", "8080").returncode, 0)
        self.assertEqual(self.cli("get", "dashboard.port").stdout.strip(), "8080")
        self.cli("set", "dashboard.autostart", "true")
        self.assertEqual(self.cli("get", "dashboard.autostart").stdout.strip(), "true")
        self.assertEqual(self.cli("get", "git.default_mode").stdout.strip(), "locked")

    def test_cli_errors(self):
        """CLI exits 2 on errors."""
        for args in (("set", "git.default_mode", "yolo"), ("get", "a.b"),
                     ("set", "dashboard.port", "x"), ("set", "dashboard.autostart", "1")):
            res = self.cli(*args)
            self.assertEqual(res.returncode, 2, args)
            self.assertTrue(res.stderr)


if __name__ == "__main__":
    unittest.main()


def test_concurrent_saves_keep_all(tmp_path):
    """20 parallel saves leave valid JSON with every change."""
    import json
    import threading
    path = tmp_path / "s.json"
    keys = [{"dashboard": {"port": 2000 + i}} for i in range(10)]
    keys += [{"workflow": {"docs": i % 2 == 0}} for i in range(10)]
    threads = [threading.Thread(target=settings.save, args=(k, path)) for k in keys]
    [t.start() for t in threads]
    [t.join() for t in threads]
    data = json.loads(path.read_text())
    assert 2000 <= data["dashboard"]["port"] < 2010
    assert "workflow" in data
