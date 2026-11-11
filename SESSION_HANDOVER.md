# Finances / budget context handover

Last updated: **07 November 2026, 20:15:49 AWST (UTC+08:00) — Australia/Perth**.
This document is a continuation aid; the user's next request determines the next task.

## Latest session — cell dates and future planning

Stamped: **07 November 2026, 20:15:49 AWST (UTC+08:00) — Australia/Perth**.

**Next-session context prompt:** You are a talented finance professional trying to automate budgeting by combining per-cell entries for today, tomorrow and future months with previous spending trends, so budgeting is easy, fast and aware of future commitments.

These notes supersede older forecast, navigation and recommendation behavior below.

- **User intent:** enter income and fixed costs, plus large future costs such as January housing and April visa expenses. Guide current spending so those costs remain affordable. There is no dedicated savings pot attached to a category; monthly **cash left is the ground truth**. Positive cash carries forward once across the shared plan. Do not sum overlapping shortfalls or credit the same cash independently to every category.
- **Monthly default:** undated cells use monthly income/expense cash forecasts. Do not assume all monthly expenses are due on the first. That incorrect assumption previously produced a $305.52 December shortfall despite positive December month-end cash; it was removed from both the guide and spending allowances.
- **Recommendations:** if later explicit expense targets exist, blank expense cells offer **Fits future plan / Up to [amount] monthly total**. Income, existing plans, actuals, pending commitments and the minimum later cash headroom constrain the shared allowance. History distributes it by recent unmet spending proportions; without history it starts equally across blank categories. With no later targets, fall back to the last three covered completed months, capped by affordability. Zero headroom can recommend zero; unavailable cash must not establish affordability. Acceptance recomputes the latest whole model so repeated accepts do not reuse headroom. Explicit zero targets remain protected.
- **Inputs:** drafts recalculate immediately. Zero is an explicit target; blank removes a target and falls back to actuals for presentation. Neither zero nor blank erases recorded payments or pending bank reservations. Save all cells persists amount drafts.
- **New per-cell popup:** editable amount cells have **Set date** (enter an amount first). Expense cells use Payment due date; income cells use Expected income date. One optional date applies to the remaining amount of that entire cell and must fall within its month. **Save cell saves that amount and date immediately**, retaining other unsaved amount drafts. Clear date + Save cell restores monthly treatment. Past months remain locked. Save all cells preserves already-saved dates; clearing/deleting a target deletes its metadata too.
- **Date-aware cash:** `BudgetCashSchedule` starts from observed bank cash for the current month and prior forecast cash for future months, preserving monthly cash reconciliation. Only unpaid/unreserved amounts become events. Dated income and expenses are grouped by date; undated expenses are reserved before dated bills, and undated income counts at month end. If an undated income date could resolve an early bill's gap, show **Set income dates to check bills before payday**, not a definitive impossible claim. Same-day flows are netted; intraday bank processing order is not modeled. Outstanding past-due dates are checked today. Clearing dates leaves original month-end results unchanged.
- **Guidance:** the guide shows month-end cash plus a separate Payment dates you set table. Known deficits show **Not achievable with the current plan** and the extra income/spending reduction needed from tomorrow. Weekly/monthly rates are alternatives and exclude today. Unknown cash or uncertain income timing blocks confident coverage and new spending allowances. There is no invented payday and no second expense added for a supposed savings contribution.
- **Navigation/presentation:** slider sits directly above the month table. Its two blue arrows move one month, including across years; the year field has no blue year arrows. Next year's report loads independently of the visible window. Trend lines/averages use visible months. Muted text is now opaque `#4b6078`. Category future-cost lists collapse by default; the main guide uses readable cash coverage tables.

### Implementation pointers

- `apps/desktop/src/features/budgets/components/BudgetCellSchedule.tsx`: native accessible dialog, date limits, save/clear/cancel and error display.
- `apps/desktop/src/features/budgets/hooks/useBudgetsWorkspace.tsx`: save one amount/date, preserve unrelated drafts and reload the paired reports; `useBudgetSavingDate.ts` refreshes the local calendar day for the whole workspace.
- `apps/desktop/src/features/budgets/domain/BudgetCashTimeline.ts`: monthly forecast, `BudgetCashSchedule` and cash-constrained spending allowances. `BudgetTargetPace.ts` combines monthly and explicit-date checkpoints into one adjustment.
- `apps/desktop/src/features/budgets/domain/BudgetSuggestions.ts` and `hooks/budgetMatrixModel.ts`: future-plan priority/history fallback and safe candidate allocation. `BudgetMatrixPeriod.ts` carries date maps across years.
- Backend: nullable `budget_bucket_target.due_date`; migration `0025_budget_cell_due_dates.sql`. Schemas validate calendar dates; routes validate matching months, preserve dates when older clients omit the field, and support explicit null to clear. Reports and prior plan context expose `due_date` maps.

### Validation and packaged state at this stamp

- TypeScript, Vite production build, all **76 existing budget checks**, backend PyInstaller build and Tauri packaging passed.
- Inline, unsaved checks covered early/late/missing payday dates, clearing dates, undated expense reservations, actual/pending offsets, same-day flows, month carry, leap-day bounds, popup rendering, cross-year date merging, existing-target migration preservation, date validation and save/clear/report round-trips in an in-memory database.
- Restarted the packaged app and verified `/health`. Read-only live `GET /api/v1/reports/budget-matrix?year=2027` returned date maps for all 10 categories; the nullable-column migration is shipped inside the backend bundle. No live budget amounts or dates were written during validation. Popup rendering was checked programmatically; a live manual date-entry workflow has not been exercised.
- Full app path: `apps/desktop/src-tauri/target/release/bundle/macos/Finances.app`. Backend changes require `bash scripts/build_backend.sh`, then frontend build and `npm run tauri build`. Wait for both old app and backend to exit before reopening.
- The user requests **no saved test files**. New checks ran inline; temporary validation/build logs were removed. Existing test files were retained. No commit or push was performed; preserve the pre-existing dirty workspace.

## Read first — final decisions for the next session

These decisions supersede intermediate interpretations and older verification
counts farther down this document. The user is ending a long session; read this
section before proposing further work.

- **Net saved means the total balance in all active connected personal savers.**
  It is not deposits minus withdrawals and is not limited to one named saver.
  The last verified November balance was **A$249** in Home deposit (account 38).
  This is a dated observation, not a fresh bank refresh at handover time.
- **Presentation:** Net saved is a subheader inside the existing Savings row,
  with balances beneath the monthly plan/actual in the same cells. No standalone
  Net saved row/card. Annual cell shows **Latest saved**, never a sum of monthly
  balances. Future actual balances and unknown balances show unavailable.
  Current component: `apps/desktop/src/features/budgets/components/BudgetNetSavings.tsx`.
  The superseded `BudgetNetSavingsRow.tsx` has been removed.
- **Savings activity stays separate:** round-ups, deposits and withdrawals remain
  historical detail rows. November activity is A$20.25 + A$232.60 - A$306.44 =
  **-A$53.59 net movement**; that is not the Net saved balance. October activity
  is A$227.27. Do not confuse activity with money currently held in savers again.
- **Deleted saver:** account 33 is inactive. Keep its historical transactions,
  classifications and recommendation evidence; exclude its stale balance from
  current cash/saver balances. Do not merge it into Home deposit or erase it.
- **Cash left follows plans:** current/future months use available bank cash
  plus remaining planned income minus unpaid/unreserved planned expenses.
  It responds to draft edits. Completed months use bank activity; unfulfilled
  plans expire at rollover. Savings allocations are neutral to combined cash.
  Last verified saved-plan November forecast: **A$8.23**, versus **A$610.61**
  actual combined bank cash. These figures are previous checks, not fresh balances.
- **Known unresolved historical cash issue:** reconstruction currently includes
  only active accounts. Archived savers can therefore be omitted from past cash
  totals. This was diagnosed, not fixed. Historical closure reconstruction needs
  dated evidence; do not invent missing final transactions or closing balances.
- **Latest verification:** 915 backend tests and 81 budget tests passed during
  the balance change. After the final layout-only change, 81 budget tests,
  TypeScript and Vite build passed again; the desktop bundle was rebuilt and
  restarted, with backend health verified. No tests, sync, rebuild or financial
  corrections were performed solely to update this handover.
- Existing uncommitted/untracked work is intentional. No commit or push requested.

## Latest CSS discussion and local build workflow

The user opened `apps/desktop/src/styles.css` to adjust the Savings subtitle
color. Net saved uses `.muted` (around line 1416), which reads the global
`--muted` variable near line 7. Changing that variable affects all muted text.

At this handover's read-only source check, the user's current source value is
**`--muted: #7bb0f152;`** (eight-digit hex including alpha). Preserve their edit.
Earlier advice suggested `#7c8fa6`; that suggestion is not the current source.
The running package has not been verified to include the latest user CSS edit.

CSS hot reload applies in Vite development (`npm run dev`). The packaged app
requires a frontend build, desktop packaging, and restart. For CSS-only changes:

```sh
cd "/Users/jwick1/Desktop/J.A.I./Debt management/apps/desktop"
npm run build
npm run tauri build
```

Then quit Finances with Command-Q, wait for the app/backend to exit, and open:

```sh
open "/Users/jwick1/Desktop/J.A.I./Debt management/apps/desktop/src-tauri/target/release/bundle/macos/Finances.app"
```

A Python backend rebuild is unnecessary for CSS-only changes. Backend source
changes still need `bash scripts/build_backend.sh` before desktop packaging.

## Additional reviewed transaction corrections

Applied to individual payments, with audit notes and no broad merchant learning:

| Transaction | Date | Native amount | Final treatment |
| --- | --- | --- | --- |
| 4334 — SMP*Oxford Hub 8 / Hub Hyde Park | 28 Sep 2026 | -A$28.50 | Food / Restaurants, based on user's recollection |
| 4810 — Legacy Barbershop & Salon | 2 Nov 2026 | -A$50.00 | Lifestyle / Personal Care |
| 4802 — BWS LIQUOR 41141 Perth | 4 Nov 2026 | -A$22.00 | Food / Alcohol |

Alcohol detail 77 was created under Food (category 56). Corrected reports were
verified; original bank details, total spending and cash were unchanged by these
reclassifications. Backups exist in the live database's backups directory.

## Latest presentation — Net saved inside Savings

At the user's request, removed the standalone Net saved table row. Net saved is
now a subheader inside the Savings label cell, with the corresponding balance
beneath each monthly plan/actual in the same Savings cells. Latest saved appears
inside the existing annual cell. `BudgetNetSavings.tsx` replaces the superseded
row component. The balance definition and financial calculations are unchanged.

## Authoritative Net saved definition — connected saver balances

The user corrected the interpretation: **Net saved is the amount held in any
saver connected to this application**, not monthly deposits minus withdrawals.
This supersedes the Net saved label/amount interpretation in the following note.
November Net saved is **A$249**, the observed connected Home deposit balance.
The deleted saver is excluded from this current balance. Monthly deposits,
round-ups and withdrawals remain separate historical activity, unchanged.

`LedgerCashflowService` now exposes `savings_balance` and monthly
`savings_closing`, computed in the existing account reconstruction with no
second ledger load. Only active personal savings accounts are included; native
balances convert through the same report FX reference. Unknown saver balances
stay unavailable. `BudgetNetSavings` uses current observed savings for this
month, reconstructed connected-saver balances for completed months, and no
invented actual balances for future months. Its annual column is **Latest**,
never a sum of balances. It no longer opens the transfer-activity drilldown as
though that were a balance breakdown. Savings plan inputs remain unchanged. All 915 backend and 81 budget tests,
TypeScript and Vite build passed. Backend and desktop bundle were rebuilt.

## Earlier savings activity correction — superseded Net saved presentation

The user reported incorrect Net saved figures and that the amount itself was
not displayed. Missing bank-side records from the deleted saver meant November
showed only the new saver's A$249. Checking has A$306.44 of explicitly named
withdrawals from the archived saver and A$3.85 of embedded round-ups without
saver-side records. November savings activity is **-A$53.59**: A$20.25 round-ups
+ A$232.60 deposits - A$306.44 withdrawals. October savings activity is **A$227.27**.

`budgeting/savings_fallbacks.py` uses exact unique archived provider account
names and Up source metadata to recover virtual missing allocations; dated
native saver legs take precedence one-to-one. It never creates bank records or
changes classifications, merchant spending or balances. Source transaction IDs
remain available for read-only drilldowns. The original standalone
`BudgetNetSavingsRow.tsx` presentation was subsequently replaced by the inline
`BudgetNetSavings.tsx` balance display described above.

Live-data source validation verified unchanged cashflow and all non-savings
budget categories. Frontend budget tests (79), TypeScript and Vite build passed;
all **913 backend tests passed**, including missing/duplicate legs and
matrix/detail agreement. Backend and desktop are rebuilt for these source changes.

## Latest UI decision — cash left follows plans

The user clarified that Cash left must update with plans during the current
month, then settle to observed bank activity when the month becomes completed.
`BudgetCashPosition.cashLeft` uses projected closing cash for current/future
months and recorded closing cash for completed months. Past months reset any
inherited plan adjustment. The matrix battery and summary center now follow
this policy; the summary still exposes actual available bank cash separately.
Unreceived income and unpaid/unreserved expenses are counted once; savings
allocations remain neutral to combined cash. Existing rollover/focus refresh
loads fresh bank reports and preserves only dirty drafts.

Verified against the live November report: bank cash A$610.61, cash after plans
A$8.23; a draft A$100 Food increase changes that to -A$91.77 without altering
bank cash or writing financial data. All 79 budget tests, TypeScript and Vite
build passed. A regression test verifies that rollover replaces the completed
month forecast with bank cash and starts the next month's plans without stale
unfulfilled amounts. The desktop bundle was rebuilt for this frontend change.

Known separate historical issue identified during diagnosis: the cash service
currently scopes historical reconstruction to active accounts. Archiving the
old saver therefore excluded its balance from past cash figures even though
its transactions/savings allocations/recommendation inputs were preserved.
This current-month forecast change does not resolve historical account scope;
that needs lifecycle-aware reconstruction and honest handling of the deleted
saver's unavailable final feed. Do not invent closing balances.

## Latest financial correction — 7 November Yasseen returned payment

The user confirmed that the 1 November Yasseen Salih A$100 payment was returned.
Saved an explicit confirmation linking debit **4816** to credit **4813**, both
account 32 / Spending, on 1 November. This is an additional confirmed pair;
the three IRS confirmations below remain unchanged. Both legs are excluded from
budget spending/income without changing their original transactions or splits.
Live November income decreased from A$1,262.31 to A$1,162.31; Housing & Bills
from A$670.06 to A$570.06. Full cashflow, raw transactions and splits verified
unchanged. The successful A$300 payment on 6 November (4791) remains included.
Backup: `backups/finance-before-yasseen-return-20261107-132552.db` in the live
data directory. No source changes or rebuild were needed for this confirmation.

## Latest update — 7 November saver lifecycle and missing income

This update supersedes the earlier account-33/current-cash and data-freshness
notes below. The user confirmed that the old saver was deleted and a new saver
added, and requested preserving historical information for recommendations.

- Up account 33 / Bonus credit card payment is now inactive, with its original
  1,536 transactions and 1,536 splits verified byte-for-byte unchanged via query
  checksums. Its last stored balance is historical and excluded from current cash.
- New saver Home deposit is account 38, separate from account 33. Current personal
  cash accounts are 32, 34 and 38. Current provider balances remain dated observations.
- Fixed Up account inventory reconciliation: read all pages before archiving
  missing accounts; retain all records and ownership links, reactivate returning
  IDs, and sync transactions only for current accounts. Direct transaction sync
  also refreshes inventory, so scheduled/budget refreshes receive the same fix.
- `connectors/up_accounts.py` contains `UpAccountLifecycle`; `up_client.py` loads
  the complete snapshot. Historical `budgeting/savings.py` ownership includes
  archived links so past savings allocations do not disappear.
- Rebuilt backend and desktop bundle, restarted the packaged app, and refreshed
  Up successfully: 1 saver created, 1 archived, 53 transactions added, 2 updated.
- Missing wage is now transaction **4796**, Breight Pty Ltd, **+A$1,162.31** on
  **5 November 2026**, correctly classified **Income / Wages** and visible in the
  live November income drilldown. Provider settlement: 5 November 5:26 pm Perth.
- Live August–October suggestion-history coverage remains true for all three
  months. October savings drilldown retains 89 allocation rows. Account closure
  does not invent inaccessible final transactions or rewrite old observations.
- Saved budget targets and confirmed IRS settings were verified unchanged.
- Full backend suite now **909 passed**. No frontend source changed in this update;
  earlier checks in this session passed 77 budget / 7 debt tests, TypeScript and
  frontend production build. Packaging succeeded; backend health is good.
- Backup: `backups/finance-before-saver-lifecycle-20261107-132217.db` under the
  live data directory. No commit or push requested or performed.

## Start here

- Workspace: `/Users/jwick1/Desktop/J.A.I./Debt management`.
- Local desktop app: React/TypeScript + Tauri, with a packaged Python backend.
- Live database: `/Users/jwick1/Library/Application Support/Finances/finance.db`.
- Backend: `http://127.0.0.1:8123`; health `/health`; API prefix `/api/v1`.
- The user wants changes completed in the actual app, including appropriate
  packaging and live verification. Source edits alone do not update the running
  packaged backend.
- There is extensive intentional **uncommitted and untracked work** across the
  frontend, backend, tests and documentation. Preserve it. No commit or push was
  requested. GitHub username: `jaiprototypes`.
- Latest financial task is complete. This turn only created a handover; it did
  not refresh banks, change financial records, rebuild the app or rerun tests.

## Latest authoritative IRS decision — supersedes earlier conversation

The user initially described IRS returns as following-month events, then
corrected this: **May and June were paid; July, August and September were
rejected and credited on the same day.** Do not restore the earlier timing rule
or match July's credit to June's payment.

Live DB settings and records below were rechecked read-only on 7 November:

- `irs_return_timing = standard`.
- `confirmed_payment_return_pairs` contains the three explicit pairs below,
  with the user's confirmation note and UTC confirmation timestamps.
- Account 34: UW Credit Union Main Checking; native currency USD.
- Original transactions/splits remain intact in Housing & Bills / Tax Payments.
  Budget and spending reports exclude returned pairs through their shared loader.

| Date | Debit ID | Credit ID | Native amount | Treatment |
| --- | --- | --- | --- | --- |
| 27 May 2026 | 4007 | — | US$200 | Paid |
| 29 June 2026 | 4142 | — | US$200 | Paid |
| 27 July 2026 | 4184 | 4185 | US$200 each leg | Same-day rejection; zero paid |
| 27 August 2026 | 4193 | 4192 | US$200 each leg | Same-day rejection; zero paid |
| 28 September 2026 | 4205 | 4204 | US$200 each leg | Same-day rejection; zero paid |

The correction moves the previously counted September payment back to June.
Annual IRS paid total remains **US$400**, across May and June. Bank balances,
raw cash movements, cash batteries, income, annual spending, original bank
amounts/dates, classifications/splits and saved budget plans were verified
unchanged. Live app drilldowns were checked after the 5 November rebuild.

Relevant implementation:

- `backend/app/features/ledger/payment_return_links.py`:
  `ConfirmedPaymentReturns.confirm(session, payment_id=..., return_id=..., note=...)`
  validates and saves JSON confirmations; caller owns commit/rollback.
- `backend/app/features/ledger/payment_reversals.py`: shared matching/exclusion
  and `payment_return_issues`. Explicit pairs reserve both IDs before heuristic
  matching. This also prevents another return from consuming a confirmed debit.
- Validate distinct IDs, account/currency, finite opposite equal-cent amounts,
  chronological order and absence of standalone bank fees. Human confirmations
  may override inferred merchant identity and timing windows.
- Conflicting/stale identifiable claims remain reserved and produce diagnostics;
  do not silently fall back to matching that credit to a different debit.
  An unreadable setting produces a diagnostic without disabling unrelated
  automatic inference.
- `backend/app/core/settings.py`: shared SQL preference getter/writer. Writer
  flushes pending writes, parameterizes an upsert, refreshes any cached ORM
  preference value, and leaves transaction ownership to the caller.
- **Do not import `features.settings.models` into ledger.** Feature imports,
  including models, count toward the architecture graph; ledger → settings
  previously recreated a circular dependency. Use core helpers.
- Regression suite: `backend/tests/test_confirmed_payment_returns.py`.

## Previous completed task: missing Breight wage

- Employer is **Breight**, despite the user's initial spelling “Bright PL”.
- Transaction 4779: account 32 / Spending, +A$1,004.02, bank ledger date
  30 October 2026, payee/description `Breight Pty Ltd`.
- It was imported without a split because the learned exact payer identity was
  `BREIGHT PL`, used by the previous wage 4232 (+A$1,162.31 on 22 October).
- Corrected 4779 to **Income / Wages**, taught the reviewed correction and added
  deterministic confirmed-employer aliases. Both receipts are still Wages in
  the live DB as checked on 7 November.
- Its settlement timestamp was 29 October at 9:10 pm Perth time, although the
  bank records 30 October. Do not rewrite all ledger dates to resolve this.
- `classification/employer_wages.py` covers Platinum Staffing, IronMerge People,
  Breight Pty Ltd and bounded PL / P/L / P.L. aliases, with positive finite
  amounts only. Business-account and explicit-rule protections remain.
- Confirmed employers default to Wages after retaining reviewed custom income
  detail. Tests: `backend/tests/test_employer_wages.py`.

## Financial invariants and budget behavior

- Base/display currency is **AUD**; native USD values must retain their signs
  and amounts. Never change raw bank records to force desired budget totals.
- Personal cash includes Up Spending (32), Up Saver (33, “Bonus credit card
  payment”) and UW Main Checking (34). Business account 36 is excluded from
  personal budgeting; debt accounts are not cash assets.
- Cash summary/batteries use provider available balances plus dated native bank
  movements, continuous coverage and one reference FX rate. They are **not**
  income minus categorized spending. That misleading secondary comparison was
  removed at the user's request.
- Required bridge: opening cash + external received − external paid/reserved +
  signed transfer/source adjustment = closing cash. Suppress proven transfers
  only between the included personal cash accounts. Borrowing still increases
  cash without becoming earned income. Untracked-account movements must not be
  suppressed merely because their category says Transfers.
- Unknown historical balances/anchors show unavailable data, not invented zero
  balances or invented income. Future cash adds only remaining unreceived/
  unpaid/unreserved plans. Pending holds do not also count as posted expenses.
- Genuine refunds reduce their expense category. Failed-payment pairs disappear
  from paid budget spending/income, while both raw movements remain in cash on
  their bank dates. Separate fees and successful later retries remain visible.
- Savings is a budget allocation: saver-side deposits/round-ups positive,
  withdrawals back to Spending negative, each transfer counted once. Embedded
  purchase round-ups must not be counted again. Stored Transfers classifications
  remain. Savings plans/allocations are cash-neutral and excluded from the
  spending chart. Subrows/drilldowns are read-only virtual allocations.
- Financial year is January–December. The visible window is six months and
  slides continuously across years (e.g. August–January). Annual totals still
  refer to the selected calendar year; viewing six months must not reset cash.
- `BudgetMatrixPeriod` merges adjacent calendars and checks account/FX snapshot
  consistency. Preserve request guards, cross-year saving and dirty drafts.
- The native slider bug was fixed: following-year loading must not disable
  month navigation; input events update columns during dragging. Editing/saving
  still wait for required data. Test actual native thumb dragging when changing
  this behavior; a programmatic change alone did not reproduce the old bug.
- Blank current/future spending cells suggest amounts once income targets are
  filled. Use up to three covered completed months, reserve actual/pending/
  explicit plans (including zero), cap by available income and historical demand.
  Suggestions affect neither totals nor forecasts until accepted; accepted
  drafts still require **Save all cells**.
- Month rollover/focus/wake refreshes suggestions/history. Preserve only dirty
  edits, take saved targets/actuals fresh, lock completed months to actuals and
  avoid duplicate carry-forward allocations.
- The user requested compact presentation, plan/actual mini charts with variance
  overlays, and one small Save all cells control above the bucket card.

Primary backend modules: `features/ledger/cashflow.py`, `cash_transfers.py`,
`bank_activity.py`; `features/budgeting/reporting.py`, `savings.py`,
`suggestions.py`, `planning.py`. Frontend domain objects are under
`apps/desktop/src/features/budgets/domain/`; see `TESTING_AND_PACKAGING.md`.

## Classification decisions to preserve

| Evidence / merchant | Confirmed treatment |
| --- | --- |
| LC ending 02 inflow | Loan drawdown to Spending; not income |
| October MLink from Sharon Gould | Income / Family Support; earlier records left Business |
| July ATO deposit A$5,137.28 | Tax refund; IRS USATAXPYMT credits are returned payments |
| Yaseen/Yasseen payments; A$300 bond refund | Rent; bond refund offsets Rent |
| Coffee / Cafe / Duotone / Belmont33 Drive Thru | Food / Cafe |
| Woolworths / Foodies | Food / Groceries |
| Transperth / Transport NSW / PTA Smartrider | Travel & Transport / Public Transport |
| Dedi Santoso; Ranier Rorr | Friends & Family; Rorr has his own detail |
| Generic Grab without ride evidence | Food orders, per user confirmation |
| YHA food spending | Under A$10 Cafe; A$10 to under A$50 Restaurants |
| MS* SYDNEYHARBOURYHA / MS* SYDNEYCENTRALYHA | Hotels, including hotel refunds; override YHA food bands |
| MCLUU DARLING / Sauna X / Ausrec Steamworks | Nightclubs |
| Peter Jackson / Florsheim | Clothing |
| Afterpay; Sallie Mae | Debt details “After pay”; “Student Loan” |
| Large Monash A$11,675 and A$5,837.50 deposits | Student loan funding, not earned wages |
| Smaller reviewed Monash deposits | Employment wages |
| Platinum Staffing deposits | Employment wages, per explicit user confirmation |

PayPal credit repayments, purchases/refunds and actual personal transfers need
distinct evidence. A generic PAYPAL bank descriptor is insufficient to infer
Friends & Family or a credit repayment. The July 8 US$275.50 PayPal receipt was
confirmed purchase/refund-related. Preserve abstention for ambiguous entries.

The local classification agent (`classification/agent.py`, `rule_health.py`)
learns trusted reviewed corrections, scoped by account/currency/direction, not
its own automatic guesses. Do not turn variable-amount YHA examples or one-off
family support into merchant-wide rules. Audit broken/conflicting rules.

Confirmed unpaid Uber original PURCHASE and RETRY PYMT pairs on 21/26 October
exclude IDs 4749–4752 and 4758–4761. Preserve later successful purchases and
genuine hotel/Uber refunds. Tests: `test_uber_payment_returns.py` and
`test_payment_reversals.py`.

Travel & Transport is the parent category, with Hotels and Public Transport
separate. Migration 0024 renamed category 44 in place; bucket key stays
`transport`. Do not recreate categories or move saved plans to fix names.

Debt terms supplied by the user: reserve LOC US$500 limit / 14% APR; Sallie Mae
private student loan US$39,182.64 supplied balance anchor / 2% APR, with daily
compounding selected per user. These are modeling inputs, not a freshly verified
lender balance or contract. Debt activity tracks payments/drawdowns and excludes
returned/pending payments; estimates must remain distinct from observed balances.

## Current review item and data freshness

- Newly imported PayPal transaction **4786**, 2 November 2026, **−US$44.77**,
  `ACH:PAYPAL -TRANSFER`, still has no category/split (rechecked 7 November).
  It was outside the completed IRS fix. Do not guess purchase vs credit payment
  vs personal transfer from that label alone.
- Last bank refresh performed in this session history: 5 November; four UW
  transactions were added. Read-only checks on 7 November show latest imported
  dates: Up Spending/Saver 30 October; UW Checking 2 November. These are coverage
  observations, not proof that the feed contains every subsequent bank event.
- Backend `/health` was healthy on 7 November. No fresh source tests or bank sync
  were run just to create this handover.
- No unanswered IRS question or unfinished financial correction remains.

## Verification, packaging and continuation commands

Most recent completed backend verification, 5 November: **905 tests passed**;
confirmed-payment-return suite **44 passed**. It covers persistence, malformed/
conflicting links, shared report totals, unchanged cash/batteries/raw records,
pending settings writes and ORM cache coherence. Earlier frontend verification
reported 77 budget tests and 7 debt tests, plus TypeScript/Vite checks; recheck as
appropriate for new frontend changes rather than claiming those counts are fresh.

Run from the workspace root:

```sh
backend/.venv/bin/python -m pytest backend/tests/test_confirmed_payment_returns.py -q
backend/.venv/bin/python -m pytest backend/tests -q
git diff --check
```

Frontend commands, run from `apps/desktop` when relevant:

```sh
npm run test:budget
npm run test:debt
npx tsc --noEmit
npm run build
```

To package backend changes, run `bash scripts/build_backend.sh` at the root,
then `npm run tauri build` from `apps/desktop`. If frontend sources changed,
build their dist as well. Full bundle path:

`/Users/jwick1/Desktop/J.A.I./Debt management/apps/desktop/src-tauri/target/release/bundle/macos/Finances.app`

Packaging must put migrations at `backend/app/migrations/sql` beside the imported
`backend.app.migrations.runner`; assets remain `app/assets`. This path was fixed
and tested for fresh/upgrade bundled databases. Do not regress it.

The app bundle ID is `com.jai.finances`. When restarting, wait for both the app
process and backend to exit before `open` the full bundle path; immediate launch
can briefly fail with LaunchServices error −600. Bounded retry succeeded. Verify
`/health`, then live report drilldowns after restart. Example:

`GET /api/v1/reports/budget-cell-transactions?month=2026-09&bucket=housing_bills`

Use `backend/.venv/bin/python` for ORM/testing, not an assumed global Python.
Point correction sessions explicitly at the live DB; do not accidentally operate
on a repository/default DB. Use SQLite's backup API before changes. Available
backups under the live DB's `backups/` directory:

- `finance-before-breight-wage-20261030.db`
- `finance-before-irs-review-20261105.db`
- `finance-before-irs-same-day-links-20261105.db`

Other agent notes may reflect earlier intermediate hypotheses. The user's latest
May/June-paid clarification and the live settings/pairs above are authoritative.
Read `TESTING_AND_PACKAGING.md`, inspect current code and preserve existing work.
Keep functions small/commented, reusable features modular and object-oriented,
dashboards simple, downstream effects checked, and deployment free of assumed
global runtime dependencies. Remove superseded code when a change makes it
obsolete; preserve the intentional work already present.
