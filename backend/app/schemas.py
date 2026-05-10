from typing import Optional
from pydantic import BaseModel, ConfigDict


class AccountBase(BaseModel):
    name: str
    type: str
    currency: str
    institution: Optional[str] = None
    note: Optional[str] = None
    is_active: bool = True


class AccountCreate(AccountBase):
    pass


class AccountOut(AccountBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TransactionBase(BaseModel):
    account_id: int
    date: str
    description: str
    amount: float
    currency: str
    payee: Optional[str] = None
    notes: Optional[str] = None
    classification: str = "Personal"
    reconciliation_state: str = "imported"


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    payee: Optional[str] = None
    notes: Optional[str] = None
    classification: Optional[str] = None
    reconciliation_state: Optional[str] = None


class TransactionOut(TransactionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TransactionSplitCreate(BaseModel):
    transaction_id: int
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    subcategory_name: Optional[str] = None
    amount: float
    currency: str
    classification: str = "Personal"
    notes: Optional[str] = None
    business_percent: Optional[float] = None


class TransactionSplitUpdate(BaseModel):
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None
    subcategory_name: Optional[str] = None
    classification: Optional[str] = None
    notes: Optional[str] = None
    cascade_matching_merchant: bool = True


class ReconcileUpdate(BaseModel):
    reconciliation_state: str


class MergeTransactionsRequest(BaseModel):
    primary_id: int
    duplicate_id: int


class CategoryCreate(BaseModel):
    name: str
    personal_allowed: bool = True
    business_allowed: bool = True
    tax_code: Optional[str] = None
    is_active: bool = True


class SubcategoryCreate(BaseModel):
    name: str
    is_active: bool = True


class SubcategoryOut(SubcategoryCreate):
    id: int
    category_id: int

    model_config = ConfigDict(from_attributes=True)


class CategoryOut(CategoryCreate):
    id: int
    subcategories: list[SubcategoryOut] = []

    model_config = ConfigDict(from_attributes=True)


class RuleCreate(BaseModel):
    name: str
    field: str
    operator: str
    value: str
    category_id: Optional[int] = None
    payee: Optional[str] = None
    memo_contains: Optional[str] = None
    is_active: bool = True


class RuleOut(RuleCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class ClientCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class ClientOut(ClientCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class InvoiceLineItemCreate(BaseModel):
    description: str
    quantity: float
    unit_price: float


class InvoiceCreate(BaseModel):
    client_id: int
    number: str
    status: str = "draft"
    issue_date: str
    due_date: Optional[str] = None
    currency: str
    notes: Optional[str] = None
    agreed_total: Optional[float] = None
    line_items: list[InvoiceLineItemCreate]


class InvoiceFromTimeRequest(BaseModel):
    client_id: int
    number: str
    status: str = "draft"
    issue_date: str
    due_date: Optional[str] = None
    currency: str
    notes: Optional[str] = None
    agreed_total: Optional[float] = None
    time_entry_ids: list[int]
    group_by: str = "day"


class InvoiceOut(BaseModel):
    id: int
    client_id: int
    number: str
    status: str
    issue_date: str
    due_date: Optional[str]
    currency: str
    subtotal: float
    tax: float
    total: float
    adjustment: float = 0.0
    notes: Optional[str]
    paid_total: float = 0.0
    balance_due: float = 0.0
    payment_count: int = 0
    last_payment_date: Optional[str] = None
    is_overdue: bool = False
    days_overdue: int = 0
    tracking_state: str = "draft"

    model_config = ConfigDict(from_attributes=True)


class ArchivedInvoiceOut(BaseModel):
    id: int
    client_id: int
    number: Optional[str] = None
    status: str
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: str
    total: float
    notes: Optional[str] = None
    file_name: str
    mime_type: Optional[str] = None
    source_label: str
    created_at: str
    updated_at: Optional[str] = None
    paid_total: float = 0.0
    balance_due: float = 0.0
    payment_count: int = 0
    last_payment_date: Optional[str] = None
    is_overdue: bool = False
    days_overdue: int = 0
    tracking_state: str = "archived"

    model_config = ConfigDict(from_attributes=True)


class ArchivedInvoiceUpdate(BaseModel):
    client_id: int
    number: Optional[str] = None
    status: str = "archived"
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    currency: str
    total: float
    notes: Optional[str] = None


class InvoiceSendRequest(BaseModel):
    recipient_email: Optional[str] = None


class InvoicePaymentApply(BaseModel):
    transaction_id: int
    amount: float


class ArchivedInvoicePaymentLinkOut(BaseModel):
    id: int
    archived_invoice_id: int
    transaction_id: int
    amount: float
    created_at: str
    transaction_date: Optional[str] = None
    transaction_description: Optional[str] = None
    transaction_amount: Optional[float] = None
    transaction_currency: Optional[str] = None
    transaction_account_name: Optional[str] = None
    transaction_available_amount: Optional[float] = None


class ReceiptCandidateOut(BaseModel):
    id: int
    date: str
    description: str
    amount: float
    currency: str
    payee: Optional[str] = None
    notes: Optional[str] = None
    classification: str
    reconciliation_state: str
    account_id: int
    account_name: Optional[str] = None
    allocated_amount: float
    available_amount: float
    match_score: int
    match_reason: str


class ArchivedInvoiceDetailOut(BaseModel):
    invoice: ArchivedInvoiceOut
    payments: list[ArchivedInvoicePaymentLinkOut]
    candidate_transactions: list[ReceiptCandidateOut]
    paid_total: float
    balance_due: float


class ProjectCreate(BaseModel):
    name: str
    client_id: Optional[int] = None
    hourly_rate: Optional[float] = None
    tags: Optional[str] = None
    is_active: bool = True


class ProjectOut(ProjectCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TaskCreate(BaseModel):
    project_id: int
    name: str
    is_active: bool = True


class TaskOut(TaskCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class TimeEntryCreate(BaseModel):
    project_id: int
    task_id: Optional[int] = None
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_minutes: int
    notes: Optional[str] = None
    billable: bool = True
    hourly_rate: Optional[float] = None
    invoiced_invoice_id: Optional[int] = None


class TimeEntryOut(TimeEntryCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class DebtProfileCreate(BaseModel):
    account_id: int
    apr: float
    min_payment: float
    due_date: Optional[str] = None
    compounding: str = "daily"


class DebtProfileOut(DebtProfileCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class DebtPaymentLinkCreate(BaseModel):
    transaction_id: int
    account_id: int
    amount: float


class PayoffDebt(BaseModel):
    debt_id: str
    name: str
    balance: float
    apr: float
    min_payment: float


class PayoffRequest(BaseModel):
    strategy: str = "avalanche"
    extra_payment: float = 0.0
    debts: list[PayoffDebt]


class FXRateCreate(BaseModel):
    date: str
    aud_per_usd: float
    source: Optional[str] = None


class FXRecommendRequest(BaseModel):
    risk_profile: str = "neutral"
    aud_cash: float
    usd_cash: float
    aud_debt: float
    usd_debt: float
    usd_debt_apr: float
    aud_debt_apr: float
    history_days: Optional[int] = None
    forecast_days: Optional[int] = None
    transfer_bps: float = 0.0005


class FXSettingsUpdate(BaseModel):
    target_account_id: Optional[int] = None
    provider: str = "manual"
    risk_profile: str = "neutral"


class BudgetMonthCreate(BaseModel):
    month: str
    rollover_enabled: bool = False


class BudgetCategoryTargetCreate(BaseModel):
    budget_month_id: int
    category_id: int
    amount: float
    rollover_amount: float = 0.0


class BudgetCategoryTargetOut(BudgetCategoryTargetCreate):
    id: int
    category_name: Optional[str] = None
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BudgetBucketTargetCreate(BaseModel):
    budget_month_id: int
    budget_bucket: str
    amount: float
    rollover_amount: float = 0.0


class BudgetBucketTargetOut(BudgetBucketTargetCreate):
    id: int
    bucket_name: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MerchantProfileCreate(BaseModel):
    name: str
    currency: str
    default_category_id: Optional[int] = None
    default_subcategory_id: Optional[int] = None
    default_classification: str = "Personal"
    notes: Optional[str] = None


class MerchantProfileOut(MerchantProfileCreate):
    id: int
    normalized_name: str
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class MerchantProfileUpdate(MerchantProfileCreate):
    apply_to_transactions: bool = False


class KnowledgeBaseCreate(BaseModel):
    title: str
    content: str
    tags: Optional[str] = None
    is_active: bool = True


class KnowledgeBaseOut(KnowledgeBaseCreate):
    id: int
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class TransactionClassifyRequest(BaseModel):
    transaction_id: Optional[int] = None
    account_id: Optional[int] = None
    description: str
    payee: Optional[str] = None
    notes: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    date: Optional[str] = None
    bank_category: Optional[str] = None
    mcc: Optional[str] = None
    pfc_primary: Optional[str] = None
    pfc_detailed: Optional[str] = None


class ClassificationResult(BaseModel):
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    classification: str = "Personal"
    merchant_name: Optional[str] = None
    source: str
    flow_type: Optional[str] = None
    note: Optional[str] = None


class BulkClassifyRequest(BaseModel):
    transaction_ids: Optional[list[int]] = None
    force: bool = False


class AssistantSearchRequest(BaseModel):
    query: str
    limit: int = 8


class SettingsUpdate(BaseModel):
    lock_enabled: Optional[bool] = None
    password: Optional[str] = None
    fx_provider: Optional[str] = None
    fx_risk_profile: Optional[str] = None
    base_currency: Optional[str] = None
    local_ai_enabled: Optional[bool] = None
    local_ai_base_url: Optional[str] = None
    local_ai_model: Optional[str] = None
    local_ai_timeout_seconds: Optional[int] = None
    classification_model: Optional[str] = None
    embedding_model: Optional[str] = None
    personal_context: Optional[str] = None
    company_name: Optional[str] = None
    company_legal_name: Optional[str] = None
    company_dba: Optional[str] = None
    company_entity_type: Optional[str] = None
    company_tax_id: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_address: Optional[str] = None
    company_city_state: Optional[str] = None
    company_logo_path: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[str] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    smtp_use_ssl: Optional[bool] = None
    budget_skip_merchants: Optional[str] = None
