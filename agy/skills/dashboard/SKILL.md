---
name: dashboard
description: Start the local Noctia dashboard for this project in the background. Use on /dashboard.
---

# Dashboard

1. Check that `python3` is 3.10 or newer (`python3 --version`). If not, tell the user and stop.
2. Start the server in the background (run_in_background):

   `python3 "${PLUGIN_ROOT:-$HOME/.gemini/config/plugins/noctia}/dashboard/server.py" --port 7777 --project "$PWD"`

3. If it fails because the port is busy, start it again with `--port 7778`.
4. Tell the user to open http://127.0.0.1:7777 (or 7778). The server listens on localhost only.
5. To stop it, use TaskStop on the background task, or Ctrl-C in its terminal.
