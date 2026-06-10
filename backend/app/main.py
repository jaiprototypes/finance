from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db, session_scope
from .logging import setup_logging
from .features.router import FEATURE_ROUTERS, STABLE_ROOT_ROUTERS
from .features.settings.service import validate_llm_configuration

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


for feature_router in FEATURE_ROUTERS:
    app.include_router(feature_router, prefix="/api/v1")

for stable_router in STABLE_ROOT_ROUTERS:
    app.include_router(stable_router)

# Temporary compatibility while scripts/tests migrate to /api/v1.
for feature_router in FEATURE_ROUTERS:
    if feature_router not in STABLE_ROOT_ROUTERS:
        app.include_router(feature_router)
