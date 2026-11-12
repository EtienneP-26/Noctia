---
name: config
description: View and change Noctia settings (dashboard, workflow, git defaults). User-only command.
disable-model-invocation: true
argument-hint: [dashboard | workflow | git]
---

The user ran `/noctia:config $ARGUMENTS`.

Read a value with:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/dashboard/settings.py" get <key>
```

Never write settings.json and never run `settings.py set`. A hook applies the user's answer.

## Steps

1. If the argument is empty, call `AskUserQuestion` with one question: `Which section do you want to configure?`, header `Section`, multiSelect false, options `dashboard`, `workflow`, `git`. This question only routes. Then continue with the chosen section.
2. Run `get` for each key of the section (keys below) to find the current values.
3. Call `AskUserQuestion` ONCE with the section's questions. Each question text starts with `Noctia config:`, multiSelect is false, headers and labels are exactly as listed. Append ` (current)` to the description of the current option.
4. Never pass `answers` or `annotations`.
5. After the answer, run `get` again and report the new values in one line. If the user picks "Other" or cancels, say nothing changed.
6. Mention that all settings are also on the dashboard Settings page (`/settings`).

## Sections

dashboard (keys `dashboard.autostart`, `dashboard.summaries`, `dashboard.retire_seconds`):
- header `Autostart`, labels `on`, `off`
- header `Summaries`, labels `on`, `off`
- header `Retire`, labels `0`, `5`, `10`, `30`, `60` (seconds)
- The port (`dashboard.port`) is set on the dashboard Settings page, not here.

workflow (keys `workflow.pentest`, `workflow.designer`, `workflow.legal`, `workflow.docs`):
- headers `Pentest`, `Designer`, `Legal`, `Docs`, labels `on`, `off`

git (keys `git.default_mode`, `git.default_coauthor`):
- header `Default git`, labels `locked`, `ask`
- header `Co-author`, labels `ask`, `yes`, `no`
