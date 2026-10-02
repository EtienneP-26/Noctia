---
name: security-check
description: Security checklist and review procedure for code changes (secrets, input validation, injections, XSS, dependencies, least privilege). Use before finishing any change that touches user input, auth, data storage, network, files or dependencies, and when the user asks for a security check.
---

# Security check

Review the change (`git diff`, or the files you touched) against each point. For a large change, delegate to the `security-reviewer` agent and give it the file list.

## 1. Secrets
- No API key, password, token or private key in code, config, tests, logs or docs.
- Read them from environment variables or a secrets manager. Fail with a clear error if one is missing.
- `.env` is in `.gitignore`; a `.env.example` lists the names without values.
- If a real secret was already committed, tell the user: it must be rotated, deleting the line is not enough.

## 2. Inputs (everything from outside: forms, URLs, headers, files, APIs, CLI args)
- Validate type, length, format and allowed values at the boundary. Prefer allow-lists.
- **SQL injection:** parameterized queries or the ORM's bound parameters. Never build SQL by string concatenation.
- **XSS:** escape output for its context; use the framework's auto-escaping; avoid `innerHTML` and `dangerouslySetInnerHTML` with user data.
- **Command injection:** no shell with user data; pass arguments as a list.
- **Path traversal:** resolve paths and check they stay inside the intended folder.
- **Deserialization, SSRF, open redirects:** do not trust user-supplied URLs, pickles or YAML loaders.

## 3. Auth and least privilege
- Check authorization on the server for every sensitive action, not only in the UI.
- Give each service, token, database user and role the minimum rights it needs.
- Passwords are hashed with a slow, salted algorithm (bcrypt, argon2), never stored or logged in clear.

## 4. Dependencies
- Run the ecosystem's audit: `npm audit`, `pip-audit`, `cargo audit`, `govulncheck`, `bundle audit`, or what the project uses.
- Report known vulnerabilities and outdated packages. Ask before upgrading across major versions.

## Report
Reply short: what was checked, then findings as `severity | file:line | issue | fix`. If everything passes, say which points you verified. Do not claim "secure": say "no issues found in these checks".
