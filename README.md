![Logo Noctia](Docs/assets/Logo.png)

# Noctia

A Claude Code plugin that makes Claude develop like a careful senior engineer, with rules you define: KISS, small modular functions, tests with every change, security checks, guarded git, and model routing.

## Install (local test)

```bash
/plugin marketplace add EtienneP-26/Noctia
```
then
```bash
/plugin install noctia@noctia-plugins
```

Then inside Claude Code, run `/help` and look for the `noctia:` skills.

## Set Sonnet as your default model

A plugin cannot force the main model, so set it once yourself, either in a session with `/model sonnet` or permanently in `~/.claude/settings.json`:

```json
{ "model": "sonnet" }
```

Noctia then delegates by itself: bulk reading to `reader` (Haiku), hard problems to `architect` (Opus), everything else stays on Sonnet.

## What does what

| File | Role |
|---|---|
| `.claude-plugin/plugin.json` | Manifest: name, version. The name prefixes the commands (`/noctia:...`). |
| `rules/core.md` | The core rules. Injected into every session by the SessionStart hook. |
| `hooks/hooks.json` | Wires the scripts below to Claude Code events. |
| `hooks/scripts/session-start.sh` | Injects the rules and scans the project (tests, CI, docs, architecture, CONTRIBUTING, linters). |
| `hooks/scripts/guard-git.sh` | Blocks `git add/commit/push/tag` unless unlocked. |
| `hooks/scripts/guard-secrets.sh` | Blocks writes containing API keys or private keys; asks on suspicious literals. |
| `hooks/scripts/set-git-mode.sh` | Stores the git mode. Called by `/noctia:git`. |
| `skills/code-quality` | How to write and test code. |
| `skills/security-check` | Security checklist and review. |
| `skills/audit` | Deep project audit (`/noctia:audit`). |
| `skills/release-and-deploy` | Versioning vX.Y.Z, branches, CI/CD, changelog, docs. |
| `skills/git-workflow` | How to commit and push once unlocked (co-author question included). |
| `skills/git` | The user-only command that unlocks git (`/noctia:git`). |
| `agents/architect.md` | Opus: complex code, blocked decisions. |
| `agents/reader.md` | Haiku: bulk reading (codebase, git history, data). |
| `agents/security-reviewer.md` | Opus: security review of a change. |

## Git modes

Git write commands are locked by default. You unlock them per project:

- `/noctia:git locked`: default, nothing allowed.
- `/noctia:git ask`: allowed, but you approve every command in a prompt.
- `/noctia:git auto`: allowed without a prompt, for full-auto projects. Claude still asks before pushing. It asks once per project whether to credit itself as co-author (`Co-Authored-By: Claude (Noctia)`) and remembers the answer in `.noctia/coauthor`.
- `/noctia:git status`: show the current mode.

The mode is stored in `.noctia/git-mode` inside the project, which is git-ignored automatically.

## Limits to know

- The hooks are guardrails, not a security sandbox. They match commands by pattern, so an unusual command shape (a script that runs git internally, for example) can slip through.
- `gh` commands (for example `gh pr create`) are not covered by the git guard.
- The co-author trailer is applied by the `git-workflow` skill, so it depends on Claude following it.
- Hook scripts need `bash`. On Windows, use Git Bash or WSL.
- In bypass-permissions mode, hooks cannot prompt: in `ask` mode Noctia denies instead.

## License

License: MIT
