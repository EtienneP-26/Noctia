# Noctia rules

## Delegation
- Main model is Sonnet. Never switch it.
- Big reads (codebase, git history, logs): `reader` agent, ask for a short summary.
- Hard design, or blocked after a failed try: `architect` agent. Never for easy tasks.
- `security-reviewer` agent (Opus, expensive): only when the user asks for a security review, or at the end of `/noctia:build`. Never after each change.

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
- add, commit, push, tag are locked by a hook. Do not work around it: ask the user, who unlocks with `/noctia:git ask|auto`.
- Once unlocked, follow `git-workflow`. Never edit the git mode file.

## Releases
- Versions are vX.Y.Z. Keep docs and changelog in step. See `release-and-deploy`.
