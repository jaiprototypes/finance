from collections import defaultdict

from sqlalchemy import select

from .models import Project, Task, TimeEntry
from ..receivables.invoices import create_invoice


def invoice_from_time_entries(session, payload: dict) -> int:
    entry_ids = payload.get("time_entry_ids") or []
    if not entry_ids:
        raise ValueError("No time entries provided")

    entries = session.execute(select(TimeEntry).where(TimeEntry.id.in_(entry_ids))).scalars().all()
    if not entries:
        raise ValueError("No matching time entries")

    project_ids = {e.project_id for e in entries}
    projects = session.execute(select(Project).where(Project.id.in_(project_ids))).scalars().all()
    project_map = {p.id: p for p in projects}

    task_ids = {e.task_id for e in entries if e.task_id}
    task_map = {}
    if task_ids:
        tasks = session.execute(select(Task).where(Task.id.in_(task_ids))).scalars().all()
        task_map = {t.id: t for t in tasks}

    group_by = payload.get("group_by", "day")

    grouped = defaultdict(lambda: {"minutes": 0, "rate": 0.0, "label": ""})
    for entry in entries:
        rate = entry.hourly_rate
        if rate is None:
            project = project_map.get(entry.project_id)
            rate = project.hourly_rate if project else 0.0
        rate = rate or 0.0

        if group_by == "task":
            task = task_map.get(entry.task_id)
            label = task.name if task else "General"
            key = (f"Task: {label}", rate)
        else:
            label = entry.date
            key = (f"Time entries {label}", rate)

        grouped[key]["minutes"] += entry.duration_minutes
        grouped[key]["rate"] = rate
        grouped[key]["label"] = key[0]

    line_items = []
    for key, data in grouped.items():
        hours = data["minutes"] / 60.0
        line_items.append({
            "description": data["label"],
            "quantity": round(hours, 2),
            "unit_price": data["rate"],
        })

    invoice_data = {
        "client_id": payload["client_id"],
        "number": payload["number"],
        "status": payload.get("status", "draft"),
        "issue_date": payload["issue_date"],
        "due_date": payload.get("due_date"),
        "currency": payload["currency"],
        "notes": payload.get("notes"),
        "agreed_total": payload.get("agreed_total"),
        "line_items": line_items,
    }

    invoice = create_invoice(session, invoice_data)
    session.flush()

    for entry in entries:
        entry.invoiced_invoice_id = invoice.id

    return invoice.id
