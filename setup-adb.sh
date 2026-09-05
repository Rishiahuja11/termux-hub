#!/data/data/com.termux/files/usr/bin/bash
# Android Control Setup Script
# Enables wireless ADB for remote control from browser
set -euo pipefail
export PATH=$PREFIX/bin:/data/data/com.termux/files/usr/bin:/usr/bin:$PATH

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[-]${NC} $1"; }

echo "======================================"
echo "  Android Control - ADB Setup"
echo "======================================"
echo ""

# Step 1: Install android-tools (adb)
info "Step 1: Installing android-tools (adb)..."
if command -v adb >/dev/null 2>&1; then
    info "adb already installed: $(adb version | head -1)"
else
    pkg install -y android-tools 2>&1 | tail -3
    if command -v adb >/dev/null 2>&1; then
        info "adb installed successfully"
    else
        err "Failed to install adb. Try: pkg install android-tools"
        exit 1
    fi
fi

# Step 2: Check if Termux:API app is installed
info "Step 2: Checking Termux:API..."
if command -v termux-screencap >/dev/null 2>&1; then
    info "Termux:API screencap available"
    HAS_TERMUX_API=1
else
    warn "termux-screencap not found."
    warn "Install 'Termux:API' app from F-Droid/Play Store for better integration."
    warn "Without it, we'll use ADB for screen capture."
    HAS_TERMUX_API=0
fi

# Step 3: Check wireless ADB
info "Step 3: Checking wireless ADB..."
ADB_PORT=$(getprop service.adb.tcp.port 2>/dev/null || echo "")
if [ "$ADB_PORT" = "" ] || [ "$ADB_PORT" = "0" ]; then
    warn "Wireless ADB is not enabled."
    echo ""
    echo "To enable wireless ADB on your Samsung M12:"
    echo ""
    echo "  1. Go to Settings > About Phone > Software Information"
    echo "  2. Tap 'Build Number' 7 times to enable Developer Options"
    echo "  3. Go to Settings > Developer Options"
    echo "  4. Enable 'USB Debugging'"
    echo "  5. Enable 'Wireless Debugging' (or 'Wireless ADB')"
    echo "  6. Tap 'Wireless Debugging' to open its settings"
    echo "  7. Note the port number shown (usually 37000-40000)"
    echo "  8. Run this script again, or run:"
    echo "     adb pair localhost:<port>    (enter pairing code)"
    echo "     adb connect localhost:<port>"
    echo ""
    echo "Alternatively, run:"
    echo "  adb tcpip 5555"
    echo "  adb connect localhost:5555"
    echo ""
else
    info "Wireless ADB port: $ADB_PORT"
fi

# Step 4: Try to connect via ADB
info "Step 4: Testing ADB connection..."
# Try common ports
CONNECTED=0
for port in 5555 5037 $ADB_PORT; do
    if [ "$port" != "" ] && [ "$port" != "0" ]; then
        result=$(adb connect localhost:$port 2>&1 || true)
        if echo "$result" | grep -q "connected"; then
            info "Connected to ADB on port $port"
            CONNECTED=1
            break
        fi
    fi
done

if [ "$CONNECTED" = "0" ]; then
    warn "Could not auto-connect ADB."
    warn "Please enable wireless debugging and run:"
    echo "  adb pair localhost:<pairing-port>   (enter pairing code from phone)"
    echo "  adb connect localhost:<adb-port>"
    echo ""
fi

# Step 5: Test ADB screencap
if [ "$CONNECTED" = "1" ]; then
    info "Step 5: Testing ADB screencap..."
    if adb exec-out screencap -p > /data/data/com.termux/files/home/.termux/adminapi/test_screen.png 2>/dev/null; then
        SIZE=$(stat -c%s /data/data/com.termux/files/home/.termux/adminapi/test_screen.png 2>/dev/null || echo 0)
        if [ "$SIZE" -gt 1000 ]; then
            info "ADB screencap works! ($SIZE bytes)"
            rm -f /data/data/com.termux/files/home/.termux/adminapi/test_screen.png
        else
            warn "screencap produced small output ($SIZE bytes)"
        fi
    else
        warn "ADB screencap failed"
    fi
fi

# Step 6: Test input injection
if [ "$CONNECTED" = "1" ]; then
    info "Step 6: Testing input injection..."
    if adb shell input keyevent KEYCODE_HOME 2>/dev/null; then
        info "Input injection works!"
    else
        warn "Input injection failed (INJECT_EVENTS permission needed)"
    fi
fi

# Step 7: Check display control
if [ "$CONNECTED" = "1" ]; then
    info "Step 7: Testing display control..."
    BRIGHTNESS=$(adb shell settings get system screen_brightness 2>/dev/null || echo "")
    if [ "$BRIGHTNESS" != "" ] && [ "$BRIGHTNESS" != "null" ]; then
        info "Display control works! Current brightness: $BRIGHTNESS"
    else
        warn "Display control may need additional permissions"
    fi
fi

echo ""
echo "======================================"
if [ "$CONNECTED" = "1" ]; then
    info "Setup complete! ADB is connected."
    info "Open the dashboard: https://$(hostname -I | awk '{print $1}'):8900"
    info "Click 'Android Control' tab for full remote control."
else
    warn "Setup incomplete. Enable wireless ADB for full control."
    info "Dashboard still works for: Files, Terminal, Software, System Monitor"
fi
echo "======================================"
