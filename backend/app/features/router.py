from .assistant.router import router as assistant_router
from .budgeting.router import router as budgets_router
from .classification.router import classification_router, knowledge_router
from .connectors.router import connectors_router, plaid_router, up_router
from .debts.router import router as debts_router
from .demo.router import router as demo_router
from .diagnostics.router import diagnostics_router, health_router
from .fx.router import router as fx_router
from .imports.router import router as imports_router
from .ledger.router import accounts_router, transactions_router
from .receivables.router import business_router, receivables_router
from .reports.router import router as reports_router
from .settings.router import router as settings_router
from .taxonomy.router import categories_router, rules_router
from .timesheets.router import router as timesheets_router

FEATURE_ROUTERS = (
    health_router,
    accounts_router,
    transactions_router,
    categories_router,
    budgets_router,
    debts_router,
    fx_router,
    business_router,
    receivables_router,
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

STABLE_ROOT_ROUTERS = (health_router, diagnostics_router)

__all__ = ["FEATURE_ROUTERS", "STABLE_ROOT_ROUTERS"]
