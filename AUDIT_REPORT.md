# Audit Report

## Summary

The repository already had a strong local-first finance foundation before this pass:

- FastAPI + SQLite backend
- Tauri + React desktop shell
- deterministic debt, invoicing, timesheet, import, FX, and budgeting logic
- optional Plaid and Up Bank integrations

The main problems were not missing finance features. The main problems were scope control, local-AI boundaries, and a few structural hotspots that could cause drift or brittle packaging later.

## High-Value Findings

### Already Present And Worth Keeping

- deterministic debt payoff engine in `shared/debt/payoff.py`
- deterministic invoice creation and payment logic
- budgeting and cash-protection logic
- local knowledge base and transaction memory groundwork
- desktop-ready Tauri shell

### Refactor Hotspots

- `backend/app/services/classification.py` is a large monolith and remains a future extraction candidate
- `backend/app/services/reports.py` is another large service worth splitting later
- `apps/desktop/src/App.tsx` is still a very large frontend monolith

### Prior Scope Drift Risks

- settings and packaging were previously framed around remote OpenAI usage
- repo docs did not strongly prevent expansion into enterprise accounting scope
- desktop packaging rules were not explicit enough about local-service expectations

## Dead Code, Redundancy, And Optimization Risks

### Generated / Build Artifacts In Repo

The repo currently contains generated or environment-specific artifacts that should not be treated as product architecture:

- virtualenv directories
- build outputs
- `dist`
- Tauri `target`
- `__pycache__`

These increase noise during audit and can obscure real source changes.

### Brittle Packaging Assumptions

- `backend.spec` still contains absolute workspace paths and should be cleaned up in a follow-up
- the frontend previously assumed remote-model configuration through `openai.env`

### Overbuilt Or Broad Areas

- connector plumbing is broader than strictly necessary for a local private finance app, though still acceptable as optional functionality
- the single large desktop `App.tsx` makes change isolation and testing harder than necessary

## Changes Implemented In This Pass

- replaced remote OpenAI-first assumptions with a local-AI configuration path
- added a localized assistant subsystem for:
  - grounded search
  - spending summaries
  - budget variance commentary
  - debt payoff commentary
  - invoice summary
  - timesheet summary
- kept deterministic finance calculations authoritative
- changed transaction classification model fallback from remote naming to local AI usage
- updated desktop/runtime env handling to use `local_ai.env`
- added backend and desktop tests covering the new local-AI boundary
- added governance, testing, and packaging docs

## Recommended Follow-Up

- split `apps/desktop/src/App.tsx` into page modules
- split `backend/app/services/classification.py` into rules, retrieval, and model adapters
- remove committed generated artifacts and tighten `.gitignore`
- replace absolute paths in `backend.spec`
- add a small assistant UI panel outside the settings page if interactive summaries become a frequent workflow
