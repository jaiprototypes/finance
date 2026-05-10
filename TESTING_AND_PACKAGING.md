# Testing And Packaging

## Terminal Workflow

### Backend Setup

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt pytest
```

### Run Backend

```bash
backend/run_with_env.sh
```

Optional local AI settings can be copied from `backend/.env.local_ai.example` into a local, ignored `backend/.env.local_ai`.

### Targeted Test Pass

```bash
backend/.venv/bin/python -m pytest \
  backend/tests/test_archived_invoices.py \
  backend/tests/test_local_ai_assistant.py \
  backend/tests/test_llm_defaults.py \
  backend/tests/test_category_taxonomy.py \
  backend/tests/test_classification_transfers.py \
  backend/tests/test_currency_budgeting.py \
  backend/tests/test_invoice_payment.py \
  backend/tests/test_payoff.py \
  backend/tests/test_auto_classify_ingest.py
```

### Terminal Smoke Tests

Assuming the backend is running on `127.0.0.1:8123`:

```bash
scripts/smoke_local_finance.sh
```

Equivalent raw calls:

```bash
curl http://127.0.0.1:8123/health
curl http://127.0.0.1:8123/assistant/status
curl -X POST http://127.0.0.1:8123/assistant/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"rent","limit":5}'
curl "http://127.0.0.1:8123/assistant/budget-variance?month=$(date +%Y-%m)"
curl "http://127.0.0.1:8123/assistant/debts?strategy=avalanche&extra_payment=50"
```

Expected behavior:

- deterministic grounding is always returned
- commentary appears only when local AI is enabled and reachable
- core finance endpoints continue working even if the assistant is disabled or unavailable

## Browser Manual QA

### Development Start

```bash
make dev
```

Or run backend and frontend separately:

```bash
backend/run_with_env.sh
cd apps/desktop
npm install
npm run dev
```

### Manual QA Checklist

1. Open the desktop UI or browser dev build.
2. Confirm the backend-ready banner clears and the dashboard loads.
3. Open `Control Room` and verify the `Local AI assistant` section shows:
   - local enable toggle
   - loopback base URL
   - local model
   - timeout
4. Confirm the copy states that AI does not own balances, budgets, debt math, or invoice totals.
5. Review Transactions:
   - create or import a sample transaction
   - verify deterministic categorization still applies
6. Review Budgets:
   - open the budget matrix
   - confirm no regressions in totals or save flow
7. Review Debt Lab:
   - create or edit a debt profile
   - confirm payoff schedule still calculates deterministically
8. Review Invoicing:
   - create a live invoice
   - confirm subtotal and total math remain correct
   - upload a historical invoice PDF in `Business`
   - confirm blank metadata fields are auto-filled when the PDF contains extractable data
   - confirm the uploaded document appears in the historical invoice workspace and downloads correctly
   - edit the historical invoice metadata and confirm the save sticks after refresh
   - link a suggested receipt to the historical invoice and confirm paid/balance figures update deterministically
9. Review Projects + Time:
   - create a time entry
   - confirm hours and invoice-from-time flow still behave

## Business Bootstrap Helpers

Seed the company profile used by invoice PDFs:

```bash
backend/.venv/bin/python scripts/bootstrap_company_profile.py --help
```

Import archived invoice PDFs from local folders:

```bash
backend/.venv/bin/python scripts/import_business_history.py --help
```

Merge duplicate client records after imports:

```bash
backend/.venv/bin/python scripts/merge_clients.py --help
```

## Desktop Packaging Notes

- The app is designed for Tauri desktop packaging with a bundled FastAPI backend.
- Core finance features must not depend on cloud hosting.
- Local AI is expected to use a loopback service configured through `local_ai.env` or app settings.
- Connector features remain optional; CSV import remains the safe fallback.
- Desktop builds should continue bundling:
  - backend binary
  - empty `plaid.env`, `up.env`, and `local_ai.env` templates only

Real connector credentials belong in the per-user app data folder or exported environment variables, not in the app bundle.

## Packaging Commands

```bash
scripts/build_backend.sh
cd apps/desktop
npm install
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

## Constraints To Preserve

- no permanent cloud dependency for core workflows
- no multi-tenant assumptions
- no AI-owned accounting truth
- no scope expansion into enterprise accounting software
