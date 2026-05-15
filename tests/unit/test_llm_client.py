"""Unit tests for the LLM Client."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from prep_pilot.services.llm_client import (
    LLMClient,
    LLMClientError,
    LLMConnectionError,
    LLMTimeoutError,
)


class SampleSchema(BaseModel):
    """Sample Pydantic model for structured output tests."""

    name: str
    score: int


@pytest.fixture
def llm_client():
    """Create an LLMClient instance with test configuration."""
    return LLMClient(
        api_key="test-key",
        model="gpt-4o-mini",
        timeout=30.0,
        max_retries=3,
    )


class TestLLMClientInit:
    """Tests for LLMClient initialization."""

    def test_init_with_explicit_params(self):
        client = LLMClient(api_key="my-key", model="gpt-4o", timeout=15.0, max_retries=2)
        assert client.model == "gpt-4o"
        assert client._api_key == "my-key"
        assert client._timeout == 15.0
        assert client._max_retries == 2

    def test_init_with_env_vars(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "env-key")
        monkeypatch.setenv("OPENAI_MODEL", "gpt-4o")
        client = LLMClient()
        assert client._api_key == "env-key"
        assert client.model == "gpt-4o"

    def test_init_defaults(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_MODEL", raising=False)
        # OpenAI client requires credentials; provide a dummy key for defaults test
        client = LLMClient(api_key="dummy-key")
        assert client._api_key == "dummy-key"
        assert client.model == "gpt-4o-mini"
        assert client._timeout == 30.0
        assert client._max_retries == 3


class TestGenerate:
    """Tests for the generate() method."""

    @pytest.mark.asyncio
    async def test_generate_returns_response_text(self, llm_client):
        """Test that generate() returns the LLM response content."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Hello, world!"

        with patch.object(
            llm_client._client.chat.completions,
            "create",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            result = await llm_client.generate(
                prompt="Say hello",
                system_prompt="You are helpful",
            )

        assert result == "Hello, world!"

    @pytest.mark.asyncio
    async def test_generate_with_system_prompt(self, llm_client):
        """Test that system prompt is included in messages."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "response"

        with patch.object(
            llm_client._client.chat.completions,
            "create",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_create:
            await llm_client.generate(
                prompt="user message",
                system_prompt="system message",
            )

        call_kwargs = mock_create.call_args[1]
        messages = call_kwargs["messages"]
        assert messages[0] == {"role": "system", "content": "system message"}
        assert messages[1] == {"role": "user", "content": "user message"}

    @pytest.mark.asyncio
    async def test_generate_without_system_prompt(self, llm_client):
        """Test that no system message is sent when system_prompt is empty."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "response"

        with patch.object(
            llm_client._client.chat.completions,
            "create",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_create:
            await llm_client.generate(prompt="user message")

        call_kwargs = mock_create.call_args[1]
        messages = call_kwargs["messages"]
        assert len(messages) == 1
        assert messages[0] == {"role": "user", "content": "user message"}

    @pytest.mark.asyncio
    async def test_generate_returns_empty_string_on_none_content(self, llm_client):
        """Test that generate() returns empty string when content is None."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = None

        with patch.object(
            llm_client._client.chat.completions,
            "create",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            result = await llm_client.generate(prompt="test")

        assert result == ""

    @pytest.mark.asyncio
    async def test_generate_passes_kwargs(self, llm_client):
        """Test that extra kwargs are passed to the API."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "response"

        with patch.object(
            llm_client._client.chat.completions,
            "create",
            new_callable=AsyncMock,
            return_value=mock_response,
        ) as mock_create:
            await llm_client.generate(
                prompt="test",
                temperature=0.7,
                max_tokens=100,
            )

        call_kwargs = mock_create.call_args[1]
        assert call_kwargs["temperature"] == 0.7
        assert call_kwargs["max_tokens"] == 100


class TestGenerateStructured:
    """Tests for the generate_structured() method."""

    @pytest.mark.asyncio
    async def test_generate_structured_returns_parsed_object(self, llm_client):
        """Test that generate_structured() returns a parsed Pydantic object."""
        expected = SampleSchema(name="Alice", score=9)

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.parsed = expected

        with patch.object(
            llm_client._client.beta.chat.completions,
            "parse",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            result = await llm_client.generate_structured(
                prompt="Evaluate this",
                system_prompt="You are an evaluator",
                schema=SampleSchema,
            )

        assert isinstance(result, SampleSchema)
        assert result.name == "Alice"
        assert result.score == 9

    @pytest.mark.asyncio
    async def test_generate_structured_raises_on_none_schema(self, llm_client):
        """Test that generate_structured() raises ValueError when schema is None."""
        with pytest.raises(ValueError, match="schema parameter is required"):
            await llm_client.generate_structured(
                prompt="test",
                schema=None,
            )

    @pytest.mark.asyncio
    async def test_generate_structured_raises_on_unparseable_response(self, llm_client):
        """Test that generate_structured() raises when parsed is None."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.parsed = None

        with patch.object(
            llm_client._client.beta.chat.completions,
            "parse",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            with pytest.raises(LLMClientError, match="could not be parsed"):
                await llm_client.generate_structured(
                    prompt="test",
                    schema=SampleSchema,
                )


class TestRetryBehavior:
    """Tests for retry with exponential backoff."""

    @pytest.mark.asyncio
    async def test_retries_on_timeout_error(self, llm_client):
        """Test that the client retries on APITimeoutError."""
        from openai import APITimeoutError

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "success"

        # Fail twice, succeed on third attempt
        mock_create = AsyncMock(
            side_effect=[
                APITimeoutError(request=MagicMock()),
                APITimeoutError(request=MagicMock()),
                mock_response,
            ]
        )

        with patch.object(
            llm_client._client.chat.completions, "create", mock_create
        ), patch("prep_pilot.services.llm_client.asyncio.sleep", new_callable=AsyncMock):
            result = await llm_client.generate(prompt="test")

        assert result == "success"
        assert mock_create.call_count == 3

    @pytest.mark.asyncio
    async def test_raises_timeout_error_after_max_retries(self, llm_client):
        """Test that LLMTimeoutError is raised after all retries exhausted."""
        from openai import APITimeoutError

        mock_create = AsyncMock(
            side_effect=APITimeoutError(request=MagicMock())
        )

        with patch.object(
            llm_client._client.chat.completions, "create", mock_create
        ), patch("prep_pilot.services.llm_client.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(LLMTimeoutError, match="timed out after 3 attempts"):
                await llm_client.generate(prompt="test")

        assert mock_create.call_count == 3

    @pytest.mark.asyncio
    async def test_raises_connection_error_after_max_retries(self, llm_client):
        """Test that LLMConnectionError is raised after all retries exhausted."""
        from openai import APIConnectionError

        mock_create = AsyncMock(
            side_effect=APIConnectionError(request=MagicMock())
        )

        with patch.object(
            llm_client._client.chat.completions, "create", mock_create
        ), patch("prep_pilot.services.llm_client.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(LLMConnectionError, match="unreachable after 3 attempts"):
                await llm_client.generate(prompt="test")

        assert mock_create.call_count == 3

    @pytest.mark.asyncio
    async def test_retries_on_rate_limit_error(self, llm_client):
        """Test that the client retries on RateLimitError."""
        from openai import RateLimitError

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "success"

        response_mock = MagicMock()
        response_mock.status_code = 429
        response_mock.headers = {}

        mock_create = AsyncMock(
            side_effect=[
                RateLimitError(
                    message="rate limited",
                    response=response_mock,
                    body=None,
                ),
                mock_response,
            ]
        )

        with patch.object(
            llm_client._client.chat.completions, "create", mock_create
        ), patch("prep_pilot.services.llm_client.asyncio.sleep", new_callable=AsyncMock):
            result = await llm_client.generate(prompt="test")

        assert result == "success"
        assert mock_create.call_count == 2

    @pytest.mark.asyncio
    async def test_no_retry_on_non_retryable_error(self, llm_client):
        """Test that non-retryable errors are raised immediately."""
        mock_create = AsyncMock(side_effect=ValueError("bad input"))

        with patch.object(
            llm_client._client.chat.completions, "create", mock_create
        ):
            with pytest.raises(LLMClientError, match="bad input"):
                await llm_client.generate(prompt="test")

        assert mock_create.call_count == 1

    @pytest.mark.asyncio
    async def test_exponential_backoff_delays(self, llm_client):
        """Test that retry delays follow exponential backoff pattern."""
        from openai import APITimeoutError

        mock_create = AsyncMock(
            side_effect=APITimeoutError(request=MagicMock())
        )
        sleep_calls = []

        async def mock_sleep(delay):
            sleep_calls.append(delay)

        with patch.object(
            llm_client._client.chat.completions, "create", mock_create
        ), patch("prep_pilot.services.llm_client.asyncio.sleep", side_effect=mock_sleep):
            with pytest.raises(LLMTimeoutError):
                await llm_client.generate(prompt="test")

        # Backoff: 2^0=1, 2^1=2 (only 2 sleeps for 3 attempts)
        assert sleep_calls == [1, 2]


class TestClose:
    """Tests for the close() method."""

    @pytest.mark.asyncio
    async def test_close_calls_client_close(self, llm_client):
        """Test that close() closes the underlying client."""
        with patch.object(
            llm_client._client, "close", new_callable=AsyncMock
        ) as mock_close:
            await llm_client.close()

        mock_close.assert_called_once()
