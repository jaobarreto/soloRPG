from typing import Protocol, TypeVar

from pydantic import BaseModel

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)


class LLMProvider(Protocol):
    """Structured-only capability; no tools, code execution or database access."""

    async def generate_structured(
        self,
        prompt: str,
        output_schema: type[StructuredOutput],
        *,
        max_output_tokens: int,
    ) -> StructuredOutput: ...
