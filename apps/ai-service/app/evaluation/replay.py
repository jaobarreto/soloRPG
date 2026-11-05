"""Offline stdin bridge for cross-service integration tests. Never creates an SDK."""

import asyncio
import json
import sys
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from app.narrative.graph import run_turn
from app.narrative.schemas import TurnRequest
from app.providers.errors import ProviderError

T = TypeVar("T", bound=BaseModel)


class ScriptedProvider:
    def __init__(self, payload: dict[str, Any]):
        self.payload = payload

    async def generate_structured(
        self, prompt: str, output_schema: type[T], *, max_output_tokens: int
    ) -> T:
        try:
            return output_schema.model_validate(self.payload)
        except ValidationError:
            raise ProviderError("INVALID_RESPONSE") from None


def main() -> None:
    payload = json.load(sys.stdin)
    response = asyncio.run(
        run_turn(
            TurnRequest.model_validate(payload["request"]),
            ScriptedProvider(payload["proposal"]),
        )
    )
    print(response.model_dump_json())


if __name__ == "__main__":
    main()
