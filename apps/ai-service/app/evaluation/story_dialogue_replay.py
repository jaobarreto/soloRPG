"""Offline FastAPI/graph bridge with a scripted provider and captured model data."""

import json
import socket
import sys
from typing import Any, TypeVar
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.api.routes import narrative
from app.core.config import Settings
from app.evaluation.replay import ScriptedProvider
from app.main import create_app

T = TypeVar("T", bound=BaseModel)


def main() -> None:
    data = json.load(sys.stdin)
    prompts: list[str] = []

    class CapturingProvider(ScriptedProvider):
        usage: list[Any] = []

        async def generate_structured(
            self, prompt: str, output_schema: type[T], *, max_output_tokens: int
        ) -> T:
            prompts.append(prompt)
            return await super().generate_structured(
                prompt, output_schema, max_output_tokens=max_output_tokens
            )

    def blocked(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("External network forbidden in Story Card replay")

    settings = Settings(ai_internal_token="synthetic-story-token", _env_file=None)
    provider = CapturingProvider(data["proposal"])
    with (
        patch.object(narrative, "get_settings", return_value=settings),
        patch.object(narrative, "ProviderRouter", return_value=provider),
        patch.object(socket.socket, "connect", blocked),
        patch.object(socket.socket, "connect_ex", blocked),
    ):
        client = TestClient(create_app())
        response = client.post(
            "/internal/turn",
            headers={"X-AI-Token": "synthetic-story-token"},
            json=data["request"],
        )
        response.raise_for_status()
        client.close()
    print(json.dumps({"response": response.json(), "prompts": prompts}))


if __name__ == "__main__":
    main()
