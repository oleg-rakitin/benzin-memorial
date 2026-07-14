#!/bin/bash
APP_DIR="$HOME/benzinopedia-backend"
PID_FILE="$APP_DIR/backend.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")"
  echo "Backend остановлен (pid $(cat "$PID_FILE"))"
  rm -f "$PID_FILE"
else
  echo "Backend не запущен"
fi
