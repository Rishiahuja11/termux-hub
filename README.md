# TermuX Hub

A modern, self-hosted device management dashboard for Termux on Android. Control your phone from any browser — terminal, file manager, app store, Android remote control with live screen streaming, and more.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![Platform](https://img.shields.io/badge/platform-Termux%20Android-orange)

## Features

- **Terminal** — Full shell access from the browser
- **File Manager** — Browse, edit, upload, download files
- **App Store** — Install from F-Droid + APKPure with one click
- **Android Remote Control** — Live screen mirror, tap, swipe, input keys
- **Package Manager** — Install/remove Termux packages
- **System Monitor** — CPU, memory, storage, processes
- **Docs** — Built-in CLI tool documentation
- **Logs** — View server and system logs
- **Multi-user** — Account-based auth with session management
- **Secure** — HTTPS with self-signed cert, rate limiting, input validation

## Quick Start

### Prerequisites

- Android phone with [Termux](https://f-droid.org/en/packages/com.termux/) installed
- Node.js 18+ in Termux (`pkg install nodejs`)

### 1. Install Termux and Dependencies

```bash
# Install Termux from F-Droid (not Play Store — it's outdated)

# Open Termux and install dependencies
pkg update && pkg upgrade -y
pkg install nodejs openssh -y
```

### 2. Clone and Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/termux-hub.git
cd termux-hub

# Install dependencies
npm install

# Generate TLS certificate and default admin user
bash setup.sh
```

### 3. Start the Server

```bash
# Start in background
bash start.sh

# Or start directly
node server.js
```

The server runs on `https://0.0.0.0:8900`. Open it in your browser:

```
https://YOUR_PHONE_IP:8900
```

### 4. First Login

1. Open the URL in any browser on your network
2. You'll see the login screen
3. Default credentials: `admin` / `admin`
4. **Change the password immediately** in Settings

### 5. Enable Android Remote Control (Optional)

To mirror and control your phone screen from the browser:

```bash
# Enable Developer Options on your phone
# Settings > About Phone > Tap "Build Number" 7 times

# Enable Wireless Debugging
# Settings > Developer Options > Wireless Debugging > Enable

# Note the pairing port and connect port from the Wireless Debugging screen

# In the TermuX Hub dashboard:
# 1. Go to Android panel
# 2. Enter the ADB target: YOUR_PHONE_IP:CONNECT_PORT
# 3. Click Connect
```

## Configuration

All settings are available in the web UI under Settings panel:

| Setting | Default | Description |
|---------|---------|-------------|
| ADB Target | — | Phone ADB address (host:port) |
| SSH Password | — | SSH password for remote setup |
| Stream FPS | 20 | Screen streaming frame rate |
| Stream Bitrate | 2 Mbps | Video bitrate |
| Stream Resolution | 720x1280 | Screen capture resolution |
| Stream Quality | 8 | JPEG quality (lower = better) |

## Project Structure

```
termux-hub/
├── server.js              # Main HTTPS server (all API routes)
├── apkpure-cli.js         # Standalone APKPure CLI tool
├── setup.sh               # Generate TLS cert + admin user
├── start.sh               # Start server in background
├── restart.sh             # Restart server
├── apps.json              # App store catalog
├── docs.json              # CLI tool documentation
├── public/
│   ├── index.html         # Main HTML entry point
│   └── assets/
│       ├── app.js         # Dashboard JavaScript
│       └── style.css      # Modern dark theme CSS
└── app-phone.js           # Phone-local dashboard variant
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login and get session token |
| POST | `/api/auth/create` | No | Create new account |
| GET | `/api/auth/me` | Yes | Get current user info |
| GET | `/api/system` | Yes | System info (CPU, RAM, disk) |
| GET | `/api/apps` | Yes | Installed apps list |
| GET | `/api/packages/lists` | Yes | Available packages |
| POST | `/api/packages/install` | Yes | Install a package |
| GET | `/api/files` | Yes | List files |
| POST | `/api/files/read` | Yes | Read file content |
| POST | `/api/files/write` | Yes | Write file content |
| GET | `/api/android/status` | Yes | ADB connection status |
| GET | `/api/android/stream` | Yes | MJPEG screen stream |
| POST | `/api/android/input` | Yes | Send tap/swipe/key input |
| GET | `/api/store/list` | Yes | App store catalog |
| POST | `/api/store/install` | Yes | Install from store |

## Security Features

- **HTTPS** — All traffic encrypted with self-signed TLS cert
- **Rate limiting** — Login attempts limited to 10/minute per IP
- **Account lockout** — Brute force protection after 10 failed attempts
- **Input validation** — Shell injection, path traversal, XSS prevention
- **File locking** — Concurrent write protection for user/session data
- **Session management** — 30-day tokens with automatic cleanup

## Development

```bash
# Run in development mode
node server.js

# The server auto-downloads F-Droid index on first start (~30s)
# Logs are written to ~/.termux/adminapi/access.log
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## License

MIT License — see [LICENSE](LICENSE) for details.

## Credits

Built with [FX CSS Effects](https://opensource.josebamirena.com/fx/) for animations.
