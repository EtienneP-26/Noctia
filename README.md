![Logo Noctia](Docs/assets/logo.png)

# Noctia

A plugin for Claude Code and Antigravity CLI (agy) that makes the AI develop like a careful senior engineer, with rules you define: KISS, small modular functions, tests with every change, security checks, guarded git, and model routing.

## Install (local test)

```bash
/plugin marketplace add EtienneP-26/Noctia
```
then
```bash
/plugin install noctia@noctia-plugins
```

Then inside Claude Code, run `/help` and look for the `noctia:` skills.

## Use Noctia in Antigravity CLI (agy)

Noctia also works in the Google Antigravity CLI (`agy`, in the terminal). The plugin is generated into the `agy/` folder.

```bash
git clone https://github.com/EtienneP-26/Noctia && cd Noctia && bash scripts/install-agy.sh
```

The script builds `agy/`, runs `agy plugin install ./agy`, then asks before adding the Noctia status line to your agy settings (a backup is made). Use `--yes` to skip the question, or `--no-statusline` to skip that step. It needs bash and jq.

What works:

- The core rules, always on.
- The skills as slash commands: `/build`, `/git`, `/audit`...
- The agents: `chief`, `orchestrator`, `developer` and `pentester` on the pro model; `tester`, `reader` and `documenter` on the flash model.
- The git lock, the secret guard and the session start info.
- The Noctia status line.

To change the git mode in agy, run this in your own terminal, from your project root:

```bash
bash ~/.gemini/antigravity-cli/plugins/noctia/hooks/scripts/set-git-mode.sh <locked|ask|auto>
```

What does not port: the Claude Code mods (panels, toasts) and the test output filtering.

More in [Docs/agy.md](Docs/agy.md).

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

## The team

Noctia turns the session into a small team. The main agent is the `chief` (Opus): it talks to you and decides who works on what.

| Agent | Model | Role |
|---|---|---|
| `chief` | Opus | Main agent. Leads, asks you to approve the plan. |
| `orchestrator` | Opus | Plans the project or feature, decides how to build it. |
| `developer` | Sonnet | Writes the code, one feature at a time. |
| `tester` | Haiku | Launches the project the normal way, uses the feature, writes its tests. |
| `reader` | Haiku | Reads the codebase: where a feature or a problem is. |
| `documenter` | Haiku | Short doc of each finished feature. |
| `pentester` | Opus | Tries to break the project (security and abnormal use). |

`/noctia:build <idea>` runs the whole flow: plan, your approval, then for each feature developer, tester, documenter and a `feat/<feature>` branch; at the end the pentester attacks and the developer fixes.

The plugin's `settings.json` makes `noctia:chief` the main agent of every session. It replaces the default Claude Code system prompt, and it runs on Opus. To turn this off, set `"agent"` to another agent in your own settings, or run `claude --agent <name>`.

## What does what

| File | Role |
|---|---|
| `.claude-plugin/plugin.json` | Manifest: name, version. The name prefixes the commands (`/noctia:...`). |
| `rules/core.md` | The core rules. Injected into every session by the SessionStart hook. |
| `hooks/hooks.json` | Wires the scripts below to Claude Code events. |
| `hooks/scripts/session-start.sh` | Injects the rules and scans the project (tests, CI, docs, architecture, CONTRIBUTING, linters). |
| `hooks/scripts/guard-git.sh` | Blocks `git add/commit/push/tag` unless unlocked. |
| `hooks/scripts/guard-secrets.sh` | Blocks writes containing API keys or private keys; asks on suspicious literals. |
| `hooks/scripts/filter-test-output.sh` | Trims the output of a bare test command (`npm test`, `pytest`, `cargo test`...) to its last lines, keeps the exit code, saves the full log to a file. Needs `jq`. Approves that command automatically; your deny and ask rules still apply. Tests: `bash hooks/tests/filter-test-output.test.sh`. |
| `hooks/scripts/set-git-mode.sh` | Stores the git mode. Called by `/noctia:git`. |
| `skills/code-quality` | How to write and test code. |
| `skills/security-check` | Security checklist and review. |
| `skills/audit` | Deep project audit (`/noctia:audit`). |
| `skills/release-and-deploy` | Versioning vX.Y.Z, branches, CI/CD, changelog, docs. |
| `skills/git-workflow` | How to commit and push once unlocked (co-author question included). |
| `skills/git` | The user-only command that unlocks git (`/noctia:git`). |
| `skills/help-me-build-it` | Mentor mode (`/noctia:help-me-build-it`): Claude guides you instead of coding, you write the code. |
| `settings.json` | Makes `noctia:chief` the main agent. |
| `agents/chief.md` | Opus: main agent, leads the team. |
| `agents/orchestrator.md` | Opus: plans and decides how to build. |
| `agents/developer.md` | Sonnet: writes the code of one feature. |
| `agents/tester.md` | Haiku: normal run, use and tests of a feature. |
| `agents/reader.md` | Haiku: reads the codebase, locates features and problems. |
| `agents/documenter.md` | Haiku: short doc of each feature. |
| `agents/pentester.md` | Opus: attacks the project, reports the flaws. |
| `skills/build` | `/noctia:build <idea>`: plan approved by you, feature loop with git branches, then pentest and fixes, then a report. |

## Mods (visual)

`noctia-mods` is a second plugin: it changes how Claude Code looks. Install it the same way:

```bash
/plugin install noctia-mods@noctia-plugins
```

| Mod | What you see | Since |
|---|---|---|
| Noctia banner | A rounded band above the prompt: git mode, co-author, guards, team and mentor, each with a green / yellow / grey dot. `/noctia` opens a pane that says how each part is switched on or off, and brings the banner back after Hide. | v0.5.0 |
| Team panel | A side panel with a summary (running, done, failed) and every subagent: colour, status, task, duration. `/team` reopens it. | v0.3.1 |
| Agent labels | A coloured `● reader`, `● pentester`… tag in front of each chat row that launches a subagent, same colours as the team panel. | v0.3.3 |
| Task checklist | A side panel with the task list of the session: done, in progress, to do, a progress bar and a percentage. Reads `TodoWrite` only for now; `TaskCreate`/`TaskUpdate` are not handled yet. | v0.3.4 |
| Visible guards | A toast when a Noctia guard blocks or questions a command (locked git, hard-coded secret), with the reason. | v0.3.5 |
| Mentor panel | In mentor mode, a side panel with the steps (done, doing, to do) and a gauge of the hints used. | v0.3.6 |
| Cost and context | The Noctia banner shows the model, a context gauge (green, yellow at 60%, red at 80%) and the session cost. A toast warns at 80% of the context. | v0.3.7 |

## Mentor mode

`/noctia:help-me-build-it <project, feature or bug>` turns Claude into a mentor. It does not write the solution: it asks questions, helps you split the work into small steps, reviews what you wrote, and guides your debugging with hints of growing strength. It only gives very specific commands, signatures or syntax reminders. You do the thinking and the typing.

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
