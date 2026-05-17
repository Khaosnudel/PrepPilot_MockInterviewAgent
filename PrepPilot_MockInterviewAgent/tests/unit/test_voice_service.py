"""Unit tests for VoiceService."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from prep_pilot.models.domain import TranscriptionResult
from prep_pilot.services.voice_service import (
    AudioDurationError,
    UnrecognizableAudioError,
    VoiceService,
    VoiceServiceError,
    VoiceUnavailableError,
)


@pytest.fixture
def mock_openai_client():
    """Create a mock AsyncOpenAI client."""
    client = AsyncMock()
    client.audio = AsyncMock()
    client.audio.transcriptions = AsyncMock()
    client.audio.speech = AsyncMock()
    return client


@pytest.fixture
def voice_service(mock_openai_client):
    """Create a VoiceService instance with mocked client."""
    return VoiceService(client=mock_openai_client)


class TestTranscribe:
    """Tests for VoiceService.transcribe()."""

    @pytest.mark.asyncio
    async def test_successful_transcription(self, voice_service, mock_openai_client):
        """Test successful audio transcription."""
        # Arrange
        mock_response = MagicMock()
        mock_response.text = "Hello, I have experience with Python and machine learning."
        mock_openai_client.audio.transcriptions.create = AsyncMock(
            return_value=mock_response
        )

        audio_data = b"fake audio data"
        duration = 5.0

        # Act
        result = await voice_service.transcribe(audio_data, duration)

        # Assert
        assert isinstance(result, TranscriptionResult)
        assert result.text == "Hello, I have experience with Python and machine learning."
        assert result.has_recognizable_words is True
        assert 0.0 <= result.confidence <= 1.0

    @pytest.mark.asyncio
    async def test_rejects_audio_exceeding_max_duration(self, voice_service):
        """Test that audio exceeding 120 seconds is rejected."""
        audio_data = b"fake audio data"
        duration = 121.0  # Exceeds MAX_RECORDING_DURATION

        with pytest.raises(AudioDurationError) as exc_info:
            await voice_service.transcribe(audio_data, duration)

        assert "121.0s" in str(exc_info.value)
        assert "120" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_rejects_audio_at_boundary(self, voice_service, mock_openai_client):
        """Test that audio at exactly 120 seconds is accepted."""
        mock_response = MagicMock()
        mock_response.text = "This is a valid response at the boundary."
        mock_openai_client.audio.transcriptions.create = AsyncMock(
            return_value=mock_response
        )

        audio_data = b"fake audio data"
        duration = 120.0  # Exactly at MAX_RECORDING_DURATION

        result = await voice_service.transcribe(audio_data, duration)
        assert result.has_recognizable_words is True

    @pytest.mark.asyncio
    async def test_unrecognizable_audio_raises_error(
        self, voice_service, mock_openai_client
    ):
        """Test that empty transcription raises UnrecognizableAudioError."""
        mock_response = MagicMock()
        mock_response.text = ""
        mock_openai_client.audio.transcriptions.create = AsyncMock(
            return_value=mock_response
        )

        audio_data = b"fake audio data"
        duration = 3.0

        with pytest.raises(UnrecognizableAudioError) as exc_info:
            await voice_service.transcribe(audio_data, duration)

        assert "could not be understood" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_unrecognizable_audio_only_symbols(
        self, voice_service, mock_openai_client
    ):
        """Test that transcription with only symbols raises UnrecognizableAudioError."""
        mock_response = MagicMock()
        mock_response.text = "... --- !!!"
        mock_openai_client.audio.transcriptions.create = AsyncMock(
            return_value=mock_response
        )

        audio_data = b"fake audio data"
        duration = 2.0

        with pytest.raises(UnrecognizableAudioError):
            await voice_service.transcribe(audio_data, duration)

    @pytest.mark.asyncio
    async def test_transcription_timeout(self, voice_service, mock_openai_client):
        """Test that transcription timeout raises VoiceServiceError."""

        async def slow_transcription(*args, **kwargs):
            await asyncio.sleep(15)  # Exceeds TRANSCRIPTION_TIMEOUT
            return MagicMock(text="late response")

        mock_openai_client.audio.transcriptions.create = slow_transcription

        audio_data = b"fake audio data"
        duration = 5.0

        with pytest.raises(VoiceServiceError) as exc_info:
            await voice_service.transcribe(audio_data, duration)

        assert "timed out" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_api_connection_error_raises_unavailable(
        self, voice_service, mock_openai_client
    ):
        """Test that API connection error raises VoiceUnavailableError."""
        from openai import APIConnectionError

        mock_openai_client.audio.transcriptions.create = AsyncMock(
            side_effect=APIConnectionError(request=MagicMock())
        )

        audio_data = b"fake audio data"
        duration = 5.0

        with pytest.raises(VoiceUnavailableError) as exc_info:
            await voice_service.transcribe(audio_data, duration)

        assert "unavailable" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_rate_limit_error_raises_unavailable(
        self, voice_service, mock_openai_client
    ):
        """Test that rate limit error raises VoiceUnavailableError."""
        from openai import RateLimitError

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {}
        mock_openai_client.audio.transcriptions.create = AsyncMock(
            side_effect=RateLimitError(
                message="Rate limited",
                response=mock_response,
                body=None,
            )
        )

        audio_data = b"fake audio data"
        duration = 5.0

        with pytest.raises(VoiceUnavailableError) as exc_info:
            await voice_service.transcribe(audio_data, duration)

        assert "rate limiting" in str(exc_info.value)


class TestSynthesize:
    """Tests for VoiceService.synthesize()."""

    @pytest.mark.asyncio
    async def test_successful_synthesis(self, voice_service, mock_openai_client):
        """Test successful text-to-speech synthesis."""
        mock_response = MagicMock(spec=[])  # spec=[] prevents auto-attribute creation
        mock_response.content = b"fake audio output bytes"
        mock_openai_client.audio.speech.create = AsyncMock(
            return_value=mock_response
        )

        result = await voice_service.synthesize("Hello, how are you?")

        assert result == b"fake audio output bytes"
        mock_openai_client.audio.speech.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_empty_text_raises_error(self, voice_service):
        """Test that empty text raises VoiceServiceError."""
        with pytest.raises(VoiceServiceError) as exc_info:
            await voice_service.synthesize("")

        assert "empty text" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_whitespace_only_text_raises_error(self, voice_service):
        """Test that whitespace-only text raises VoiceServiceError."""
        with pytest.raises(VoiceServiceError) as exc_info:
            await voice_service.synthesize("   ")

        assert "empty text" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_api_connection_error_raises_unavailable(
        self, voice_service, mock_openai_client
    ):
        """Test that API connection error during synthesis raises VoiceUnavailableError."""
        from openai import APIConnectionError

        mock_openai_client.audio.speech.create = AsyncMock(
            side_effect=APIConnectionError(request=MagicMock())
        )

        with pytest.raises(VoiceUnavailableError) as exc_info:
            await voice_service.synthesize("Hello world")

        assert "unavailable" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_synthesis_with_read_method(self, voice_service, mock_openai_client):
        """Test synthesis when response has aread() method."""
        mock_response = MagicMock()
        mock_response.read = None  # Has 'read' attr but it's None
        del mock_response.read  # Remove it
        mock_response.content = b"audio bytes from content"
        mock_openai_client.audio.speech.create = AsyncMock(
            return_value=mock_response
        )

        result = await voice_service.synthesize("Test text")
        assert result == b"audio bytes from content"


class TestHelperMethods:
    """Tests for VoiceService helper methods."""

    def test_has_recognizable_words_with_text(self):
        """Test recognizable words detection with valid text."""
        assert VoiceService._has_recognizable_words("Hello world") is True

    def test_has_recognizable_words_empty(self):
        """Test recognizable words detection with empty string."""
        assert VoiceService._has_recognizable_words("") is False

    def test_has_recognizable_words_only_numbers(self):
        """Test recognizable words detection with only numbers."""
        assert VoiceService._has_recognizable_words("123 456") is False

    def test_has_recognizable_words_only_symbols(self):
        """Test recognizable words detection with only symbols."""
        assert VoiceService._has_recognizable_words("... !!! ???") is False

    def test_has_recognizable_words_mixed(self):
        """Test recognizable words detection with mixed content."""
        assert VoiceService._has_recognizable_words("123 hello 456") is True

    def test_estimate_confidence_normal_speech(self):
        """Test confidence estimation for normal speech rate."""
        # ~10 words in 5 seconds is reasonable
        confidence = VoiceService._estimate_confidence(
            "I have experience with Python and machine learning frameworks",
            5.0,
        )
        assert 0.5 <= confidence <= 1.0

    def test_estimate_confidence_empty_text(self):
        """Test confidence estimation for empty text."""
        confidence = VoiceService._estimate_confidence("", 5.0)
        assert confidence == 0.0

    def test_estimate_confidence_zero_duration(self):
        """Test confidence estimation for zero duration."""
        confidence = VoiceService._estimate_confidence("hello", 0.0)
        assert confidence == 0.0


class TestConstants:
    """Tests for VoiceService constants."""

    def test_max_recording_duration(self):
        """Test MAX_RECORDING_DURATION is 120 seconds."""
        assert VoiceService.MAX_RECORDING_DURATION == 120

    def test_transcription_timeout(self):
        """Test TRANSCRIPTION_TIMEOUT is 10 seconds."""
        assert VoiceService.TRANSCRIPTION_TIMEOUT == 10


class TestExceptionHierarchy:
    """Tests for custom exception hierarchy."""

    def test_voice_service_error_is_base(self):
        """Test VoiceServiceError is the base exception."""
        assert issubclass(VoiceUnavailableError, VoiceServiceError)
        assert issubclass(AudioDurationError, VoiceServiceError)
        assert issubclass(UnrecognizableAudioError, VoiceServiceError)

    def test_exceptions_are_catchable_as_base(self):
        """Test all custom exceptions can be caught as VoiceServiceError."""
        with pytest.raises(VoiceServiceError):
            raise VoiceUnavailableError("test")

        with pytest.raises(VoiceServiceError):
            raise AudioDurationError("test")

        with pytest.raises(VoiceServiceError):
            raise UnrecognizableAudioError("test")
