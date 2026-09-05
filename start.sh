#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# TermuX Hub — Start Server
# Automatically starts, validates, and reports status
# ============================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

export PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
export PATH="$PREFIX/bin:$PATH"

DIR="$HOME/.termux/adminapi"
LOG="$DIR/server.log"
PIDFILE="$DIR/server.pid"

# ---- Check if server directory exists ----
if [ ! -f "$DIR/server.js" ]; then
  echo -e "${RED}Error: TermuX Hub not found at $DIR${NC}"
  echo "Run setup.sh first: bash setup.sh"
  exit 1
fi

# ---- Stop existing server ----
if [ -f "$PIDFILE" ]; then
  OLD_PID=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo -e "${YELLOW}Stopping existing server (PID $OLD_PID)...${NC}"
    kill "$OLD_PID" 2>/dev/null
    sleep 2
    # Force kill if still running
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null
      sleep 1
    fi
  fi
  rm -f "$PIDFILE"
fi

# Also kill any orphan node server.js processes
pkill -f "node server.js" 2>/dev/null || true
sleep 1

# ---- Check dependencies ----
echo -e "${CYAN}Checking dependencies...${NC}"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}Error: Node.js not found. Run: pkg install nodejs${NC}"
  exit 1
fi

if [ ! -s "$DIR/cert.pem" ] || [ ! -s "$DIR/key.pem" ]; then
  echo -e "${YELLOW}TLS certificate missing. Generating...${NC}"
  bash "$DIR/setup.sh" 2>/dev/null || {
    echo -e "${RED}Failed to generate TLS certificate${NC}"
    exit 1
  }
fi

if [ ! -s "$DIR/users.json" ]; then
  echo -e "${YELLOW}User database missing. Running setup...${NC}"
  bash "$DIR/setup.sh" 2>/dev/null || {
    echo -e "${RED}Failed to create user database${NC}"
    exit 1
  }
fi

# ---- Start server ----
cd "$DIR"
echo -e "${CYAN}Starting TermuX Hub server...${NC}"

nohup node server.js >> "$LOG" 2>&1 </dev/null &
SERVER_PID=$!
echo "$SERVER_PID" > "$PIDFILE"

# ---- Wait and verify ----
echo -n "Waiting for server"
WAIT=0
MAX_WAIT=40

while [ $WAIT -lt $MAX_WAIT ]; do
  sleep 1
  WAIT=$((WAIT + 1))
  echo -n "."

  # Check if process is still alive
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo -e "${RED}Server crashed during startup!${NC}"
    echo -e "Last 10 lines of log:"
    tail -10 "$LOG" 2>/dev/null
    rm -f "$PIDFILE"
    exit 1
  fi

  # Try to connect
  if curl -sk "https://localhost:8900/api/health" >/dev/null 2>&1; then
    echo ""
    echo ""

    # Get server info
    IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "UNKNOWN")
    PORT=$(node -e "try{const c=require('./config.json');console.log(c.port||8900)}catch(e){console.log(8900)}" 2>/dev/null || echo "8900")

    echo -e "${GREEN}┌─────────────────────────────────────┐"
    echo -e "│    TermuX Hub is running! 🚀       │"
    echo -e "└─────────────────────────────────────┘${NC}"
    echo ""
    echo -e "  ${CYAN}PID:${NC}       $SERVER_PID"
    echo -e "  ${CYAN}Log:${NC}       $LOG"
    echo -e "  ${CYAN}Local:${NC}     https://localhost:${PORT}"
    echo -e "  ${CYAN}Network:${NC}   https://${IP}:${PORT}"
    echo ""
    echo -e "  Login: ${YELLOW}admin${NC} / ${YELLOW}admin${NC}"
    echo ""
    exit 0
  fi
done

# ---- Timeout ----
echo ""
echo -e "${YELLOW}Server started but health check timed out (${MAX_WAIT}s)${NC}"
echo -e "The server may still be loading (FDroid index download can take 20-30s)."
echo ""
echo -e "  Check status: ${CYAN}curl -sk https://localhost:8900/api/health${NC}"
echo -e "  View logs:    ${CYAN}tail -f $LOG${NC}"
echo -e "  Stop server:  ${CYAN}kill $SERVER_PID${NC}"
echo ""
echo -e "  PID: $SERVER_PID"
