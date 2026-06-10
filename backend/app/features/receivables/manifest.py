from ..manifest import FeatureManifest, FeatureRoute
from .router import business_router, receivables_router


manifest = FeatureManifest(
    key="receivables",
    label="Receivables",
    dependencies=("ledger", "settings"),
    routes=(FeatureRoute(business_router), FeatureRoute(receivables_router)),
)

