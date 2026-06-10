from .diagnostics_router import router as diagnostics_router
from .health_router import router as health_router

__all__ = ["diagnostics_router", "health_router"]
