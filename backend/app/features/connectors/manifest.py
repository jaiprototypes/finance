from ..manifest import FeatureManifest, FeatureRoute
from .router import connectors_router, plaid_router, up_router


manifest = FeatureManifest(
    key="connectors",
    label="Connectors",
    dependencies=("ledger", "settings"),
    routes=(FeatureRoute(connectors_router), FeatureRoute(plaid_router), FeatureRoute(up_router)),
)

