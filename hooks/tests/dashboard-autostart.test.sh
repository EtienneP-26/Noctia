#!/usr/bin/env bash
# Tests for hooks/scripts/dashboard-autostart.sh. Run: bash hooks/tests/dashboard-autostart.test.sh
set -u

SCRIPT="$(cd "$(dirname "$0")/../scripts" && pwd)/dashboard-autostart.sh"
TMP_HOME=$(mktemp -d)
FAILED=0
LISTENER_PID=""
trap 'kill $LISTENER_PID 2>/dev/null; pkill -f "dashboard/server.py --port $PORT " 2>/dev/null; rm -rf "$TMP_HOME"' EXIT

# free_port: print a free high port.
free_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'
}
PORT=$(free_port)

# check NAME CONDITION...: run the condition, report and count a failure.
check() {
  local name=$1; shift
  if "$@"; then echo "ok   $name"; else echo "FAIL $name"; FAILED=1; fi
}

# run_script ENV...: run the script with a temp HOME and extra env; print its stdout.
run_script() { env HOME="$TMP_HOME" CLAUDE_PROJECT_DIR="$TMP_HOME" "$@" bash "$SCRIPT"; }

# server_count: number of dashboard servers started on PORT.
server_count() { pgrep -fc "dashboard/server.py --port $PORT " || true; }

test_unset_starts_nothing() {
  run_script NOCTIA_DASHBOARD_PORT="$PORT" >/dev/null; sleep 1
  [ "$(server_count)" = 0 ]
}

test_invalid_port_starts_nothing() {
  local out
  out=$(run_script NOCTIA_DASHBOARD_AUTOSTART=1 NOCTIA_DASHBOARD_PORT="80;x"); sleep 1
  [ -z "$out" ] && [ "$(server_count)" = 0 ] \
    && [ -z "$(run_script NOCTIA_DASHBOARD_AUTOSTART=1 NOCTIA_DASHBOARD_PORT=80)" ]
}

test_busy_port_starts_nothing() {
  python3 -c "
import socket,time
s=socket.socket(); s.bind(('127.0.0.1',$PORT)); s.listen(); time.sleep(20)" &
  LISTENER_PID=$!; sleep 1
  run_script NOCTIA_DASHBOARD_AUTOSTART=1 NOCTIA_DASHBOARD_PORT="$PORT" >/dev/null; sleep 1
  local n; n=$(server_count)
  kill "$LISTENER_PID" 2>/dev/null; wait "$LISTENER_PID" 2>/dev/null
  [ "$n" = 0 ]
}

test_enabled_starts_server() {
  local i code=""
  run_script NOCTIA_DASHBOARD_AUTOSTART=1 NOCTIA_DASHBOARD_PORT="$PORT" >/dev/null
  for i in $(seq 25); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" 2>/dev/null)
    [ "$code" = 200 ] && break; sleep 0.2
  done
  [ "$code" = 200 ]
}

# count_port PORT: number of dashboard servers started on PORT.
count_port() { pgrep -fc "dashboard/server.py --port $1 " || true; }

# write_settings JSON: write the settings file that NOCTIA_SETTINGS points to.
write_settings() { printf '%s\n' "$1" >"$TMP_HOME/settings.json"; }

# http_ok PORT: succeed once the dashboard answers 200 on 127.0.0.1:PORT.
http_ok() {
  local i code=""
  for i in $(seq 25); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1/" 2>/dev/null)
    [ "$code" = 200 ] && return 0
    sleep 0.2
  done
  return 1
}

# stop_port PORT: stop any dashboard server started on PORT.
stop_port() { pkill -f "dashboard/server.py --port $1 " 2>/dev/null; sleep 0.5; }

test_setting_enables_server() {
  local port rc
  port=$(free_port)
  write_settings "{\"dashboard\":{\"autostart\":true,\"port\":$port}}"
  run_script NOCTIA_SETTINGS="$TMP_HOME/settings.json" >/dev/null
  http_ok "$port"; rc=$?
  stop_port "$port"
  return "$rc"
}

test_env_zero_overrides_setting() {
  local port
  port=$(free_port)
  write_settings "{\"dashboard\":{\"autostart\":true,\"port\":$port}}"
  run_script NOCTIA_SETTINGS="$TMP_HOME/settings.json" NOCTIA_DASHBOARD_AUTOSTART=0 >/dev/null; sleep 1
  [ "$(count_port "$port")" = 0 ]
}

test_summaries_setting_passes_flag() {
  local port rc flag
  port=$(free_port)
  write_settings "{\"dashboard\":{\"autostart\":true,\"summaries\":true,\"port\":$port}}"
  run_script NOCTIA_SETTINGS="$TMP_HOME/settings.json" >/dev/null
  http_ok "$port"; rc=$?
  pgrep -f "server.py --port $port .*--summaries" >/dev/null; flag=$?
  stop_port "$port"
  [ "$rc" = 0 ] && [ "$flag" = 0 ]
}

check "unset env starts nothing" test_unset_starts_nothing
check "invalid port starts nothing" test_invalid_port_starts_nothing
check "busy port starts no second server" test_busy_port_starts_nothing
check "enabled + free port serves 200" test_enabled_starts_server
check "autostart setting enables server" test_setting_enables_server
check "env 0 overrides autostart setting" test_env_zero_overrides_setting
check "summaries setting passes --summaries" test_summaries_setting_passes_flag
exit "$FAILED"
