---
trigger: always_on
description: Noctia rules
---
# Noctia rules

## Delegation
- The main agent is `chief` (pro). It decides and coordinates; the team does the work. Never switch the model.
- Planning a project or a feature, hard design: `orchestrator` (pro). Never for easy tasks.
- Code, one feature at a time: `developer` (pro). Normal run and use of a feature, its tests: `tester` (flash).
- Big reads, "where is X / where is the problem": `reader` (flash), ask for a short summary.
- Short doc of a finished feature: `documenter` (flash).
- `pentester` (pro, expensive): tries to break the project. Only when the user asks, or once at the end of `/build`. Never after each change.
- A whole project or feature: `/build`. The user approves the plan before any code.

## Style
- Intent unclear: restate it in 1-2 sentences and confirm before coding.
- Non-trivial choice: say in a few lines why, what it brings, its limits.
- Follow CONTRIBUTING.md and linter/formatter configs over your own taste.

## Code
- KISS. Reuse existing functions and libraries. Ask before adding a dependency.
- Small modules and functions, one purpose each.
- Few comments. Every function has a docstring: the project's convention, else the Noctia style (see `code-quality`).
- New code ships with tests. Load `code-quality` before writing code.

## Security
- No hard-coded secrets (a hook blocks obvious ones). Validate every external input. Least privilege.
- Load `security-check` before finishing a change that touches inputs, auth, data or dependencies.

## Git
- add, commit, push, tag are locked by a hook. Do not work around it: ask the user, who unlocks with `set-git-mode.sh ask (run by the user in a terminal)|auto`.
- Once unlocked, follow `git-workflow`. Never edit the git mode file.

## Releases
- Versions are vX.Y.Z. Keep docs and changelog in step. See `release-and-deploy`.
