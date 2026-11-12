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
/plugin install noctia-mods@noctia-plugins
```

`noctia-mods` is optional: it adds the visual mods (see [Mods](#mods-visual)). Then inside Claude Code, run `/help` and look for the `noctia:` skills.

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
bash ~/.gemini/config/plugins/noctia/hooks/scripts/set-git-mode.sh <locked|ask|auto>
```

What does not port: the Claude Code mods (panels, toasts) and the test output filtering.

More in [Docs/agy.md](Docs/agy.md).

## Update

Refresh the marketplace to fetch the latest version, then reinstall both plugins:

```bash
/plugin marketplace update noctia-plugins
```
then
```bash
/plugin install noctia@noctia-plugins
/plugin install noctia-mods@noctia-plugins
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
| `pentester` | Opus | Finds the bugs and problems of the project. |
| `designer` | Sonnet | UI/visual design review and fixes. |
| `legal` | Sonnet | Production compliance check: GDPR, cookies, legal notices, licenses, accessibility law. |

New agents need a Claude Code restart to be available.

`/noctia:build <idea>` runs the whole flow: plan, your approval, then for each feature developer, tester, documenter and a `feat/<feature>` branch; at the end the pentester looks for bugs and problems and the developer fixes them.

The plugin's `settings.json` makes `noctia:chief` the main agent of every session. It replaces the default Claude Code system prompt, and it runs on Opus. To turn this off, set `"agent"` to another agent in your own settings, or run `claude --agent <name>`.

### Build waves and KISS

`/noctia:build` runs developers in waves. At most 3 developers work in parallel, each on separate files. Each brief is labelled `W<wave>·T<task>`, so you can see which task belongs to which wave.

The KISS rules are strict: the shortest code that works, no dead code, no abstraction "for later", no unused option. Existing functions and libraries are reused, and a new dependency needs your approval.

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
| `skills/config` | The user-only command that views and changes the settings (`/noctia:config`). |
| `skills/help-me-build-it` | Mentor mode (`/noctia:help-me-build-it`): Claude guides you instead of coding, you write the code. |
| `settings.json` | Makes `noctia:chief` the main agent. |
| `agents/chief.md` | Opus: main agent, leads the team. |
| `agents/orchestrator.md` | Opus: plans and decides how to build. |
| `agents/developer.md` | Sonnet: writes the code of one feature. |
| `agents/tester.md` | Haiku: normal run, use and tests of a feature. |
| `agents/reader.md` | Haiku: reads the codebase, locates features and problems. |
| `agents/documenter.md` | Haiku: short doc of each feature. |
| `agents/pentester.md` | Opus: finds the bugs and problems, reports them. |
| `agents/designer.md` | Sonnet: UI/visual design review and fixes. |
| `agents/legal.md` | Sonnet: production compliance check, reports only. |
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
| Agent graph | A side pane with the live agents as a node graph. Each node shows state, type, wave·task, model and time; tokens appear when the agent finishes. Opens on the first agent launch or with `/graph`. | v0.6.0 |

### Noctia graph

The graph docks next to the chat in fullscreen mode and takes at most 45% of the width. It updates live while agents run. Each node shows the agent's state, type, `W<wave>·T<task>`, model and time. Tokens are shown once the agent finishes. The panel also shows the completion in percent, overall and per wave.

## Settings

Noctia stores its settings in `~/.claude/noctia/settings.json` (change the path with `NOCTIA_SETTINGS`). Change them on the dashboard Settings page (`/settings`), or with `/noctia:config [dashboard | workflow | git]`. Both write the same file.

| Key | Default | Values |
|---|---|---|
| `dashboard.autostart` | `false` | start the dashboard when a session starts |
| `dashboard.port` | `7777` | 1024 to 65535 |
| `dashboard.summaries` | `false` | one Haiku mission summary per brief (opt-in) |
| `dashboard.retire_seconds` | `10` | 0 to 3600: delay before finished work leaves the Tree |
| `workflow.pentest`, `workflow.designer`, `workflow.legal`, `workflow.docs` | `true` | steps of `/noctia:build`; off steps are skipped |
| `git.default_mode` | `locked` | `locked` or `ask` |
| `git.default_coauthor` | `ask` | `ask`, `yes` or `no` |

- Environment variables win over the file for auto-start: `NOCTIA_DASHBOARD_AUTOSTART=1` (on) or `0` (off), and `NOCTIA_DASHBOARD_PORT`. `NOCTIA_DASHBOARD_SUMMARIES=1` turns summaries on.
- `git.default_mode` only accepts `locked` or `ask`. It applies to projects that have no mode set yet. `auto` is set per project with `/noctia:git auto`.
- An invalid value is ignored and the default is used.

## Dashboard

A local "control room" web page that follows the agents of a session live. Run `/noctia:dashboard`, then open http://127.0.0.1:7777 (or the port it prints). Without the skill:

```bash
python3 dashboard/server.py --port 7777 --project .
```

- KPI tiles: progress ring, tasks, active agents, tokens, elapsed time.
- Tree view, the only view: chief, then agent types, then a task card per task with elapsed time, actions and last action. Finished work leaves the view `dashboard.retire_seconds` after it ends (default 10 s, set on the Settings page); running work stays.
- Waves panel with a progress bar per wave.
- Swimlane timeline per agent, zoom 1h / 6h / All. Each task shows its start and end time.
- Click an agent or a task for a drawer with its brief, report, model and tokens.
- Yellow accent on a dark blue base.
- Mission summaries (opt-in: `dashboard.summaries` on the Settings page, or `--summaries`): one short French sentence per brief, written by `claude -p --model haiku`. Results are cached in `~/.claude/noctia/summaries.json`. Each brief without a cached summary costs one small Haiku call.
- Drawn with D3 v7.9.0, bundled in `dashboard/static/d3.min.js` (ISC license in `dashboard/static/D3-LICENSE.txt`). No CDN, no build step.
- Needs python3 3.10 or newer. No dependency to install.
- The source is the Claude Code session transcripts of the project. The transcript format is undocumented and may change.
- Listens on 127.0.0.1 only. Transcripts may hold secrets, so do not expose the port.
- Behind a reverse proxy, `--allow-host NAME` (repeatable, or `NOCTIA_DASHBOARD_ALLOW_HOSTS`, comma-separated) accepts that hostname. Only HTTPS origins are accepted for such names.
- Transcripts are read-only. The [Agents page](#agents-page) is the only part that writes. Stop the server with Ctrl-C, or TaskStop on its background task.

## Usage limits

The status line shows your plan usage: `5h NN% ↻HH:MM · wk NN% ↻Day`, for the five-hour and weekly windows with their reset times. It reads the `rate_limits` fields (`five_hour`, `seven_day`) of the status line JSON that Claude Code documents. Only Pro, Max and Ultra plans send them, and only after the first response. The colour turns yellow at 70% and red at 90%.

- The status line writes a snapshot to `~/.claude/noctia/usage.json` (file mode 0600). Override the path with `NOCTIA_USAGE_FILE`.
- The dashboard reads it at `/api/usage` and shows two ring tiles with a reset countdown. It shows "stale" after 30 minutes.
- The Noctia banner reads the same file.
- No credentials or undocumented endpoints are used.

## Local AI

The `noctia-localai` MCP server lets the chief call self-hosted models with `list_local` and `ask_local`. It reads `~/.config/noctia/localai.json`, or the file named by `NOCTIA_LOCALAI_CONFIG`. Example with a vLLM server, an Ollama server and a `command` backend (any local script):

```json
{
  "backends": {
    "vllm": {
      "type": "openai",
      "base_url": "http://127.0.0.1:8000/v1",
      "model": "your-vllm-model",
      "api_key_env": "VLLM_API_KEY",
      "timeout": 60
    },
    "ollama": {
      "type": "openai",
      "base_url": "http://127.0.0.1:11434/v1",
      "model": "llama3.1"
    },
    "myscript": {
      "type": "command",
      "argv": ["/usr/bin/python3", "-I", "/home/you/bin/my_model.py"],
      "timeout": 90
    }
  }
}
```

- Backend names: `a-z`, `0-9`, `_` or `-`, up to 32 characters.
- Keys are never written in the file. `api_key_env` is the name of an environment variable that holds the key. An `api_key` field is rejected.
- `timeout` is in seconds, from 1 to 600. Default 60.
- `command` contract: Noctia runs `argv` without a shell. It writes `{"prompt", "system", "max_tokens"}` as JSON on stdin, and the script must print `{"text": "..."}` on stdout and exit with 0.
- The file is read on each call, so edits apply without a restart.
- The answers are unverified. The chief checks them before using them.

### Managed from Settings

The dashboard Settings page (`/settings`) lists the backends. You can add, test or remove one, and the page writes the same `localai.json` file, with the same rules (keys are still read from the environment only).

### Which agents can call it

`chief`, `developer`, `reader` and `documenter` have the tools `mcp__noctia-localai__list_local` and `mcp__noctia-localai__ask_local`. The per-agent switch on the Settings page adds or removes these two tools in `agents/<name>.md`. Restart Claude Code to apply it, and a plugin update overwrites the change. Use the tools only for cheap, simple or private sub-tasks, and check the output.

## Agents page

With the dashboard running, open http://127.0.0.1:7777/agents. It lists the agents from `agents/*.md` with their model, tools and an enabled switch.

- Model: `haiku`, `sonnet`, `opus`, `fable` or `inherit`. The change rewrites the `model:` line of `agents/<name>.md`. Restart Claude Code to apply it. A plugin update overwrites the change. `fable` is a choice only: no agent uses it by default.
- Enabled: stored in `~/.claude/noctia/agents.json`, outside the project. A disabled agent is listed at session start, and the chief does not delegate to it. This is a soft rule, not a hard block.
- The `chief` cannot be disabled.

## Mentor mode

`/noctia:help-me-build-it <project, feature or bug>` turns Claude into a mentor. It does not write the solution: it asks questions, helps you split the work into small steps, reviews what you wrote, and guides your debugging with hints of growing strength. It only gives very specific commands, signatures or syntax reminders. You do the thinking and the typing.

## Git modes

Git write commands are locked by default. You unlock them per project:

- `/noctia:git locked`: default, nothing allowed.
- `/noctia:git ask`: allowed, but you approve every command in a prompt.
- `/noctia:git auto`: allowed without a prompt, for full-auto projects. Claude still asks before pushing.
- `/noctia:git status`: show the current mode.

The mode is stored in `.noctia/git-mode` inside the project, which is git-ignored automatically.

### Co-authors

Once git is unlocked (`ask` or `auto`), Noctia asks once per project whether you want Claude and Noctia credited as co-authors. If you say yes, every commit Claude makes ends with:

```
Co-Authored-By: Noctia <noctia@etienne-pouille.work>
Co-Authored-By: Claude <noreply@anthropic.com>
```

Both then appear as co-authors on the commit on GitHub. If you say no, no credit is added. Your answer is remembered in `.noctia/coauthor`, and you can change it by running `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-coauthor.sh" yes` (or `no`). The credit is only attribution: it does not give anyone rights over your code, your `LICENSE` does.

The git guard enforces the answer on each commit: `yes` requires the `Co-Authored-By` trailer, `no` refuses it, and a missing answer blocks the commit until the user is asked. `.noctia/coauthor` is protected like the mode file, so Claude cannot change it.

## Limits to know

- The hooks are guardrails, not a security sandbox. They match commands by pattern, so an unusual command shape (a script that runs git internally, for example) can slip through.
- `gh` commands (for example `gh pr create`) are not covered by the git guard.
- The co-author trailer is applied by the `git-workflow` skill, so it depends on Claude following it.
- Hook scripts need `bash`. On Windows, use Git Bash or WSL.
- In bypass-permissions mode, hooks cannot prompt: in `ask` mode Noctia denies instead.

## License

License: MIT
