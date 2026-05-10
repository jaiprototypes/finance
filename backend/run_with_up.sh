#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env.up"
LOCAL_AI_ENV_FILE="$ROOT_DIR/backend/.env.local_ai"
BACKEND_VENV="$ROOT_DIR/backend/.venv"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi
if [ -f "$LOCAL_AI_ENV_FILE" ]; then
  set -a
  . "$LOCAL_AI_ENV_FILE"
  set +a
fi

: "${UP_API_KEY:=}"
: "${BACKEND_PORT:=8123}"

if [ -z "$UP_API_KEY" ]; then
  echo "UP_API_KEY is required. Copy backend/.env.up.example to backend/.env.up, fill it locally, or export it."
  exit 1
fi

python3 -m venv "$BACKEND_VENV"
"$BACKEND_VENV/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements.txt"

UP_API_KEY="$UP_API_KEY" \
BACKEND_PORT="$BACKEND_PORT" \
"$BACKEND_VENV/bin/python" "$ROOT_DIR/backend/main.py"
