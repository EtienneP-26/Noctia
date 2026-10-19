#!/usr/bin/env bash
# PreToolUse hook (Bash): trim the output of a bare test command so long logs stay out of the context.
# Rewrites only a single test command with no shell operators, keeps its exit code, saves the full log to a file.
# Needs bash and jq. Without jq it does nothing.
set -u

# Test runners recognised at the start of the command.
TEST_COMMAND='^[[:space:]]*(npm (run )?test|pnpm (run )?test|yarn test|bun test|npx (jest|vitest)|jest|vitest|pytest|python3? -m pytest|go test|cargo test|dotnet test|mvn test|gradle test|phpunit|rspec)([[:space:]]|$)'
# Anything that could chain another command or redirect output.
SHELL_OPERATORS='[|;&<>`$()]'

# is_bare_test_command COMMAND: succeed for one test command with no shell operators and no newline.
is_bare_test_command() {
  [[ $1 =~ $TEST_COMMAND ]] || return 1
  [[ $1 =~ $SHELL_OPERATORS ]] && return 1
  [[ $1 == *$'\n'* ]] && return 1
  return 0
}

# trimmed_command COMMAND: print COMMAND wrapped so only the end of its output is shown and its exit code is kept.
trimmed_command() {
  printf '%s' "log=\$(mktemp \"\${TMPDIR:-/tmp}/noctia-test.XXXXXX\"); $1 >\"\$log\" 2>&1; rc=\$?; \
if [ \$rc -eq 0 ]; then tail -n 15 \"\$log\"; else tail -n 100 \"\$log\"; fi; \
echo \"[Noctia: output trimmed, full log: \$log]\"; (exit \$rc)"
}

# emit_rewrite INPUT COMMAND: print the hook decision that replaces the Bash command and approves it.
emit_rewrite() {
  jq -n --argjson input "$1" --arg command "$2" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "Noctia: test output trimmed to save tokens.",
      updatedInput: ($input.tool_input + {command: $command})
    }
  }'
}

main() {
  command -v jq >/dev/null 2>&1 || exit 0
  local input command
  input=$(cat)
  [ "$(jq -r '.tool_name // empty' <<<"$input")" = "Bash" ] || exit 0
  command=$(jq -r '.tool_input.command // empty' <<<"$input")
  is_bare_test_command "$command" || exit 0
  emit_rewrite "$input" "$(trimmed_command "$command")"
}

main
