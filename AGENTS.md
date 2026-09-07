# TermuX Hub

Self-hosted device management dashboard for Termux on Android.

## Architecture

- **`server.js`** — Single-file Node.js HTTPS server (~1710 lines). Handles auth, file system, package management, streaming, exec, Shizuku/rish integration. No framework — raw `https` module.
- **`public/`** — Frontend SPA (vanilla JS, no build step). `index.html` + `assets/app.js` + `assets/style.css`.
- **`setup.sh`** — One-time setup: installs deps, generates TLS cert, creates admin user, installs rish.
- **`start.sh`** — Starts server with health check. Runs from `~/.termux/adminapi/`.
- **`rish/`** — Embedded Shizuku shell binary + DEX for privileged Android operations.

## Runtime vs Source

- **Source code**: `~/termux-hub/` (git repo)
- **Runtime data**: `~/.termux/adminapi/` (certs, configs, logs, users.json, sessions.json)
- `setup.sh` copies source to runtime directory. After setup, run from `~/.termux/adminapi/`.

## Key Commands

```bash
# First time setup
cd ~/termux-hub && bash setup.sh

# Start server
cd ~/.termux/adminapi && bash start.sh

# Or directly
cd ~/.termux/adminapi && node server.js

# Stop server
pkill -f "node server.js"

# View logs
tail -f ~/.termux/adminapi/server.log

# Health check
curl -sk https://localhost:8900/api/health
```

## Server Defaults

- Port: `8900` (HTTPS only, self-signed cert)
- Default login: `admin` / `admin`
- Config: `~/.termux/adminapi/config.json`
- Users: `~/.termux/adminapi/users.json`

## Shizuku / rish Integration

Screen streaming and remote input require Shizuku (rish) or ADB. The `rish` binary uses `#!/system/bin/sh` with `app_process` to run `rikka.shizuku.shell.ShizukuShellLoader`. **Critical**: rish cannot pipe binary stdout (strips binary data). Text commands work fine. Requires `bash -l` (login shell) to preserve Termux identity.

## Phone Environment (Target Device)

- Samsung M12, Termux user `u0_a270`
- SSH: `sshpass -p '1010' ssh -p 8022 u0_a270@192.168.1.25`
- `/tmp` is read-only on phone
- Phone screen must be on for WiFi
- **AP Isolation**: Two phones cannot communicate on same WiFi — test via SSH or directly on phone

## Frontend

No build step. Vanilla JS SPA with glassmorphism UI. Files served directly from `public/`. Icons are inline SVGs. CSS uses custom properties for theming.

## Git

```bash
cd ~/termux-hub
git add -A && git commit -m "description"
git push
```

On phone, pull and copy to runtime:
```bash
cd ~/termux-hub && git pull
cp -f server.js ~/.termux/adminapi/server.js
cp -rf public ~/.termux/adminapi/
```
