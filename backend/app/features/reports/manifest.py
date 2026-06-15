from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="reports",
    label="Reports",
    dependencies=("budgeting", "fx", "ledger", "receivables", "timesheets"),
    routes=(FeatureRoute(router),),
)

