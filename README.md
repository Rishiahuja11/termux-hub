# TermuX Hub

A modern, self-hosted device management dashboard for Termux on Android. Control your phone from any browser — terminal, file manager, app store, Android remote control with live screen streaming, and more.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![Platform](https://img.shields.io/badge/platform-Termux%20Android-orange)
![Stars](https://img.shields.io/github/stars/Rishiahuja11/termux-hub)

## Features

- **Terminal** — Full shell access from any browser on your network
- **File Manager** — Browse, edit, upload, download files with breadcrumb navigation
- **App Store** — Install from F-Droid + APKPure with one click
- **Android Remote Control** — Live screen mirror, tap, swipe, input keys (20-30fps)
- **Package Manager** — Install/remove Termux packages with dependency tracking
- **System Monitor** — CPU, memory, storage, running processes
- **Docs** — Built-in CLI tool documentation for 30+ tools
- **Logs** — View server, package, and system logs
- **Multi-user** — Account-based auth with session management
- **Secure** — HTTPS with TLS, rate limiting, brute force protection, input validation
- **Root Mode** — Direct screenrecord access on rooted phones (no ADB needed)

## Screenshots

> Open `https://YOUR_PHONE_IP:8900` in your browser after setup.

## Quick Start (TL;DR)

```bash
# In Termux:
pkg install nodejs git -y
git clone https://github.com/Rishiahuja11/termux-hub.git
cd termux-hub
bash setup.sh    # Installs deps, generates cert, creates admin user
bash start.sh    # Starts server, shows URL and login info
```

Then open `https://YOUR_PHONE_IP:8900` and login with `admin` / `admin`.

---

## Detailed Setup Guide

### Step 1: Install Termux

**Important:** Install Termux from **F-Droid**, NOT Google Play Store (Play Store version is outdated and broken).

1. Download F-Droid from https://f-droid.org/en/packages/com.termux/
2. Install F-Droid, open it, search for "Termux" and install it
3. Open Termux and grant storage permission when prompted:
   ```bash
   termux-setup-storage
   ```

### Step 2: Install Dependencies

```bash
# Update package lists
pkg update && pkg upgrade -y

# Install required packages
pkg install nodejs git openssl-tool curl -y

# Verify installation
node -v    # Should show v18.x or higher
git -v     # Should show git version
```

### Step 3: Download TermuX Hub

```bash
# Clone the repository
git clone https://github.com/Rishiahuja11/termux-hub.git
cd termux-hub
```

### Step 4: Run Automatic Setup

```bash
bash setup.sh
```

This will automatically:
- Install any missing system packages
- Generate a self-signed TLS certificate (3072-bit RSA, valid 10 years)
- Create a default admin account (`admin` / `admin`)
- Create the configuration file with optimal defaults
- Set up the directory structure at `~/.termux/adminapi/`

You'll see output like:
```
[1/6] Checking environment...
[2/6] Installing system packages...
  ✓ Node.js v18.19.0
[3/6] Setting up directories...
  ✓ Directory: /data/data/com.termux/files/home/.termux/adminapi
[4/6] Generating TLS certificate...
  ✓ TLS certificate generated (3072-bit RSA, 10 years)
[5/6] Creating admin account...
  ✓ Default account created: admin / admin
[6/6] Creating config...
  ✓ Config created with defaults

Setup Complete! 🎉
```

### Step 5: Start the Server

```bash
bash start.sh
```

The server will start and show:
```
✓ TermuX Hub is running! 🚀

  PID:       12345
  Log:       /data/data/com.termux/files/home/.termux/adminapi/server.log
  Local:     https://localhost:8900
  Network:   https://192.168.1.100:8900

  Login: admin / admin
```

### Step 6: Access from Browser

1. Make sure your phone and computer are on the **same WiFi network**
2. Open a browser on your computer
3. Go to `https://YOUR_PHONE_IP:8900`
   - Find your phone's IP in Termux: `hostname -I`
   - Or check WiFi settings on your phone
4. Accept the self-signed certificate warning (click "Advanced" → "Proceed")
5. Login with `admin` / `admin`
6. **Change the password immediately** in Settings

---

## Phone Setup for Android Remote Control

The Android Remote Control feature lets you mirror and control your phone screen from the browser. There are two methods:

### Method A: Wireless ADB (Non-Rooted Phones)

#### 1. Enable Developer Options

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times until you see "You are now a developer"
3. Go back to **Settings** → **Developer Options**

#### 2. Enable Wireless Debugging

1. In Developer Options, enable **Wireless Debugging**
2. Tap on **Wireless Debugging** to open its settings
3. Note the **IP address & Port** shown (e.g., `192.168.1.100:37000`)
4. For pairing, note the **Pairing Code** and **Pairing Port**

#### 3. Connect from TermuX Hub

1. Open TermuX Hub in your browser
2. Go to the **Android** panel
3. Click **Pair** and enter:
   - Pairing Port (from phone's wireless debugging settings)
   - Pairing Code (6-digit code shown on phone)
4. After pairing, enter the ADB Target:
   ```
   192.168.1.100:CONNECT_PORT
   ```
   (Use the Connect Port from wireless debugging, NOT the pairing port)
5. Click **Connect**
6. You should see your phone screen in the browser

**Note:** The ADB ports change every time you restart the server or toggle wireless debugging. You'll need to re-enter the new port.

### Method B: Root Access (Rooted Phones)

If your phone is rooted, you can skip ADB entirely and use direct screenrecord:

1. Open TermuX Hub in your browser
2. Go to **Settings**
3. Enable **Root mode (direct screenrecord, no ADB needed)**
4. Save settings
5. The Android panel will now use direct screen access

**Root mode benefits:**
- No ADB setup required
- More reliable connection
- No port changes on restart
- Higher frame rates possible

### Method C: USB ADB (Advanced)

For the most reliable connection:

1. Enable USB Debugging on your phone
2. Connect phone to computer via USB
3. Install ADB on your computer: `apt install android-tools-adb`
4. Authorize the connection on your phone
5. Find the ADB device path and enter it as the ADB Target

---

## Configuration Settings

All settings are available in the web UI under **Settings**:

### Connection Settings

| Setting | Default | Description |
|---------|---------|-------------|
| ADB Target | — | Phone ADB address (host:port) for wireless debugging |
| SSH Password | — | SSH password for remote Termux access |

### Screen Streaming Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Resolution | 720x1280 | Screen capture resolution (360p/720p/1080p) |
| FPS | 20 | Target frame rate (10/20/30 fps) |
| Bitrate | 4 Mbps | Video bitrate (500K/1M/2M/4M) |
| Quality | 8 | JPEG quality (4=Best, 8=Good, 15=Fast) |

### Device Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Root Mode | Off | Use direct screenrecord (requires root) |
| Wake Screen | On | Auto-wake screen before streaming |
| Auto-reconnect ADB | On | Reconnect ADB if connection drops |
| Reconnect Interval | 30s | How often to check ADB connection |
| Screen Record Timeout | 180s | Max screenrecord duration (0=unlimited) |

### Server Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Port | 8900 | HTTPS server port |
| Bind Address | 0.0.0.0 | Network interface to listen on |

---

## Project Structure

```
termux-hub/
├── server.js              # Main HTTPS server (all API routes, ~1600 lines)
├── apkpure-cli.js         # Standalone APKPure CLI tool
├── setup.sh               # Automatic setup script
├── start.sh               # Start server with health checks
├── restart.sh             # Restart server
├── apps.json              # App store catalog (~300 apps)
├── docs.json              # CLI tool documentation (~30 tools)
├── .gitignore             # Git ignore rules
├── LICENSE                # MIT License
├── README.md              # This file
├── public/
│   ├── index.html         # Main HTML entry point
│   └── assets/
│       ├── app.js         # Dashboard JavaScript (~930 lines)
│       └── style.css      # Modern dark theme CSS
└── app-phone.js           # Phone-local dashboard variant
```

---

## API Reference

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | No | Login with username/password |
| `POST` | `/api/auth/create` | No | Create new account |
| `GET` | `/api/auth/me` | Yes | Get current user info |
| `POST` | `/api/auth/logout` | Yes | Logout (invalidate session) |

### System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/system` | Yes | System info (CPU, RAM, disk, processes) |
| `GET` | `/api/apps` | Yes | Installed apps list |
| `GET` | `/api/logs` | Yes | View logs (query: `?which=access&lines=200`) |

### Files

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/files?path=...` | Yes | List directory contents |
| `POST` | `/api/files/read` | Yes | Read file content |
| `POST` | `/api/files/write` | Yes | Write/create file |
| `POST` | `/api/files/mkdir` | Yes | Create directory |
| `POST` | `/api/files/delete` | Yes | Delete file/directory |

### Packages

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/packages/lists` | Yes | List available packages |
| `GET` | `/api/packages/installed` | Yes | List installed packages |
| `POST` | `/api/packages/install` | Yes | Install package (`{"name":"pkg"}`) |
| `POST` | `/api/packages/remove` | Yes | Remove package (`{"name":"pkg"}`) |

### Android

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/android/status` | Yes | ADB connection status |
| `GET` | `/api/android/stream` | Yes | MJPEG screen stream |
| `GET` | `/api/android/screencap` | Yes | Single screenshot (PNG) |
| `POST` | `/api/android/input` | Yes | Send input (`tap`/`swipe`/`key`/`text`) |
| `POST` | `/api/android/adb-pair` | Yes | Pair with ADB |
| `POST` | `/api/android/adb-connect` | Yes | Connect to ADB target |

### App Store

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/store/list` | Yes | List store apps |
| `GET` | `/api/store/search?q=...` | Yes | Search apps |
| `POST` | `/api/store/install` | Yes | Install from store |

---

## Security Features

- **HTTPS Encryption** — All traffic encrypted with 3072-bit RSA TLS certificate
- **Rate Limiting** — Login attempts limited to 10/minute per IP
- **Account Lockout** — Brute force protection after 10 failed attempts (10-minute lockout)
- **Session Management** — 30-day tokens with automatic cleanup
- **Input Validation** — Shell injection, path traversal, XSS prevention
- **File Locking** — Concurrent write protection for user/session data
- **CSP Headers** — Content Security Policy prevents script injection
- **Symlink Protection** — `realpathSync` prevents path traversal via symlinks

---

## Troubleshooting

### "Connection refused" error

- Make sure the server is running: `bash start.sh`
- Check if port 8900 is open: `ss -tln | grep 8900`
- Check firewall: Termux doesn't have a firewall by default

### "Not secure" browser warning

This is normal — the self-signed certificate isn't trusted by browsers. Click "Advanced" → "Proceed to [site]" to continue.

### ADB connection drops

- Enable **Auto-reconnect ADB** in Settings
- Keep TermuX Hub app open in the background
- Some phones kill background apps — disable battery optimization for Termux

### Screen stream is black

- Make sure the screen is unlocked
- Enable **Wake screen before streaming** in Settings
- Try increasing the timeout in Settings

### Low FPS (below 10fps)

- Lower the resolution to 360x640
- Increase bitrate to 4 Mbps
- Close other apps to free CPU
- On non-rooted phones, ADB screenrecord has inherent overhead

### Server won't start

- Check the log: `tail -20 ~/.termux/adminapi/server.log`
- Make sure Node.js is installed: `node -v`
- Re-run setup: `bash setup.sh`

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Credits

- [FX CSS Effects](https://opensource.josebamirena.com/fx/) for UI animations
- [F-Droid](https://f-droid.org/) for the open-source app repository
- [APKPure](https://apkpure.com/) for the alternative app source
- Built with Node.js, vanilla JavaScript, and ❤️
