#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# TermuX Hub — Install as Termux Service (sv)
# After running: sv start termux-hub / sv stop termux-hub
# ============================================================

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

SVC_DIR="$HOME/.termux/services/termux-hub"

echo -e "${CYAN}Setting up TermuX Hub as a Termux service...${NC}"

mkdir -p "$SVC_DIR"

cat > "$SVC_DIR/run" << 'RUNEOF'
#!/data/data/com.termux/files/usr/bin/bash
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
export PATH=$PREFIX/bin:$PATH
cd $HOME/.termux/adminapi
exec node server.js 2>&1
RUNEOF

chmod +x "$SVC_DIR/run"

echo -e "${GREEN}Service installed!${NC}"
echo ""
echo "  Start:   sv start termux-hub"
echo "  Stop:    sv stop termux-hub"
echo "  Status:  sv status termux-hub"
echo "  Restart: sv restart termux-hub"
echo ""
echo "  Logs:    tail -f ~/.termux/adminapi/server.log"
