import asyncio
import time
from typing import Literal, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.narrative.schemas import Usage
from app.providers.errors import ProviderError
from app.providers.gemini import GeminiProvider
from app.providers.groq import GroqProvider

T = TypeVar("T", bound=BaseModel)
FREE_MODELS = {
    "gemini": {"gemini-2.5-flash-lite", "gemini-2.5-flash"},
    "groq": {"openai/gpt-oss-20b", "openai/gpt-oss-120b"},
}


class ProviderRouter:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.usage: list[Usage] = []

    async def generate_structured(
        self, prompt: str, output_schema: type[T], *, max_output_tokens: int
    ) -> T:
        settings = self.settings
        if not settings.ai_free_tier_confirmed:
            raise ProviderError("FREE_TIER_NOT_CONFIRMED")
        if len(prompt) > 65000:
            raise ProviderError("CONTEXT_LIMIT")
        names: list[Literal["gemini", "groq"]] = [settings.llm_provider]
        if settings.enable_provider_fallback:
            names.append("groq" if names[0] == "gemini" else "gemini")
        last = ProviderError("NOT_CONFIGURED")
        for name in names:
            key = settings.gemini_api_key if name == "gemini" else settings.groq_api_key
            model = settings.gemini_model if name == "gemini" else settings.groq_model
            if not key or not key.get_secret_value():
                continue
            if model not in FREE_MODELS[name]:
                raise ProviderError("MODEL_NOT_FREE_ALLOWLISTED")
            adapter = (GeminiProvider if name == "gemini" else GroqProvider)(
                key.get_secret_value(), model, settings.llm_timeout_seconds
            )
            started = time.monotonic()
            succeeded = False
            try:
                result = await asyncio.wait_for(
                    adapter.generate_structured(
                        prompt, output_schema, max_output_tokens=max_output_tokens
                    ),
                    timeout=settings.llm_timeout_seconds + 1,
                )
                succeeded = True
                return result
            except ProviderError as exc:
                last = exc
            except (TimeoutError, httpx.TimeoutException):
                last = ProviderError("TIMEOUT", transient=True)
            except httpx.TransportError:
                last = ProviderError("CONNECTION", transient=True)
            except (ValidationError, ValueError):
                last = ProviderError("INVALID_RESPONSE")
            finally:
                # No prompts, keys or SDK exception strings enter metrics or logs.
                error = None if succeeded else last.code
                self.usage.append(
                    Usage(
                        provider=name,
                        model=model,
                        inputTokens=adapter.input_tokens,
                        outputTokens=adapter.output_tokens,
                        durationMs=int((time.monotonic() - started) * 1000),
                        error=error,
                    )
                )
                await adapter.close()
            if not last.transient:
                raise last
        raise last
