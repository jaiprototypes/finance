from ..manifest import FeatureManifest, FeatureRoute
from .router import accounts_router, transactions_router


manifest = FeatureManifest(
    key="ledger",
    label="Ledger",
    routes=(FeatureRoute(accounts_router), FeatureRoute(transactions_router)),
)

