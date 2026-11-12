#!/usr/bin/env bash
# Noctia settings reader. Source it, then: noctia_setting section.key
# Prints the saved value, or the default when the file, key or value is unusable.
# Reads the file with jq only; never evals its content.

# _noctia_default NAME: print the default of a setting; fail for unknown names.
_noctia_default() {
  case "$1" in
    dashboard.autostart | dashboard.summaries) echo false ;;
    dashboard.port) echo 7777 ;;
    dashboard.retire_seconds) echo 10 ;;
    workflow.pentest | workflow.designer | workflow.legal | workflow.docs) echo true ;;
    git.default_mode) echo locked ;;
    git.default_coauthor) echo ask ;;
    *) return 1 ;;
  esac
}

# _noctia_read SECTION KEY: print the stored value as JSON, or nothing if absent or unreadable.
_noctia_read() {
  local file="${NOCTIA_SETTINGS:-$HOME/.claude/noctia/settings.json}"
  command -v jq >/dev/null 2>&1 || return 0
  [ -r "$file" ] || return 0
  jq -c --arg s "$1" --arg k "$2" '.[$s][$k] | select(. != null)' "$file" 2>/dev/null
  return 0
}

# _noctia_in_range VALUE MIN MAX: succeed if VALUE is a plain integer within MIN..MAX.
_noctia_in_range() {
  [[ $1 =~ ^[0-9]{1,6}$ ]] && (( 10#$1 >= $2 && 10#$1 <= $3 ))
}

# _noctia_in_set VALUE CHOICE...: succeed if VALUE equals one of the CHOICE strings.
_noctia_in_set() {
  local value=$1 choice
  shift
  for choice in "$@"; do
    [ "$value" = "$choice" ] && return 0
  done
  return 1
}

# _noctia_valid NAME JSON: succeed if the stored JSON value fits the setting's type and limits.
_noctia_valid() {
  case "$1" in
    dashboard.autostart | dashboard.summaries | workflow.*) _noctia_in_set "$2" true false ;;
    dashboard.port) _noctia_in_range "$2" 1024 65535 ;;
    dashboard.retire_seconds) _noctia_in_range "$2" 0 3600 ;;
    git.default_mode) _noctia_in_set "$2" '"locked"' '"ask"' ;;
    git.default_coauthor) _noctia_in_set "$2" '"ask"' '"yes"' '"no"' ;;
    *) return 1 ;;
  esac
}

# noctia_setting SECTION.KEY: print the setting's value or its default; return 1 for unknown names.
noctia_setting() {
  local name=$1 default raw
  default=$(_noctia_default "$name") || return 1
  raw=$(_noctia_read "${name%%.*}" "${name#*.}")
  if [ -n "$raw" ] && _noctia_valid "$name" "$raw"; then
    printf '%s\n' "${raw//\"/}"
  else
    printf '%s\n' "$default"
  fi
}
