"""LLM Client - Abstraction over the OpenAI API for all AI operations."""

import asyncio
import logging
import os
from typing import Any, TypeVar

import httpx
from openai import AsyncOpenAI, APITimeoutError, APIConnectionError, RateLimitError
from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Retryable exception types
_RETRYABLE_EXCEPTIONS = (APITimeoutError, APIConnectionError, RateLimitError)


class LLMClientError(Exception):
    """Base exception for LLM client errors."""


class LLMTimeoutError(LLMClientError):
    """Raised when all retry attempts are exhausted due to timeouts."""


class LLMConnectionError(LLMClientError):
    """Raised when the LLM service is unreachable after retries."""


class LLMClient:
    """Async LLM client wrapping the OpenAI API with retry and timeout support.

    Provides two main methods:
    - generate(): Free-text LLM responses
    - generate_structured(): Structured output parsed into typed Pydantic objects

    Configuration:
    - api_key: OpenAI API key (or set OPENAI_API_KEY env var)
    - model: Model name (default: gpt-4o-mini, or set OPENAI_MODEL env var)
    - timeout: Per-call timeout in seconds (default: 30)
    - max_retries: Maximum retry attempts with exponential backoff (default: 3)
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float = 30.0,
        max_retries: int = 3,
        base_url: str | None = None,
    ) -> None:
        self._api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self._model = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self._timeout = timeout
        self._max_retries = max_retries

        # Create async httpx client with connection pooling for faster subsequent calls
        http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )

        # Use a placeholder key if none provided so the client can initialize
        # without crashing. Actual API calls will fail with a clear auth error.
        init_key = self._api_key if self._api_key else "sk-placeholder-not-set"

        self._client = AsyncOpenAI(
            api_key=init_key,
            http_client=http_client,
            base_url=base_url,
            timeout=timeout,
        )

    @property
    def model(self) -> str:
        """Return the configured model name."""
        return self._model

    def _check_api_key(self) -> None:
        """Verify that a real API key is configured before making calls.

        Raises:
            LLMClientError: If no valid API key is set.
        """
        if not self._api_key or self._api_key == "sk-placeholder-not-set":
            raise LLMClientError(
                "OpenAI API key is not configured. "
                "Set the OPENAI_API_KEY environment variable in your .env file "
                "or pass it directly to LLMClient(api_key='...'). "
                "Get a key at https://platform.openai.com/api-keys"
            )

    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        **kwargs: Any,
    ) -> str:
        """Send a prompt to the LLM and return the response text.

        Args:
            prompt: The user prompt to send.
            system_prompt: Optional system prompt for context/instructions.
            **kwargs: Additional parameters passed to the OpenAI API
                (e.g., temperature, max_tokens).

        Returns:
            The LLM's response as a string.

        Raises:
            LLMTimeoutError: If all retries are exhausted due to timeouts.
            LLMConnectionError: If the service is unreachable after retries.
            LLMClientError: For other unrecoverable errors.
        """
        self._check_api_key()
        messages = self._build_messages(prompt, system_prompt)

        response = await self._call_with_retry(
            self._make_chat_completion,
            messages=messages,
            **kwargs,
        )

        return response.choices[0].message.content or ""

    async def generate_structured(
        self,
        prompt: str,
        system_prompt: str = "",
        schema: type[T] | None = None,
        **kwargs: Any,
    ) -> T:
        """Send a prompt and parse the response into a structured Pydantic object.

        Uses OpenAI's structured output (response_format) to ensure the response
        conforms to the provided Pydantic schema.

        Args:
            prompt: The user prompt to send.
            system_prompt: Optional system prompt for context/instructions.
            schema: A Pydantic BaseModel subclass defining the expected output structure.
            **kwargs: Additional parameters passed to the OpenAI API.

        Returns:
            An instance of the schema type populated with the LLM's response.

        Raises:
            LLMTimeoutError: If all retries are exhausted due to timeouts.
            LLMConnectionError: If the service is unreachable after retries.
            LLMClientError: For other unrecoverable errors.
            ValueError: If schema is None.
        """
        if schema is None:
            raise ValueError("schema parameter is required for generate_structured()")

        self._check_api_key()
        messages = self._build_messages(prompt, system_prompt)

        response = await self._call_with_retry(
            self._make_structured_completion,
            messages=messages,
            schema=schema,
            **kwargs,
        )

        return response

    def _build_messages(
        self, prompt: str, system_prompt: str
    ) -> list[dict[str, str]]:
        """Build the messages list for the OpenAI API."""
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        return messages

    async def _make_chat_completion(
        self, *, messages: list[dict[str, str]], **kwargs: Any
    ) -> Any:
        """Make a standard chat completion call."""
        return await self._client.chat.completions.create(
            model=self._model,
            messages=messages,  # type: ignore[arg-type]
            **kwargs,
        )

    async def _make_structured_completion(
        self, *, messages: list[dict[str, str]], schema: type[T], **kwargs: Any
    ) -> T:
        """Make a structured output chat completion call using beta parse."""
        response = await self._client.beta.chat.completions.parse(
            model=self._model,
            messages=messages,  # type: ignore[arg-type]
            response_format=schema,
            **kwargs,
        )

        parsed = response.choices[0].message.parsed
        if parsed is None:
            raise LLMClientError(
                "LLM returned a response that could not be parsed into the schema"
            )
        return parsed

    async def _call_with_retry(self, func: Any, **kwargs: Any) -> Any:
        """Execute a function with exponential backoff retry on transient errors.

        Retries on:
        - APITimeoutError
        - APIConnectionError
        - RateLimitError

        Backoff schedule: 1s, 2s, 4s (doubling each retry).
        """
        last_exception: Exception | None = None

        for attempt in range(self._max_retries):
            try:
                return await func(**kwargs)
            except _RETRYABLE_EXCEPTIONS as exc:
                last_exception = exc
                if attempt < self._max_retries - 1:
                    # Exponential backoff: 1s, 2s, 4s, ...
                    delay = 2**attempt
                    logger.warning(
                        "LLM call attempt %d/%d failed (%s), retrying in %ds...",
                        attempt + 1,
                        self._max_retries,
                        type(exc).__name__,
                        delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "LLM call failed after %d attempts: %s",
                        self._max_retries,
                        exc,
                    )
            except Exception as exc:
                # Non-retryable error, raise immediately
                raise LLMClientError(f"LLM call failed: {exc}") from exc

        # All retries exhausted
        if isinstance(last_exception, APITimeoutError):
            raise LLMTimeoutError(
                f"LLM call timed out after {self._max_retries} attempts"
            ) from last_exception
        elif isinstance(last_exception, APIConnectionError):
            raise LLMConnectionError(
                f"LLM service unreachable after {self._max_retries} attempts"
            ) from last_exception
        else:
            raise LLMClientError(
                f"LLM call failed after {self._max_retries} attempts: {last_exception}"
            ) from last_exception

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.close()
