from ..manifest import FeatureManifest, FeatureRoute
from .router import diagnostics_router, health_router


manifest = FeatureManifest(
    key="diagnostics",
    label="Diagnostics",
    routes=(
        FeatureRoute(health_router, stable_root=True),
        FeatureRoute(diagnostics_router, stable_root=True),
    ),
)
