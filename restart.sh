#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
# TermuX Hub — Restart Server
# ============================================================

DIR="$HOME/.termux/adminapi"

if [ ! -f "$DIR/server.js" ]; then
  echo "Error: TermuX Hub not found at $DIR"
  echo "Run setup.sh first"
  exit 1
fi

echo "Restarting TermuX Hub..."
bash "$DIR/start.sh"
