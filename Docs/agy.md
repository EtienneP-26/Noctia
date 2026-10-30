# Noctia in Antigravity CLI (agy)

Noctia runs in the Google Antigravity CLI. The agy plugin is in the `agy/` folder. It is generated from the Claude Code sources.

## Install

```bash
git clone https://github.com/EtienneP-26/Noctia && cd Noctia && bash scripts/install-agy.sh
```

Or `agy plugin install ./agy` from the clone. The GitHub URL form only works if your agy version supports plugins in a subfolder.

Change the git mode from your own terminal (the model cannot do it):

```bash
bash ~/.gemini/config/plugins/noctia/hooks/scripts/set-git-mode.sh <locked|ask|auto>
```

## Mapping from Claude Code

| Claude Code | In agy | How |
|---|---|---|
| `rules/core.md` | Yes | One always-on rule, `rules/core.md`. |
| 8 skills | Yes | Agy skills, each a slash command (`/build`, `/git`...). `/noctia:x` becomes `/x`. |
| 7 agents | Yes | Agy agents. Opus and Sonnet map to pro, Haiku to flash. |
| `chief` as main agent | Yes | Set as `mainAgent`. |
| `guard-git` | Yes | PreToolUse hook through `agy-hook.sh`. Also denies the model changing the git mode. |
| `guard-secrets` | Yes | PreToolUse hook through `agy-hook.sh`. |
| `session-start` | Yes | Hook through `agy-hook.sh`, context sent as `injectSteps`. |
| `filter-test-output` | No | Agy hooks cannot rewrite commands. |
| `set-git-mode` | Partial | Run it in your terminal. `/noctia:git` does not change the mode (no prompt hook). |
| `set-coauthor` | Partial | Co-author line is Gemini. Change it from the terminal script. |
| `marketplace.json` | No | Not used by agy. |
| Mods status and banner | Partial | Replaced by the Noctia status line. |
| Cost | Partial | Cost (`~` if estimated) and context % in colour in the status line; no toast. |
| Theme | No | Claude Code only. |
| Team panel | No | Claude Code only. |
| Tasks panel | No | Claude Code only. |
| Mentor panel | No | The mentor skill works, the panel does not. |
| Agent labels | No | Claude Code only. |
| Visible guards (toasts) | No | The guards work, the toasts do not. |
| `register` | No | Claude Code mods only. |

## Maintainers

- Edit the Claude Code sources. Never edit `agy/` by hand.
- Run `bash scripts/build-agy.sh` to rebuild `agy/`, then commit it.
- CI (`.github/workflows/check.yml`) runs all the tests and fails if `agy/` is out of date.

## Known limits

- Not tested on a real agy install yet.
- `${PLUGIN_ROOT}` expansion in hooks is unconfirmed. The fallback path `$HOME/.gemini/config/plugins/noctia` is used.
- Agents have no tool restriction.
- It is unknown whether `force_ask` is honored in agy auto-approve mode.

## Details

- [Hook adapter](features/agy-hook-adapter.md)
- [Generator](features/agy-generator.md)
- [Status line](features/agy-statusline.md)
