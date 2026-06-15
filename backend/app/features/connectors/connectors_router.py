from fastapi import APIRouter

from .service import StubConnector, PlaidConnector, UpConnector

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("")
def list_connectors():
    connectors = [StubConnector(), PlaidConnector(), UpConnector()]
    return [{"name": connector.name, "enabled": connector.is_enabled()} for connector in connectors]
