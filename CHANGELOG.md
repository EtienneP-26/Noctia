# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
- Local AI: Laya adapter (`localai/adapters/laya_route.py`) as a `command` backend, and chief routing advice (agent and model choice, advisory, ignored below 0.6 confidence).
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
