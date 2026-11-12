# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.7.1] - 2026-11-12

### Added
- Settings: `~/.claude/noctia/settings.json` with a dashboard Settings page (`/settings`) and the `/noctia:config` command. Keys: `dashboard.autostart`, `dashboard.port`, `dashboard.summaries`, `dashboard.retire_seconds`, `workflow.*` and `git.default_mode` / `git.default_coauthor`.
- Local AI: backends added, tested and removed from the Settings page, and a per-agent access switch.
- Dashboard: optional Haiku mission summaries (`dashboard.summaries`), one short sentence per brief, cached.
- Dashboard: start and end time of each task in the timeline.
- Agents: `fable` is selectable as an agent model (no agent uses it by default).

### Changed
- Dashboard: yellow and blue terminal theme.
- Dashboard: Tree is the only view. Finished work leaves after `dashboard.retire_seconds` (default 10 s) instead of 10 minutes.
- Git default mode in settings accepts `locked` or `ask` only. `auto` stays per project via `/noctia:git`.

### Removed
- Laya adapter (`localai/adapters/laya_route.py`).
- Radial view of the dashboard and its graph script.

### Fixed
- Dashboard: usage tiles no longer vanish on reset.
- Dashboard: the summary route no longer hangs the CPU.
- Dashboard: the hidden SVG left by the radial view is removed.

## [0.7.0] - 2026-11-11

### Added
- Usage limits (5h and week windows) in the status line, the dashboard and the Noctia banner.
- `designer` agent (UI and visual design review and fixes) and `legal` agent (production compliance check, reports only). Wired in the chief, the build skill, the README and the rules.
- Noctia graph: panel colors for the designer and legal agents.
- Dashboard: `dashboard/` server with transcript parser and static UI, and the `/noctia:dashboard` skill.
- Noctia graph: completion percent overall and per wave.
- Local AI: `noctia-localai` MCP server (`list_local`, `ask_local`) with `openai` and `command` backends from `~/.config/noctia/localai.json`.
- Dashboard: Agents page (`/agents`) to change an agent's model and enable or disable it.
- Disabled agents are listed at session start; the chief does not delegate to them.
- Dashboard: `--allow-host NAME` (repeatable, or `NOCTIA_DASHBOARD_ALLOW_HOSTS`) to accept a reverse-proxy hostname, HTTPS origins only.
- Local AI: `developer`, `reader` and `documenter` can call `list_local` and `ask_local`.
- Dashboard: Tree view of the session (chief, agent types, task cards with elapsed time, actions and last action), with a Tree/Radial toggle. Finished work retires after 10 minutes.

### Changed
- Dashboard redesigned with D3 as a control room view: KPI tiles, agent graph, waves panel, swimlane timeline and a detail drawer. D3 v7.9.0 is bundled, no CDN.

### Fixed
- Dashboard and local AI pentest findings: redirects are refused for API keys, credentials in `base_url` are rejected, file mode is kept, the process group is killed on timeout, parsing is more robust, and the SSE stream has a cap and a race fix.
- Git guard: false positives no longer make `/noctia:git` fail intermittently, bypasses of the mode and co-author files are closed, and the co-author answer is enforced on commit.

## [0.6.3] - 2026-11-05

### Fixed
- Git guard: `git add`, `git diff` or a commit naming the git mode scripts is no longer blocked. Writing the mode file or running the mode script with a mode is still denied.

## [0.6.2] - 2026-11-05

### Changed
- Git: each change to `ask` or `auto` resets the co-author answer, and Noctia asks again with its co-author lines. `locked` keeps it.

## [0.6.1] - 2026-11-05

### Fixed
- Noctia graph: wide and hidden characters, bad counts and cycles no longer break the pane.
- Task briefs: no test files in the template, no repo-wide commands in parallel waves.

## [0.6.0] - 2026-11-04

### Added
- Noctia graph: a side pane showing the live agents as a node graph. It opens on the first agent launch or with `/graph`.
- Build waves: `/noctia:build` runs up to 3 developers in parallel, each on separate files, with `W<wave>·T<task>` briefs.

### Changed
- Strict KISS rules in `rules/core.md`.

## [0.5.0]

Earlier releases: see git tags.
