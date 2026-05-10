#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 -m venv backend/.venv-build
source backend/.venv-build/bin/activate
python -m pip install --quiet -r backend/requirements.txt pyinstaller

rm -rf dist/backend

python -m PyInstaller \
  --name backend \
  --onedir \
  --clean \
  --paths "$ROOT_DIR" \
  --collect-submodules backend.app \
  --collect-submodules passlib.handlers \
  --collect-submodules argon2 \
  --hidden-import backend.app.main \
  --hidden-import passlib.handlers.argon2 \
  --hidden-import argon2 \
  --hidden-import argon2.low_level \
  --add-data "$ROOT_DIR/backend/app/migrations/sql:app/migrations/sql" \
  --add-data "$ROOT_DIR/backend/app/assets:app/assets" \
  --distpath "$ROOT_DIR/dist" \
  backend/main.py

mkdir -p apps/desktop/src-tauri/resources
rm -rf apps/desktop/src-tauri/resources/backend
cp -R dist/backend apps/desktop/src-tauri/resources/backend
chmod +x apps/desktop/src-tauri/resources/backend/backend
