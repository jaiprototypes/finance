#!/usr/bin/env python3
from __future__ import annotations

import argparse

from backend.app.db import init_db, session_scope
from backend.app.services.settings import set_setting


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Set the local company profile used by invoice PDFs and email defaults."
    )
    parser.add_argument("--company-name", required=True)
    parser.add_argument("--company-legal-name", required=True)
    parser.add_argument("--company-dba", default="")
    parser.add_argument("--company-entity-type", required=True)
    parser.add_argument("--company-tax-id", default="")
    parser.add_argument("--company-email", default="")
    parser.add_argument("--company-phone", default="")
    parser.add_argument("--company-address", default="")
    parser.add_argument("--company-city-state", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    init_db()
    with session_scope() as session:
        set_setting(session, "company_name", args.company_name)
        set_setting(session, "company_legal_name", args.company_legal_name)
        set_setting(session, "company_dba", args.company_dba)
        set_setting(session, "company_entity_type", args.company_entity_type)
        set_setting(session, "company_tax_id", args.company_tax_id)
        set_setting(session, "company_email", args.company_email)
        set_setting(session, "company_phone", args.company_phone)
        set_setting(session, "company_address", args.company_address)
        set_setting(session, "company_city_state", args.company_city_state)
    print("Company profile updated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
