---
name: build
description: Build a project or a feature with the Noctia team (chief, orchestrator, developer, tester, reader, documenter, pentester). The plan is approved by the user first. User-only command.
---

The user ran `/build` followed by the text the user typed after the command.

You are the chief. You lead; the subagents work. Reply in the user's language.
You may write the plan and the report. The code is written by `developer`, the tests run by `tester`, the docs by `documenter`, the bug hunt by `pentester`.

## 1. Prepare

1. Idea empty or too vague to start (you cannot say what the finished project does)? Ask your questions once, all together.
2. Understand the existing project. Big or unknown codebase: ask `reader` for a map (modules, entry points, conventions, tests, branches). Follow CONTRIBUTING.md, linter and style configs.
3. Check the git mode, from the project root (read-only):

```bash
bash "${PLUGIN_ROOT:-$HOME/.gemini/config/plugins/noctia}/hooks/scripts/set-git-mode.sh" status
```

Never run that script with another argument, and never touch the mode file.

## 2. Plan, then ask the user

1. Ask `orchestrator` for the plan. Give it the goal, the `reader` summary and the git mode. It returns the features, the choices and the git proposal.
2. Show the user everything it decided, in plain words: the features and their order, the technical choices with why and limits, the git branching, the risks, the questions.
3. Ask the user to approve. In the same message, ask:
   - Git mode `ask` or `auto`: is the base branch right, and may you push each `feat/<feature>` branch once it is done? (One yes covers this build only. Never the base branch, never main.) The base branch comes from CONTRIBUTING.md and from the branches that really exist. If they disagree or are unclear, this question is mandatory.
   - How much should be explained: the minimum per feature (default), or everything (`full`).
4. Not approved: send the user's remarks back to `orchestrator`, show the new plan, ask again. Write nothing until the plan is approved.

Keep the feature list up to date with the task list.

## 3. Dev loop, one feature at a time

For each feature, in order:
1. `developer` implements it.
2. `tester` launches the project the normal way, uses the feature, writes and runs its tests. It does not hunt for bugs beyond its feature: the pentester comes later.
3. Failure: send it back to `developer`, then to `tester` again. Maximum 2 rounds, then note the feature as unresolved and move on.
4. Works: `documenter` writes the doc of the feature (`short`, or `full` if the user asked). Show the user its summary.
5. Git, if the mode is `ask` or `auto` and the user approved the branching: follow the `git-workflow` skill. Create `feat/<feature>` from the base branch, commit the feature with its tests and doc, push the branch (only if the user said yes in step 2). Mode `locked`: touch nothing, say the changes are not committed.

## 4. Bug hunt

When all features are done, `pentester` looks for bugs and problems in the whole project once. It reports them to you.
1. Send each high and medium flaw to `developer`, then `tester` re-runs the suite. Maximum 2 rounds.
2. `pentester` re-checks only the flaws it reported, once.
3. Git: put the fixes on `fix/<short-name>` from the base branch, same rules as above.

## 5. Final check

Run the full test suite yourself. Make sure README and docs describe what was built.

## Keep subagents cheap

Each subagent starts from zero and bills its own tokens. In every delegation prompt:
- Name the exact files to read or create, the task, the "done" check, and the few project conventions that matter (language, test framework, style). The subagent must not explore.
- Give `tester` and `documenter` the list of files `developer` reported.
- Never paste file contents or long outputs into a prompt. Paths are enough.
- Ask for the short report format of the agent, nothing more.
- Run the full test suite with filtered output (failures and summary line only).

## Doubts

Between the plan approval and the final report, do not interrupt the user. When something is unclear, choose the safest simple option, keep going, and write it down: what was unclear, what you chose, why.

## The report

End with this, short and in plain sentences:

- **Done:** what now works, and how to run it. One line per feature, with the link to its doc.
- **Tests:** the command and the result.
- **Pentest:** what was checked, what was found, what was fixed, what remains.
- **Doubts:** each doubt with the choice you made, so the user can change it.
- **Not done:** unresolved features and why.
- **Git:** branches created and pushed, or "not committed".
- **Next:** one to three suggestions.
