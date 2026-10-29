# Noctia status line for agy

A one-line status bar for the Google Antigravity CLI (agy), with the Noctia model, context use, cost, git mode, running agents, tasks and the current mentor step.

Example:

```
☾ Noctia | Gemini Pro (high) | ctx 42% | $0.50 | git:locked | agents:2 | tasks:3
```

Files:

- `statusline/noctia-status.sh`: the status line script. `scripts/build-agy.sh` copies it to `agy/statusline/`.
- `scripts/install-agy.sh`: builds `agy/`, installs the plugin and optionally enables the status line.
- `scripts/tests/statusline.test.sh` and `scripts/tests/install-agy.test.sh`: tests.

How it works:

- agy pipes its status JSON to the script on stdin. The script reads it with one `jq` call and prints one line.
- Context is green below 60%, yellow from 60% to 79%, red from 80%. A `~` before the cost means the cost is estimated.
- Segments that do not fit `terminal_width` are dropped from the end. Control characters are stripped. With no `jq` or bad input, it prints `Noctia`.
- The git mode comes from the git mode file in `.noctia/`. `mentor:` shows the first line of `.noctia/mentor`, when that file exists.

How to use it:

- Run `bash scripts/install-agy.sh` (add `--yes` to skip the question, `--no-statusline` to skip the status line). It runs `agy plugin install` if agy is found, otherwise it prints the command.
- After a yes, the `statusLine` key is merged into `~/.gemini/antigravity-cli/settings.json`. The old file is backed up as `settings.json.bak-<timestamp>`, other keys are kept, and an invalid JSON file is left untouched.

Limits:

- Not yet checked against a real agy install.
- Only the banner, cost, theme, team, tasks and mentor parts of the Claude Code mods are mapped to this one line. Panels, buttons, toasts, labels and register are not ported.
