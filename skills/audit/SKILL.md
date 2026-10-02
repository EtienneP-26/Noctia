---
name: audit
description: Deep audit of a project's health (tests, CI, docs, architecture, security basics, versioning). Use when the user runs /noctia:audit, asks what is missing in a project, or wants a state-of-the-project review.
---

# Project audit

The session-start scan gave a quick file check. This is the deeper pass.

1. **Map the project.** For anything larger than a small repo, delegate the reading to the `reader` agent (Haiku): languages, entry points, folder layout, size, main dependencies, git history summary (activity, branch names, commit style, tags).
2. **Check each area**, and note present, partial or missing:
   - **Tests:** framework, coverage of core logic, whether they run and pass.
   - **CI/CD:** pipeline files, what they run (lint, test, build, deploy), environments.
   - **Docs:** README quality (install, usage, contribute), API docs, docs folder.
   - **Architecture:** a description of the modules and how they connect.
   - **Contributing rules:** CONTRIBUTING.md, PR template, code owners.
   - **Style:** linter, formatter, editorconfig, pre-commit.
   - **Security basics:** `.gitignore`, `.env.example`, secrets in history or code, dependency audit (see `security-check`).
   - **Versioning:** tags in vX.Y.Z form, CHANGELOG, release process (see `release-and-deploy`).
3. **Report** as a table: area | status | what is missing | priority (high/medium/low). Then at most 3 recommended next steps, in order.
4. **Do not create anything yet.** Ask which items the user wants, then do them one at a time.

Keep the report on one screen. Facts from the repo only; say "not found" rather than guessing.
