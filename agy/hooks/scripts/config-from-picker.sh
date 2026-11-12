#!/usr/bin/env bash
# PostToolUse hook (AskUserQuestion): applies the USER's answers from a /config picker to settings.json.
# Picker contract: each question text starts with "Noctia config:" and its `header` is one of
#   Autostart->dashboard.autostart (on|off)   Summaries->dashboard.summaries (on|off)
#   Retire->dashboard.retire_seconds (0|5|10|30|60)   Port->dashboard.port (1024-65535)
#   Pentest|Designer|Legal|Docs->workflow.<lowercase> (on|off)
#   "Default git"->git.default_mode (locked|ask|auto)   Co-author->git.default_coauthor (ask|yes|no)
# Answers are read from tool_response only, never tool_input. Header matching and value checks run in jq
# against fixed lists, so control characters or unknown text never reach the shell. Anything else is ignored.
set -u

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# validated_pairs INPUT: print "key<TAB>value" lines for each known header with a valid answer.
validated_pairs() {
  jq -r '
    def on_off: {"on": "true", "off": "false"};
    def rules: {
      "Autostart": ["dashboard.autostart", on_off],
      "Summaries": ["dashboard.summaries", on_off],
      "Retire": ["dashboard.retire_seconds", {"0": "0", "5": "5", "10": "10", "30": "30", "60": "60"}],
      "Port": ["dashboard.port", "port"],
      "Pentest": ["workflow.pentest", on_off],
      "Designer": ["workflow.designer", on_off],
      "Legal": ["workflow.legal", on_off],
      "Docs": ["workflow.docs", on_off],
      "Default git": ["git.default_mode", {"locked": "locked", "ask": "ask", "auto": "auto"}],
      "Co-author": ["git.default_coauthor", {"ask": "ask", "yes": "yes", "no": "no"}]
    };
    def port_value($l):
      if ($l | test("^[0-9]{4,5}$")) then
        (($l | tonumber) as $n | if $n >= 1024 and $n <= 65535 then $l else empty end)
      else empty end;
    def value($rule; $l):
      if $rule == "port" then port_value($l) else ($rule[$l] // empty) end;
    .tool_response as $r
    | (if ($r | type) == "object" then ($r.answers // {}) else {} end) as $a
    | (.tool_input.questions // [])[]
    | select((.question | type) == "string" and (.question | startswith("Noctia config:")))
    | select((.header | type) == "string" and (.header as $h | rules | has($h)))
    | rules[.header] as $rule
    | ($a[.question]?) as $v
    | (if ($v | type) == "array" then $v[0] else $v end) as $l
    | select(($l | type) == "string")
    | value($rule[1]; $l) as $out
    | "\($rule[0])\t\($out)"' <<<"$1" 2>/dev/null
}

# apply KEY VALUE: set one setting through the CLI; failures are ignored.
apply() {
  python3 "$PLUGIN_ROOT/dashboard/settings.py" set "$1" "$2" >/dev/null 2>&1
}

main() {
  local input key value done_list=""
  command -v jq >/dev/null 2>&1 || exit 0
  input=$(cat)
  while IFS=$'\t' read -r key value; do
    apply "$key" "$value" && done_list="$done_list $key=$value"
  done < <(validated_pairs "$input")
  [ -n "$done_list" ] || exit 0
  jq -nc --arg m "Noctia config set by the user:$done_list" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
}

main
