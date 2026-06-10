from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="debts",
    label="Debts",
    dependencies=("ledger",),
    routes=(FeatureRoute(router),),
)

