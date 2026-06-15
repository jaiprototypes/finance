"""Import all feature-owned ORM models for metadata registration."""

from ..core.db_base import Base
from .assistant import models as assistant_models
from .budgeting import models as budgeting_models
from .classification import models as classification_models
from .connectors import models as connectors_models
from .debts import models as debts_models
from .demo import models as demo_models
from .diagnostics import models as diagnostics_models
from .fx import models as fx_models
from .imports import models as imports_models
from .ledger import models as ledger_models
from .receivables import models as receivables_models
from .settings import models as settings_models
from .taxonomy import models as taxonomy_models
from .timesheets import models as timesheets_models

__all__ = [
    "Base",
    "assistant_models",
    "budgeting_models",
    "classification_models",
    "connectors_models",
    "debts_models",
    "demo_models",
    "diagnostics_models",
    "fx_models",
    "imports_models",
    "ledger_models",
    "receivables_models",
    "settings_models",
    "taxonomy_models",
    "timesheets_models",
]
