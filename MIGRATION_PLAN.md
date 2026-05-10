# Migration Plan (Debt Management -> Finances Desktop)

## Current repo snapshot
- **Purpose**: Streamlit app for FX-aware debt planning.
- **Backend/UI**: Single Streamlit app (`app.py`).
- **FX logic**: `engine.py` (classifier + recommend), `fx.py` (RBA ingestion).
- **Data**: SQLite (`app_data.db`) via `storage.py`.
- **Auth**: None.
- **DB usage**: Raw sqlite3 + ad-hoc schema creation in `storage.py`.

## What will be reused
- FX ingestion logic from `fx.py`.
- FX classifier + recommendation logic from `engine.py`.
- Debt/loan concepts for payoff planning (ported into a shared module).

## What will be replaced
- Streamlit UI (replaced by Tauri + React desktop app).
- Ad-hoc sqlite schema (replaced by structured migrations + models).
- Single-file entrypoints (replaced by FastAPI backend + desktop shell).

## Target structure
- `/apps/desktop`: Tauri v2 + React + TypeScript UI.
- `/backend`: FastAPI service bundled into the app via PyInstaller.
- `/shared`: Domain logic (FX, debt payoff, timesheets, import utilities).
- `/legacy`: Original Streamlit app retained for reference.

## Migration steps
1) Create new scaffold in `/apps/desktop`, `/backend`, `/shared`.
2) Port FX logic into `/shared/fx` and wire into backend.
3) Implement core data models + migrations + services.
4) Build desktop shell with routing, settings, diagnostics, and demo data.
5) Add build scripts for macOS .app (and optional .dmg).
6) Move existing Streamlit app into `/legacy`.

