#!/usr/bin/env bash
# Tests for noctia-status.sh usage segment and snapshot.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export NOCTIA_USAGE_FILE="$T/d/usage.json"
FAIL=0
# check NAME COND: record a failure when COND is not true.
check() { if [ "$2" = 1 ]; then echo "ok $1"; else echo "FAIL $1"; FAIL=1; fi; }
# run JSON: print the status line without colours.
run() { printf '%s' "$1" | bash "$HERE/noctia-status.sh" | sed 's/\x1b\[[0-9;]*m//g'; }
NOW=$(date +%s); SOON=$((NOW + 3600)); LATER=$((NOW + 3 * 86400))

out=$(run "{\"rate_limits\":{\"five_hour\":{\"used_percentage\":23,\"resets_at\":$SOON},\"seven_day\":{\"used_percentage\":41,\"resets_at\":$LATER}}}")
h=$(date -d "@$SOON" +%H:%M); w=$(date -d "@$LATER" +%a)
check both "$([[ "$out" == *"5h 23% ↻$h · wk 41% ↻$w"* ]] && echo 1 || echo 0)"
check mode "$([ "$(stat -c %a "$NOCTIA_USAGE_FILE")" = 600 ] && [ "$(stat -c %a "$T/d")" = 700 ] && echo 1 || echo 0)"
check json "$(jq -e --argjson s "$SOON" '(.updated_at|type)=="number" and .five_hour.used_percentage==23 and .five_hour.resets_at==$s and .seven_day.used_percentage==41 and (keys|length)==3' "$NOCTIA_USAGE_FILE" >/dev/null && echo 1 || echo 0)"

rm -rf "$T/d"
out=$(run "{\"rate_limits\":{\"five_hour\":{\"used_percentage\":72,\"resets_at\":$SOON}}}")
check one "$([[ "$out" == *"5h 72% ↻$h"* && "$out" != *wk* ]] && echo 1 || echo 0)"
check one_json "$(jq -e '.seven_day==null and .five_hour.used_percentage==72' "$NOCTIA_USAGE_FILE" >/dev/null && echo 1 || echo 0)"
raw=$(printf '%s' "{\"rate_limits\":{\"five_hour\":{\"used_percentage\":72,\"resets_at\":$SOON}}}" | bash "$HERE/noctia-status.sh")
check warn_color "$([[ "$raw" == *"252;211;77m5h 72%"* ]] && echo 1 || echo 0)"
raw=$(printf '%s' "{\"rate_limits\":{\"seven_day\":{\"used_percentage\":95,\"resets_at\":$LATER}}}" | bash "$HERE/noctia-status.sh")
check danger_color "$([[ "$raw" == *"252;165;165m wk 95%"* || "$raw" == *"252;165;165mwk 95%"* ]] && echo 1 || echo 0)"

rm -rf "$T/d"
out=$(run '{"model":{"display_name":"X"}}')
check none "$([[ "$out" != *"5h"* && "$out" != *wk* && ! -e "$NOCTIA_USAGE_FILE" ]] && echo 1 || echo 0)"
exit $FAIL
