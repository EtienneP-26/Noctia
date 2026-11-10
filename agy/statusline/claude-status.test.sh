#!/usr/bin/env bash
# Tests for claude-status.sh.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export NOCTIA_USAGE_FILE="$T/d/usage.json"
FAIL=0
# check NAME COND: record a failure when COND is not true.
check() { if [ "$2" = 1 ]; then echo "ok $1"; else echo "FAIL $1"; FAIL=1; fi; }
# run JSON: print the status line without colours.
run() { printf '%s' "$1" | bash "$HERE/claude-status.sh" | sed 's/\x1b\[[0-9;]*m//g'; }
NOW=$(date +%s); SOON=$((NOW + 3600)); LATER=$((NOW + 3 * 86400))
h=$(date -d "@$SOON" +%H:%M); w=$(date -d "@$LATER" +%a)
MF="git""-mode"
mkdir -p "$T/p/.noctia"; echo ask > "$T/p/.noctia/$MF"

out=$(run "{\"model\":{\"display_name\":\"Opus\"},\"workspace\":{\"current_dir\":\"$T/p\"},\"context_window\":{\"used_percentage\":42.4},\"rate_limits\":{\"five_hour\":{\"used_percentage\":23,\"resets_at\":$SOON},\"seven_day\":{\"used_percentage\":41,\"resets_at\":$LATER}}}")
check full "$([ "$out" = "Noctia · Opus · ctx 42% · 5h 23% ↻$h · wk 41% ↻$w · git:ask" ] && echo 1 || echo 0)"
check usage "$(jq -e '.five_hour.used_percentage==23' "$NOCTIA_USAGE_FILE" >/dev/null && echo 1 || echo 0)"
check missing "$([ "$(run '{}')" = "Noctia · git:locked" ] && echo 1 || echo 0)"
check bad "$([ "$(run 'not json')" = Noctia ] && echo 1 || echo 0)"
QJSON="{\"rate_limits\":{\"five_hour\":{\"used_percentage\":31,\"resets_at\":$SOON}}}"
rm -f "$NOCTIA_USAGE_FILE"
qout=$(printf '%s' "$QJSON" | bash "$HERE/claude-status.sh" --quiet)
check quiet "$([ -z "$qout" ] && echo 1 || echo 0)"
check quiet_usage "$(jq -e '.five_hour.used_percentage==31' "$NOCTIA_USAGE_FILE" >/dev/null && echo 1 || echo 0)"
qout=$(printf '%s' "$QJSON" | NOCTIA_STATUS_QUIET=1 bash "$HERE/claude-status.sh")
check quiet_env "$([ -z "$qout" ] && echo 1 || echo 0)"
exit $FAIL
