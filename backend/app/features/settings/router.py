from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ...db import get_session
from .schemas import SettingsUpdate
from ..fx.currency import (
    ensure_recent_fx_rates,
    get_recent_fortnightly_average_aud_per_usd,
    rebase_budget_targets,
)
from .service import (
    delete_setting,
    get_base_currency,
    get_classification_model,
    get_embedding_model,
    get_local_ai_base_url,
    get_local_ai_enabled,
    get_local_ai_timeout_seconds,
    get_setting,
    normalize_base_currency,
    set_setting,
    set_lock_password,
    SUPPORTED_BASE_CURRENCIES,
    validate_llm_configuration,
    verify_lock_password,
)
from ..receivables.emailer import send_test_email

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings(session: Session = Depends(get_session)):
    return {
        "lock_enabled": get_setting(session, "lock_enabled", "false") == "true",
        "fx_provider": get_setting(session, "fx_provider", "manual"),
        "fx_risk_profile": get_setting(session, "fx_risk_profile", "neutral"),
        "base_currency": get_base_currency(session),
        "local_ai_enabled": get_local_ai_enabled(session),
        "local_ai_base_url": get_local_ai_base_url(session),
        "local_ai_model": get_classification_model(session),
        "local_ai_timeout_seconds": get_local_ai_timeout_seconds(session),
        "classification_model": get_classification_model(session),
        "embedding_model": get_embedding_model(session),
        "personal_context": get_setting(session, "personal_context", ""),
        "company_name": get_setting(session, "company_name", ""),
        "company_legal_name": get_setting(session, "company_legal_name", ""),
        "company_dba": get_setting(session, "company_dba", ""),
        "company_entity_type": get_setting(session, "company_entity_type", ""),
        "company_tax_id": get_setting(session, "company_tax_id", ""),
        "company_email": get_setting(session, "company_email", ""),
        "company_phone": get_setting(session, "company_phone", ""),
        "company_address": get_setting(session, "company_address", ""),
        "company_city_state": get_setting(session, "company_city_state", ""),
        "company_logo_path": get_setting(session, "company_logo_path", ""),
        "smtp_host": get_setting(session, "smtp_host", ""),
        "smtp_port": get_setting(session, "smtp_port", ""),
        "smtp_username": get_setting(session, "smtp_username", ""),
        "smtp_password": get_setting(session, "smtp_password", ""),
        "smtp_from_name": get_setting(session, "smtp_from_name", ""),
        "smtp_from_email": get_setting(session, "smtp_from_email", ""),
        "smtp_use_tls": get_setting(session, "smtp_use_tls", "true") == "true",
        "smtp_use_ssl": get_setting(session, "smtp_use_ssl", "false") == "true",
        "budget_skip_merchants": get_setting(session, "budget_skip_merchants", ""),
    }


@router.post("")
def update_settings(payload: SettingsUpdate, session: Session = Depends(get_session)):
    if payload.lock_enabled is not None:
        set_setting(session, "lock_enabled", "true" if payload.lock_enabled else "false")
    if payload.password:
        set_lock_password(session, payload.password)
    if payload.fx_provider:
        set_setting(session, "fx_provider", payload.fx_provider)
    if payload.fx_risk_profile:
        set_setting(session, "fx_risk_profile", payload.fx_risk_profile)
    if payload.base_currency is not None:
        requested_base_currency = (payload.base_currency or "").strip().upper()
        if requested_base_currency and requested_base_currency not in SUPPORTED_BASE_CURRENCIES:
            raise HTTPException(
                status_code=400,
                detail=f"base_currency must be one of: {', '.join(SUPPORTED_BASE_CURRENCIES)}",
            )
        previous_base_currency = get_base_currency(session)
        next_base_currency = normalize_base_currency(requested_base_currency or None)
        if next_base_currency != previous_base_currency:
            ensure_recent_fx_rates(session)
            try:
                fx_summary = get_recent_fortnightly_average_aud_per_usd(session)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            rebase_budget_targets(
                session,
                previous_base_currency,
                next_base_currency,
                fx_summary.get("aud_per_usd"),
            )
        set_setting(session, "base_currency", next_base_currency)
        set_setting(session, "budget_base_currency", next_base_currency)
    if payload.local_ai_enabled is not None:
        set_setting(session, "local_ai_enabled", "true" if payload.local_ai_enabled else "false")
    if payload.local_ai_base_url is not None:
        set_setting(session, "local_ai_base_url", payload.local_ai_base_url.strip())
        delete_setting(session, "llm_endpoint")
    if payload.local_ai_model is not None:
        set_setting(session, "local_ai_model", payload.local_ai_model.strip())
        delete_setting(session, "llm_model")
        delete_setting(session, "llm_provider")
    if payload.local_ai_timeout_seconds is not None:
        set_setting(session, "local_ai_timeout_seconds", str(int(payload.local_ai_timeout_seconds)))
    if payload.classification_model is not None:
        set_setting(session, "local_ai_model", payload.classification_model.strip())
        set_setting(session, "classification_model", payload.classification_model.strip())
        delete_setting(session, "llm_provider")
        delete_setting(session, "llm_model")
        delete_setting(session, "llm_endpoint")
    if payload.embedding_model is not None:
        set_setting(session, "embedding_model", payload.embedding_model.strip())
    if payload.personal_context is not None:
        set_setting(session, "personal_context", payload.personal_context)
    if payload.company_name is not None:
        set_setting(session, "company_name", payload.company_name)
    if payload.company_legal_name is not None:
        set_setting(session, "company_legal_name", payload.company_legal_name)
    if payload.company_dba is not None:
        set_setting(session, "company_dba", payload.company_dba)
    if payload.company_entity_type is not None:
        set_setting(session, "company_entity_type", payload.company_entity_type)
    if payload.company_tax_id is not None:
        set_setting(session, "company_tax_id", payload.company_tax_id)
    if payload.company_email is not None:
        set_setting(session, "company_email", payload.company_email)
    if payload.company_phone is not None:
        set_setting(session, "company_phone", payload.company_phone)
    if payload.company_address is not None:
        set_setting(session, "company_address", payload.company_address)
    if payload.company_city_state is not None:
        set_setting(session, "company_city_state", payload.company_city_state)
    if payload.company_logo_path is not None:
        set_setting(session, "company_logo_path", payload.company_logo_path)
    if payload.smtp_host is not None:
        set_setting(session, "smtp_host", payload.smtp_host)
    if payload.smtp_port is not None:
        set_setting(session, "smtp_port", payload.smtp_port)
    if payload.smtp_username is not None:
        set_setting(session, "smtp_username", payload.smtp_username)
    if payload.smtp_password is not None:
        set_setting(session, "smtp_password", payload.smtp_password)
    if payload.smtp_from_name is not None:
        set_setting(session, "smtp_from_name", payload.smtp_from_name)
    if payload.smtp_from_email is not None:
        set_setting(session, "smtp_from_email", payload.smtp_from_email)
    if payload.smtp_use_tls is not None:
        set_setting(session, "smtp_use_tls", "true" if payload.smtp_use_tls else "false")
    if payload.smtp_use_ssl is not None:
        set_setting(session, "smtp_use_ssl", "true" if payload.smtp_use_ssl else "false")
    if payload.budget_skip_merchants is not None:
        set_setting(session, "budget_skip_merchants", payload.budget_skip_merchants)
    validate_llm_configuration(session)
    session.commit()
    return {"status": "ok"}


@router.post("/verify")
def verify_lock(password: str = Body(...), session: Session = Depends(get_session)):
    return {"valid": verify_lock_password(session, password)}


@router.post("/email-test")
def email_test(payload: dict = Body(default={}), session: Session = Depends(get_session)):
    to_email = payload.get("to_email") if isinstance(payload, dict) else None
    try:
        send_test_email(session, to_email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "sent"}
