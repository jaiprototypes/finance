# Implementation Plan

## Objective

Transform this repository into a local-first personal finance and sole trader desktop application with:

- deterministic, auditable finance logic as the source of truth
- a localized AI assistant layer for categorization help, summaries, retrieval, and guidance
- terminal and browser development workflows
- a packaging path that stays compatible with a single-user desktop app

## Current Repo Baseline

The repo already contains substantial finance functionality:

- local SQLite-backed FastAPI backend
- React + Tauri desktop shell
- accounts, transactions, budgets, debt payoff, invoicing, timesheets, reports, imports, Plaid, and Up Bank integration
- deterministic shared logic for debt payoff, FX, imports, invoice generation, and timers

The main gaps are architectural and governance-related rather than domain absence:

- the classification/AI path is currently wired around remote OpenAI defaults
- the frontend is concentrated in a very large `App.tsx` monolith
- packaging assumptions still reference `openai.env` and remote model configuration
- generated artifacts and packaging details need cleanup for a realistic local desktop target
- markdown scope controls are too weak to prevent drift into enterprise accounting software

## Guardrails

### Deterministic Truth

- balances, budget math, debt schedules, invoice totals, and bookkeeping rules remain deterministic
- AI suggestions never write authoritative accounting outcomes without explicit deterministic application logic
- AI outputs must be grounded in real stored records and returned with structured fields

### Localized AI Scope

- transaction categorization assistance
- spending pattern summaries
- budget variance explanations
- debt payoff commentary based on deterministic schedules
- invoice and timesheet summarization
- natural-language retrieval over stored records
- recommendations tied to actual transaction, debt, invoice, and time-entry data

### Non-Goals

- multi-tenant SaaS architecture
- cloud-first hosting assumptions
- ERP, payroll, tax filing, inventory, or full double-entry enterprise accounting scope
- autonomous AI bookkeeping
- AI-generated balances, debt math, or budget truth

## Audit Findings To Address

### High Priority

- Replace remote OpenAI assumptions with a local assistant configuration and service boundary.
- Split authoritative finance logic from assistant logic more explicitly in code and docs.
- Add tests for AI grounding and local-AI unavailability.
- Update desktop packaging notes so local AI stays optional, private, and local-service compatible.

### Medium Priority

- Reduce scope drift in docs and settings language.
- Refine personal vs business separation language and workflows where needed.
- Audit monolithic frontend/backend modules for realistic extraction targets.
- Remove or document generated artifacts and brittle packaging assumptions.

### Known Hotspots

- `backend/app/services/classification.py`
- `backend/app/services/reports.py`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src-tauri/src/main.rs`
- `backend.spec`

## Implementation Sequence

### Phase 1: Governance And Boundary Lock

- add scope and architecture docs for personal + sole trader local use
- document localized AI scope, grounded-output rules, and desktop constraints
- define terminal smoke tests and browser QA workflow

### Phase 2: Local AI Assistant Layer

- introduce a local assistant service boundary that supports:
  - local provider settings
  - structured response parsing
  - grounded context assembly from stored records
  - graceful degradation when no local AI service is configured or available
- keep classification rules, merchant profiles, memories, bank metadata, and knowledge base retrieval ahead of model use
- remove remote OpenAI-first defaults from settings, tests, and packaging language

### Phase 3: Finance-Focused UX And Structure

- surface personal vs business separation more explicitly where records are reviewed and summarized
- add assistant endpoints or views for budget, debt, invoice, timesheet, and record search analysis
- tighten settings copy so users understand AI is advisory only

### Phase 4: Test And Packaging Hardening

- extend deterministic tests for budgeting, debt, invoices, and separation rules as needed
- add assistant grounding tests and local-service failure tests
- add terminal smoke-test instructions
- add browser manual QA flows
- document desktop packaging expectations and constraints

## Planned Concrete Changes In This Pass

1. Replace OpenAI-centric settings defaults and validation with local assistant settings.
2. Add a localized assistant subsystem that uses retrieval + deterministic context + constrained generation.
3. Add backend tests for:
   - assistant grounding
   - assistant unavailable fallback
   - deterministic debt, budget, invoice, and separation behavior touched by the refactor
4. Update the desktop settings UI so AI configuration is local-service oriented and clearly advisory.
5. Add markdown governance docs covering scope, non-goals, testing workflow, and desktop packaging notes.

## Acceptance Criteria

- The app remains single-user and local-first.
- Deterministic finance calculations remain authoritative and test-covered.
- AI features work from grounded local records only.
- AI unavailability does not block core finance workflows.
- Docs explicitly prevent drift into enterprise accounting scope.
- Terminal and browser development workflows are documented.
- Desktop packaging notes assume local resources, not cloud dependencies.
