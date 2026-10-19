---
name: agent-teams
description: Turn Claude Code agent teams on or off for this project, or show their state. User-only command.
disable-model-invocation: true
argument-hint: on | off | status
---

The user ran `/noctia:agent-teams $ARGUMENTS`.

If the argument is not exactly `on`, `off` or `status` (no argument counts as `status`), do not run anything: say which three values are accepted.

Otherwise run this from the project root, then report the result in two or three lines, in the user's language:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-team-mode.sh" $ARGUMENTS
```

What the modes do:
- `off` (default): subagents you name stay ordinary subagents. They report back to you and nothing else.
- `on`: Claude Code agent teams are enabled. A subagent you name starts as a teammate: its own session and context, reachable by name with `SendMessage`, with a shared task list. Experimental, and it costs more tokens.

The switch is the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` variable, written to `.claude/settings.local.json` (personal, kept out of git). Choose the models with `/noctia:models`.

If the script fails because `jq` is missing, pass on its message as it is: the user has to add the line by hand.
