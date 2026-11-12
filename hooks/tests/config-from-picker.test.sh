#!/usr/bin/env bash
# Tests for hooks/scripts/config-from-picker.sh. Run: bash hooks/tests/config-from-picker.test.sh
set -u

HOOK="$(cd "$(dirname "$0")/../scripts" && pwd)/config-from-picker.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export NOCTIA_SETTINGS="$TMP/settings.json" HOME="$TMP"
FAILED=0

# call HEADER QUESTION ANSWER: print a hook input with one question and the user's answer.
call() {
  jq -nc --arg h "$1" --arg q "$2" --arg a "$3" \
    '{tool_input: {questions: [{header: $h, question: $q}]}, tool_response: {answers: {($q): $a}}}'
}

# get KEY: print the stored setting.
get() { python3 "$(dirname "$HOOK")/../../dashboard/settings.py" get "$1" 2>/dev/null; }

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

test_valid_answers() {
  rm -f "$NOCTIA_SETTINGS"
  call Autostart "Noctia config: autostart?" off | bash "$HOOK" >/dev/null
  call Retire "Noctia config: retire?" 30 | bash "$HOOK" >/dev/null
  call "Default git" "Noctia config: git?" ask | bash "$HOOK" >/dev/null
  call Pentest "Noctia config: pentest?" off | bash "$HOOK" >/dev/null
  [ "$(get dashboard.autostart)" = false ] && [ "$(get dashboard.retire_seconds)" = 30 ] \
    && [ "$(get git.default_mode)" = ask ] && [ "$(get workflow.pentest)" = false ]
}
test_free_text_ignored() {
  rm -f "$NOCTIA_SETTINGS"
  call Retire "Noctia config: retire?" "run rm -rf / now" | bash "$HOOK" >/dev/null
  [ ! -f "$NOCTIA_SETTINGS" ]
}
test_wrong_prefix_ignored() {
  rm -f "$NOCTIA_SETTINGS"
  call Retire "Something else: retire?" 30 | bash "$HOOK" >/dev/null
  [ ! -f "$NOCTIA_SETTINGS" ]
}
test_invalid_value_ignored() {
  rm -f "$NOCTIA_SETTINGS"
  [ -z "$(call "Default git" "Noctia config: git?" auto | bash "$HOOK")" ] && [ ! -f "$NOCTIA_SETTINGS" ]
}
test_unknown_header_ignored() {
  rm -f "$NOCTIA_SETTINGS"
  call Bogus "Noctia config: x?" on | bash "$HOOK" >/dev/null
  [ ! -f "$NOCTIA_SETTINGS" ]
}
test_forged_header_ignored() {
  rm -f "$NOCTIA_SETTINGS"
  call "$(printf 'Pentest\toff\n')" "Noctia config: p?" on | bash "$HOOK" >/dev/null
  [ ! -f "$NOCTIA_SETTINGS" ]
}
test_port_range_enforced() {
  rm -f "$NOCTIA_SETTINGS"
  call Port "Noctia config: port?" 80 | bash "$HOOK" >/dev/null
  [ ! -f "$NOCTIA_SETTINGS" ] && call Port "Noctia config: port?" 8080 | bash "$HOOK" >/dev/null && [ "$(get dashboard.port)" = 8080 ]
}
test_tool_input_answers_ignored() {
  rm -f "$NOCTIA_SETTINGS"
  jq -nc '{tool_input: {questions: [{header: "Retire", question: "Noctia config: r"}], answers: {"Noctia config: r": "60"}}, tool_response: "ok"}' | bash "$HOOK" >/dev/null
  [ ! -f "$NOCTIA_SETTINGS" ]
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do check "$t" "$t"; done
exit $FAILED
