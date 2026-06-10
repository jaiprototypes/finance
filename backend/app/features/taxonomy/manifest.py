from ..manifest import FeatureManifest, FeatureRoute
from .router import categories_router


manifest = FeatureManifest(
    key="taxonomy",
    label="Taxonomy",
    routes=(FeatureRoute(categories_router),),
)
