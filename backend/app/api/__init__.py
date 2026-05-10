from .health import router as health_router
from .accounts import router as accounts_router
from .transactions import router as transactions_router
from .categories import router as categories_router
from .budgets import router as budgets_router
from .debts import router as debts_router
from .fx import router as fx_router
from .business import router as business_router
from .timesheets import router as timesheets_router
from .imports import router as imports_router
from .settings import router as settings_router
from .diagnostics import router as diagnostics_router
from .demo import router as demo_router
from .connectors import router as connectors_router
from .reports import router as reports_router
from .classification import router as classification_router
from .assistant import router as assistant_router
from .rules import router as rules_router
from .knowledge import router as knowledge_router
from .plaid import router as plaid_router
from .up import router as up_router

__all__ = [
    "health_router",
    "accounts_router",
    "transactions_router",
    "categories_router",
    "budgets_router",
    "debts_router",
    "fx_router",
    "business_router",
    "timesheets_router",
    "imports_router",
    "settings_router",
    "diagnostics_router",
    "demo_router",
    "connectors_router",
    "reports_router",
    "classification_router",
    "assistant_router",
    "rules_router",
    "knowledge_router",
    "plaid_router",
    "up_router",
]
