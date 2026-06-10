from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="budgeting",
    label="Budgeting",
    dependencies=("connectors", "ledger", "receivables", "taxonomy"),
    routes=(FeatureRoute(router),),
)

