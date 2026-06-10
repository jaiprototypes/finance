from __future__ import annotations

import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from ...core.settings import get_setting


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _smtp_settings(session):
    host = get_setting(session, "smtp_host", "") or ""
    port_raw = get_setting(session, "smtp_port", "") or ""
    username = get_setting(session, "smtp_username", "") or ""
    password = get_setting(session, "smtp_password", "") or ""
    from_email = get_setting(session, "smtp_from_email", "") or get_setting(session, "company_email", "") or ""
    from_name = get_setting(session, "smtp_from_name", "") or get_setting(session, "company_name", "") or ""
    use_tls = _as_bool(get_setting(session, "smtp_use_tls", "true"), default=True)
    use_ssl = _as_bool(get_setting(session, "smtp_use_ssl", "false"), default=False)

    if not host or not port_raw:
        raise ValueError("SMTP host and port are required to send invoices.")
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError("SMTP port must be a number.") from exc
    if not username or not password:
        raise ValueError("SMTP username and password are required to send invoices.")
    if not from_email and "@" in username:
        from_email = username
    if not from_email:
        raise ValueError("Sender email is required to send invoices.")

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "from_email": from_email,
        "from_name": from_name,
        "use_tls": use_tls,
        "use_ssl": use_ssl,
    }


def send_invoice_email(session, invoice, client, pdf_bytes: bytes, recipient_email: str | None = None) -> None:
    settings = _smtp_settings(session)
    recipient = (recipient_email or client.email or "").strip()
    if not recipient:
        raise ValueError("Recipient email is required")
    subject = f"Invoice {invoice.number or invoice.id}"
    body_lines = [
        f"Hi {client.name or 'there'},",
        "",
        f"Please find your invoice{f' #{invoice.number}' if invoice.number else ''}.",
        f"Total: {invoice.total:.2f} {invoice.currency}",
    ]
    if invoice.due_date:
        body_lines.append(f"Due date: {invoice.due_date}")
    body_lines.extend(["", "Thanks,"])

    message = EmailMessage()
    message["To"] = recipient
    message["From"] = formataddr((settings["from_name"], settings["from_email"]))
    message["Subject"] = subject
    message.set_content("\n".join(body_lines))
    filename = f"Invoice-{invoice.number or invoice.id}.pdf"
    message.add_attachment(pdf_bytes, maintype="application", subtype="pdf", filename=filename)

    if settings["use_ssl"]:
        server = smtplib.SMTP_SSL(settings["host"], settings["port"], timeout=20)
    else:
        server = smtplib.SMTP(settings["host"], settings["port"], timeout=20)

    try:
        if settings["use_tls"] and not settings["use_ssl"]:
            server.starttls()
        server.login(settings["username"], settings["password"])
        server.send_message(message)
    finally:
        try:
            server.quit()
        except Exception:
            server.close()


def send_test_email(session, to_email: str | None = None) -> None:
    settings = _smtp_settings(session)
    recipient = to_email or settings["from_email"] or settings["username"]
    if not recipient:
        raise ValueError("Test email recipient is required.")

    message = EmailMessage()
    message["To"] = recipient
    message["From"] = formataddr((settings["from_name"], settings["from_email"]))
    message["Subject"] = "Invoice email test"
    message.set_content("This is a test email from your Finances app.")

    if settings["use_ssl"]:
        server = smtplib.SMTP_SSL(settings["host"], settings["port"], timeout=20)
    else:
        server = smtplib.SMTP(settings["host"], settings["port"], timeout=20)

    try:
        if settings["use_tls"] and not settings["use_ssl"]:
            server.starttls()
        server.login(settings["username"], settings["password"])
        server.send_message(message)
    finally:
        try:
            server.quit()
        except Exception:
            server.close()
