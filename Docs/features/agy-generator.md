# Antigravity CLI (agy) plugin generator

`scripts/build-agy.sh` rebuilds the `agy/` folder, a Google Antigravity CLI (agy) plugin, from the Claude Code sources. The output is generated. Do not edit `agy/` by hand.

Files:
- `scripts/build-agy.sh`: the generator. It deletes `agy/` and writes it again.
- `scripts/tests/build-agy.test.sh`: tests for the output.

How it works:
- Agents become agy agents. Opus and Sonnet map to the `pro` model, Haiku maps to `flash`. The `chief` agent is the `mainAgent`.
- Skills become agy skills, so each one is a slash command (for example `/build` and `/git`). Rules become one always-on rule in `rules/core.md`.
- The hooks are written in agy format and call `hooks/scripts/agy-hook.sh` (guard-git, guard-secrets, session-start). Text is adapted for agy: `/noctia:x` becomes `/x`, paths use `${PLUGIN_ROOT}` with the fallback `$HOME/.gemini/config/plugins/noctia`, and the co-author line is Gemini.
- `plugin.json` has three keys only: `$schema`, `name` and `description`. The output is deterministic.

Use:
- Build: `bash scripts/build-agy.sh`
- Test: `bash scripts/tests/build-agy.test.sh`
- Install: `agy plugin install ./agy` (or the GitHub URL)

Limits:
- Not ported: mods, `marketplace.json`, and test-output filtering.
- `${PLUGIN_ROOT}` expansion in agy hooks is unconfirmed, so the fallback path is what gets used.
- Agents have no tool restrictions in agy.
- Not tested against a real agy install.
