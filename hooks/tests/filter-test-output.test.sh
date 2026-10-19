#!/usr/bin/env bash
# Tests for hooks/scripts/filter-test-output.sh. Run: bash hooks/tests/filter-test-output.test.sh
set -u

HOOK="$(cd "$(dirname "$0")/../scripts" && pwd)/filter-test-output.sh"
FAILED=0

# hook_output TOOL COMMAND: run the hook on a fake tool call and print its stdout.
hook_output() {
  jq -n --arg tool "$1" --arg command "$2" '{tool_name: $tool, tool_input: {command: $command, timeout: 5000}}' | bash "$HOOK"
}

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

is_rewritten() { [ "$(jq -r '.hookSpecificOutput.permissionDecision' <<<"$1")" = "allow" ]; }
is_untouched() { [ -z "$1" ]; }

test_rewrites_a_bare_test_command() {
  is_rewritten "$(hook_output Bash "pytest -q tests/")"
}

test_keeps_the_other_tool_input_fields() {
  [ "$(hook_output Bash "npm test" | jq -r '.hookSpecificOutput.updatedInput.timeout')" = "5000" ]
}

test_ignores_commands_that_are_not_tests() {
  is_untouched "$(hook_output Bash "ls -la")"
}

test_ignores_other_tools() {
  is_untouched "$(hook_output Write "pytest")"
}

test_ignores_chained_commands() {
  is_untouched "$(hook_output Bash "pytest && rm -rf build")" &&
  is_untouched "$(hook_output Bash "pytest; echo done")" &&
  is_untouched "$(hook_output Bash "pytest | head")" &&
  is_untouched "$(hook_output Bash 'pytest $(whoami)')" &&
  is_untouched "$(hook_output Bash $'pytest\nrm -rf build')"
}

test_ignores_commands_that_only_look_like_a_runner() {
  is_untouched "$(hook_output Bash "pytestfoo")" &&
  is_untouched "$(hook_output Bash "echo pytest")"
}

# run_rewritten SCRIPT_BODY: run a fake `pytest` with the given body through the rewritten command.
run_rewritten() {
  local dir rewritten
  dir=$(mktemp -d)
  printf '#!/usr/bin/env bash\n%s\n' "$1" > "$dir/pytest"
  chmod +x "$dir/pytest"
  rewritten=$(hook_output Bash "pytest" | jq -r '.hookSpecificOutput.updatedInput.command')
  PATH="$dir:$PATH" bash -c "$rewritten"
  local rc=$?
  rm -rf "$dir"
  return $rc
}

test_failing_run_keeps_exit_code_and_trims_output() {
  local out rc
  out=$(run_rewritten 'seq 1 300; exit 3'); rc=$?
  [ "$rc" -eq 3 ] && [ "$(wc -l <<<"$out")" -le 102 ] && grep -q "full log:" <<<"$out" && grep -q '^300$' <<<"$out"
}

test_passing_run_shows_only_the_summary() {
  local out rc
  out=$(run_rewritten 'seq 1 300; exit 0'); rc=$?
  [ "$rc" -eq 0 ] && [ "$(wc -l <<<"$out")" -le 17 ] && grep -q '^300$' <<<"$out"
}

command -v jq >/dev/null || { echo "jq is required to run these tests"; exit 1; }

check "rewrites a bare test command" test_rewrites_a_bare_test_command
check "keeps the other tool input fields" test_keeps_the_other_tool_input_fields
check "ignores commands that are not tests" test_ignores_commands_that_are_not_tests
check "ignores other tools" test_ignores_other_tools
check "ignores chained commands" test_ignores_chained_commands
check "ignores lookalike commands" test_ignores_commands_that_only_look_like_a_runner
check "failing run keeps exit code and trims output" test_failing_run_keeps_exit_code_and_trims_output
check "passing run shows only the summary" test_passing_run_shows_only_the_summary

exit $FAILED
