from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="assistant",
    label="Assistant",
    dependencies=("budgeting", "classification", "debts", "ledger", "receivables", "timesheets"),
    routes=(FeatureRoute(router),),
)

