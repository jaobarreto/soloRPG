from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")
    ai_service_port: int = Field(default=8000, ge=1, le=65535)
    llm_provider: Literal["gemini", "groq"] = "gemini"
    gemini_api_key: SecretStr | None = None
    groq_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.5-flash-lite"
    groq_model: str = "openai/gpt-oss-20b"
    enable_provider_fallback: bool = False
    ai_free_tier_confirmed: bool = False
    groq_free_tier_confirmed: bool = False
    ai_internal_token: SecretStr | None = None
    llm_timeout_seconds: float = Field(default=20, ge=1, le=30)
    llm_turn_timeout_seconds: float = Field(default=48, ge=1, le=48)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()
