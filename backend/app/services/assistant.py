from __future__ import annotations

import re
import json
from typing import Any

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from ..models import Client, DebtProfile, Invoice, Project, Task, TimeEntry, Transaction
from .currency import ensure_recent_fx_rates, get_recent_fortnightly_average_aud_per_usd
from .debts import build_payoff_plan
from .invoice_tracking import auto_track_receivables, invoice_payment_summary, serialize_invoice
from .local_ai import LocalAIUnavailableError, call_local_json, local_ai_status
from .reports import budget_status, expense_analysis, net_worth, timesheet_summary


def _refresh_fx_if_needed(session: Session) -> None:
    inserted = ensure_recent_fx_rates(session)
    if inserted:
        session.commit()
    get_recent_fortnightly_average_aud_per_usd(session)


def _normalized_limit(limit: int, default: int = 8, maximum: int = 25) -> int:
    if limit <= 0:
        return default
    return min(limit, maximum)


def _normalize_text(value: str | None) -> str:
    return " ".join((value or "").strip().split())


def _commentary_response(session: Session, task: str, grounding: dict[str, Any]) -> dict[str, Any]:
    status = local_ai_status(session)
    if not status["enabled"] or not status["configured"]:
        return {
            "status": "disabled",
            "model": None,
            "commentary": None,
            "highlights": [],
            "warnings": [
                "Local AI is disabled or incomplete. Grounding data is still available for deterministic review."
            ],
            "grounding": grounding,
        }

    system_prompt = (
        "You are a privacy-preserving local finance assistant.\n"
        "You must only use the provided grounding JSON.\n"
        "You are not the source of truth for balances, budgets, debt math, invoices, or bookkeeping.\n"
        "Do not invent records, totals, or dates.\n"
        'Return JSON with keys: "commentary" (string), "highlights" (array of strings), "warnings" (array of strings).'
    )
    user_prompt = (
        f"Task: {task}\n"
        "Use only the grounding JSON below. Keep commentary concise and practical.\n"
        "If the grounding is insufficient for a claim, say so in warnings.\n"
        f"Grounding JSON:\n{json.dumps(grounding, ensure_ascii=True)}"
    )
    try:
        payload = call_local_json(
            session,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=450,
        )
    except LocalAIUnavailableError as exc:
        return {
            "status": "unavailable",
            "model": status["model"],
            "commentary": None,
            "highlights": [],
            "warnings": [str(exc)],
            "grounding": grounding,
        }
    except Exception as exc:
        return {
            "status": "error",
            "model": status["model"],
            "commentary": None,
            "highlights": [],
            "warnings": [f"Local AI returned an unusable response: {exc}"],
            "grounding": grounding,
        }

    highlights = payload.get("highlights")
    warnings = payload.get("warnings")
    return {
        "status": "generated",
        "model": status["model"],
        "commentary": _normalize_text(str(payload.get("commentary") or "")) or None,
        "highlights": [str(item).strip() for item in highlights] if isinstance(highlights, list) else [],
        "warnings": [str(item).strip() for item in warnings] if isinstance(warnings, list) else [],
        "grounding": grounding,
    }


def search_records(session: Session, query: str, limit: int = 8) -> dict[str, Any]:
    cleaned_query = _normalize_text(query)
    if not cleaned_query:
        return {
            "query": "",
            "transactions": [],
            "invoices": [],
            "time_entries": [],
            "knowledge": [],
        }

    max_rows = _normalized_limit(limit)
    like = f"%{cleaned_query}%"

    transactions = [
        {
            "id": txn.id,
            "date": txn.date,
            "description": txn.description,
            "payee": txn.payee,
            "amount": txn.amount,
            "currency": txn.currency,
            "classification": txn.classification,
        }
        for txn in session.execute(
            select(Transaction)
            .where(
                or_(
                    Transaction.description.ilike(like),
                    Transaction.payee.ilike(like),
                    Transaction.notes.ilike(like),
                )
            )
            .order_by(Transaction.date.desc(), Transaction.id.desc())
            .limit(max_rows)
        ).scalars()
    ]

    invoice_rows = session.execute(
        select(Invoice, Client.name)
        .join(Client, Client.id == Invoice.client_id)
        .where(
            or_(
                Invoice.number.ilike(like),
                Invoice.notes.ilike(like),
                Client.name.ilike(like),
            )
        )
        .order_by(Invoice.issue_date.desc(), Invoice.id.desc())
        .limit(max_rows)
    ).all()
    invoices = [
        {
            "id": invoice.id,
            "number": invoice.number,
            "status": invoice.status,
            "issue_date": invoice.issue_date,
            "due_date": invoice.due_date,
            "currency": invoice.currency,
            "total": invoice.total,
            "client_name": client_name,
        }
        for invoice, client_name in invoice_rows
    ]

    time_rows = session.execute(
        select(TimeEntry, Project.name, Task.name)
        .join(Project, Project.id == TimeEntry.project_id)
        .outerjoin(Task, Task.id == TimeEntry.task_id)
        .where(
            or_(
                Project.name.ilike(like),
                Task.name.ilike(like),
                TimeEntry.notes.ilike(like),
            )
        )
        .order_by(TimeEntry.date.desc(), TimeEntry.id.desc())
        .limit(max_rows)
    ).all()
    time_entries = [
        {
            "id": entry.id,
            "date": entry.date,
            "duration_minutes": entry.duration_minutes,
            "billable": bool(entry.billable),
            "project_name": project_name,
            "task_name": task_name,
            "notes": entry.notes,
        }
        for entry, project_name, task_name in time_rows
    ]

    knowledge_tokens = re.findall(r"[a-z0-9]+", cleaned_query.lower())
    knowledge_query = " OR ".join(knowledge_tokens[:8])
    knowledge = []
    if knowledge_query:
        knowledge = [
            dict(row)
            for row in session.execute(
                text(
                    """
                    SELECT k.id, k.title, k.tags, substr(k.content, 1, 220) AS excerpt
                    FROM knowledge_base_entry k
                    JOIN knowledge_base_fts fts ON k.id = fts.rowid
                    WHERE k.is_active = 1 AND knowledge_base_fts MATCH :q
                    ORDER BY bm25(knowledge_base_fts)
                    LIMIT :limit
                    """
                ),
                {"q": knowledge_query, "limit": max_rows},
            ).mappings().all()
        ]

    return {
        "query": cleaned_query,
        "transactions": transactions,
        "invoices": invoices,
        "time_entries": time_entries,
        "knowledge": knowledge,
    }


def spending_assistant(session: Session, months: int = 3) -> dict[str, Any]:
    _refresh_fx_if_needed(session)
    analysis = expense_analysis(session, months=max(months, 1))
    grounding = {
        "period_months": max(months, 1),
        "base_currency": analysis.get("base_currency"),
        "average_monthly_spend": analysis.get("avg_spend"),
        "monthly": analysis.get("monthly", []),
        "top_categories": analysis.get("categories", [])[:5],
        "top_merchants": analysis.get("merchants", [])[:5],
    }
    return _commentary_response(
        session,
        task="Summarize spending patterns and call out the largest categories and merchants.",
        grounding=grounding,
    )


def budget_variance_assistant(session: Session, month: str | None = None) -> dict[str, Any]:
    _refresh_fx_if_needed(session)
    summary = budget_status(session, month=month)
    targets = summary.get("targets", [])
    overspent = sorted(
        [row for row in targets if float(row.get("remaining") or 0.0) < 0],
        key=lambda row: float(row.get("remaining") or 0.0),
    )[:5]
    grounding = {
        "month": summary.get("month"),
        "base_currency": summary.get("base_currency"),
        "total_target": summary.get("total_target"),
        "total_spent": summary.get("total_spent"),
        "total_remaining": summary.get("total_remaining"),
        "largest_overruns": overspent,
        "tracked_targets": targets[:12],
    }
    return _commentary_response(
        session,
        task="Explain the budget variance for this month using the grounded category targets and spending totals.",
        grounding=grounding,
    )


def debt_assistant(session: Session, strategy: str = "avalanche", extra_payment: float = 0.0) -> dict[str, Any]:
    _refresh_fx_if_needed(session)
    worth = net_worth(session)
    balances = {
        int(account["account_id"]): float(account.get("ledger_balance") or 0.0)
        for account in worth.get("accounts", [])
    }
    debts = []
    for profile in session.execute(select(DebtProfile).order_by(DebtProfile.id)).scalars().all():
        balance = abs(float(balances.get(profile.account_id) or 0.0))
        debts.append(
            {
                "debt_id": str(profile.id),
                "name": f"Account {profile.account_id}",
                "balance": balance,
                "apr": float(profile.apr or 0.0),
                "min_payment": float(profile.min_payment or 0.0),
            }
        )
    payoff = build_payoff_plan(debts, strategy=strategy, extra_payment=float(extra_payment or 0.0))
    grounding = {
        "strategy": strategy,
        "extra_payment": float(extra_payment or 0.0),
        "base_currency": worth.get("base_currency"),
        "debts": debts,
        "payoff_plan": payoff,
    }
    return _commentary_response(
        session,
        task="Comment on the debt payoff scenario without changing the deterministic schedule or balances.",
        grounding=grounding,
    )


def invoice_assistant(session: Session) -> dict[str, Any]:
    tracking = auto_track_receivables(session)
    if tracking["status_updates"] or tracking["auto_applied"]:
        session.commit()
    invoice_rows = session.execute(
        select(Invoice, Client.name).join(Client, Client.id == Invoice.client_id).order_by(Invoice.issue_date.desc(), Invoice.id.desc())
    ).all()
    summary = invoice_payment_summary(session, [invoice.id for invoice, _client_name in invoice_rows])
    open_total = 0.0
    open_count = 0
    invoices: list[dict[str, Any]] = []
    for invoice, client_name in invoice_rows[:20]:
        payload = serialize_invoice(session, invoice, summary.get(invoice.id))
        if payload["status"] not in {"paid", "void"}:
            open_total += float(payload["balance_due"] or 0.0)
            open_count += 1
        invoices.append(
            {
                "id": payload["id"],
                "number": payload["number"],
                "status": payload["status"],
                "issue_date": payload["issue_date"],
                "due_date": payload["due_date"],
                "currency": payload["currency"],
                "total": payload["total"],
                "balance_due": payload["balance_due"],
                "paid_total": payload["paid_total"],
                "is_overdue": payload["is_overdue"],
                "client_name": client_name,
            }
        )
    grounding = {
        "open_invoice_count": open_count,
        "open_invoice_total": open_total,
        "recent_invoices": invoices,
    }
    return _commentary_response(
        session,
        task="Summarize invoice pipeline health and highlight unpaid or overdue concentration.",
        grounding=grounding,
    )


def timesheet_assistant(session: Session) -> dict[str, Any]:
    summary = timesheet_summary(session)
    entries = [
        {
            "id": entry.id,
            "date": entry.date,
            "project_id": entry.project_id,
            "task_id": entry.task_id,
            "duration_minutes": entry.duration_minutes,
            "billable": bool(entry.billable),
            "notes": entry.notes,
        }
        for entry in session.execute(select(TimeEntry).order_by(TimeEntry.date.desc(), TimeEntry.id.desc()).limit(20)).scalars()
    ]
    grounding = {
        "total_hours": summary.get("total_hours"),
        "billable_hours": summary.get("billable_hours"),
        "non_billable_hours": summary.get("non_billable_hours"),
        "effective_hourly_rate": summary.get("effective_hourly_rate"),
        "by_week": summary.get("by_week", []),
        "by_project": summary.get("by_project", []),
        "recent_entries": entries,
    }
    return _commentary_response(
        session,
        task="Summarize timesheet and project effort patterns from the grounded time-entry records.",
        grounding=grounding,
    )


def search_assistant(session: Session, query: str, limit: int = 8) -> dict[str, Any]:
    grounding = search_records(session, query=query, limit=limit)
    return _commentary_response(
        session,
        task="Answer the user's search intent by summarizing the grounded matches across transactions, invoices, time entries, and knowledge notes.",
        grounding=grounding,
    )
