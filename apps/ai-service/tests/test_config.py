import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_optional_keys():
    settings = Settings(_env_file=None)
    assert settings.llm_provider == "gemini"


@pytest.mark.parametrize("value", [0, 65536, "invalid"])
def test_invalid_port(value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, ai_service_port=value)


def test_invalid_provider():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, llm_provider="paid-fallback")


def test_secret_is_masked():
    settings = Settings(_env_file=None, gemini_api_key="test-secret")
    assert "test-secret" not in repr(settings)
