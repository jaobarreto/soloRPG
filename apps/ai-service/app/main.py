import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.health import router
from app.api.routes.narrative import router as narrative_router
from app.core.config import get_settings
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    logging.getLogger(__name__).info("SoloRPG AI service ready")
    yield


def create_app() -> FastAPI:
    application = FastAPI(title="SoloRPG AI", version="0.1.0", lifespan=lifespan)
    application.include_router(router)
    application.include_router(narrative_router)
    return application


app = create_app()
