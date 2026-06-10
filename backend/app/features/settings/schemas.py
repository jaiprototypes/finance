from typing import Optional

from pydantic import BaseModel, ConfigDict


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

__all__ = ['SettingsUpdate']
