# Project instructions

- Consider downstream effects of every change and address them within the requested scope.
- Identify deprecated features, dead code, and obsolete paths. Remove them when cleanup is authorized and their callers, data, migrations, and packaging have been checked.
- Keep dashboards elegant, simple, visually consistent, and efficient with system resources.
- Use object-oriented domain models where they clarify ownership, state, and behavior. Keep React components and hooks idiomatic; do not introduce classes solely to satisfy a style rule.
- Keep functions small and focused. Add useful functionality comments explaining intent, financial rules, or non-obvious constraints.
- Keep features modular and reusable across projects, with explicit dependencies and clear interfaces.
- Assume clean machines without globally installed dependencies. Declare dependencies and use project-local tools and bundled runtime resources.
- GitHub username: `jaiprototypes`.

# Code review prompt

When asked to review this repository, act as a rigorous reviewer of a single-user, local-first finance application. Find concrete defects and regressions that can change financial results, lose data, mislead the user, break workflows, or waste resources. Evaluate the code against the user's latest requirements and the actual application behavior.

A code review is an inspection task unless fixes are also requested. Report findings before editing implementation code. Do not turn a review into an unrelated refactor, dependency upgrade, data correction, commit, or deployment.

## 1. Establish scope and authoritative behavior

- Read the applicable project instructions, `ARCHITECTURE_GUARDRAILS.md`, and relevant feature documentation. Use `SESSION_HANDOVER.md` for context, but verify it against current code and later user decisions; older financial examples and rules may be stale.
- For a change review, inspect the complete diff against the stated base, including relevant untracked files and deletions. For a repository audit, inspect the whole requested area and state coverage limits.
- Preserve unrelated working-tree changes. Do not assume an existing modification or deletion is accidental.
- State the intended behavior and important invariants before deciding that code is wrong. Separate confirmed requirements from assumptions that need clarification.
- Trace each affected workflow from user interaction through component state, domain calculations, API contracts, persistence, report generation, and desktop packaging, as applicable.
- Inspect callers and downstream consumers, including background refresh, cross-year planning, reports, imports, and older persisted records. A locally correct function can still produce an incorrect workflow.

## 2. Financial correctness

- Keep recorded bank balances, transaction activity, saved plans, unsaved drafts, reservations, and forecast balances distinct.
- Check signs, currencies, conversion direction, FX reference dates, rounding, cents, zero, blank, null, refunds, reversals, partial payments, and pending transactions.
- Do not count income, expenses, available cash, transfers, or shortfalls twice. Carry shared cash forward once rather than assigning the same balance independently to every category.
- Do not substitute zero for missing financial coverage or present uncertain forecasts as confirmed affordability.
- Preserve original transaction records, classification evidence, history, and explicit user corrections. Automatic suggestions must not silently replace saved financial decisions.
- Verify category totals, detail views, summary reports, and exported figures agree on the same financial meaning.
- For debt, invoices, and timesheets, examine interest periods, payment application, duplicate payments, returned payments, duration boundaries, and cumulative rounding where affected.
- Financial truth must remain deterministic and auditable. AI commentary and suggestions must never invent or independently establish balances, debts, invoices, or bookkeeping events.

## 3. Budgeting and future planning

- Verify edits recalculate forecasts, cash headroom, suggestions, and relevant totals locally from the cached bank snapshot. Typing, affordability checks, rejection, and suggested replacements must use cached data. Enter must persist only the validated cell with a write request, without querying reports or saving unrelated drafts.
- Pressing Enter must validate against the complete loaded future plan, including later months, cross-year costs, protected Savings, actual spending, pending commitments, and explicitly dated payments and income.
- An unaffordable amount must restore the previous accepted value and show an actionable suggestion when one can be established. Recheck a suggestion against current inputs before applying it. Do not offer a confident maximum when coverage or payment timing is unknown.
- Zero is an explicit target; blank removes a target. Clearing a target must not erase recorded payments, transaction history, or pending bank reservations.
- Planned Savings are protected from spendable cash while remaining inside combined bank cash. A transfer into a connected saver must not release that planned reserve back into spending headroom or become an external expense.
- Keep saver balances separate from savings activity and planned allocations. Do not sum monthly balance observations into an annual saved amount or invent future actual balances.
- Reserve shared headroom once across competing categories. Accepting one recommendation must update the allowance available to the others.
- Future-cost category lists must contain only explicitly marked cells. Ordinary plans must still affect the overall forecast without automatically becoming marked future costs.
- Undated monthly plans must retain monthly treatment. Never invent a first-of-month deadline, payday, or payment order. Respect explicit dates, same-day netting, overdue dates, and timing uncertainty.
- Check month rollover, expired plans, focus refresh, year navigation, failed requests, stale responses, and preservation of unrelated drafts.
- Retain the budget workspace, drafts, visible month range, and valid loaded years when navigating. Refresh financial snapshots after relevant data changes, month rollover, or explicit refresh, without discarding the visible table.
- Saving persists drafts; it must not be necessary to calculate them. Check that save acknowledgements update cached plan metadata without unnecessary report reloads and that preview and saved forecasts agree for unchanged bank data.

## 4. Database integrity and persistence

- Check additive and destructive migrations against existing records, not only empty databases. Preserve compatibility, constraints, defaults, nullable fields, identifiers, and relationships.
- Confirm the shipped backend includes required migrations and applies them in order.
- Examine transaction boundaries, partial failures, retries, duplicate submissions, concurrent writes, and rollback behavior. A failure must not be reported as a complete successful save.
- Ensure omitted API fields preserve existing metadata where required; distinguish omitted, null, false, zero, and blank values.
- Verify deleting a target clears its attached metadata without deleting unrelated financial evidence.
- Retain archived account history while treating inactive balances correctly. Do not merge, remove, or reconstruct records using unsupported assumptions.
- Use isolated fixtures or in-memory databases for write validation. Do not mutate live financial data or trigger bank synchronization just to prove a review finding.

## 5. API, import, and connector correctness

- Trace request validation, response serialization, returned identifiers, schema compatibility, error handling, and frontend consumers together.
- Check pagination, deduplication, idempotent imports, incremental cursors, retry behavior, and complete account snapshots before archiving records.
- Identify partial imports or failed connector calls that can leave inconsistent state or appear successful.
- Check asynchronous request ordering and cancellation: an older response must not overwrite newer edits, a different year, or another currency.
- Assess authentication, authorization, loopback exposure, CORS, file access, and secret handling against the actual desktop threat model. Do not invent enterprise access-control requirements for this single-user app.
- Bank connectors and local AI must remain optional. Their failure must not block independent local finance workflows or CSV imports.

## 6. Performance and resource use

- Look for repeated report generation, N+1 database queries, redundant scans, unbounded result sets, unnecessary API round trips, and recalculation tied to persistence.
- Check dependency arrays, memoization validity, stale closures, event listeners, timers, subscriptions, polling, and cleanup after navigation or unmount.
- Keep routine cell editing responsive. Prefer shared cached inputs and focused recalculation; recommend a worker or larger architectural change only when evidence justifies it.
- Examine memory growth, large imports, chart rendering, table layout, backend startup, and bundled dependencies in affected workflows.
- Explain the triggering workload and practical impact of a performance finding. Do not demand optimizations based only on stylistic preference or hypothetical scale.

## 7. UI, interaction, and accessibility

- Check narrow and wide windows, collapsed navigation, dense tables, long amounts, negative values, currencies, large text, overflow, sticky columns, and popup placement.
- Keep the amount readable. Expanded cell pills should fit their contents rather than obscure large sections of the table or shift column widths.
- Preserve existing interaction contracts: amount editing, Enter validation, the calendar control, the expanded-pill future-cost checkmark, and right-click transaction history.
- Verify keyboard access, focus visibility and restoration, accessible names, pressed/expanded states, dialog dismissal, loading states, and understandable errors.
- Distinguish saved data, draft changes, actual values, suggestions, unavailable data, and projections without clutter or implementation jargon in the product UI.
- Flag visual inconsistency when it obscures meaning or breaks usability. Treat purely aesthetic preferences as optional observations, not functional defects.

## 8. Architecture and deprecated code

- Check that financial rules live in reusable domain logic rather than being duplicated across components, reports, and save handlers.
- Identify obsolete components, superseded calculations, compatibility shims, exports, routes, styles, configuration, documentation, and dependency entries.
- Before recommending removal, verify references, dynamic loading, migrations, packaging resources, and consumers outside the immediate diff. Lack of a direct text match alone does not prove code is unused.
- Prefer the smallest cohesive fix. Do not propose speculative frameworks, general-purpose abstractions, extra helper layers, or public-contract changes without a demonstrated need.
- Check comments and documentation for contradictions with current behavior. Keep historical migrations and useful financial evidence even when the old feature is no longer active.

## 9. Validation and desktop delivery

- Choose focused checks that prove behavior and downstream invariants. Include meaningful boundary cases rather than tests that merely mirror implementation.
- Use existing tests or inline checks; do not add saved test files unless explicitly requested. Do not alter or delete existing tests to hide failures.
- Discover current commands and available test files before running them. Documentation may reference removed tests or outdated counts.
- Where relevant, run TypeScript checking, the production frontend build, existing budget checks, and targeted backend or migration checks with project-local dependencies.
- For budgeting changes, compare an unsaved preview with the acknowledged saved state, exercise rejection and suggestion application, check cross-year cash carry, and assert the intended backend-call count.
- For packaged-app changes, distinguish source validation from desktop validation. Frontend changes require rebuilding the desktop bundle; backend changes require rebuilding the bundled backend first.
- If packaging or restart is requested or already authorized, wait for the old app and backend to exit before reopening, then verify startup and health. Do not treat a successful Vite build as proof that the running desktop app contains the change.
- Report exactly which checks ran, their results, and any untested behavior. Do not claim manual UI verification based solely on source inspection, static rendering, or unit tests.

## 10. Evidence and findings format

Lead with actionable findings, ordered by severity. Do not invent a minimum number of issues.

For each finding, provide:

1. **Priority and concrete title:** describe the defect and its effect.
2. **Location:** give the smallest relevant file/line reference; for a diff review, anchor it to changed code where possible.
3. **Trigger and evidence:** explain the inputs or interaction that cause it, the expected result, and the observed result. Include a focused reproduction or calculation when useful.
4. **Root cause and downstream impact:** explain why the code produces the result and which other workflows or records are affected.
5. **Smallest corrective direction:** identify the necessary scope, affected files, regression risks, and validation that would prove the fix.

Use priorities consistently:

- **P0 — Critical:** a demonstrated release-blocking failure with broad impact, such as unavoidable data corruption or exposure. Do not use P0 for an unproven scenario.
- **P1 — High:** a serious financial error, data-loss path, security regression, or broken core workflow that should be fixed before release. State the actual conditions required.
- **P2 — Medium:** a reproducible correctness, reliability, performance, or usability defect with a narrower impact.
- **P3 — Low:** a concrete minor issue with limited impact. Keep optional cleanup and style suggestions separate from defects.

Deduplicate findings with the same root cause. Separate confirmed defects from open questions or hypotheses. Do not present a failing test as proof that the implementation is wrong until the test's assumptions have been checked against current requirements.

After the findings, briefly report scope covered, validation performed, and material gaps. If no actionable defects were found, say so clearly and identify remaining coverage limits. Do not imply the whole application is correct merely because reviewed checks passed.
