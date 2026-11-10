"""Tests for laya_route with a fake laya module."""
import io
import json
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import laya_route  # noqa: E402


def fake_laya(seen):
    """Build a fake laya module recording predict calls."""
    class M:
        def predict(self, state, questions):
            seen.append((state, questions))
            return {"answers": {q: {"choice": "x", "confidence": 0.5,
                                    "probabilities": {"x": 0.123456}} for q in questions}}
    mod = types.ModuleType("laya")
    mod.load = lambda *a, **k: M()
    return mod


def run(prompt):
    """Run main with a prompt; return (code, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with mock.patch("sys.stdin", io.StringIO(json.dumps({"prompt": prompt}))), \
         mock.patch("sys.stdout", out), mock.patch("sys.stderr", err):
        code = laya_route.main()
    return code, out.getvalue(), err.getvalue()


class T(unittest.TestCase):
    def test_default_questions(self):
        seen = []
        with mock.patch.dict(sys.modules, {"laya": fake_laya(seen)}):
            code, out, _ = run("write tests")
        self.assertEqual(code, 0)
        self.assertEqual(seen[0][0], {"task": "write tests"})
        res = json.loads(json.loads(out)["text"])
        self.assertEqual(set(res), {"agent", "model"})
        self.assertEqual(res["agent"]["probabilities"], {"x": 0.123})
        self.assertIn("legal", seen[0][1]["agent"]["criteria"])

    def test_passthrough(self):
        seen = []
        p = json.dumps({"state": {"a": 1}, "questions": {"q": {"type": "choice"}}})
        with mock.patch.dict(sys.modules, {"laya": fake_laya(seen)}):
            code, _, _ = run(p)
        self.assertEqual(code, 0)
        self.assertEqual(seen[0][0], {"a": 1})

    def test_too_many_questions(self):
        qs = {str(i): {} for i in range(11)}
        code, _, err = run(json.dumps({"state": {}, "questions": qs}))
        self.assertEqual(code, 1)
        self.assertIn("questions", err)

    def test_too_many_options(self):
        q = {"q": {"criteria": {str(i): "d" for i in range(21)}}}
        code, _, _ = run(json.dumps({"state": {}, "questions": q}))
        self.assertEqual(code, 1)

    def test_bad_state(self):
        code, _, _ = run(json.dumps({"state": 3, "questions": {"q": {}}}))
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
