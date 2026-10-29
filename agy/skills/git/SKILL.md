---
name: git
description: Set how the agent may use git in this project (locked, ask, auto). User-only command.
---

The user ran `/git` followed by the text the user typed after the command.

The mode cannot be changed from the chat. The user runs `bash "${PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/noctia}/hooks/scripts/set-git-mode.sh" <mode>` in their own terminal. Do not run it with a mode, the guard denies it.

Only confirm, then report the result in one line:

```bash
bash "${PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/noctia}/hooks/scripts/set-git-mode.sh" status
```

Modes:
- `locked` (default): git add, commit, push and tag are blocked.
- `ask`: allowed, but the user approves every command in a prompt.
- `auto`: allowed without a prompt, for full-auto projects. You still follow the `git-workflow` skill: ask before pushing, and ask once per project about co-author credit.
