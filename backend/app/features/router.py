from .registry import registry

FEATURE_ROUTERS = registry.versioned_routers()
STABLE_ROOT_ROUTERS = registry.stable_root_routers()
COMPATIBILITY_ROOT_ROUTERS = registry.compatibility_root_routers()

__all__ = ["FEATURE_ROUTERS", "STABLE_ROOT_ROUTERS", "COMPATIBILITY_ROOT_ROUTERS", "registry"]
