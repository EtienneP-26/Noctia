#!/usr/bin/env bash
# Tests for hooks/scripts/noctia-settings.sh. Run: bash hooks/tests/noctia-settings.test.sh
set -u

SCRIPT="$(cd "$(dirname "$0")/../scripts" && pwd)/noctia-settings.sh"
TMP_DIR=$(mktemp -d)
FAILED=0
trap 'rm -rf "$TMP_DIR"' EXIT
export NOCTIA_SETTINGS="$TMP_DIR/settings.json"
source "$SCRIPT"

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

# write_settings JSON: replace the temp settings file with the given text.
write_settings() { printf '%s' "$1" > "$NOCTIA_SETTINGS"; }

# expect NAME VALUE: succeed if the helper prints VALUE for setting NAME.
expect() { [ "$(noctia_setting "$1")" = "$2" ]; }

test_missing_file() {
  rm -f "$NOCTIA_SETTINGS"
  expect dashboard.port 7777 && expect git.default_mode locked && expect workflow.docs true
}

test_malformed_json() {
  write_settings '{"dashboard": {"port": '
  expect dashboard.port 7777 && expect dashboard.autostart false
}

test_valid_overrides() {
  write_settings '{"dashboard":{"autostart":true,"port":8080,"summaries":true,"retire_seconds":0},"workflow":{"pentest":false},"git":{"default_mode":"ask","default_coauthor":"no"}}'
  expect dashboard.autostart true && expect dashboard.port 8080 \
    && expect dashboard.summaries true && expect dashboard.retire_seconds 0 \
    && expect workflow.pentest false && expect git.default_mode ask \
    && expect git.default_coauthor no
}

test_wrong_types() {
  write_settings '{"dashboard":{"autostart":"yes","port":"8080","retire_seconds":true},"workflow":{"docs":0},"git":{"default_coauthor":true}}'
  expect dashboard.autostart false && expect dashboard.port 7777 \
    && expect dashboard.retire_seconds 10 && expect workflow.docs true \
    && expect git.default_coauthor ask
}

test_port_out_of_range() {
  write_settings '{"dashboard":{"port":80}}'
  expect dashboard.port 7777 || return 1
  write_settings '{"dashboard":{"port":70000}}'
  expect dashboard.port 7777 || return 1
  write_settings '{"dashboard":{"port":1024}}'
  expect dashboard.port 1024
}

test_bad_choice() {
  write_settings '{"git":{"default_mode":"auto","default_coauthor":"maybe"}}'
  expect git.default_mode locked && expect git.default_coauthor ask
}

test_unknown_key() {
  local out
  write_settings '{"dashboard":{"port":8080}}'
  out=$(noctia_setting dashboard.nope) && return 1
  [ -z "$out" ]
}

test_no_jq() {
  write_settings '{"dashboard":{"port":8080}}'
  [ "$(PATH=/nonexistent noctia_setting dashboard.port)" = 7777 ]
}

check "missing file uses defaults" test_missing_file
check "malformed json uses defaults" test_malformed_json
check "valid overrides are read" test_valid_overrides
check "wrong types use defaults" test_wrong_types
check "out-of-range port uses default" test_port_out_of_range
check "bad choices use defaults" test_bad_choice
check "unknown key prints nothing and fails" test_unknown_key
check "missing jq uses defaults" test_no_jq
exit "$FAILED"
