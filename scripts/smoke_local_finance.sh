#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8123}"
QUERY="${1:-rent}"
CURRENT_MONTH="$(date +%Y-%m)"

echo "== health =="
curl -fsS "$BASE_URL/health"
printf '\n\n'

echo "== assistant status =="
curl -fsS "$BASE_URL/assistant/status"
printf '\n\n'

echo "== grounded search =="
curl -fsS \
  -X POST \
  "$BASE_URL/assistant/search" \
  -H 'Content-Type: application/json' \
  -d "{\"query\":\"${QUERY}\",\"limit\":5}"
printf '\n\n'

echo "== budget variance =="
curl -fsS "$BASE_URL/assistant/budget-variance?month=${CURRENT_MONTH}"
printf '\n\n'

echo "== debt commentary grounding =="
curl -fsS "$BASE_URL/assistant/debts?strategy=avalanche&extra_payment=50"
printf '\n'
