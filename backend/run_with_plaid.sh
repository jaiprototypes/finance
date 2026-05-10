#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env.plaid"
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

: "${PLAID_CLIENT_ID:=}"
: "${PLAID_SECRET:=}"
: "${PLAID_ENV:=sandbox}"
: "${BACKEND_PORT:=8123}"

if [ -z "$PLAID_CLIENT_ID" ] || [ -z "$PLAID_SECRET" ]; then
  echo "PLAID_CLIENT_ID and PLAID_SECRET are required. Copy backend/.env.plaid.example to backend/.env.plaid, fill it locally, or export them."
  exit 1
fi

python3 -m venv "$BACKEND_VENV"
"$BACKEND_VENV/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements.txt"

PLAID_CLIENT_ID="$PLAID_CLIENT_ID" \
PLAID_SECRET="$PLAID_SECRET" \
PLAID_ENV="$PLAID_ENV" \
BACKEND_PORT="$BACKEND_PORT" \
"$BACKEND_VENV/bin/python" "$ROOT_DIR/backend/main.py"
