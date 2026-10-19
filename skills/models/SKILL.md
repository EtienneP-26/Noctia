---
name: models
description: Choose the model of the lead session and of each Noctia agent (reader, architect, security-reviewer, developer, tester). User-only command.
disable-model-invocation: true
argument-hint: show | reset | lead=opus developer=haiku ...
---

The user ran `/noctia:models $ARGUMENTS`.

Each argument is `role=model`. Roles: `lead` (the main session), `reader`, `architect`, `security-reviewer`, `developer`, `tester`. Models: `opus`, `sonnet`, `haiku`, `fable`, `default` (drop the choice and use the agent's own model). `show` lists the current choices and `reset` drops them all. No argument counts as `show`.

If an argument has another shape, do not run anything: explain the syntax.

Otherwise run this from the project root:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-models.sh" $ARGUMENTS
```

Then, in the user's language:

1. Show the table the script printed.
2. With no argument, or `show`, ask which role they want to change and give an example such as `/noctia:models lead=opus developer=haiku`.
3. For every choice just made, apply it yourself from now on in this session: pass `model: <choice>` on each Agent call for that role, and name the model in the spawn prompt when it starts as a teammate. These choices win over the models named in the Noctia rules. A `default` means the agent's own model again.
4. If `lead` changed, tell the user it applies from the next session and that `/model <choice>` changes the current one. Do not switch your own model.

Where the choices live:
- Agents: `.noctia/models` in the project (git-ignored). The session-start hook gives them to Claude, and the `noctia-mods` plugin enforces them when an agent starts, from Claude Code 2.1.287.
- Lead: the `model` setting of `.claude/settings.local.json`.

If the script fails because `jq` is missing, pass on its message as it is: the user has to add the line by hand.
