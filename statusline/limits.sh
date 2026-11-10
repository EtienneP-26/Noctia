#!/usr/bin/env bash
# Shared by the Noctia status lines: usage segment (5h/weekly) and usage snapshot.
# Needs from the caller: FIELDS (9-12 = 5h pct/reset, 7d pct/reset) and add().

# limit_color P: print the RGB triple for a usage percentage (warn at 70, danger at 90).
limit_color() {
  if [ "$1" -ge 90 ]; then echo "252 165 165"; elif [ "$1" -ge 70 ]; then echo "252 211 77"; else echo "134 239 172"; fi
}

# reset_label EPOCH: HH:MM local when under 24h away, else short weekday; empty if invalid.
reset_label() {
  [[ "$1" =~ ^[0-9]+$ ]] || return 0
  if [ $(( $1 - $(date +%s) )) -lt 86400 ]; then date -d "@$1" +%H:%M; else date -d "@$1" +%a; fi
}

# limit_part LABEL PCT RESET: print "LABEL P% ↻time" for one window, nothing if PCT is invalid.
limit_part() {
  [[ "$2" =~ ^[0-9]+(\.[0-9]+)?$ ]] || return 0
  local r
  r=$(reset_label "$3" 2>/dev/null)
  printf '%s %.0f%%%s' "$1" "$2" "${r:+ ↻$r}"
}

# add_limits: subscription usage (5h and weekly windows), coloured by the highest one.
add_limits() {
  local a b max=0 p
  a=$(limit_part 5h "${FIELDS[9]}" "${FIELDS[10]}")
  b=$(limit_part wk "${FIELDS[11]}" "${FIELDS[12]}")
  [ -n "$a$b" ] || return 0
  for p in "${FIELDS[9]}" "${FIELDS[11]}"; do
    [[ "$p" =~ ^[0-9]+(\.[0-9]+)?$ ]] && p=$(printf '%.0f' "$p") && [ "$p" -gt "$max" ] && max=$p
  done
  add "$(limit_color "$max")" "$a${a:+${b:+ · }}$b"
  write_usage
}

# usage_window PCT RESET: print the JSON for one window, or null when PCT is invalid.
usage_window() {
  [[ "$1" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { printf null; return 0; }
  [[ "$2" =~ ^[0-9]+$ ]] || { printf '{"used_percentage": %s, "resets_at": null}' "$1"; return 0; }
  printf '{"used_percentage": %s, "resets_at": %s}' "$1" "$2"
}

# write_usage: atomic snapshot of the usage windows (dir 0700, file 0600); errors are ignored.
write_usage() {
  local f=${NOCTIA_USAGE_FILE:-$HOME/.claude/noctia/usage.json} d tmp
  d=$(dirname "$f")
  ( umask 077
    mkdir -p -m 700 "$d" && tmp=$(mktemp "$d/.usage.XXXXXX") || exit 0
    printf '{"updated_at": %s, "five_hour": %s, "seven_day": %s}\n' "$(date +%s)" \
      "$(usage_window "${FIELDS[9]}" "${FIELDS[10]}")" "$(usage_window "${FIELDS[11]}" "${FIELDS[12]}")" > "$tmp" \
      && mv -f "$tmp" "$f" || rm -f "$tmp" ) 2>/dev/null
  return 0
}
