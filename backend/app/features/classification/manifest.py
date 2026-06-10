from ..manifest import FeatureManifest, FeatureRoute
from .router import classification_router, knowledge_router, rules_router


manifest = FeatureManifest(
    key="classification",
    label="Classification",
    dependencies=("ledger", "taxonomy"),
    routes=(FeatureRoute(classification_router), FeatureRoute(knowledge_router), FeatureRoute(rules_router)),
)
