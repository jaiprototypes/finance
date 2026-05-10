from sqlalchemy import text

from backend.tests.utils import make_session


def test_budget_group_tables_and_column_are_removed_from_fresh_schema():
    session = make_session()

    merchant_profile_columns = [
        row[1] for row in session.execute(text("PRAGMA table_info(merchant_profile)")).all()
    ]
    tables = {
        row[0]
        for row in session.execute(
            text("SELECT name FROM sqlite_master WHERE type = 'table'")
        ).all()
    }

    assert "budget_group_id" not in merchant_profile_columns
    assert "budget_group" not in tables
    assert "budget_group_target" not in tables
    assert "budget_group_training_run" not in tables


def test_latest_schema_migrations_are_recorded():
    session = make_session()
    versions = {
        row[0]
        for row in session.execute(text("SELECT version FROM schema_migrations")).all()
    }

    assert "0014_remove_budget_groups" in versions
    assert "0015_compact_category_taxonomy" in versions
    assert "0016_collapse_shopping_lifestyle" in versions
    assert "0017_merge_travel_into_transport" in versions
    assert "0018_provider_account_balances" in versions
    assert "0019_subcategories" in versions
    assert "0020_archived_invoices" in versions
    assert "0021_archived_invoice_collections" in versions


def test_provider_balance_columns_exist_on_linked_account_tables():
    session = make_session()
    plaid_columns = {
        row[1] for row in session.execute(text("PRAGMA table_info(plaid_account)")).all()
    }
    up_columns = {
        row[1] for row in session.execute(text("PRAGMA table_info(up_account)")).all()
    }

    assert {"current_balance", "available_balance", "balance_as_of"} <= plaid_columns
    assert {"current_balance", "available_balance", "balance_as_of"} <= up_columns


def test_archived_invoice_table_exists_on_fresh_schema():
    session = make_session()
    columns = {
        row[1] for row in session.execute(text("PRAGMA table_info(archived_invoice)")).all()
    }
    indexes = {
        row[1] for row in session.execute(text("PRAGMA index_list(archived_invoice)")).all()
    }

    assert {
        "client_id",
        "number",
        "status",
        "issue_date",
        "due_date",
        "currency",
        "total",
        "file_path",
        "file_name",
        "checksum",
        "source_label",
        "updated_at",
    } <= columns
    assert "ux_archived_invoice_checksum" in indexes


def test_archived_invoice_payment_link_table_exists_on_fresh_schema():
    session = make_session()
    columns = {
        row[1] for row in session.execute(text("PRAGMA table_info(archived_invoice_payment_link)")).all()
    }
    indexes = {
        row[1] for row in session.execute(text("PRAGMA index_list(archived_invoice_payment_link)")).all()
    }

    assert {
        "archived_invoice_id",
        "transaction_id",
        "amount",
        "created_at",
    } <= columns
    assert "ux_archived_invoice_payment_link_pair" in indexes
