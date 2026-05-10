# Architecture Guardrails

## Product Scope

This repository is for a single-user, local-first desktop application that combines:

- personal finance tracking
- sole trader business finance tracking
- budgeting
- debt planning
- invoicing
- timesheets and project time logging

Personal and business records may coexist in one system, but the app is not a multi-entity accounting platform.

## Authoritative Logic

The following must remain deterministic and auditable:

- balances
- transaction history
- category assignments once explicitly saved
- budget targets and remaining amounts
- debt payoff schedules and interest math
- invoice totals and payment application
- timesheet durations and invoice-from-time calculations

AI suggestions may assist review, but they never become financial truth on their own.

## Local AI Boundary

The localized AI layer exists only for:

- categorization suggestions
- grounded summaries
- budget variance explanations
- debt payoff commentary
- invoice and timesheet summarization
- natural-language retrieval over stored records
- practical recommendations tied to actual local records

The localized AI layer must:

- run through a local loopback service
- use grounded repo data only
- return structured outputs where practical
- degrade gracefully when unavailable
- never invent balances, debts, invoices, or bookkeeping events

## Non-Goals

Do not expand this app toward:

- multi-tenant SaaS
- enterprise ERP
- payroll
- inventory
- tax filing automation
- general ledger features aimed at teams or accountants
- autonomous AI bookkeeping

This repo should not drift into enterprise accounting software.

## Desktop Constraints

- development may use terminal + browser for speed
- packaging must remain straightforward for Tauri desktop delivery
- cloud-only dependencies are unacceptable for core finance workflows
- bank connectors remain optional
- CSV import remains a first-class path

## Acceptance Criteria

- the app remains usable as a private local desktop application
- core finance logic remains deterministic
- AI output is grounded and advisory only
- local AI failure does not block finance workflows
- docs continue to reinforce single-user local scope
