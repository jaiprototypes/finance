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

## Budget Running Totals

The summary and batteries use dated available bank balances. Money received and
paid exclude proven transfers between the included personal cash accounts,
including roundups and savings withdrawals. Posting-date or currency differences
are a separate signed adjustment: opening cash plus money received minus money
paid or reserved plus that adjustment equals cash left. Savings accounts are
included. Borrowing, business-to-personal funding, cash withdrawals and unassigned
external activity remain in cash flows. Transfers involving untracked accounts
are not suppressed just because their category is Transfers.
Native currency bridges use one reference FX rate for both balances and flows.

`cash_flow` in the budget matrix includes account balances, coverage, source
adjustments and monthly bridges. Historical cash is reconstructed only within
continuous feed coverage; missing anchors or metadata yield unavailable balances,
not zero or an invented opening amount. Future cash estimates add only plans not
already received, paid or reserved. Battery fill uses a consistent scale across
the loaded calendars, including months outside the six-month window.

The summary shows reconciled cash without a separate income-minus-spending
comparison. Refunds reduce their expense category. Unpaid returns cancel
paid budget expenses but remain on their actual dates in cash reports.

The Savings row shows net money set aside: owned savings deposits and round-ups
are positive; withdrawals back to spending are negative. Read-only Round-ups,
Savings Deposits and Savings Withdrawals subrows use the savings account's bank
leg once, preserving the stored Transfers classification. Embedded purchase
round-ups are not added a second time. Interest and unproven external transfers
are not savings movements. These allocations and Savings plans leave combined
cash unchanged and are excluded from the spending chart. Matrix and drilldown
share the same source and sign policy. Regression checks are in
`test_budget_savings_activity.py` and `test_budget_savings_reporting.py`.

Up purchase amounts stay unchanged. Migration 0022 stores embedded roundup debits,
cashback credits, owned-account relationships and metadata verification time.
Roundups are internal transfers; merchant cashback reduces purchase expenses and
is allocated once across genuine splits. Incremental sync revisits older holds.
Pending reservations reduce available cash but do not become posted expenses.

Blank current and future spending cells offer suggestions once the month's
income targets are entered. Suggestions use up to three recent completed months
with complete feed coverage. Existing plans, posted spending and reservations
are covered first; recommendations fit remaining income and leave unused money
unallocated. Explicit targets, including zero, are preserved. Suggestions stay
outside totals and cash forecasts until accepted, and remain drafts until
`Save all cells`. Future years reuse real completed history.

Open budgets refresh on a calendar-month change and when the app wakes or regains
focus. Recommendations use the newly completed history, and closed months lock
to actuals. Only unsaved plan edits survive refreshes; updated saved targets and
fresh actuals replace cached values. Earlier-year drafts carry forward only their
remaining amounts, with no duplicate receipts, pending reservations or savings
allocations. The six-month window does not reset the full-year cash timeline.
The window continues across December into January one month at a time. It loads
the adjacent calendar when needed, carries cash continuously, and saves edited
cells in both loaded years. The year shown beside the slider identifies the
January–December annual totals. A view following the current month slides just
enough to keep a newly arrived month visible; historical and future browsing
stay where the user placed them. Cross-year reports use matching bank and FX
snapshots so loading a second year cannot introduce a balance jump.
Native slider input updates columns during dragging. Loading the adjacent year
keeps month navigation active while editing and saving still wait for the data.
Verify an actual native thumb drag across December while the next-year request
is delayed, in addition to arrow-button and programmatic window checks.

Run `npm run test:budget` in `apps/desktop` for the reusable timeline and
suggestion tests. Backend suggestion history checks are in
`test_budget_suggestion_history.py`.
Backend cash and source checks are in `test_bank_cashflow.py`,
`test_bank_activity_expenses.py`, `test_up_cash_metadata.py` and
`test_owned_transfer_evidence.py`, `test_internal_cash_transfers.py` and
`test_cashflow_transfer_reporting.py`.

## Local Classification Agent

New bank and CSV imports use explicit rules, confirmed merchant groups, and a local
agent trained from reviewed corrections. Training keeps account, currency, and
payment direction separate. Conflicting examples require review. One-off family
support corrections do not become merchant-wide rules.

- `GET /api/v1/classify/agent/status` reports training and rule health.
- `POST /api/v1/classify/agent/train` rebuilds the local model from reviewed labels.
- `GET /api/v1/classify/agent/audit` lists conflicting rules, invalid targets, and
  missing merchant subcategories without changing saved transactions.

Training is stored in the local database and requires no model download or cloud
service. Existing reviewed transactions are not automatically rewritten.

PayPal bank references alone do not establish family support or a credit
repayment. Reviewed debt rules retain PayPal repayment details, while purchases
keep their merchant category; unidentified purchase-related flows require review.
Food details use confirmed merchant rules and bank/MCC evidence. YHA food bands
use AUD amounts and are excluded from merchant-wide training. The confirmed
`MS* SYDNEYHARBOURYHA` and `MS* SYDNEYCENTRALYHA` hotel descriptors override
food bands; their charges and refunds share Travel & Transport / Hotels.
Travel & Transport is the shared parent for accommodation and transport, with
Hotels and Public Transport kept as separate details. Migration 0024 renames the
existing category in place, preserving its ID, classifications and saved plans.
Legacy Transport and Travel imports still resolve to the same budget bucket.
The backend bundle places SQL migrations beside the imported
`backend.app.migrations.runner` module, under `backend/app/migrations/sql`.
Verify schema upgrades against the bundled executable as well as source tests.

Confirmed `PLATINUM STAFFIN` / `PLATINUM STAFFING`, `IronMerge People` and
`BREIGHT PL` / `Breight Pty Ltd` wage receipts use Income in personal accounts, ahead of stale
profile and learned Business labels. Confirmed employers default to Wages after
preserving any reviewed custom income detail. This rule
does not classify outgoing payments or create a merchant-wide Income profile.
The rule audit also detects stale wage categories and Business classifications.
Run `backend/.venv/bin/python -m pytest backend/tests/test_employer_wages.py` for
the direction, account, precedence and audit regressions.

Standard return matching uses the short bank-return window. The optional legacy
`irs_return_timing=previous_month` setting prioritizes a unique IRS debit in the
preceding calendar month; this is an inference, not an ACH original-payment
link. The corrected local timing preference is `standard`. Ambiguous matches
are reported by the rule audit.

Individual confirmations in `confirmed_payment_return_pairs` take precedence over
that timing convention. `ConfirmedPaymentReturns.confirm` saves the reviewed
payment/credit IDs and note after validating the same account/currency, equal
opposite amounts, date order and absence of standalone fees. Both transactions
are reserved before automatic matching. Reviewed July, August and September IRS
credits cancel their same-day rejected payments; May and June remain paid.
Invalid or conflicting identifiable confirmations remain reserved and appear in
the rule audit. An unreadable setting produces a diagnostic without disabling
unrelated automatic matching. Bank cash, original transactions/splits and saved
plans remain unchanged. Run
`backend/.venv/bin/python -m pytest backend/tests/test_confirmed_payment_returns.py`
for the persistence, exclusion, cash-conservation and diagnostic regressions.

Confirmed `UBER AUSTRALIA P PURCHASE` and `UBER AUSTRALIA P RETRY PYMT` credits are unpaid-payment returns only
when a unique earlier or same-day debit has the same normalized ACH reference,
account, currency and amount. Their failed pair is excluded from budget actuals;
bank cash retains both original movements. Other Uber purchases and genuine
hotel/travel refunds stay independent, and separately posted fees stay visible.

## Constraints To Preserve

- no permanent cloud dependency for core workflows
- no multi-tenant assumptions
- no AI-owned accounting truth
- no scope expansion into enterprise accounting software

### Up saver replacement and retained history

Up account refreshes read every provider page before reconciling account status.
Accounts absent from a successful complete snapshot are marked inactive in both
provider mappings and the account list; their transactions, splits, learned
classification evidence and old balance observations remain stored. A replacement
saver receives a separate identity. Returning provider IDs reactivate their
original account. Transaction refreshes request only current accounts, including
when called outside the connector router.

Historical savings projections retain archived provider ownership links. Current
cash excludes archived accounts and their stale balances. Reviewed historical
spending remains available to budget recommendation baselines; the existing
complete-coverage checks still apply, including to newly connected accounts.
Account closure does not establish missing final transactions or a zero balance.

Regression checks:

```sh
backend/.venv/bin/python -m pytest backend/tests/test_up_account_lifecycle.py backend/tests/test_budget_savings_activity.py backend/tests/test_budget_suggestion_history.py -q
```

The lifecycle suite covers replacement, reactivation, pagination, provider page
failure, preserved original records, and importing the 5 November wage while
skipping the deleted saver.

### Cash left during planning and month rollover

The current-month battery and summary center display bank available cash plus
remaining planned income minus remaining unpaid/unreserved expenses. They update
with draft edits. Future months carry those remaining plans forward. Completed
months use recorded bank cash; unfulfilled plans expire on rollover rather than
remaining in later projections. The summary lists bank available cash separately.
Savings allocations remain neutral to combined cash. Forecasts reconcile to bank
observations after refresh; they do not guarantee that actual spending will follow
the original plan. `budgetCashTimeline.test.mjs` covers edits and rollover.

### Net savings when a saver is deleted

Savings activity uses deposits + round-ups - withdrawals. The Net saved
subheader inside the Savings cells shows balances held in active connected
personal savers, regardless of subrow expansion. The current month uses observed saver balances, completed
months use reconstructed balances, and future balances remain unavailable. The
annual column is the latest balance, never a sum. Plan inputs remain separate.

`SavingsFallbackActivity` recovers missing saver legs from provider-linked
checking records: exact transfer-from names matching a unique archived personal
saver prove withdrawals; Up embedded round-up amounts prove savings sweeps.
Existing dated native saver legs take precedence and are consumed one-to-one,
scoped by checking account, saver identity for withdrawals, currency and amount.
Generic category labels or ambiguous saver names are insufficient. Fallbacks
are virtual allocations with the original source transaction ID and amount;
merchant purchases remain in their expense categories and bank data is untouched.

Regression coverage checks deleted-saver receipts, later availability of the
original saver leg, repeated equal round-ups, ambiguous names, matrix/drilldown
agreement, and preservation of original classifications and purchase spending.
