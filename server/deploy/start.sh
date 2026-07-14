#!/bin/bash
# Запуск/перезапуск backend'а на сервере без Docker (нет root, чтобы поднять
# демон Docker — см. README.md). Идемпотентно: если процесс уже запущен,
# ничего не делает; иначе перезапускает.
set -e

APP_DIR="$HOME/benzinopedia-backend"
BIN="$APP_DIR/benzinopedia-backend"
ENV_FILE="$APP_DIR/.env"
LOG_FILE="$APP_DIR/backend.log"
PID_FILE="$APP_DIR/backend.pid"

cd "$APP_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Backend уже запущен, pid $(cat "$PID_FILE")"
  exit 0
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

nohup "$BIN" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Backend запущен, pid $(cat "$PID_FILE")"
