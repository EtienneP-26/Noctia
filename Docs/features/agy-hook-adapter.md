# Antigravity CLI (agy) hook adapter

Runs the Noctia hook scripts, written for Claude Code, as hooks of the Google Antigravity CLI (agy). It also hardens the git lock so the model cannot change the git mode.

Files:
- `hooks/scripts/agy-hook.sh`: the adapter. Usage: `agy-hook.sh <script-name-without-.sh> [event]`.
- `hooks/scripts/guard-git.sh`: denies the model changing the git mode, that is, running the mode-setting script with a mode or writing to the git mode file (in the `.noctia` folder).
- `hooks/scripts/git-mode-from-prompt.sh`: `UserPromptSubmit` hook. Only the exact user prompt `/noctia:git locked|ask|auto` changes the mode.
- `hooks/hooks.json`, `skills/git/SKILL.md`.
- Tests: `hooks/tests/agy-hook.test.sh`, `guard-git.test.sh`, `guard-secrets.test.sh`, `git-mode-from-prompt.test.sh`.

How it works:
- The adapter reads agy hook JSON on stdin and converts it to the Claude Code shape (`run_command` becomes `Bash`, file write and replace tools become `Write` or `Edit`).
- It runs the existing script unchanged, then maps the answer back: deny becomes `{"decision":"deny"}`, ask becomes `force_ask`, and SessionStart context becomes `injectSteps`.
- It fails closed. Unreadable input, an unknown script name or a missing `jq` denies a PreToolUse call.

Use:
- Run the tests with `for t in hooks/tests/*.test.sh; do bash "$t"; done`. The last run reported 48 ok.
- In agy, the user changes the git mode from their own terminal by running the mode-setting script in the plugin's `hooks/scripts` folder with `locked`, `ask` or `auto`.

Limits:
- `filter-test-output.sh` cannot rewrite commands in agy, so test output is not filtered there.
- agy has no prompt hook, so `/noctia:git` does not change the mode there. Use the terminal command above.
- The mode-file checks are best-effort. Obfuscated commands may get past them.
