#!/usr/bin/env bash
# Opt-in dashboard auto-start: enabled by NOCTIA_DASHBOARD_AUTOSTART=1, or by the
# dashboard.autostart setting when the env var is unset (env "0" forces it off).
# Never blocks and never fails the hook: always exits 0.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
# shellcheck source=noctia-settings.sh
. "$SCRIPT_DIR/noctia-settings.sh"

PORT="${NOCTIA_DASHBOARD_PORT:-$(noctia_setting dashboard.port)}"

# autostart_enabled: succeed when the env var or, if unset, the setting turns auto-start on.
autostart_enabled() {
  case "${NOCTIA_DASHBOARD_AUTOSTART:-}" in
    1) return 0 ;;
    0 | ?*) return 1 ;;
    *) [ "$(noctia_setting dashboard.autostart)" = true ] ;;
  esac
}

# summaries_enabled: succeed when the env var or the setting asks for AI brief summaries.
summaries_enabled() {
  [ "${NOCTIA_DASHBOARD_SUMMARIES:-}" = 1 ] || [ "$(noctia_setting dashboard.summaries)" = true ]
}

# valid_port: succeed when PORT is digits only and within 1024-65535.
valid_port() {
  [[ "$PORT" =~ ^[0-9]{1,5}$ ]] && [ "$((10#$PORT))" -ge 1024 ] && [ "$((10#$PORT))" -le 65535 ]
}

# port_busy: succeed when something accepts connections on 127.0.0.1:PORT.
port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$((10#$PORT))") 2>/dev/null
}

# start_server: launch the dashboard fully detached, logging to ~/.claude/noctia/dashboard.log.
start_server() {
  local log_dir="$HOME/.claude/noctia" extra=()
  mkdir -p "$log_dir" 2>/dev/null || return 0
  summaries_enabled && extra+=(--summaries)
  setsid nohup python3 "$PLUGIN_ROOT/dashboard/server.py" --port "$((10#$PORT))" \
    --project "$PROJECT_DIR" "${extra[@]}" </dev/null >>"$log_dir/dashboard.log" 2>&1 &
}

main() {
  autostart_enabled || exit 0
  valid_port || exit 0
  port_busy || start_server
  echo "Dashboard: http://127.0.0.1:$((10#$PORT))"
  exit 0
}

main
