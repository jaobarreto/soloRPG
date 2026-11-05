from typing import Any, TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.narrative.prompts import MASTER, NARRATOR
from app.narrative.schemas import Narration
from app.providers.errors import ProviderError, status_error

T = TypeVar("T", bound=BaseModel)


def gemini_generation_schema(value: Any) -> Any:
    """Express Pydantic literals as singleton enums in the remote schema only."""
    if isinstance(value, dict):
        schema = {
            key: gemini_generation_schema(child)
            for key, child in value.items()
            if key != "const"
        }
        if "const" in value:
            schema["enum"] = [value["const"]]
        return schema
    if isinstance(value, list):
        return [gemini_generation_schema(child) for child in value]
    return value


def narration_generation_schema(value: Any) -> Any:
    """Simplify remote grammar bounds; strict local validation remains unchanged."""
    if isinstance(value, dict):
        return {
            key: narration_generation_schema(child)
            for key, child in value.items()
            if key not in ("maxItems", "maxLength")
        }
    if isinstance(value, list):
        return [narration_generation_schema(child) for child in value]
    return value


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
        self.total_tokens: int | None = None
        self.usage_reported = False

    async def generate_structured(
        self, prompt: str, output_schema: type[T], *, max_output_tokens: int
    ) -> T:
        try:
            result = await self.client.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=NARRATOR
                    if output_schema is Narration
                    else MASTER,
                    response_mime_type="application/json",
                    response_json_schema=gemini_generation_schema(
                        narration_generation_schema(output_schema.model_json_schema())
                        if output_schema is Narration
                        else output_schema.model_json_schema()
                    ),
                    max_output_tokens=max_output_tokens,
                    temperature=0.6 if output_schema is Narration else 0.2,
                ),
            )
        except errors.APIError as exc:
            raise status_error(exc.code or 500) from None
        usage = result.usage_metadata
        self.usage_reported = bool(
            usage
            and usage.prompt_token_count is not None
            and usage.candidates_token_count is not None
        )
        self.total_tokens = usage.total_token_count if usage else None
        self.input_tokens = (usage.prompt_token_count or 0) if usage else 0
        self.output_tokens = (usage.candidates_token_count or 0) if usage else 0
        try:
            return output_schema.model_validate_json(result.text or "{}")
        except ValidationError as exc:
            # Only schema-owned field/type labels, never output values, prompts,
            # provider messages or credentials, enter a synthetic probe report.
            schema = output_schema.model_json_schema()
            allowed = set(schema.get("properties", {})) | set(schema.get("$defs", {}))
            for definition in schema.get("$defs", {}).values():
                allowed.update(definition.get("properties", {}))
            issues = [
                ".".join(
                    str(part) if isinstance(part, int) or part in allowed else "<field>"
                    for part in error["loc"]
                )
                + ":"
                + error["type"]
                for error in exc.errors(include_input=False, include_url=False)[:8]
            ]
            raise ProviderError("INVALID_RESPONSE", validation_issues=issues) from None

    async def close(self) -> None:
        await self.client.aio.aclose()
