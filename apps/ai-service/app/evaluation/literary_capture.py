"""Evaluation-only observation of the unchanged Gemini SDK adapter boundary."""

import hashlib
import re
import socket
import time
from collections.abc import Callable, Iterator
from contextlib import ExitStack, contextmanager
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import httpx
from google import genai

from app.providers.errors import ProviderError

MODEL = "gemini-3.5-flash-lite"


def private_material(text: str, secrets: list[str]) -> bool:
    return (
        any(len(secret) >= 12 and secret in text for secret in secrets)
        or bool(re.search(r"AIza[\w-]{30,}|gsk_[\w]{20,}|PRIVATE_[A-Z_]+", text))
        or bool(
            re.search(r'"(?:api_key|authorization|x-goog-api-key)"\s*:', text, re.I)
        )
    )


@contextmanager
def observe_sdk(
    receipt: dict[str, Any],
    *,
    secrets: list[str],
    transport: Callable[[httpx.Request], httpx.Response] | None,
) -> Iterator[None]:
    """Return the original SDK result unchanged; never override structured parsing.

    The optional transport exists only for offline runs/tests. Without it the
    original client/options are used. Caller must pass financial/integrity gates
    before entering a live scope. This is a dedicated CLI process, not a server.
    """
    original_client = genai.Client

    def create(**kwargs: Any) -> Any:
        options = kwargs["http_options"]
        if options.retry_options.attempts != 1:
            raise ProviderError("SDK_RETRY_POLICY_DRIFT")
        if transport is not None:
            mock = httpx.MockTransport(transport)
            kwargs["http_options"] = options.model_copy(
                update={
                    "httpx_async_client": httpx.AsyncClient(
                        transport=mock, trust_env=False
                    ),
                    "httpx_client": httpx.Client(transport=mock, trust_env=False),
                }
            )
        client = original_client(**kwargs)

        async def generate(**arguments: Any) -> Any:
            started = time.monotonic()
            receipt["sdkStarted"] = True
            try:
                result = await client.aio.models.generate_content(**arguments)
            except Exception as exc:
                # Classify in memory, never store SDK exception text/headers.
                status = getattr(exc, "code", None)
                receipt["httpStatus"] = status if isinstance(status, int) else None
                receipt["financialSignal"] = bool(
                    re.search(r"billing|payment|faturamento|paid tier", str(exc), re.I)
                )
                raise
            finally:
                receipt["latencyMs"] = round((time.monotonic() - started) * 1000)
            raw = result.text
            usage = result.usage_metadata
            receipt.update(
                reportedModel=getattr(result, "model_version", None),
                rawTextBoundary="SDK_TEXT_BEFORE_PYDANTIC_AND_GRAPH",
                rawText=raw,
                inputTokens=usage.prompt_token_count if usage else None,
                outputTokens=usage.candidates_token_count if usage else None,
                totalTokens=usage.total_token_count if usage else None,
                usageReported=bool(
                    usage
                    and usage.prompt_token_count is not None
                    and usage.candidates_token_count is not None
                ),
            )
            if raw is not None:
                receipt["rawTextSha256"] = hashlib.sha256(raw.encode()).hexdigest()
                if private_material(raw, secrets):
                    receipt["rawText"] = None
                    receipt["rawWithheldReason"] = "PRIVATE_MATERIAL"
                    raise ProviderError("PRIVATE_MATERIAL")
                if re.search(
                    r"billing|faturamento|payment|paid tier|cobrança", raw, re.I
                ):
                    receipt["financialSignal"] = True
                    receipt["rawText"] = None
                    receipt["rawWithheldReason"] = "FINANCIAL_DETAILS"
                    raise ProviderError("BILLING_OR_FINANCIAL_UNCERTAINTY")
            if receipt["reportedModel"] is None:
                raise ProviderError("MODEL_IDENTITY_UNVERIFIED")
            if receipt["reportedModel"] != MODEL:
                raise ProviderError("UNEXPECTED_MODEL")
            return result

        async def close() -> None:
            await client.aio.aclose()
            client.close()

        return SimpleNamespace(
            aio=SimpleNamespace(
                models=SimpleNamespace(generate_content=generate), aclose=close
            )
        )

    def blocked(*args: Any, **kwargs: Any) -> None:
        raise ProviderError("EXTERNAL_NETWORK_FORBIDDEN_IN_DRY_RUN")

    with ExitStack() as stack:
        stack.enter_context(patch.object(genai, "Client", create))
        if transport is not None:
            stack.enter_context(patch.object(socket.socket, "connect", blocked))
            stack.enter_context(patch.object(socket.socket, "connect_ex", blocked))
            stack.enter_context(patch.object(socket, "create_connection", blocked))
        yield
