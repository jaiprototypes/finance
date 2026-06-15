from typing import Optional

from pydantic import BaseModel, ConfigDict


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


class InvoiceNumberPreviewOut(BaseModel):
    client_id: int
    number: str


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

__all__ = ['ClientCreate', 'ClientOut', 'InvoiceLineItemCreate', 'InvoiceCreate', 'InvoiceNumberPreviewOut', 'InvoiceOut', 'ArchivedInvoiceOut', 'ArchivedInvoiceUpdate', 'InvoiceSendRequest', 'InvoicePaymentApply', 'ArchivedInvoicePaymentLinkOut', 'ReceiptCandidateOut', 'ArchivedInvoiceDetailOut']
