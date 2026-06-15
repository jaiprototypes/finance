from ..manifest import FeatureManifest, FeatureRoute
from .router import router


manifest = FeatureManifest(
    key="timesheets",
    label="Timesheets",
    dependencies=("receivables",),
    routes=(FeatureRoute(router),),
)

