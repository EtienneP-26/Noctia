---
name: git
description: Set how Claude may use git in this project (locked, ask, auto). User-only command.
disable-model-invocation: true
argument-hint: [locked | ask | auto | status]
---

The user ran `/noctia:git $ARGUMENTS`.

The `UserPromptSubmit` hook already set the mode when the argument is `locked`, `ask` or `auto`. Do not run `set-git-mode.sh` with a mode, the guard denies it.

If the argument is a mode, only confirm, then report the result in one line:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-git-mode.sh" status
```

If the argument is `status`, run the same command and report the mode. Nothing more.

<!-- picker -->
If the argument is empty, open the mode picker:

1. Run the `status` command above to get the current mode.
2. Call the `AskUserQuestion` tool with exactly one question:
   - question: `Noctia: choose the git mode for this project`
   - header: `Git mode`
   - multiSelect: false
   - options, in this order, with these exact labels: `locked` (blocked), `ask` (allowed, you approve each command), `auto` (allowed without a prompt). Append ` (current)` to the description of the current mode.
   - Never pass `answers` or `annotations`. The guard denies it, and a hook sets the mode from the user's own answer.
3. After the answer, run the `status` command again and report the mode in one line.
4. If the user picks "Other" or cancels, say nothing changed.
<!-- /picker -->

Modes:
- `locked` (default): git add, commit, push and tag are blocked.
- `ask`: allowed, but the user approves every command in a prompt.
- `auto`: allowed without a prompt, for full-auto projects. You still follow the `git-workflow` skill: ask before pushing, and ask once per project about co-author credit.
