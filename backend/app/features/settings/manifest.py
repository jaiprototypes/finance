from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="settings",
    label="Settings",
    routes=(FeatureRoute(router),),
)

