"""Tests for transcript.py using synthetic fixtures."""
import json
import os
import tempfile
import unittest
from pathlib import Path

from dashboard import transcript as t


def line(kind, content, **extra):
    """Build a synthetic transcript line."""
    msg = {"role": kind, "content": content, **extra}
    return json.dumps({"type": kind, "timestamp": "T1", "message": msg})


class ParseLineTest(unittest.TestCase):
    """Tests for parse_line."""

    def test_user_string(self):
        """A string user message gives one user event."""
        ev = t.parse_line(line("user", "hi"), "s")[0]
        self.assertEqual((ev["kind"], ev["text"], ev["agent"]), ("user", "hi", "chief"))

    def test_assistant_tokens_model(self):
        """Assistant text carries model and token counts."""
        usage = {"input_tokens": 1, "cache_read_input_tokens": 4, "output_tokens": 3}
        raw = line("assistant", [{"type": "text", "text": "yo"}],
                   model="m", usage=usage)
        ev = t.parse_line(raw, "s")[0]
        self.assertEqual((ev["model"], ev["tokens"]), ("m", {"in": 5, "out": 3}))

    def test_tool_call_and_result(self):
        """Non-Agent tools give tool_call then tool_result."""
        use = line("assistant", [{"type": "tool_use", "id": "a", "name": "Bash",
                                  "input": {"command": "ls"}}])
        res = line("user", [{"type": "tool_result", "tool_use_id": "a",
                             "content": "out"}])
        briefs = {}
        e1 = t.parse_line(use, "s", briefs=briefs)[0]
        e2 = t.parse_line(res, "s", briefs=briefs)[0]
        self.assertEqual((e1["kind"], e1["tool"]), ("tool_call", "Bash"))
        self.assertEqual((e2["kind"], e2["text"]), ("tool_result", "out"))

    def test_brief_and_report(self):
        """Agent tool_use is a brief; its result is a report with the task id."""
        use = line("assistant", [{"type": "tool_use", "id": "b", "name": "Agent",
                                  "input": {"subagent_type": "dev",
                                            "description": "W1·T2 parser",
                                            "prompt": "do it"}}])
        res = line("user", [{"type": "tool_result", "tool_use_id": "b",
                             "content": [{"type": "text", "text": "done"}]}])
        briefs = {}
        e1 = t.parse_line(use, "s", briefs=briefs)[0]
        e2 = t.parse_line(res, "s", briefs=briefs)[0]
        self.assertEqual((e1["kind"], e1["task"]), ("brief", "W1·T2"))
        self.assertIn("do it", e1["text"])
        self.assertEqual((e2["kind"], e2["task"], e2["text"]), ("report", "W1·T2", "done"))

    def test_target(self):
        """Brief and report carry the receiving subagent without plugin prefix."""
        def use(i, inp):
            return line("assistant", [{"type": "tool_use", "id": i, "name": "Agent",
                                       "input": inp}])
        res = line("user", [{"type": "tool_result", "tool_use_id": "a", "content": "ok"}])
        briefs = {}
        e1 = t.parse_line(use("a", {"subagent_type": "noctia:developer"}), "s", briefs=briefs)[0]
        e2 = t.parse_line(res, "s", briefs=briefs)[0]
        e3 = t.parse_line(use("c", {}), "s", briefs=briefs)[0]
        self.assertEqual((e1["target"], e2["target"]), ("developer", "developer"))
        self.assertEqual(e3["target"], "general-purpose")

    def test_truncation(self):
        """Long text is cut to 2000 chars."""
        ev = t.parse_line(line("user", "x" * 5000), "s")[0]
        self.assertEqual(len(ev["text"]), 2000)

    def test_bad_lines_skipped(self):
        """Malformed or unknown lines give no events and no crash."""
        for raw in ["", "{", "[]", '{"type":"mode"}', '{"type":"user"}',
                    '{"type":"user","message":{"content":[1,null]}}']:
            self.assertEqual(t.parse_line(raw, "s"), [])

    def test_deep_nesting_skipped(self):
        """A deeply nested line is skipped without crashing."""
        self.assertEqual(t.parse_line("[" * 100000, "s"), [])

    def test_oversize_line_skipped(self):
        """A line over 5 MB is skipped."""
        self.assertEqual(t.parse_line(line("user", "x" * (6 * 1024 * 1024)), "s"), [])

    def test_ts_is_str(self):
        """Numeric ts becomes str, missing ts becomes empty; list sorts."""
        num = json.dumps({"type": "user", "timestamp": 5, "message": {"content": "a"}})
        none = json.dumps({"type": "user", "message": {"content": "b"}})
        evs = t.parse_line(num, "s") + t.parse_line(none, "s") + t.parse_line(line("user", "c"), "s")
        self.assertEqual([e["ts"] for e in evs], ["5", "", "T1"])
        self.assertEqual([e["ts"] for e in sorted(evs, key=lambda e: e["ts"])], ["", "5", "T1"])

    def test_task_id(self):
        """Task id parsing accepts only W<n>·T<n>."""
        self.assertIsNone(t._task_id("plan stuff"))
        self.assertIsNone(t._task_id(None))
        self.assertEqual(t._task_id("W10·T3 x"), "W10·T3")


class AsyncTest(unittest.TestCase):
    """Async launch, notification, duplicate and sync behaviour."""

    def feed(self, briefs, msg, kind="user"):
        """Parse one synthetic line with shared briefs."""
        line = json.dumps({"type": kind, "message": msg})
        return t.parse_line(line, "s", "chief", briefs)

    def setup_launch(self, ack):
        """Send a brief then its result; return briefs and result events."""
        b = {}
        use = {"content": [{"type": "tool_use", "id": "tu1", "name": "Agent", "input": {
            "description": "W1·T1 x", "subagent_type": "p:developer", "prompt": "p"}}]}
        self.feed(b, use, "assistant")
        res = {"content": [{"type": "tool_result", "tool_use_id": "tu1", "content": ack}]}
        return b, self.feed(b, res)

    def test_async_flow(self):
        b, ev = self.setup_launch("Async agent launched successfully\nagentId: a1")
        self.assertEqual(ev[0]["kind"], "launch")
        note = ("<task-notification><task-id>a1</task-id><tool-use-id>tu1</tool-use-id>"
                "<status>completed</status><summary>done</summary></task-notification>")
        ev = self.feed(b, {"content": note})
        self.assertEqual((ev[0]["kind"], ev[0]["task"], ev[0]["target"], ev[0]["status"]),
                         ("report", "W1·T1", "developer", "completed"))
        self.assertEqual(ev[0]["text"], "done")
        self.assertEqual(self.feed(b, {"content": note}), [])

    def test_hand_back(self):
        b, _ = self.setup_launch("Async agent launched\nagentId: a1")
        hand = '<agent-message from="a1">final</agent-message>'
        ev = self.feed(b, {"content": hand})
        self.assertEqual([(e["kind"], e["text"], e["task"]) for e in ev],
                         [("report", "final", "W1·T1"), ("report_text", "final", "W1·T1")])
        self.assertEqual(ev[0]["status"], "completed")
        note = ("<task-notification><task-id>a1</task-id><tool-use-id>tu1</tool-use-id>"
                "<status>completed</status><summary>s</summary></task-notification>")
        self.assertEqual(self.feed(b, {"content": note}), [])

    def test_embedded_in_tool_result(self):
        b, _ = self.setup_launch("Async agent launched\nagentId: a1")
        note = ("<task-notification><task-id>a1</task-id><tool-use-id>tu1</tool-use-id>"
                "<status>failed</status><summary>s</summary></task-notification>")
        res = {"content": [{"type": "tool_result", "tool_use_id": "other",
                            "content": [{"type": "text", "text": "ok " + note}]}]}
        kinds = [(e["kind"], e.get("status")) for e in self.feed(b, res)]
        self.assertIn(("report", "failed"), kinds)
        self.assertEqual(self.feed(b, res)[0]["kind"], "tool_result")

    def test_report_carries_later_ts(self):
        b = {}
        use = {"content": [{"type": "tool_use", "id": "tu1", "name": "Agent", "input": {
            "description": "W1·T1 x", "subagent_type": "p:developer", "prompt": "p"}}]}
        self.feed(b, use, "assistant")
        ack = {"content": [{"type": "tool_result", "tool_use_id": "tu1",
                            "content": "Async agent launched\nagentId: a1"}]}
        self.assertEqual([e["kind"] for e in self.feed(b, ack)], ["launch"])
        note = ("<task-notification><task-id>a1</task-id><tool-use-id>tu1</tool-use-id>"
                "<status>completed</status><summary>s</summary></task-notification>")
        res = {"content": [{"type": "tool_result", "tool_use_id": "zz", "content": "x " + note}]}
        raw = json.dumps({"type": "user", "timestamp": "T9", "message": res})
        ev = t.parse_line(raw, "s", "chief", b)
        self.assertEqual([(e["kind"], e["ts"]) for e in ev if e["kind"] == "report"], [("report", "T9")])

    def test_queue_operation_line(self):
        b, _ = self.setup_launch("Async agent launched\nagentId: a1")
        raw = json.dumps({"type": "queue-operation", "content":
                          "<task-notification><task-id>a1</task-id><status>completed</status></task-notification>"})
        self.assertEqual(t.parse_line(raw, "s", "chief", b)[0]["kind"], "report")

    def test_sync_stays_report(self):
        _, ev = self.setup_launch("all done")
        self.assertEqual(ev[0]["kind"], "report")


class FilesTest(unittest.TestCase):
    """Tests for parse_file and find_transcripts."""

    def test_find_and_parse(self):
        """Main and subagent files are found newest first and labelled."""
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            main = root / "sess.jsonl"
            sub_dir = root / "sess" / "subagents"
            sub_dir.mkdir(parents=True)
            sub = sub_dir / "agent-1.jsonl"
            main.write_text(line("user", "hi") + "\nbroken\n")
            sub.write_text(line("user", "brief"))
            sub.with_suffix(".meta.json").write_text(
                json.dumps({"agentType": "dev", "description": "W1·T1 x"}))
            os.utime(main, (1, 1))
            self.assertEqual(t.find_transcripts(root), [sub, main])
            self.assertEqual(t.parse_file(main)[0]["agent"], "chief")
            ev = t.parse_file(sub)[0]
            self.assertEqual((ev["agent"], ev["session"]), ("W1·T1 x", "sess"))
            self.assertEqual(t.parse_file(root / "nope.jsonl"), [])


if __name__ == "__main__":
    unittest.main()


class ReusedTaskIdTest(unittest.TestCase):
    """Two briefs with the same W1·T1 id keep distinct call ids."""

    def test_two_briefs_same_id(self):
        """Brief, launch and report events carry their own tool_use id."""
        briefs, out = {}, []
        for call in ("c1", "c2"):
            use = line("assistant", [{"type": "tool_use", "id": call, "name": "Agent",
                                      "input": {"description": "W1·T1 x", "subagent_type": "developer"}}])
            res = line("user", [{"type": "tool_result", "tool_use_id": call, "content": "done " + call}])
            out += t.parse_line(use, "s", briefs=briefs) + t.parse_line(res, "s", briefs=briefs)
        self.assertEqual([(e["kind"], e["call"]) for e in out],
                         [("brief", "c1"), ("report", "c1"), ("brief", "c2"), ("report", "c2")])
        self.assertEqual({e["task"] for e in out}, {"W1·T1"})

    def test_async_report_call(self):
        """A task-notification report maps back to its brief call id."""
        briefs = {}
        use = line("assistant", [{"type": "tool_use", "id": "c9", "name": "Agent",
                                  "input": {"description": "W1·T1 x", "subagent_type": "tester"}}])
        ack = line("user", [{"type": "tool_result", "tool_use_id": "c9",
                             "content": "Async agent launched\nagentId: ab12"}])
        note = line("user", "<task-notification><task-id>ab12</task-id><status>completed</status>"
                            "<summary>ok</summary></task-notification>")
        evs = [e for ln in (use, ack, note) for e in t.parse_line(ln, "s", briefs=briefs)]
        self.assertEqual([e["call"] for e in evs], ["c9", "c9", "c9"])
