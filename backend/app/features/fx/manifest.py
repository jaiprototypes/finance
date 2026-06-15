from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="fx",
    label="FX",
    dependencies=("settings",),
    routes=(FeatureRoute(router),),
)

