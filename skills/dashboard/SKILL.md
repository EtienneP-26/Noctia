---
name: dashboard
description: Start the local Noctia dashboard for this project in the background. Use on /noctia:dashboard.
---

# Dashboard

1. Check that `python3` is 3.10 or newer (`python3 --version`). If not, tell the user and stop.
2. Start the server in the background (run_in_background):

   `python3 "${CLAUDE_PLUGIN_ROOT}/dashboard/server.py" --port 7777 --project "$PWD"`

3. If it fails because the port is busy, start it again with `--port 7778`.
4. Tell the user to open http://127.0.0.1:7777 (or 7778). The server listens on localhost only.
5. To stop it, use TaskStop on the background task, or Ctrl-C in its terminal.

## Auto-start

Opt-in, from the settings: turn on `dashboard.autostart` on the Settings page (`/settings` on the dashboard) or with `/noctia:config dashboard`. The port is `dashboard.port` (default 7777), also set there. The session-start hook then starts the dashboard if the port is free. Log: `~/.claude/noctia/dashboard.log`.

An environment variable overrides the setting: `NOCTIA_DASHBOARD_AUTOSTART=1` forces it on and `0` forces it off. Set it in the `env` block of `~/.claude/settings.json` if you need it. `NOCTIA_DASHBOARD_SUMMARIES=1` starts the server with `--summaries`.

The Settings page also holds `dashboard.retire_seconds` (default 10) and the summaries switch (`dashboard.summaries`).
