from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class Client(Base):
    __tablename__ = "client"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String)
    phone = Column(String)
    address = Column(Text)
    notes = Column(Text)
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

__all__ = ['Client', 'Invoice', 'InvoiceLineItem', 'ArchivedInvoice', 'InvoicePaymentLink', 'ArchivedInvoicePaymentLink']
