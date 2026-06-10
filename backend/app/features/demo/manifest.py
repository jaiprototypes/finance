from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="demo",
    label="Demo Data",
    dependencies=("budgeting", "ledger", "receivables", "taxonomy"),
    routes=(FeatureRoute(router),),
)

