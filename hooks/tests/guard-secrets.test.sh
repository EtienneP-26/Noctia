#!/usr/bin/env bash
# Tests for hooks/scripts/guard-secrets.sh. Run: bash hooks/tests/guard-secrets.test.sh
set -u

HOOK="$(cd "$(dirname "$0")/../scripts" && pwd)/guard-secrets.sh"
FAILED=0

# decision PATH CONTENT: print the permission decision for a Write call (empty when none).
decision() {
  jq -n --arg p "$1" --arg c "$2" '{tool_name: "Write", tool_input: {file_path: $p, content: $c}}' |
    bash "$HOOK" | jq -r '.hookSpecificOutput.permissionDecision // empty'
}

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

test_aws_key_denied() { [ "$(decision a.py 'key = "AKIAABCDEFGHIJKLMNOP"')" = deny ]; }
test_private_key_denied() { [ "$(decision k.pem '-----BEGIN RSA PRIVATE KEY-----')" = deny ]; }
test_github_token_denied() { [ "$(decision a.sh "t=ghp_$(printf 'a%.0s' {1..36})")" = deny ]; }
test_generic_literal_asks() { [ "$(decision a.py 'password = "hunter2hunter2"')" = ask ]; }
test_env_reference_allowed() { [ -z "$(decision a.py 'password = os.environ["PW"]')" ]; }
test_example_env_file_allowed() { [ -z "$(decision .env.example 'KEY=AKIAABCDEFGHIJKLMNOP')" ]; }
test_plain_code_allowed() { [ -z "$(decision a.py 'print("hello")')" ]; }

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do check "$t" "$t"; done
exit "$FAILED"
