from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="imports",
    label="Imports",
    dependencies=("classification", "ledger", "receivables"),
    routes=(FeatureRoute(router),),
)

