#!/data/data/com.termux/files/usr/bin/bash
# Source the full shell environment and export it
source ~/.bashrc 2>/dev/null || true
source ~/.profile 2>/dev/null || true
source ~/.bash_profile 2>/dev/null || true
export HOME="$HOME"
export PATH="$HOME/.termux/usr/bin:$PATH"
export PREFIX="/data/data/com.termux/files/usr"
export TMPDIR="$HOME/.termux/tmp"
export LANG="en_US.UTF-8"
export TMPDIR="$HOME/.termux/tmp"

API_DIR="$HOME/.termux/adminapi"
cd "$API_DIR"

# Kill old server
OLD_PID=$(cat server.pid 2>/dev/null || echo "")
if [ -n "$OLD_PID" ]; then
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$OLD_PID" 2>/dev/null || true
fi
pkill -9 -f "node.*server.js" 2>/dev/null || true
sleep 2

# Start new server with exported environment
env -i HOME="$HOME" PATH="$HOME/.termux/usr/bin:/data/data/com.termux/files/usr/bin" SHELL="$HOME/.termux/usr/bin/bash" PREFIX="/data/data/com.termux/files/usr" TMPDIR="$HOME/.termux/tmp" TERM="xterm-256color" LD_LIBRARY_PATH="/data/data/com.termux/files/usr/lib" nohup node server.js >> server.log 2>&1 &
echo $! > server.pid
sleep 4

PID=$(cat server.pid)
if kill -0 "$PID" 2>/dev/null; then
  echo "SUCCESS: Server running PID=$PID"
  tail -3 server.log
else
  echo "FAILED"
  tail -20 server.log
fi
