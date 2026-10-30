import secrets

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import get_settings
from app.narrative.graph import run_turn
from app.narrative.schemas import TurnRequest, TurnResponse
from app.providers.errors import ProviderError
from app.providers.router import ProviderRouter

router = APIRouter(prefix="/internal", tags=["internal"])


def authenticate(x_ai_token: str = Header(default="")) -> None:
    key = get_settings().ai_internal_token
    if (
        not key
        or not key.get_secret_value()
        or not secrets.compare_digest(x_ai_token, key.get_secret_value())
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/turn", response_model=TurnResponse, dependencies=[Depends(authenticate)])
async def turn(request: TurnRequest) -> TurnResponse:
    if len(request.model_dump_json()) > 65000:
        raise HTTPException(status_code=413, detail="Context too large")
    provider = ProviderRouter(get_settings())
    try:
        result = await run_turn(request, provider)
    except ProviderError as exc:
        result = TurnResponse(error=exc.code)
    result.usage = provider.usage
    return result
