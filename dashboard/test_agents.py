"""Tests for dashboard/agents.py."""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agents  # noqa: E402

SRC = Path(__file__).resolve().parent.parent / "agents"


class AgentsTest(unittest.TestCase):
    """Agents module tests on temp copies."""

    def setUp(self):
        """Copy agent files to a temp dir."""
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.dir = self.tmp / "agents"
        shutil.copytree(SRC, self.dir)
        self.settings = self.tmp / "cfg" / "agents.json"

    def test_list(self):
        """Lists agents with fields."""
        items = {a["name"]: a for a in agents.list_agents(self.dir, self.settings)}
        self.assertEqual(items["chief"]["model"], "opus")
        self.assertTrue(items["chief"]["enabled"])
        self.assertIsInstance(items["chief"]["tools"], list)

    def test_set_model_only_changes_model_line(self):
        """Only the model line changes."""
        p = self.dir / "legal.md"
        old = p.read_text().split("\n")
        agents.set_model(self.dir, "legal", "haiku")
        new = p.read_text().split("\n")
        diff = [i for i, (a, b) in enumerate(zip(old, new)) if a != b]
        self.assertEqual(len(old), len(new))
        self.assertEqual([new[i] for i in diff], ["model: haiku"])

    def test_set_model_keeps_file_mode(self):
        """Rewritten agent file keeps its original mode."""
        p = self.dir / "legal.md"
        os.chmod(p, 0o664)
        agents.set_model(self.dir, "legal", "haiku")
        self.assertEqual(os.stat(p).st_mode & 0o777, 0o664)

    def test_bad_inputs(self):
        """Bad model, name and traversal are refused."""
        with self.assertRaises(ValueError):
            agents.set_model(self.dir, "legal", "gpt")
        with self.assertRaises(ValueError):
            agents.set_model(self.dir, "Legal", "haiku")
        with self.assertRaises(ValueError):
            agents.set_model(self.dir, "../x", "haiku")
        with self.assertRaises(ValueError):
            agents.set_model(self.dir, "nonexistent", "haiku")

    def test_enable_disable(self):
        """Disable then enable an agent."""
        agents.set_enabled(self.dir, "legal", False, self.settings)
        self.assertEqual(json.loads(self.settings.read_text())["disabled"], ["legal"])
        items = {a["name"]: a for a in agents.list_agents(self.dir, self.settings)}
        self.assertFalse(items["legal"]["enabled"])
        agents.set_enabled(self.dir, "legal", True, self.settings)
        self.assertEqual(json.loads(self.settings.read_text())["disabled"], [])

    def test_chief_cannot_be_disabled(self):
        """Chief stays enabled."""
        with self.assertRaises(ValueError):
            agents.set_enabled(self.dir, "chief", False, self.settings)

    def test_enabled_must_be_bool(self):
        """Non-bool enabled values are refused and nothing is written."""
        for bad in ("false", 0, None, 1):
            with self.assertRaises(ValueError):
                agents.set_enabled(self.dir, "legal", bad, self.settings)
        self.assertFalse(self.settings.exists())

    def test_unknown_agent_refused(self):
        """Unknown or invalid agent names are refused and nothing is written."""
        with self.assertRaises(ValueError):
            agents.set_enabled(self.dir, "nonexistent", False, self.settings)
        with self.assertRaises(ValueError):
            agents.set_enabled(self.dir, "../x", False, self.settings)
        self.assertFalse(self.settings.exists())


if __name__ == "__main__":
    unittest.main()
