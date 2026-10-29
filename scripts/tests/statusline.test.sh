#!/usr/bin/env bash
# Tests for statusline/noctia-status.sh. Run: bash scripts/tests/statusline.test.sh
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SL="$ROOT/statusline/noctia-status.sh"
FX="$ROOT/scripts/tests/fixtures"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FAILED=0

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

# plain FILE: run the script on FILE and strip colour codes.
plain() { bash "$SL" < "$1" | sed -E $'s/\033\\[[0-9;]*m//g'; }

test_normal() { [ "$(plain "$FX/normal.json")" = "☾ Noctia | Gemini Pro (high) | ctx 42% | \$0.50 | git:locked | agents:2 | tasks:3" ]; }
test_high_context_red() { bash "$SL" < "$FX/high-context.json" | grep -q '38;2;252;165;165mctx 91%'; }
test_estimated_cost() { plain "$FX/estimated-cost.json" | grep -qF '~$2.00'; }
test_missing_fields() { [ "$(plain "$FX/missing.json")" = "☾ Noctia | git:locked" ]; }
test_garbage() { [ "$(bash "$SL" < "$FX/garbage.txt")" = Noctia ] && [ "$(bash "$SL" < /dev/null)" = Noctia ]; }
test_esc_in_model() { ! bash "$SL" < "$FX/escape-model.json" | sed -E $'s/\033\\[[0-9;]*m//g' | grep -q $'\033'; }

test_esc_in_git_mode() {
  mkdir -p "$TMP/p/.noctia"
  printf 'auto\033[31m\033]0;x\007' > "$TMP/p/.noctia/git""-mode"
  ! echo "{\"cwd\":\"$TMP/p\"}" | bash "$SL" | sed -E $'s/\033\\[[0-9;]*m//g' | grep -q $'\033' \
    && echo "{\"cwd\":\"$TMP/p\"}" | bash "$SL" | grep -q 'git:auto'
}

test_truncates() { [ "$(echo '{"model":{"display_name":"Gemini Pro"},"terminal_width":25}' | bash "$SL" | sed -E $'s/\033\\[[0-9;]*m//g')" = "☾ Noctia | Gemini Pro" ]; }
test_no_jq() { [ "$(PATH=/nonexistent /bin/bash "$SL" < "$FX/normal.json")" = Noctia ]; }

for t in $(declare -F | awk '$3 ~ /^test_/ {print $3}'); do check "$t" "$t"; done
exit $FAILED
