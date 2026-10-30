import json
from typing import TypeVar

import httpx
from pydantic import BaseModel

from app.narrative.prompts import MASTER
from app.providers.errors import ProviderError, status_error

T = TypeVar("T", bound=BaseModel)


class GroqProvider:
    def __init__(self, key: str, model: str, timeout: float):
        self.model = model
        self.client = httpx.AsyncClient(
            base_url="https://api.groq.com/openai/v1/",
            headers={"Authorization": f"Bearer {key}"},
            timeout=timeout,
        )
        self.input_tokens = 0
        self.output_tokens = 0

    async def generate_structured(
        self, prompt: str, output_schema: type[T], *, max_output_tokens: int
    ) -> T:
        response = await self.client.post(
            "chat/completions",
            json={
                "model": self.model,
                "max_completion_tokens": max_output_tokens,
                "messages": [
                    {
                        "role": "system",
                        "content": MASTER
                        + "\nReturn only JSON matching this schema: "
                        + json.dumps(output_schema.model_json_schema()),
                    },
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
            },
        )
        if not response.is_success:
            raise status_error(response.status_code)
        try:
            data = response.json()
            usage = data.get("usage", {})
            self.input_tokens = usage.get("prompt_tokens", 0)
            self.output_tokens = usage.get("completion_tokens", 0)
            return output_schema.model_validate_json(
                data["choices"][0]["message"]["content"]
            )
        except (KeyError, IndexError, TypeError, ValueError):
            raise ProviderError("INVALID_RESPONSE") from None

    async def close(self) -> None:
        await self.client.aclose()
