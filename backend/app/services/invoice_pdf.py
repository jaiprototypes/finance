from pathlib import Path
import logging
import sys

from fpdf import FPDF
from fpdf.enums import MethodReturnValue, XPos, YPos
from sqlalchemy import select

from ..models import Client, Invoice, InvoiceLineItem
from ..services.settings import get_setting

logger = logging.getLogger(__name__)

PAGE_MARGIN = 14
ROW_HEIGHT = 5
DESCRIPTION_PADDING = 2
BRAND_COLOR = (23, 79, 140)
INK = (15, 23, 42)
MUTED = (71, 85, 105)
LINE = (203, 213, 225)
SURFACE = (248, 250, 252)
def _safe_text(value: str | None) -> str:
    text = str(value or "")
    try:
        text.encode("latin-1")
        return text
    except UnicodeEncodeError:
        return text.encode("latin-1", "replace").decode("latin-1")


def _format_money(amount: float | None, currency: str | None) -> str:
    value = float(amount or 0.0)
    return f"{value:,.2f} {str(currency or '').upper()}".strip()


def _format_money_signed(amount: float | None, currency: str | None) -> str:
    value = float(amount or 0.0)
    sign = "-" if value < 0 else ""
    return f"{sign}{abs(value):,.2f} {str(currency or '').upper()}".strip()


def _split_lines(value: str | None) -> list[str]:
    return [line.strip() for line in str(value or "").splitlines() if line.strip()]


def _join_bits(bits: list[str]) -> str:
    return " · ".join([bit.strip() for bit in bits if bit and bit.strip()])


def _build_company_lines(session) -> tuple[str, list[str]]:
    company_name = (
        get_setting(session, "company_name", "")
        or get_setting(session, "company_dba", "")
        or get_setting(session, "company_legal_name", "")
        or "Business"
    )
    company_legal_name = get_setting(session, "company_legal_name", "") or ""
    company_email = get_setting(session, "company_email", "") or ""
    company_phone = get_setting(session, "company_phone", "") or ""
    company_address = get_setting(session, "company_address", "") or ""
    company_city_state = get_setting(session, "company_city_state", "") or ""

    lines: list[str] = []
    if company_legal_name and company_legal_name.strip() != company_name.strip():
        lines.append(company_legal_name.strip())
    lines.extend(_split_lines(company_address))
    if company_city_state and company_city_state.strip().lower() not in company_address.lower():
        lines.append(company_city_state.strip())
    contact_line = _join_bits([company_email, company_phone])
    if contact_line:
        lines.append(contact_line)
    return company_name.strip(), lines


def _build_client_lines(client: Client | None) -> list[str]:
    if not client:
        return ["Client record missing"]
    lines: list[str] = [client.name]
    lines.extend(_split_lines(client.address))
    contact_bits = _join_bits([client.email or "", client.phone or ""])
    if contact_bits:
        lines.append(contact_bits)
    return lines


def _resolve_logo_file(session) -> Path | None:
    logo_path = get_setting(session, "company_logo_path", "") or ""
    candidates: list[Path] = []
    if logo_path:
        candidates.append(Path(logo_path).expanduser())
    source_logo = Path(__file__).resolve().parent.parent / "assets" / "logo.png"
    bundle_roots = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", "")
        if meipass:
            bundle_roots.append(Path(meipass))
        bundle_roots.append(Path(sys.executable).resolve().parent)
        bundle_roots.append(Path(sys.executable).resolve().parent / "_internal")
    for root in bundle_roots:
        candidates.append(root / "app" / "assets" / "logo.png")
        candidates.append(root / "assets" / "logo.png")
    candidates.append(source_logo)
    for logo_file in candidates:
        try:
            if logo_file.exists():
                return logo_file
        except Exception:
            logger.warning("Failed to resolve invoice logo", exc_info=True)
    return None


def _draw_logo(pdf: FPDF, logo_file: Path | None, x: float, y: float, size: float) -> float:
    if not logo_file:
        return 0.0
    try:
        pdf.image(str(logo_file), x=x, y=y, w=size, h=size)
        return size + 5
    except Exception:
        logger.warning("Failed to render invoice logo", exc_info=True)
        return 0.0


def _draw_logo_watermark(pdf: FPDF, logo_file: Path | None) -> None:
    if not logo_file:
        return
    width = pdf.w * 0.56
    height = width
    x = (pdf.w - width) / 2
    y = (pdf.h - height) / 2 + 18
    try:
        with pdf.local_context(fill_opacity=0.14):
            pdf.image(str(logo_file), x=x, y=y, w=width, h=height)
    except Exception:
        logger.warning("Failed to render invoice watermark", exc_info=True)


def _invoice_adjustment(invoice: Invoice) -> float:
    return round(float(invoice.total or 0.0) - float(invoice.subtotal or 0.0) - float(invoice.tax or 0.0), 2)


def _render_invoice_facts(pdf: FPDF, x: float, y: float, w: float, invoice: Invoice) -> float:
    rows = [
        ("Issue", str(invoice.issue_date or "—")),
        ("Due", str(invoice.due_date or "On receipt")),
        ("Total due", _format_money(invoice.total, invoice.currency)),
    ]
    pdf.set_text_color(*MUTED)
    pdf.set_xy(x, y)
    pdf.set_font("Helvetica", size=8)
    pdf.cell(w, 4, "INVOICE", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_text_color(*INK)
    pdf.set_x(x)
    pdf.set_font("Helvetica", style="B", size=18)
    pdf.cell(w, 9, _safe_text(invoice.number or f"INV-{invoice.id}"), align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    current_y = pdf.get_y() + 2
    label_width = 14
    for label, value in rows:
        pdf.set_xy(x, current_y)
        pdf.set_font("Helvetica", size=8)
        pdf.set_text_color(*MUTED)
        pdf.cell(label_width, 5.5, _safe_text(label.upper()))
        pdf.set_xy(x + label_width, current_y)
        pdf.set_font("Helvetica", style="B" if label == "Total due" else "", size=9)
        pdf.set_text_color(*INK)
        pdf.cell(w - label_width, 5.5, _safe_text(value), align="R")
        current_y += 5.5
    return current_y - y


def _info_block_height(pdf: FPDF, width: float, lines: list[str]) -> float:
    available_width = max(width - 8, 20)
    line_count = 0
    for line in lines or [""]:
        wrapped = pdf.multi_cell(
            available_width,
            4.6,
            _safe_text(line),
            dry_run=True,
            output=MethodReturnValue.LINES,
        )
        line_count += max(len(wrapped), 1)
    return 14 + max(line_count, 1) * 5


def _render_info_block(pdf: FPDF, x: float, y: float, w: float, title: str, lines: list[str]) -> float:
    pdf.set_font("Helvetica", size=9)
    block_height = _info_block_height(pdf, w, lines)
    pdf.set_xy(x, y)
    pdf.set_font("Helvetica", size=8)
    pdf.set_text_color(*MUTED)
    pdf.cell(w, 4, _safe_text(title.upper()), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_text_color(*INK)
    if lines:
        pdf.set_font("Helvetica", style="B", size=10)
        pdf.set_x(x)
        pdf.multi_cell(w, 5, _safe_text(lines[0]))
        pdf.set_font("Helvetica", size=9)
        for line in lines[1:]:
            pdf.set_x(x)
            pdf.multi_cell(w, 4.6, _safe_text(line))
    return block_height


def _render_table_header(pdf: FPDF, widths: tuple[float, float, float, float]) -> None:
    description_w, qty_w, unit_w, amount_w = widths
    total_width = description_w + qty_w + unit_w + amount_w
    header_y = pdf.get_y()
    pdf.set_font("Helvetica", style="B", size=9)
    pdf.set_text_color(*MUTED)
    pdf.cell(description_w, 7, "Description")
    pdf.cell(qty_w, 7, "Qty", align="R")
    pdf.cell(unit_w, 7, "Unit", align="R")
    pdf.cell(amount_w, 7, "Amount", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(*LINE)
    pdf.line(pdf.l_margin, header_y + 8, pdf.l_margin + total_width, header_y + 8)
    pdf.ln(2)
    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", size=9)


def _render_line_item_row(
    pdf: FPDF,
    widths: tuple[float, float, float, float],
    item: InvoiceLineItem,
) -> None:
    description_w, qty_w, unit_w, amount_w = widths
    total_width = description_w + qty_w + unit_w + amount_w
    wrapped = pdf.multi_cell(
        description_w,
        ROW_HEIGHT,
        _safe_text(item.description),
        dry_run=True,
        output=MethodReturnValue.LINES,
    )
    line_count = max(len(wrapped), 1)
    row_height = max(8, 2 + line_count * ROW_HEIGHT)
    if pdf.get_y() + row_height > pdf.page_break_trigger:
        pdf.add_page()
        _render_table_header(pdf, widths)

    x = pdf.l_margin
    y = pdf.get_y()
    pdf.set_xy(x, y)
    pdf.multi_cell(
        description_w,
        ROW_HEIGHT,
        _safe_text(item.description),
        new_x="LEFT",
        new_y="TOP",
    )

    numeric_values = [
        (qty_w, f"{float(item.quantity or 0.0):.2f}"),
        (unit_w, f"{float(item.unit_price or 0.0):,.2f}"),
        (amount_w, f"{float(item.amount or 0.0):,.2f}"),
    ]
    current_x = x + description_w
    for width, value in numeric_values:
        pdf.set_xy(current_x, y)
        pdf.cell(width, row_height, _safe_text(value), align="R")
        current_x += width
    pdf.set_draw_color(*LINE)
    pdf.line(x, y + row_height + 1, x + total_width, y + row_height + 1)
    pdf.set_xy(pdf.l_margin, y + row_height + 3)


def _render_totals_block(pdf: FPDF, invoice: Invoice) -> None:
    block_width = 62
    x = pdf.w - pdf.r_margin - block_width
    y = pdf.get_y()
    rows = [("Subtotal", _format_money(invoice.subtotal, invoice.currency))]
    adjustment = _invoice_adjustment(invoice)
    if abs(adjustment) > 0.005:
        rows.append(("Adjustment", _format_money_signed(adjustment, invoice.currency)))
    if float(invoice.tax or 0.0) > 0.005:
        rows.append(("Tax", _format_money(invoice.tax, invoice.currency)))
    rows.append(("Total due", _format_money(invoice.total, invoice.currency)))

    current_y = y
    for label, value in rows:
        is_total = label == "Total due"
        if is_total:
            pdf.set_draw_color(*LINE)
            pdf.line(x, current_y - 1, x + block_width, current_y - 1)
        pdf.set_xy(x + 4, current_y)
        pdf.set_font("Helvetica", style="B" if is_total else "", size=9 if is_total else 8)
        pdf.set_text_color(*INK if is_total else MUTED)
        pdf.cell(20, 6, _safe_text(label.upper() if is_total else label))
        pdf.set_xy(x + 4, current_y)
        pdf.cell(block_width - 8, 6, _safe_text(value), align="R")
        current_y += 7.5


def render_invoice_pdf(session, invoice_id: int) -> bytes:
    invoice = session.execute(select(Invoice).where(Invoice.id == invoice_id)).scalar_one_or_none()
    if not invoice:
        raise ValueError("Invoice not found")

    client = session.execute(select(Client).where(Client.id == invoice.client_id)).scalar_one_or_none()
    items = session.execute(
        select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id).order_by(InvoiceLineItem.id.asc())
    ).scalars().all()

    pdf = FPDF(format="A4")
    pdf.set_margins(PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN)
    pdf.set_auto_page_break(auto=True, margin=PAGE_MARGIN)
    pdf.add_page()
    pdf.set_title(f"Invoice {invoice.number or invoice.id}")

    company_name, company_lines = _build_company_lines(session)
    logo_file = _resolve_logo_file(session)
    _draw_logo_watermark(pdf, logo_file)

    page_width = pdf.w - pdf.l_margin - pdf.r_margin
    facts_width = 68
    gap = 8
    start_y = pdf.get_y()
    left_width = page_width - facts_width - gap
    logo_offset = _draw_logo(pdf, logo_file, pdf.l_margin, start_y, 21)

    pdf.set_text_color(*BRAND_COLOR)
    pdf.set_xy(pdf.l_margin + logo_offset, start_y)
    pdf.set_font("Helvetica", style="B", size=17)
    pdf.multi_cell(left_width - logo_offset, 7, _safe_text(company_name))
    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(*MUTED)
    for line in company_lines:
        pdf.set_x(pdf.l_margin + logo_offset)
        pdf.multi_cell(left_width - logo_offset, 4.6, _safe_text(line))
    left_bottom = max(start_y + 21, pdf.get_y())

    facts_x = pdf.l_margin + left_width + gap
    facts_height = _render_invoice_facts(pdf, facts_x, start_y, facts_width, invoice)
    pdf.set_y(max(left_bottom, start_y + facts_height) + 8)

    block_y = pdf.get_y()
    bill_to_height = _render_info_block(pdf, pdf.l_margin, block_y, page_width, "Bill To", _build_client_lines(client))
    pdf.set_y(block_y + bill_to_height + 8)

    widths = (page_width - 74, 18, 28, 28)
    _render_table_header(pdf, widths)
    for item in items:
        _render_line_item_row(pdf, widths, item)

    pdf.ln(6)
    if invoice.notes:
        notes_width = page_width - 70
        notes_y = pdf.get_y()
        note_lines = _split_lines(invoice.notes)
        notes_height = _info_block_height(pdf, notes_width, note_lines)
        _render_info_block(pdf, pdf.l_margin, notes_y, notes_width, "Notes", note_lines)
        pdf.set_y(notes_y + notes_height + 2)
    _render_totals_block(pdf, invoice)

    output = pdf.output()
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)
    return output.encode("latin-1")
