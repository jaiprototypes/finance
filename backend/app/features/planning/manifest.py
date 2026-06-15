from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="planning",
    label="Planning",
    dependencies=("budgeting", "debts", "fx", "reports"),
    routes=(FeatureRoute(router), FeatureRoute(router, versioned=False, stable_root=True)),
)
