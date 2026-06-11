from datetime import datetime, timedelta, timezone

from backend.app.features.assistant import service as assistant
from backend.app.features.assistant.local_ai import LocalAIUnavailableError
from backend.app.features.debts.models import DebtProfile
from backend.app.features.fx.models import FXRate
from backend.app.features.ledger.models import Account, Transaction
from backend.app.features.receivables.models import Client, Invoice
from backend.app.features.settings.service import set_setting
from backend.app.features.timesheets.models import Project, TimeEntry
from backend.tests.utils import make_session


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _seed_fx_rates(session, values: list[float]) -> None:
    end_date = datetime.now(tz=timezone.utc).date()
    start_date = end_date - timedelta(days=len(values) - 1)
    for offset, value in enumerate(values):
        day = start_date + timedelta(days=offset)
        session.add(
            FXRate(
                date=day.isoformat(),
                aud_per_usd=float(value),
                source="test",
                created_at=_now_str(),
            )
        )
    session.commit()


def test_search_assistant_returns_grounded_matches_when_model_disabled():
    session = make_session()
    account = Account(
        name="Checking",
        type="checking",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    client = Client(name="Acme Client", email=None, phone=None, address=None, notes=None, is_active=1)
    project = Project(name="Acme Website", client_id=None, hourly_rate=100.0, tags=None, is_active=1)
    session.add_all([account, client, project])
    session.flush()
    session.add(
        Transaction(
            account_id=account.id,
            date="2026-03-01",
            description="Acme hosting",
            amount=-45.0,
            currency="USD",
            payee="Acme",
            notes="hosting bill",
            classification="Business",
            reconciliation_state="verified",
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.add(
        Invoice(
            client_id=client.id,
            number="INV-ACME-001",
            status="sent",
            issue_date="2026-03-02",
            due_date="2026-03-16",
            currency="USD",
            subtotal=250.0,
            tax=0.0,
            total=250.0,
            notes="Acme build sprint",
            created_at=_now_str(),
        )
    )
    session.add(
        TimeEntry(
            project_id=project.id,
            task_id=None,
            date="2026-03-03",
            start_time=None,
            end_time=None,
            duration_minutes=90,
            notes="Acme kickoff",
            billable=1,
            hourly_rate=100.0,
            invoiced_invoice_id=None,
            created_at=_now_str(),
        )
    )
    session.commit()

    result = assistant.search_assistant(session, query="Acme", limit=5)

    assert result["status"] == "disabled"
    assert result["grounding"]["transactions"][0]["description"] == "Acme hosting"
    assert result["grounding"]["invoices"][0]["number"] == "INV-ACME-001"
    assert result["grounding"]["time_entries"][0]["project_name"] == "Acme Website"


def test_search_assistant_returns_grounding_when_local_ai_is_unavailable(monkeypatch):
    session = make_session()
    set_setting(session, "local_ai_enabled", "true")
    session.commit()

    account = Account(
        name="Checking",
        type="checking",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(account)
    session.flush()
    session.add(
        Transaction(
            account_id=account.id,
            date="2026-03-04",
            description="Grocer",
            amount=-12.0,
            currency="USD",
            payee="Grocer",
            notes="weekly shop",
            classification="Personal",
            reconciliation_state="verified",
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.commit()

    monkeypatch.setattr(assistant, "call_local_json", lambda *args, **kwargs: (_ for _ in ()).throw(LocalAIUnavailableError("offline")))

    result = assistant.search_assistant(session, query="Grocer", limit=5)

    assert result["status"] == "unavailable"
    assert "offline" in result["warnings"][0]
    assert result["grounding"]["transactions"][0]["payee"] == "Grocer"


def test_debt_assistant_uses_deterministic_payoff_grounding():
    session = make_session()
    _seed_fx_rates(session, [1.5] * 14)
    account = Account(
        name="Card",
        type="credit card",
        currency="USD",
        institution="Test Bank",
        note=None,
        is_active=1,
        created_at=_now_str(),
        updated_at=_now_str(),
    )
    session.add(account)
    session.flush()
    session.add(
        Transaction(
            account_id=account.id,
            date="2026-03-01",
            description="Opening card balance",
            amount=-1000.0,
            currency="USD",
            payee=None,
            notes=None,
            classification="Personal",
            reconciliation_state="imported",
            created_at=_now_str(),
            updated_at=_now_str(),
        )
    )
    session.add(
        DebtProfile(
            account_id=account.id,
            apr=0.18,
            min_payment=50.0,
            due_date="2026-03-28",
            compounding="daily",
            created_at=_now_str(),
        )
    )
    session.commit()

    result = assistant.debt_assistant(session, strategy="avalanche", extra_payment=25.0)

    assert result["status"] == "disabled"
    assert result["grounding"]["debts"][0]["balance"] == 1000.0
    assert result["grounding"]["payoff_plan"]["months"] > 0
