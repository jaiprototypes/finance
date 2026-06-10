import logging
import math
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...db import get_session
from .models import ArchivedInvoice, ArchivedInvoicePaymentLink, Client, Invoice, InvoiceLineItem, InvoicePaymentLink
from ..timesheets.models import Project, TimeEntry
from .schemas import ArchivedInvoiceDetailOut, ArchivedInvoiceOut, ArchivedInvoiceUpdate, ClientCreate, ClientOut, InvoiceCreate, InvoiceOut, InvoicePaymentApply, InvoiceSendRequest
from .archived_invoices import (
    apply_archived_invoice_payment,
    archived_invoice_detail,
    archived_invoice_payment_summary,
    create_archived_invoice_from_upload,
    ensure_client,
    remove_archived_invoice_payment,
    serialize_archived_invoice,
    update_archived_invoice,
)
from .service import ReceivableTrackingService
from .invoices import create_invoice, apply_payment, update_invoice
from .invoice_tracking import (
    invoice_payment_summary,
    serialize_invoice,
)
from .invoice_pdf import render_invoice_pdf
from .emailer import send_invoice_email

router = APIRouter(prefix="/business", tags=["business"])
logger = logging.getLogger(__name__)
receivable_tracking = ReceivableTrackingService()


@router.get("/clients", response_model=list[ClientOut])
def list_clients(session: Session = Depends(get_session)):
    return session.execute(
        select(Client).order_by(Client.is_active.desc(), func.lower(Client.name), Client.id)
    ).scalars().all()


@router.post("/clients", response_model=ClientOut)
def create_client(payload: ClientCreate, session: Session = Depends(get_session)):
    name = _normalize_client_name(payload.name)
    client = ensure_client(
        session,
        client_name=name,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        notes=payload.notes,
    )
    client.is_active = 1 if payload.is_active else 0
    session.add(client)
    session.commit()
    session.refresh(client)
    return client


@router.post("/clients/{client_id}", response_model=ClientOut)
def update_client(client_id: int, payload: ClientCreate, session: Session = Depends(get_session)):
    client = session.execute(select(Client).where(Client.id == client_id)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.name = _normalize_client_name(payload.name)
    client.email = payload.email
    client.phone = payload.phone
    client.address = payload.address
    client.notes = payload.notes
    client.is_active = 1 if payload.is_active else 0
    session.commit()
    return client


@router.delete("/clients/{client_id}")
def delete_client(client_id: int, session: Session = Depends(get_session)):
    client = session.execute(select(Client).where(Client.id == client_id)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    dependencies = _client_dependency_counts(session, client_id)
    if not any(dependencies.values()):
        session.delete(client)
        session.commit()
        return {"status": "deleted"}
    client.is_active = 0
    session.commit()
    return {"status": "archived", "dependencies": dependencies}


@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(session: Session = Depends(get_session)):
    invoices = session.execute(
        select(Invoice).order_by(Invoice.issue_date.desc(), Invoice.id.desc())
    ).scalars().all()
    summary = invoice_payment_summary(session, [invoice.id for invoice in invoices])
    return [serialize_invoice(session, invoice, summary.get(invoice.id)) for invoice in invoices]


@router.get("/invoice-archives", response_model=list[ArchivedInvoiceOut])
def list_invoice_archives(session: Session = Depends(get_session)):
    archives = session.execute(
        select(ArchivedInvoice).order_by(ArchivedInvoice.issue_date.desc(), ArchivedInvoice.id.desc())
    ).scalars().all()
    summary = archived_invoice_payment_summary(session, [archive.id for archive in archives])
    return [serialize_archived_invoice(session, archive, summary.get(archive.id)) for archive in archives]


@router.get("/invoice-archives/{archive_id}", response_model=ArchivedInvoiceDetailOut)
def get_invoice_archive_detail(archive_id: int, session: Session = Depends(get_session)):
    archive = session.execute(
        select(ArchivedInvoice).where(ArchivedInvoice.id == archive_id)
    ).scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="Archived invoice not found")
    return archived_invoice_detail(session, archive)


@router.post("/invoice-archives/upload", response_model=ArchivedInvoiceOut)
def upload_invoice_archive(
    file: UploadFile = File(...),
    client_id: int | None = Form(None),
    client_name: str | None = Form(None),
    number: str | None = Form(None),
    issue_date: str | None = Form(None),
    due_date: str | None = Form(None),
    currency: str | None = Form(None),
    total: float | None = Form(None),
    status: str | None = Form(None),
    notes: str | None = Form(None),
    session: Session = Depends(get_session),
):
    content = file.file.read()
    try:
        record = create_archived_invoice_from_upload(
            session,
            file_bytes=content,
            original_name=file.filename or "invoice.pdf",
            mime_type=file.content_type,
            client_id=client_id,
            client_name=client_name,
            number=number,
            issue_date=issue_date,
            due_date=due_date,
            currency=currency,
            total=total,
            status=status,
            notes=notes,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    receivable_tracking.reconcile_after_ledger_change(session, archived_invoice_ids=[record.id])
    session.commit()
    session.refresh(record)
    return serialize_archived_invoice(session, record)


@router.post("/invoice-archives/{archive_id}", response_model=ArchivedInvoiceDetailOut)
def update_invoice_archive(
    archive_id: int,
    payload: ArchivedInvoiceUpdate,
    session: Session = Depends(get_session),
):
    try:
        archive = update_archived_invoice(session, archive_id, payload.model_dump())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    receivable_tracking.reconcile_after_ledger_change(session, archived_invoice_ids=[archive.id])
    session.commit()
    session.refresh(archive)
    return archived_invoice_detail(session, archive)


@router.get("/invoice-archives/{archive_id}/download")
def download_invoice_archive(archive_id: int, session: Session = Depends(get_session)):
    archive = session.execute(
        select(ArchivedInvoice).where(ArchivedInvoice.id == archive_id)
    ).scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="Archived invoice not found")
    file_path = Path(archive.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archived invoice file missing")
    return FileResponse(file_path, filename=archive.file_name or file_path.name)


@router.delete("/invoice-archives/{archive_id}")
def delete_invoice_archive(archive_id: int, session: Session = Depends(get_session)):
    archive = session.execute(
        select(ArchivedInvoice).where(ArchivedInvoice.id == archive_id)
    ).scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="Archived invoice not found")
    file_path = Path(archive.file_path)
    session.execute(
        ArchivedInvoicePaymentLink.__table__.delete().where(
            ArchivedInvoicePaymentLink.archived_invoice_id == archive_id
        )
    )
    session.delete(archive)
    session.commit()
    file_path.unlink(missing_ok=True)
    return {"status": "ok"}


@router.get("/invoices/{invoice_id}")
def invoice_detail(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    items = session.execute(select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id)).scalars().all()
    return {
        "invoice": serialize_invoice(session, invoice),
        "line_items": [
            {
                "id": item.id,
                "description": item.description,
                "quantity": float(item.quantity or 0.0),
                "unit_price": float(item.unit_price or 0.0),
                "amount": float(item.amount or 0.0),
            }
            for item in items
        ],
    }


@router.post("/invoices", response_model=InvoiceOut)
def create_invoice_route(payload: InvoiceCreate, session: Session = Depends(get_session)):
    _validate_invoice_payload(payload, session)
    invoice = create_invoice(session, payload.model_dump())
    receivable_tracking.reconcile_after_ledger_change(session, invoice_ids=[invoice.id])
    session.commit()
    session.refresh(invoice)
    return serialize_invoice(session, invoice)


@router.post("/invoices/{invoice_id}", response_model=InvoiceOut)
def update_invoice_route(invoice_id: int, payload: InvoiceCreate, session: Session = Depends(get_session)):
    _validate_invoice_payload(payload, session, invoice_id=invoice_id)
    try:
        invoice = update_invoice(session, invoice_id, payload.model_dump())
    except ValueError as exc:
        if str(exc) == "Invoice not found":
            raise HTTPException(status_code=404, detail="Invoice not found")
        raise HTTPException(status_code=400, detail=str(exc))
    receivable_tracking.reconcile_after_ledger_change(session, invoice_ids=[invoice.id])
    session.commit()
    session.refresh(invoice)
    return serialize_invoice(session, invoice)


@router.delete("/invoices/{invoice_id}")
def delete_invoice(invoice_id: int, session: Session = Depends(get_session)):
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    session.execute(InvoiceLineItem.__table__.delete().where(InvoiceLineItem.invoice_id == invoice_id))
    session.execute(InvoicePaymentLink.__table__.delete().where(InvoicePaymentLink.invoice_id == invoice_id))
    session.execute(
        TimeEntry.__table__.update()
        .where(TimeEntry.invoiced_invoice_id == invoice_id)
        .values(invoiced_invoice_id=None)
    )
    session.delete(invoice)
    session.commit()
    return {"status": "ok"}


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, session: Session = Depends(get_session)):
    try:
        pdf_bytes = render_invoice_pdf(session, invoice_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    filename = f'Invoice-{(invoice.number if invoice and invoice.number else invoice_id)}.pdf'
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.post("/invoices/{invoice_id}/apply-payment")
def apply_payment_route(invoice_id: int, payload: InvoicePaymentApply, session: Session = Depends(get_session)):
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        apply_payment(session, invoice_id, payload.transaction_id, payload.amount)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    receivable_tracking.reconcile_after_ledger_change(session, invoice_ids=[invoice_id])
    session.commit()
    session.refresh(invoice)
    return serialize_invoice(session, invoice)


@router.post("/invoice-archives/{archive_id}/apply-payment")
def apply_payment_archive_route(
    archive_id: int,
    payload: InvoicePaymentApply,
    session: Session = Depends(get_session),
):
    try:
        result = apply_archived_invoice_payment(session, archive_id, payload.transaction_id, payload.amount)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    receivable_tracking.reconcile_after_ledger_change(session, archived_invoice_ids=[archive_id])
    session.commit()
    return result


@router.delete("/invoice-archives/{archive_id}/payments/{payment_link_id}")
def delete_payment_archive_route(
    archive_id: int,
    payment_link_id: int,
    session: Session = Depends(get_session),
):
    try:
        result = remove_archived_invoice_payment(session, archive_id, payment_link_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    session.commit()
    return result


@router.post("/invoices/{invoice_id}/send")
def send_invoice(
    invoice_id: int,
    payload: InvoiceSendRequest | None = None,
    session: Session = Depends(get_session),
):
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    client = session.execute(select(Client).where(Client.id == invoice.client_id)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Client not found")
    recipient_email = (payload.recipient_email if payload else None) or client.email
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Recipient email is required")
    try:
        pdf_bytes = render_invoice_pdf(session, invoice_id)
        send_invoice_email(session, invoice, client, pdf_bytes, recipient_email=recipient_email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception:
        logger.exception("Failed to send invoice email")
        raise HTTPException(status_code=500, detail="Unable to send invoice email")
    invoice.status = "sent"
    session.commit()
    return {"status": "sent"}


@router.post("/invoices/{invoice_id}/status")
def update_invoice_status(invoice_id: int, status: str, session: Session = Depends(get_session)):
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice.status = status
    session.commit()
    return {"status": "ok", "invoice_status": invoice.status}


def _validate_invoice_payload(payload: InvoiceCreate, session: Session, invoice_id: int | None = None) -> None:
    if not payload.client_id:
        raise HTTPException(status_code=400, detail="Client is required")
    client = session.execute(select(Client).where(Client.id == payload.client_id)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Client not found")
    if not payload.issue_date:
        raise HTTPException(status_code=400, detail="Issue date is required")
    if not payload.line_items:
        raise HTTPException(status_code=400, detail="At least one line item is required")
    for idx, item in enumerate(payload.line_items, start=1):
        if not item.description.strip():
            raise HTTPException(status_code=400, detail=f"Line item {idx} needs a description")
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail=f"Line item {idx} needs a quantity greater than 0")
        if item.unit_price < 0:
            raise HTTPException(status_code=400, detail=f"Line item {idx} needs a non-negative unit price")
    line_subtotal = round(sum(float(item.quantity) * float(item.unit_price) for item in payload.line_items), 2)
    resolved_total = line_subtotal if payload.agreed_total is None else round(float(payload.agreed_total), 2)
    if payload.agreed_total is not None:
        if not math.isfinite(float(payload.agreed_total)):
            raise HTTPException(status_code=400, detail="Agreed total must be a valid number")
        if resolved_total < 0:
            raise HTTPException(status_code=400, detail="Agreed total must be zero or greater")
    if invoice_id is not None:
        paid_total = session.execute(
            select(func.sum(InvoicePaymentLink.amount)).where(InvoicePaymentLink.invoice_id == invoice_id)
        ).scalar()
        if resolved_total + 0.005 < float(paid_total or 0.0):
            raise HTTPException(status_code=400, detail="Invoice total cannot be lower than linked payments")


def _normalize_client_name(name: str) -> str:
    normalized = (name or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Client name is required")
    return normalized


def _client_dependency_counts(session: Session, client_id: int) -> dict[str, int]:
    return {
        "projects": int(
            session.execute(select(func.count()).select_from(Project).where(Project.client_id == client_id)).scalar()
            or 0
        ),
        "live_invoices": int(
            session.execute(select(func.count()).select_from(Invoice).where(Invoice.client_id == client_id)).scalar()
            or 0
        ),
        "archived_invoices": int(
            session.execute(
                select(func.count()).select_from(ArchivedInvoice).where(ArchivedInvoice.client_id == client_id)
            ).scalar()
            or 0
        ),
    }
