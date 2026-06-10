from .classification_router import router as classification_router
from .knowledge_router import router as knowledge_router
from .rules_router import router as rules_router

__all__ = ["classification_router", "knowledge_router", "rules_router"]
