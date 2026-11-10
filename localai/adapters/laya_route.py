"""Command backend: route a task with Laya (stdin JSON in, stdout JSON out)."""
import json
import re
import sys
from pathlib import Path

AGENTS_DIR = Path(__file__).resolve().parent.parent.parent / "agents"
AGENTS = {
    "orchestrator": "coordinates the work and splits it into tasks",
    "developer": "writes and fixes code",
    "designer": "designs interfaces and visuals",
    "tester": "writes and runs tests",
    "reader": "reads and explains code",
    "documenter": "writes documentation",
    "pentester": "tries to break things, security testing",
    "legal": "legal and license review",
}
MODELS = {
    "haiku": "small, mechanical, cheap",
    "sonnet": "normal code and reasoning",
    "opus": "planning, hard design, security review",
}
MAX_QUESTIONS, MAX_OPTIONS = 10, 20


def agent_criteria() -> dict:
    """Map each agent to a one-line role from agents/<name>.md, with fallback."""
    out = {}
    for name, fallback in AGENTS.items():
        out[name] = fallback
        try:
            text = (AGENTS_DIR / f"{name}.md").read_text(encoding="utf-8")
        except OSError:
            continue
        m = re.search(r"^description:\s*(.+)$", text, re.M)
        if m:
            out[name] = m.group(1).strip()[:200]
    return out


def default_questions() -> dict:
    """Build the default agent and model questions."""
    return {
        "agent": {"type": "choice", "instructions": "Which agent should handle this task?",
                  "criteria": agent_criteria()},
        "model": {"type": "choice", "instructions": "Which model should run this task?",
                  "criteria": dict(MODELS)},
    }


def _check_questions(questions) -> None:
    """Validate the shape and limits of a questions dict."""
    if not isinstance(questions, dict) or not questions or len(questions) > MAX_QUESTIONS:
        raise ValueError(f"questions must be a dict of 1-{MAX_QUESTIONS} items")
    for qid, q in questions.items():
        if not isinstance(qid, str) or not isinstance(q, dict):
            raise ValueError("each question must be an object")
        crit = q.get("criteria")
        if crit is not None and (not isinstance(crit, dict) or len(crit) > MAX_OPTIONS):
            raise ValueError(f"criteria must be a dict of at most {MAX_OPTIONS} options")


def build_input(prompt: str) -> tuple:
    """Return (state, questions) from a pass-through payload or a task text."""
    try:
        data = json.loads(prompt)
    except ValueError:
        data = None
    if isinstance(data, dict) and "state" in data and "questions" in data:
        if not isinstance(data["state"], dict):
            raise ValueError("state must be an object")
        _check_questions(data["questions"])
        return data["state"], data["questions"]
    return {"task": prompt}, default_questions()


def run_laya(state: dict, questions: dict) -> dict:
    """Load Laya lazily and predict answers."""
    import laya
    model = laya.load("convaiinnovations/laya", subfolder="multilingual", device="cpu")
    return model.predict(state, questions)["answers"]


def format_answers(answers: dict) -> str:
    """Serialize answers to the compact JSON text."""
    out = {}
    for qid, a in answers.items():
        probs = a.get("probabilities") or {}
        out[qid] = {
            "choice": a.get("choice"),
            "confidence": a.get("confidence"),
            "probabilities": {k: round(float(v), 3) for k, v in probs.items()}
            if isinstance(probs, dict) else probs,
        }
    return json.dumps(out, ensure_ascii=False, default=str)


def main() -> int:
    """Entry point: stdin JSON to stdout JSON, errors to stderr."""
    try:
        req = json.load(sys.stdin)
        prompt = req["prompt"]
        if not isinstance(prompt, str):
            raise ValueError("prompt must be a string")
        state, questions = build_input(prompt)
        text = format_answers(run_laya(state, questions))
    except Exception as e:  # noqa: BLE001 - report any failure on stderr
        print(f"laya_route: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    print(json.dumps({"text": text}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
