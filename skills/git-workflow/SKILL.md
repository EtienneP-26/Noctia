---
name: git-workflow
description: How to commit and push once git is unlocked. Use whenever you are about to run git add, commit, push or tag, or when the user asks you to commit.
---

# Git workflow

Git write commands are locked by a hook until the user runs `/noctia:git ask` or `/noctia:git auto`. If a command is blocked, stop and tell the user how to unlock. Never retry or work around it.

Once unlocked:

1. **Match the project.** Read CONTRIBUTING.md if it exists, otherwise `git log --oneline -20` (delegate to `reader` if the history is large). Follow its branch naming, commit message style and target branch. Default: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
2. **Stage precisely.** `git add <specific files>`, never `git add -A` or `.` blindly. Check `git status` first so no secret, `.env`, build output or unrelated file goes in.
3. **Co-author credit, ask once per project.** Look for `.noctia/coauthor`. If it exists, use its answer (`yes` or `no`) without asking. If not, ask once: "Do you want me to credit myself as co-author in this project's commits? I will remember your answer." Then save the answer by running `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-coauthor.sh" yes` (or `no`). On `no`, the script also adds `.noctia/` to `.git/info/exclude`, so the folder leaves no trace in the repo. If the answer is yes, end every commit message with these two lines:
```
   Co-Authored-By: Noctia <noctia@etienne-pouille.work>
   Co-Authored-By: Claude <noreply@anthropic.com>
```
   The credit is always these same two lines, whichever model did the work. If the user later changes their mind, run the script again with the new answer. If CONTRIBUTING.md forbids AI credit, do not ask: run the script with `no` and say why.
4. **Push is a separate question.** Ask "Do you want me to push?" every time, even in auto mode. Never force-push. Never push to main or a protected branch unless CONTRIBUTING.md says that is the workflow.
5. **Tags and releases** follow the `release-and-deploy` skill.
