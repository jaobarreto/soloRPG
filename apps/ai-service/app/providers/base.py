from collections.abc import AsyncIterator
from typing import Protocol, TypeVar

from pydantic import BaseModel

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)


class LLMProvider(Protocol):
    """Future adapters must honor free-tier limits; no paid fallback is configured."""

    async def generate_text(self, prompt: str, *, max_output_tokens: int) -> str: ...

    async def generate_structured(
        self,
        prompt: str,
        output_schema: type[StructuredOutput],
        *,
        max_output_tokens: int,
    ) -> StructuredOutput: ...

    def stream_text(
        self, prompt: str, *, max_output_tokens: int
    ) -> AsyncIterator[str]: ...
