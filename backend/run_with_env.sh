#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_VENV="$ROOT_DIR/backend/.venv"

load_env_file() {
  env_file="$1"
  if [ -f "$env_file" ]; then
    set -a
    . "$env_file"
    set +a
  fi
}

load_env_file "$ROOT_DIR/backend/.env.local_ai"
load_env_file "$ROOT_DIR/backend/.env.plaid"
load_env_file "$ROOT_DIR/backend/.env.up"

: "${BACKEND_HOST:=127.0.0.1}"
: "${BACKEND_PORT:=8123}"

export BACKEND_HOST
export BACKEND_PORT

python3 -m venv "$BACKEND_VENV"
"$BACKEND_VENV/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements.txt"

exec "$BACKEND_VENV/bin/python" "$ROOT_DIR/backend/main.py"
