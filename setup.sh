#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# TermuX Hub — Automatic Setup
# Installs all dependencies, generates TLS cert, creates admin
# ============================================================
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ┌─────────────────────────────────────┐"
echo "  │       TermuX Hub — Setup            │"
echo "  │   Device Management Dashboard       │"
echo "  └─────────────────────────────────────┘"
echo -e "${NC}"

# ---- Step 1: Check Termux ----
echo -e "${YELLOW}[1/6] Checking environment...${NC}"

if [ ! -d "/data/data/com.termux" ]; then
  echo -e "${RED}Error: This must run inside Termux.${NC}"
  echo "Install Termux from F-Droid: https://f-droid.org/en/packages/com.termux/"
  exit 1
fi

export PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
export PATH="$PREFIX/bin:$PATH"

# ---- Step 2: Install system packages ----
echo -e "${YELLOW}[2/6] Installing system packages...${NC}"

pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs openssl-tool curl >/dev/null 2>&1 || true

# Verify node is installed
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}Error: Node.js installation failed. Try: pkg install nodejs${NC}"
  exit 1
fi

NODE_VER=$(node -v)
echo -e "  ${GREEN}✓${NC} Node.js $NODE_VER"

# ---- Step 3: Setup directory structure ----
echo -e "${YELLOW}[3/6] Setting up directories...${NC}"

HUB_DIR="$HOME/termux-hub"
API_DIR="$HOME/.termux/adminapi"
STORE_DIR="$API_DIR/store"

# If running from the repo directory, use that
if [ -f "./server.js" ] && [ -f "./public/index.html" ]; then
  HUB_DIR="$(pwd)"
fi

mkdir -p "$API_DIR"
mkdir -p "$API_DIR/public/assets"
mkdir -p "$STORE_DIR"

# Copy files to API directory if they're not already there
if [ "$HUB_DIR" != "$API_DIR" ]; then
  cp -f "$HUB_DIR/server.js" "$API_DIR/" 2>/dev/null || true
  cp -f "$HUB_DIR/app-phone.js" "$API_DIR/" 2>/dev/null || true
  cp -f "$HUB_DIR/apps.json" "$API_DIR/" 2>/dev/null || true
  cp -f "$HUB_DIR/docs.json" "$API_DIR/" 2>/dev/null || true
  cp -f "$HUB_DIR/apkpure-cli.js" "$API_DIR/" 2>/dev/null || true
  cp -f "$HUB_DIR/setup.sh" "$API_DIR/" 2>/dev/null || true
  cp -f "$HUB_DIR/start.sh" "$API_DIR/" 2>/dev/null || true
  cp -f "$HUB_DIR/restart.sh" "$API_DIR/" 2>/dev/null || true
  cp -rf "$HUB_DIR/public/"* "$API_DIR/public/" 2>/dev/null || true
fi

echo -e "  ${GREEN}✓${NC} Directory: $API_DIR"

# ---- Step 4: Generate TLS certificate ----
echo -e "${YELLOW}[4/6] Generating TLS certificate...${NC}"

if [ -s "$API_DIR/cert.pem" ] && [ -s "$API_DIR/key.pem" ]; then
  echo -e "  ${GREEN}✓${NC} TLS certificate already exists"
else
  openssl req -x509 -newkey rsa:3072 -nodes \
    -keyout "$API_DIR/key.pem" -out "$API_DIR/cert.pem" \
    -days 3650 -subj "/CN=termux-hub" >/dev/null 2>&1
  chmod 600 "$API_DIR/key.pem" "$API_DIR/cert.pem"
  echo -e "  ${GREEN}✓${NC} TLS certificate generated (3072-bit RSA, 10 years)"
fi

# ---- Step 5: Create default admin account ----
echo -e "${YELLOW}[5/6] Creating admin account...${NC}"

if [ ! -s "$API_DIR/users.json" ]; then
  # Generate real scrypt hash for default admin/admin account
  SALT=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  HASH=$(node -e "console.log(require('crypto').scryptSync('admin','$SALT',64).toString('hex'))" 2>/dev/null || echo "placeholder")
  cat > "$API_DIR/users.json" << ENDJSON
{
  "admin": {
    "salt": "$SALT",
    "hash": "$HASH",
    "created": $(date +%s)000
  }
}
ENDJSON
  chmod 600 "$API_DIR/users.json"
  echo -e "  ${GREEN}✓${NC} Default account created: ${GREEN}admin${NC} / ${GREEN}admin${NC}"
  echo -e "  ${YELLOW}⚠ Change this password after first login!${NC}"
else
  echo -e "  ${GREEN}✓${NC} User database already exists"
fi

# ---- Step 6: Create config with defaults ----
echo -e "${YELLOW}[6/6] Creating config...${NC}"

if [ ! -s "$API_DIR/config.json" ]; then
  cat > "$API_DIR/config.json" << 'ENDJSON'
{
  "adbTarget": "",
  "sshPassword": "",
  "streamBitrate": 4000000,
  "streamResolution": "720x1280",
  "streamFps": 20,
  "streamQuality": 8,
  "hostname": "0.0.0.0",
  "port": 8900,
  "adminNote": "",
  "rootMode": false,
  "wakeScreenOnStream": true,
  "screenRecordTimeout": 180,
  "autoReconnectAdb": true,
  "adbReconnectInterval": 30
}
ENDJSON
  echo -e "  ${GREEN}✓${NC} Config created with defaults"
else
  echo -e "  ${GREEN}✓${NC} Config already exists"
fi

# ---- Done ----
echo ""
echo -e "${GREEN}┌─────────────────────────────────────┐"
echo -e "│        Setup Complete! 🎉           │"
echo -e "└─────────────────────────────────────┘${NC}"
echo ""
echo -e "  Start the server:"
echo -e "    ${CYAN}cd $API_DIR && bash start.sh${NC}"
echo ""
echo -e "  Or directly:"
echo -e "    ${CYAN}cd $API_DIR && node server.js${NC}"
echo ""
echo -e "  Then open in browser:"
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_PHONE_IP")
echo -e "    ${GREEN}https://${IP}:8900${NC}"
echo ""
echo -e "  Login: ${YELLOW}admin${NC} / ${YELLOW}admin${NC}"
echo -e "  ${RED}⚠ Change the default password after first login!${NC}"
echo ""
