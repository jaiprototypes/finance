from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Account(Base):
    __tablename__ = "account"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    currency = Column(String, nullable=False)
    institution = Column(String)
    note = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class Category(Base):
    __tablename__ = "category"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    personal_allowed = Column(Integer, default=1, nullable=False)
    business_allowed = Column(Integer, default=1, nullable=False)
    tax_code = Column(String)
    is_active = Column(Integer, default=1, nullable=False)


class Subcategory(Base):
    __tablename__ = "subcategory"

    id = Column(Integer, primary_key=True)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    name = Column(String, nullable=False)
    normalized_name = Column(String, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)


class Tag(Base):
    __tablename__ = "tag"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)


class Client(Base):
    __tablename__ = "client"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String)
    phone = Column(String)
    address = Column(Text)
    notes = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)


class Project(Base):
    __tablename__ = "project"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    client_id = Column(Integer, ForeignKey("client.id"))
    hourly_rate = Column(Float)
    tags = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)


class Task(Base):
    __tablename__ = "task"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("project.id"), nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)


class Invoice(Base):
    __tablename__ = "invoice"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client.id"), nullable=False)
    number = Column(String, nullable=False)
    status = Column(String, nullable=False)
    issue_date = Column(String, nullable=False)
    due_date = Column(String)
    currency = Column(String, nullable=False)
    subtotal = Column(Float, default=0, nullable=False)
    tax = Column(Float, default=0, nullable=False)
    total = Column(Float, default=0, nullable=False)
    notes = Column(Text)
    created_at = Column(String, nullable=False)


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_item"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoice.id"), nullable=False)
    description = Column(Text, nullable=False)
    quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    amount = Column(Float, nullable=False)


class ArchivedInvoice(Base):
    __tablename__ = "archived_invoice"

    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client.id"), nullable=False)
    number = Column(String)
    status = Column(String, nullable=False)
    issue_date = Column(String)
    due_date = Column(String)
    currency = Column(String, nullable=False)
    total = Column(Float, default=0, nullable=False)
    notes = Column(Text)
    file_path = Column(Text, nullable=False)
    file_name = Column(Text, nullable=False)
    mime_type = Column(String)
    checksum = Column(String, nullable=False)
    source_label = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)


class ImportBatch(Base):
    __tablename__ = "import_batch"

    id = Column(Integer, primary_key=True)
    source = Column(String)
    file_name = Column(String)
    created_at = Column(String, nullable=False)
    status = Column(String, nullable=False)
    total_rows = Column(Integer, default=0, nullable=False)
    imported_rows = Column(Integer, default=0, nullable=False)
    duplicate_rows = Column(Integer, default=0, nullable=False)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    date = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False)
    payee = Column(String)
    notes = Column(Text)
    classification = Column(String, default="Personal", nullable=False)
    reconciliation_state = Column(String, default="imported", nullable=False)
    import_batch_id = Column(Integer, ForeignKey("import_batch.id"))
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class TransactionSplit(Base):
    __tablename__ = "transaction_split"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    subcategory_id = Column(Integer, ForeignKey("subcategory.id"))
    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False)
    classification = Column(String, default="Personal", nullable=False)
    notes = Column(Text)
    business_percent = Column(Float)


class TransactionTag(Base):
    __tablename__ = "transaction_tag"

    transaction_id = Column(Integer, ForeignKey("transactions.id"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tag.id"), primary_key=True)


class Attachment(Base):
    __tablename__ = "attachment"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    file_path = Column(Text, nullable=False)
    file_name = Column(Text)
    mime_type = Column(String)
    created_at = Column(String, nullable=False)


class PlaidItem(Base):
    __tablename__ = "plaid_item"

    id = Column(Integer, primary_key=True)
    item_id = Column(String, nullable=False)
    access_token = Column(Text, nullable=False)
    institution_id = Column(String)
    institution_name = Column(String)
    status = Column(String, default="active", nullable=False)
    cursor = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class PlaidAccount(Base):
    __tablename__ = "plaid_account"

    id = Column(Integer, primary_key=True)
    item_id = Column(String, nullable=False)
    plaid_account_id = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"))
    name = Column(String)
    official_name = Column(String)
    type = Column(String)
    subtype = Column(String)
    mask = Column(String)
    currency = Column(String)
    current_balance = Column(Float)
    available_balance = Column(Float)
    balance_as_of = Column(String)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class PlaidTransaction(Base):
    __tablename__ = "plaid_transaction"

    id = Column(Integer, primary_key=True)
    plaid_transaction_id = Column(String, nullable=False)
    pending_transaction_id = Column(String)
    account_id = Column(Integer, ForeignKey("account.id"))
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    amount = Column(Float, nullable=False)
    date = Column(String, nullable=False)
    name = Column(Text)
    merchant_name = Column(Text)
    merchant_category_code = Column(String)
    pfc_primary = Column(String)
    pfc_detailed = Column(String)
    pending = Column(Integer, default=0, nullable=False)
    created_at = Column(String, nullable=False)


class UpAccount(Base):
    __tablename__ = "up_account"

    id = Column(Integer, primary_key=True)
    up_account_id = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"))
    name = Column(String)
    account_type = Column(String)
    ownership_type = Column(String)
    currency = Column(String)
    current_balance = Column(Float)
    available_balance = Column(Float)
    balance_as_of = Column(String)
    is_active = Column(Integer, default=1, nullable=False)
    last_synced_at = Column(String)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class UpTransaction(Base):
    __tablename__ = "up_transaction"

    id = Column(Integer, primary_key=True)
    up_transaction_id = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"))
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    status = Column(String)
    up_category_id = Column(String)
    up_category_name = Column(String)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class ImportRow(Base):
    __tablename__ = "import_row"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("import_batch.id"), nullable=False)
    row_index = Column(Integer, nullable=False)
    raw_json = Column(Text, nullable=False)
    parsed_json = Column(Text)
    fingerprint = Column(String, nullable=False)
    status = Column(String, nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    error = Column(Text)


class Rule(Base):
    __tablename__ = "rule"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    field = Column(String, nullable=False)
    operator = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    payee = Column(Text)
    memo_contains = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)


class BudgetMonth(Base):
    __tablename__ = "budget_month"

    id = Column(Integer, primary_key=True)
    month = Column(String, nullable=False)
    rollover_enabled = Column(Integer, default=0, nullable=False)
    created_at = Column(String, nullable=False)


class BudgetCategoryTarget(Base):
    __tablename__ = "budget_category_target"

    id = Column(Integer, primary_key=True)
    budget_month_id = Column(Integer, ForeignKey("budget_month.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"), nullable=False)
    amount = Column(Float, nullable=False)
    rollover_amount = Column(Float, default=0, nullable=False)


class BudgetBucketTarget(Base):
    __tablename__ = "budget_bucket_target"

    id = Column(Integer, primary_key=True)
    budget_month_id = Column(Integer, ForeignKey("budget_month.id"), nullable=False)
    budget_bucket = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    rollover_amount = Column(Float, default=0, nullable=False)


class DebtProfile(Base):
    __tablename__ = "debt_profile"

    id = Column(Integer, primary_key=True)
    account_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    apr = Column(Float, nullable=False)
    min_payment = Column(Float, nullable=False)
    due_date = Column(String)
    compounding = Column(String, default="daily", nullable=False)
    created_at = Column(String, nullable=False)


class DebtPaymentLink(Base):
    __tablename__ = "debt_payment_link"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"), nullable=False)
    amount = Column(Float, nullable=False)


class FXRate(Base):
    __tablename__ = "fx_rate"

    id = Column(Integer, primary_key=True)
    date = Column(String, nullable=False)
    aud_per_usd = Column(Float, nullable=False)
    source = Column(String)
    created_at = Column(String, nullable=False)


class FXRecommendation(Base):
    __tablename__ = "fx_recommendation"

    id = Column(Integer, primary_key=True)
    created_at = Column(String, nullable=False)
    risk_profile = Column(String, nullable=False)
    payload_json = Column(Text, nullable=False)
    note = Column(Text)


class FXBacktestRun(Base):
    __tablename__ = "fx_backtest_run"

    id = Column(Integer, primary_key=True)
    created_at = Column(String, nullable=False)
    horizon_days = Column(Integer, nullable=False)
    metrics_json = Column(Text, nullable=False)


class TimeEntry(Base):
    __tablename__ = "time_entry"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("project.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("task.id"))
    date = Column(String, nullable=False)
    start_time = Column(String)
    end_time = Column(String)
    duration_minutes = Column(Integer, nullable=False)
    notes = Column(Text)
    billable = Column(Integer, default=1, nullable=False)
    hourly_rate = Column(Float)
    invoiced_invoice_id = Column(Integer, ForeignKey("invoice.id"))
    created_at = Column(String, nullable=False)


class InvoicePaymentLink(Base):
    __tablename__ = "invoice_payment_link"

    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("invoice.id"), nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    amount = Column(Float, nullable=False)


class ArchivedInvoicePaymentLink(Base):
    __tablename__ = "archived_invoice_payment_link"

    id = Column(Integer, primary_key=True)
    archived_invoice_id = Column(Integer, ForeignKey("archived_invoice.id"), nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    amount = Column(Float, nullable=False)
    created_at = Column(String, nullable=False)


class FXSettings(Base):
    __tablename__ = "fx_settings"

    id = Column(Integer, primary_key=True)
    target_account_id = Column(Integer, ForeignKey("account.id"))
    provider = Column(String, default="manual", nullable=False)
    risk_profile = Column(String, default="neutral", nullable=False)


class MerchantProfile(Base):
    __tablename__ = "merchant_profile"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    normalized_name = Column(String, nullable=False)
    currency = Column(String, default="", nullable=False)
    default_category_id = Column(Integer, ForeignKey("category.id"))
    default_subcategory_id = Column(Integer, ForeignKey("subcategory.id"))
    default_classification = Column(String, default="Personal", nullable=False)
    notes = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class TransactionMemory(Base):
    __tablename__ = "transaction_memory"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    merchant = Column(Text)
    content = Column(Text, nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    classification = Column(String, default="Personal", nullable=False)
    created_at = Column(String, nullable=False)


class ClassificationAudit(Base):
    __tablename__ = "classification_audit"

    id = Column(Integer, primary_key=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    source = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("category.id"))
    classification = Column(String, default="Personal", nullable=False)
    merchant_name = Column(Text)
    note = Column(Text)
    created_at = Column(String, nullable=False)


class KnowledgeBaseEntry(Base):
    __tablename__ = "knowledge_base_entry"

    id = Column(Integer, primary_key=True)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(Text)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class AppSetting(Base):
    __tablename__ = "app_setting"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
