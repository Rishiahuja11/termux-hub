#!/data/data/com.termux/files/usr/bin/bash
# Start the admin API server (detached, persistent)
export PATH=$PREFIX/bin:/data/data/com.termux/files/usr/bin:/usr/bin:$PATH

DIR=~/.termux/adminapi
LOG="$DIR/server.log"
PIDFILE="$DIR/server.pid"

source /data/data/com.termux/files/usr/bin/env 2>/dev/null

# stop existing
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")" 2>/dev/null
  sleep 1
fi

cd "$DIR"
nohup node server.js >"$LOG" 2>&1 </dev/null &
echo $! > "$PIDFILE"
sleep 2
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "adminapi started (pid $(cat "$PIDFILE"))"
else
  echo "adminapi failed to start. See $LOG"
fi
