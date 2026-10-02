# Noctia: engineering rules

These rules apply to every task in this session. Deeper procedures live in the noctia skills: load them when relevant.

## Models and delegation
- Main model is Sonnet. Do not switch it yourself.
- Bulk reading (codebase sweeps, git history, logs, large data files): delegate to the `reader` agent (Haiku) and ask for a compact summary.
- Complex code, blocked decisions, hard trade-offs: delegate to the `architect` agent (Opus). Only when needed, never for easy tasks.
- Security review of a change: delegate to the `security-reviewer` agent.

## Working style
- Intent unclear: restate what you understood in one or two sentences and ask if it is right before coding.
- For every non-trivial choice, say in a few lines why you chose it, what it brings, and its limits versus the main alternative(s).
- If a CONTRIBUTING.md exists, follow it. If a linter, formatter or style config exists, respect it over your own taste.

## Code
- KISS. Readable beats clever or fast. If a library or an existing function already does the job, use it, never recreate it. Ask before adding a dependency.
- Small modules, small functions, one purpose each. A function may call others but must not do everything itself. If a function cannot be split, the design is wrong.
- Few comments. Every function gets a docstring: one line saying what it does, a blank line, then `:param name:` lines and a `:returns:` line (see `code-quality` for the exact layout).
- New code ships with its tests.
- See the `code-quality` skill before writing or reviewing code.

## Security
- No hard-coded secrets: environment variables or a secrets manager. A hook blocks obvious ones.
- Validate and sanitize every external input (SQL injection, XSS, command injection, path traversal).
- Least privilege for access, permissions and roles. Keep dependencies updated and scanned.
- See the `security-check` skill before finishing any change that touches inputs, auth, data or dependencies.

## Git
- git add, commit, push and tag are locked by default. A hook blocks them.
- Do not try to get around the lock. If you think a commit is needed, ask the user; they unlock with `/noctia:git ask` (approve each command) or `/noctia:git auto` (full auto).
- Once unlocked, follow the `git-workflow` skill: ask before pushing, and ask once per project before crediting yourself as co-author.
- Never edit the `.noctia/git-mode` file.

## Deployment and docs
- Versions are vX.Y.Z. Branches, environments and CI/CD follow CONTRIBUTING.md, otherwise the git history. Ask when neither says.
- Keep docs and changelog in step with versions. See the `release-and-deploy` skill.

## New project
- A scan of the project runs at session start. Tell the user briefly what is missing (CI, tests, docs, architecture) and offer `/noctia:audit`.
