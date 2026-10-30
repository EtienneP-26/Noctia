---
name: git
description: Set how the agent may use git in this project (locked, ask, auto). User-only command.
---

The user ran `/git` followed by the text the user typed after the command.

The mode cannot be changed from the chat. The user runs `bash "${PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/noctia}/hooks/scripts/set-git-mode.sh" <mode>` in their own terminal. Do not run it with a mode, the guard denies it.

If the argument is a mode, only confirm, then report the result in one line:

```bash
bash "${PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/noctia}/hooks/scripts/set-git-mode.sh" status
```

If the argument is `status`, run the same command and report the mode. Nothing more.

If the argument is empty, run the `status` command above, report the mode, and tell the user to change it with `bash "${PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/noctia}/hooks/scripts/set-git-mode.sh" <mode>` (locked, ask or auto) in their own terminal, from the project root.

Modes:
- `locked` (default): git add, commit, push and tag are blocked.
- `ask`: allowed, but the user approves every command in a prompt.
- `auto`: allowed without a prompt, for full-auto projects. You still follow the `git-workflow` skill: ask before pushing, and ask once per project about co-author credit.
