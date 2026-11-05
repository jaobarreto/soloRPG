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
    # Public Free Standard pricing checked 2026-11-01. 2.5 access is legacy-only.
    "gemini": {"gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.5-flash-lite"},
    "groq": {"openai/gpt-oss-20b", "openai/gpt-oss-120b"},
}


class ProviderRouter:
    def __init__(self, settings: Settings, *, max_requests: int = 2):
        if not 0 <= max_requests <= 4:
            raise ValueError("Request budget must be between zero and four")
        self.settings = settings
        self.max_requests = max_requests
        self.usage: list[Usage] = []
        self.validation_issues: list[str] = []

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
        deadline = time.monotonic() + settings.llm_turn_timeout_seconds
        for name in names:
            key = settings.gemini_api_key if name == "gemini" else settings.groq_api_key
            model = settings.gemini_model if name == "gemini" else settings.groq_model
            if not key or not key.get_secret_value():
                continue
            if name == "groq" and not settings.groq_free_tier_confirmed:
                raise ProviderError("FREE_TIER_NOT_CONFIRMED")
            if len(self.usage) >= self.max_requests:
                raise ProviderError("REQUEST_BUDGET")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProviderError("TIMEOUT", transient=True)
            if model not in FREE_MODELS[name]:
                raise ProviderError("MODEL_NOT_FREE_ALLOWLISTED")
            try:
                adapter = (GeminiProvider if name == "gemini" else GroqProvider)(
                    key.get_secret_value(), model, settings.llm_timeout_seconds
                )
            except Exception:
                raise ProviderError("CONFIGURATION") from None
            started = time.monotonic()
            succeeded = False
            try:
                result = await asyncio.wait_for(
                    adapter.generate_structured(
                        prompt, output_schema, max_output_tokens=max_output_tokens
                    ),
                    timeout=min(settings.llm_timeout_seconds, remaining),
                )
                succeeded = True
                return result
            except ProviderError as exc:
                last = exc
                self.validation_issues = exc.validation_issues
            except (TimeoutError, httpx.TimeoutException):
                last = ProviderError("TIMEOUT", transient=True)
            except httpx.TransportError:
                last = ProviderError("CONNECTION", transient=True)
            except (ValidationError, ValueError):
                last = ProviderError("INVALID_RESPONSE")
            except Exception:
                last = ProviderError("UNAVAILABLE")
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
                        inputCharacters=len(prompt),
                        totalTokens=getattr(adapter, "total_tokens", None),
                        usageReported=getattr(adapter, "usage_reported", False),
                        error=error,
                    )
                )
                try:
                    await asyncio.wait_for(adapter.close(), timeout=1)
                except Exception:
                    pass
            if not last.transient:
                raise last
        raise last
