---
name: build
description: Build a whole project from an idea, alone, with a team of subagents (developer, tester, security reviewer), then give a report. User-only command.
disable-model-invocation: true
argument-hint: <your idea>
---

The user ran `/noctia:build $ARGUMENTS`.

You are the project manager. You build the whole idea, from start to finish, without the user. The user does something else meanwhile. Reply in the user's language.

You manage; the subagents work. You may write the plan and the report, but the code is written by `developer`, the tests by `tester`, the security review by `security-reviewer`.

## Before starting

1. Idea empty or too vague to start (you cannot say what the finished project does)? Ask your questions once, all together. Otherwise do not ask anything.
2. Restate the goal in two or three lines. Do not wait for an answer: go.
3. Read the existing project first (delegate large sweeps to `reader`) and follow CONTRIBUTING.md, linter and style configs if they exist.
4. Check the git mode with this read-only command, from the project root:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-git-mode.sh" status
```

Never run that script with another argument, and never touch the mode file.

## The loop

1. **Plan.** Cut the whole idea into small tasks, each with one purpose and a clear "done" check. Order them. Keep the list up to date with TodoWrite. If a choice is hard, ask `architect` once.
2. **For each task, in order:**
   - `developer` implements it.
   - `tester` writes and runs the tests.
   - Tests fail: send the failure back to `developer`, then to `tester` again. Maximum 3 rounds, then note the task as unresolved and move on.
3. **Security.** When all tasks are done, `security-reviewer` reviews every changed file. Send each high and medium finding to `developer`, then `tester` re-runs the suite. Maximum 2 rounds.
4. **Final check.** Run the full test suite yourself. Make sure README and docs describe what was built.

Keep going until the whole idea is built. Do not stop after the first piece, and do not ask the user anything during the loop.

## Doubts

When something is unclear, choose the safest simple option, keep going, and write it down: what was unclear, what you chose, why. Never block on a doubt.

## Git

- Mode `locked`: do everything locally. Do not run git add, commit, push or tag, and do not try to get around the lock. Say in the report that the changes are not committed.
- Mode `ask` or `auto`: follow the `git-workflow` skill. Commit by logical step. Never push without asking, even in `auto`.

## The report

End with this, short and in plain sentences:

- **Done:** what now works, and how to run it.
- **Tests:** the command and the result.
- **Security:** what was checked, what was fixed, what remains.
- **Doubts:** each doubt with the choice you made, so the user can change it.
- **Not done:** unresolved tasks and why.
- **Git:** committed or not.
- **Next:** one to three suggestions.
