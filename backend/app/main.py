from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db, session_scope
from .services.settings import validate_llm_configuration
from .logging import setup_logging
from .api import (
    health_router,
    accounts_router,
    transactions_router,
    categories_router,
    budgets_router,
    debts_router,
    fx_router,
    business_router,
    timesheets_router,
    imports_router,
    settings_router,
    diagnostics_router,
    demo_router,
    connectors_router,
    reports_router,
    classification_router,
    assistant_router,
    rules_router,
    knowledge_router,
    plaid_router,
    up_router,
)

TAURI_ALLOWED_ORIGINS = [
    "tauri://localhost",
    "https://tauri.localhost",
]
LOCAL_WEB_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    init_db()
    with session_scope() as session:
        validate_llm_configuration(session)
    yield


app = FastAPI(title="Finances Local Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=TAURI_ALLOWED_ORIGINS,
    allow_origin_regex=LOCAL_WEB_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(health_router)
app.include_router(accounts_router)
app.include_router(transactions_router)
app.include_router(categories_router)
app.include_router(budgets_router)
app.include_router(debts_router)
app.include_router(fx_router)
app.include_router(business_router)
app.include_router(timesheets_router)
app.include_router(imports_router)
app.include_router(settings_router)
app.include_router(diagnostics_router)
app.include_router(demo_router)
app.include_router(connectors_router)
app.include_router(reports_router)
app.include_router(classification_router)
app.include_router(assistant_router)
app.include_router(rules_router)
app.include_router(knowledge_router)
app.include_router(plaid_router)
app.include_router(up_router)
