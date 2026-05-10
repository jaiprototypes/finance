# Finances (Local-First Desktop)

A local-first macOS desktop app for personal + sole-trader finances: accounts, transactions, budgets, business invoicing, debt planning, FX optimization, timesheets, and a grounded local AI assistant layer. Runs offline and stores all data on-device.

## Governance Docs

- Scope and architecture guardrails: `ARCHITECTURE_GUARDRAILS.md`
- Audit findings and cleanup priorities: `AUDIT_REPORT.md`
- Implementation sequence: `IMPLEMENTATION_PLAN.md`
- Terminal QA, browser QA, and desktop packaging notes: `TESTING_AND_PACKAGING.md`
- Day-to-day business workflow and import helpers: `BUSINESS_WORKFLOW.md`

## Architecture
- Desktop shell: Tauri v2 + React + TypeScript (`apps/desktop`).
- Local backend: FastAPI (`backend`) bundled into the app via PyInstaller.
- Domain logic: Shared modules (`shared`) for FX, debt planning, and timesheets.
- Local AI assistant: optional loopback service for grounded categorization help, summaries, and retrieval.
- Database: SQLite at `~/Library/Application Support/Finances/finance.db`.
- Logging: JSON logs at `~/Library/Application Support/Finances/logs/`.

## Modules (MVP)
- Personal finance: accounts, transactions, budgeting, net worth.
- Business finance: clients, live invoices, archived invoice PDFs, receipts, basic P&L.
- Debt management: avalanche/snowball payoff scenarios.
- FX optimizer: AUD/USD rates + timing recommendations.
- Timesheets: projects, tasks, timer, invoicing from time.
- Local AI assistant: privacy-preserving commentary grounded in stored records only.

FX recommendations are informational only. Not financial advice.
AI suggestions are advisory only and are never the source of truth for balances, budgets, debt math, or invoice totals.

## Development

### Private configuration
Runtime secrets and personal finance data must stay outside the public source tree.

- Copy `backend/.env.plaid.example` to `backend/.env.plaid` for local Plaid development.
- Copy `backend/.env.up.example` to `backend/.env.up` for local Up Bank development.
- Copy `backend/.env.local_ai.example` to `backend/.env.local_ai` only when local-AI overrides are needed.
- The desktop app reads private runtime env files from the app data folder: `~/Library/Application Support/Finances/plaid.env`, `~/Library/Application Support/Finances/up.env`, and `~/Library/Application Support/Finances/local_ai.env`.

The build only bundles empty templates. Do not commit real API keys, bank tokens, exported statements, SQLite databases, invoices, receipts, logs, or generated app bundles.

### Backend
```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/run_with_env.sh
```

Optional local-AI defaults can be set in a local, ignored `backend/.env.local_ai`.

### Desktop UI
```bash
cd apps/desktop
npm install
npm run dev
```

### Business bootstrap
```bash
backend/.venv/bin/python scripts/bootstrap_company_profile.py --help
backend/.venv/bin/python scripts/import_business_history.py --help
backend/.venv/bin/python scripts/merge_clients.py --help
```

### One-command dev
```bash
make dev
```

## macOS build (.app)

1) Build backend binary and copy into Tauri resources:
```bash
scripts/build_backend.sh
```

2) Build desktop app:
```bash
cd apps/desktop
npm install
npm run build
npm run tauri build
```

Output will be a `.app` bundle under `apps/desktop/src-tauri/target/release/bundle/macos/`.

### Optional DMG packaging
Use `create-dmg` or `appdmg` on the `.app` bundle:
```bash
brew install create-dmg
create-dmg \
  --volname "Finances" \
  --app-drop-link 400 200 \
  "Finances.dmg" \
  "apps/desktop/src-tauri/target/release/bundle/macos/Finances.app"
```

## Data storage, backup, restore
- Primary DB: `~/Library/Application Support/Finances/finance.db`
- Uploads: `~/Library/Application Support/Finances/uploads/`
- Backups: `~/Library/Application Support/Finances/backups/`
- Logs: `~/Library/Application Support/Finances/logs/`

To back up, copy the `finance.db` file (and uploads if needed). To restore, replace the DB file and restart the app.

## Bank connectors
Bank-linking connectors are optional. CSV import remains the primary and most reliable import path.

Plaid and Up Bank are disabled until private credentials are provided through local env files or exported environment variables. Public builds intentionally do not contain connector credentials.

## Legacy
The original Streamlit debt planner is in `legacy/streamlit_debt_planner` for reference.

## Tests
```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt pytest
backend/.venv/bin/python -m pytest backend/tests
```

For the focused local-AI and desktop workflow checks, see `TESTING_AND_PACKAGING.md`.
