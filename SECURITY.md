# Security Policy

This is a local-first personal finance app. Do not post private financial data in public GitHub issues, discussions, pull requests, screenshots, logs, or stack traces.

Do not share:

- Bank transactions, balances, account names, account numbers, routing numbers, or statement files.
- API keys, Plaid credentials, Up Bank tokens, access tokens, refresh tokens, or OAuth callback URLs containing state.
- Local SQLite databases, app-data folders, exported backups, invoice PDFs, receipts, or logs.
- Real customer, employer, client, vendor, phone, email, or address details.

When reporting a bug, use redacted sample data and replace private values with placeholders such as `Example Bank`, `txn_123`, `client@example.com`, or `PLAID_SECRET=redacted`.

If you believe you found a security or privacy issue, do not open a public issue with sensitive details. Contact the maintainer privately first.
