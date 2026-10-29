---
name: git
description: Set how Claude may use git in this project (locked, ask, auto). User-only command.
disable-model-invocation: true
argument-hint: locked | ask | auto | status
---

The user ran `/noctia:git $ARGUMENTS`.

The `UserPromptSubmit` hook already set the mode from the user's command. Do not run `set-git-mode.sh` with a mode, the guard denies it.

Only confirm, then report the result in one line:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-git-mode.sh" status
```

Modes:
- `locked` (default): git add, commit, push and tag are blocked.
- `ask`: allowed, but the user approves every command in a prompt.
- `auto`: allowed without a prompt, for full-auto projects. You still follow the `git-workflow` skill: ask before pushing, and ask once per project about co-author credit.
