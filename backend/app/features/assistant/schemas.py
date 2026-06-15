from typing import Optional

from pydantic import BaseModel, ConfigDict


class AssistantSearchRequest(BaseModel):
    query: str
    limit: int = 8

__all__ = ['AssistantSearchRequest']
