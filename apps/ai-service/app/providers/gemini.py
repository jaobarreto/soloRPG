from typing import TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.narrative.prompts import MASTER
from app.providers.errors import status_error

T = TypeVar("T", bound=BaseModel)


class GeminiProvider:
    def __init__(self, key: str, model: str, timeout: float):
        self.model = model
        self.client = genai.Client(
            api_key=key,
            http_options=types.HttpOptions(
                timeout=int(timeout * 1000),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )
        self.input_tokens = 0
        self.output_tokens = 0

    async def generate_structured(
        self, prompt: str, output_schema: type[T], *, max_output_tokens: int
    ) -> T:
        try:
            result = await self.client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=MASTER,
                    response_mime_type="application/json",
                    response_json_schema=output_schema.model_json_schema(),
                    max_output_tokens=max_output_tokens,
                    temperature=0.2,
                ),
            )
        except errors.APIError as exc:
            raise status_error(exc.code or 500) from None
        usage = result.usage_metadata
        self.input_tokens = (usage.prompt_token_count or 0) if usage else 0
        self.output_tokens = (usage.candidates_token_count or 0) if usage else 0
        return output_schema.model_validate_json(result.text or "{}")

    async def close(self) -> None:
        await self.client.aio.aclose()
