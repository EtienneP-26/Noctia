![Logo Noctia](Docs/assets/logo.png)

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

## Update

Refresh the marketplace to fetch the latest version, then reinstall the plugin:

```bash
/plugin marketplace update noctia-plugins
```
then
```bash
/plugin install noctia@noctia-plugins
```

Reload without restarting Claude Code:

```bash
/reload-plugins
```

You can also open `/plugin` and, in the marketplace settings, enable auto-update for `noctia-plugins` so it refreshes at startup.

Claude Code decides a plugin changed from the `version` in `.claude-plugin/plugin.json`. If you maintain Noctia, bump that version (vX.Y.Z) with every release, or users will not see your changes.

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
| `skills/help-me-code-it` | Mentor mode (`/noctia:help-me-code-it`): Claude guides you instead of coding, you write the code. |
| `agents/architect.md` | Opus: complex code, blocked decisions. |
| `agents/reader.md` | Haiku: bulk reading (codebase, git history, data). |
| `agents/security-reviewer.md` | Opus: security review of a change. |

## Mods (visual)

`noctia-mods` is a second plugin: it changes how Claude Code looks. Install it the same way:

```bash
/plugin install noctia-mods@noctia-plugins
```

| Mod | What you see | Since |
|---|---|---|
| Team panel | A side panel listing every subagent: colour, status, task, duration. `/team` reopens it. | v0.3.1 |
| Agent labels | A coloured `[reader]`, `[architect]`… tag in front of each chat row that launches a subagent, same colours as the team panel. | v0.3.3 |
| Task checklist | A side panel with the task list of the session: done, in progress, to do, and a progress bar. Reads `TodoWrite` only for now; `TaskCreate`/`TaskUpdate` are not handled yet. | v0.3.4 |
| Visible guards | A toast when a Noctia guard blocks or questions a command (locked git, hard-coded secret), with the reason. | v0.3.5 |
| Mentor panel | In mentor mode, a side panel with the steps (done, doing, to do) and a gauge of the hints used. | v0.3.6 |

## Mentor mode

`/noctia:help-me-code-it <project, feature or bug>` turns Claude into a mentor. It does not write the solution: it asks questions, helps you split the work into small steps, reviews what you wrote, and guides your debugging with hints of growing strength. It only gives very specific commands, signatures or syntax reminders. You do the thinking and the typing.

## Git modes

Git write commands are locked by default. You unlock them per project:

- `/noctia:git locked`: default, nothing allowed.
- `/noctia:git ask`: allowed, but you approve every command in a prompt.
- `/noctia:git auto`: allowed without a prompt, for full-auto projects. Claude still asks before pushing.- `/noctia:git status`: show the current mode.

The mode is stored in `.noctia/git-mode` inside the project, which is git-ignored automatically.

### Co-authors

Once git is unlocked (`ask` or `auto`), Noctia asks once per project whether you want Claude and Noctia credited as co-authors. If you say yes, every commit Claude makes ends with:

```
Co-Authored-By: Noctia <noctia@etienne-pouille.work>
Co-Authored-By: Claude <noreply@anthropic.com>
```

Both then appear as co-authors on the commit on GitHub. If you say no, no credit is added. Your answer is remembered in `.noctia/coauthor`, and you can change it by running `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-coauthor.sh" yes` (or `no`). The credit is only attribution: it does not give anyone rights over your code, your `LICENSE` does.

## Limits to know

- The hooks are guardrails, not a security sandbox. They match commands by pattern, so an unusual command shape (a script that runs git internally, for example) can slip through.
- `gh` commands (for example `gh pr create`) are not covered by the git guard.
- The co-author trailer is applied by the `git-workflow` skill, so it depends on Claude following it.
- Hook scripts need `bash`. On Windows, use Git Bash or WSL.
- In bypass-permissions mode, hooks cannot prompt: in `ask` mode Noctia denies instead.

## License

License: MIT
