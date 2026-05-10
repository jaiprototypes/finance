# Business Workflow

This app is a single-user local finance workspace for running a small business, not a multi-tenant accounting suite.

## Core Flow

1. Set the company profile in `Control Room`.
2. Add or edit clients in `Business`.
3. Create live invoices for new work in `Business`.
4. Upload old invoice PDFs into the archived invoice library.
5. Use `Projects + Time` only when you need to turn tracked hours into a new invoice.

## Historical Invoices

- Historical invoice PDFs live in the local archive library.
- Historical invoices are editable local receivable records with their source PDF attached.
- Receipt links are always grounded in real transactions; the PDF is evidence, not the balance source by itself.
- Plaid or statement-backed receipts can be linked to historical invoices without converting them into live invoices.
- Empty upload fields are auto-filled from the PDF when the parser can extract the data.
- Uploaded files are stored locally under the app uploads directory.
- If a payment date is not supported by a real statement or imported transaction, do not invent it. Add the exact receipt only after a dated source exists.

## Client Management

- Keep one active client record per real customer.
- If older documents use alternate legal names for the same customer, merge the duplicate client into the main client record.
- Archive inactive clients instead of deleting them when you want to preserve history without cluttering the active list.

## Terminal Helpers

Bootstrap the company profile used by invoice PDFs:

```bash
backend/.venv/bin/python scripts/bootstrap_company_profile.py \
  --company-name 'Example Consulting' \
  --company-legal-name 'Example Consulting LLC' \
  --company-dba 'Example Consulting' \
  --company-entity-type 'Single-member LLC' \
  --company-tax-id '<your tax ID>' \
  --company-email 'you@example.com' \
  --company-phone '+1 (555) 555-5555' \
  --company-address '123 Example St' \
  --company-city-state 'Example City, ST 00000'
```

Import historical invoice PDFs into the local archive library:

```bash
backend/.venv/bin/python scripts/import_business_history.py \
  --invoice-dir '/absolute/path/to/invoices'
```

Merge duplicate client records after import:

```bash
backend/.venv/bin/python scripts/merge_clients.py \
  --source-client-id 4 \
  --target-client-id 3
```

## Non-Goals

- No payroll
- No double-entry general ledger
- No multi-user permissions
- No cloud-hosted document workflow
- No AI-owned bookkeeping decisions
