"""Voice Service - Handles speech-to-text and text-to-speech operations.

Provides voice interaction capabilities using OpenAI's Whisper (STT) and TTS APIs.
Implements timeout handling, duration constraints, and graceful fallback to text mode.
"""

import asyncio
import io
import logging
from typing import Any

from openai import AsyncOpenAI, APIConnectionError, APITimeoutError, RateLimitError

from prep_pilot.models.domain import TranscriptionResult

logger = logging.getLogger(__name__)


# --- Custom Exceptions ---


class VoiceServiceError(Exception):
    """Base exception for voice service errors."""


class VoiceUnavailableError(VoiceServiceError):
    """Raised when the voice API is unavailable and fallback to text mode is needed."""


class AudioDurationError(VoiceServiceError):
    """Raised when audio exceeds the maximum recording duration."""


class UnrecognizableAudioError(VoiceServiceError):
    """Raised when transcription returns no recognizable words."""


class VoiceService:
    """Handles speech-to-text and text-to-speech operations.

    Uses OpenAI's Whisper API for transcription and TTS API for synthesis.
    Enforces duration limits and provides graceful error handling with
    fallback to text mode when the voice API is unavailable.

    Attributes:
        MAX_RECORDING_DURATION: Maximum allowed audio duration in seconds (120s).
        TRANSCRIPTION_TIMEOUT: Maximum time allowed for transcription in seconds (10s).
    """

    MAX_RECORDING_DURATION: int = 120  # seconds
    TRANSCRIPTION_TIMEOUT: int = 10  # seconds

    def __init__(
        self,
        client: AsyncOpenAI,
        stt_model: str = "whisper-1",
        tts_model: str = "tts-1",
        tts_voice: str = "alloy",
    ) -> None:
        """Initialize VoiceService.

        Args:
            client: An AsyncOpenAI client instance for API calls.
            stt_model: The Whisper model to use for transcription.
            tts_model: The TTS model to use for synthesis.
            tts_voice: The voice to use for TTS output.
        """
        self._client = client
        self._stt_model = stt_model
        self._tts_model = tts_model
        self._tts_voice = tts_voice

    async def transcribe(
        self, audio_data: bytes, duration_seconds: float
    ) -> TranscriptionResult:
        """Convert audio input to text using OpenAI Whisper API.

        Validates audio duration, calls the Whisper API with a 10-second timeout,
        and checks for recognizable words in the transcription result.

        Args:
            audio_data: Raw audio bytes to transcribe.
            duration_seconds: Duration of the audio in seconds.

        Returns:
            TranscriptionResult with transcribed text, confidence, and
            has_recognizable_words flag.

        Raises:
            AudioDurationError: If duration exceeds MAX_RECORDING_DURATION (120s).
            UnrecognizableAudioError: If transcription contains no recognizable words.
            VoiceUnavailableError: If the voice API is unavailable (fallback to text).
            VoiceServiceError: For other transcription failures.
        """
        # Validate duration constraint
        if duration_seconds > self.MAX_RECORDING_DURATION:
            raise AudioDurationError(
                f"Audio duration ({duration_seconds:.1f}s) exceeds maximum "
                f"allowed duration of {self.MAX_RECORDING_DURATION} seconds."
            )

        try:
            # Call Whisper API with timeout
            transcription = await asyncio.wait_for(
                self._call_whisper(audio_data),
                timeout=self.TRANSCRIPTION_TIMEOUT,
            )
        except asyncio.TimeoutError:
            raise VoiceServiceError(
                f"Transcription timed out after {self.TRANSCRIPTION_TIMEOUT} seconds. "
                "Please try again or switch to text input."
            )
        except (APIConnectionError, APITimeoutError) as exc:
            logger.warning("Voice API unavailable: %s", exc)
            raise VoiceUnavailableError(
                "Voice service is currently unavailable. "
                "Please continue using text input."
            ) from exc
        except RateLimitError as exc:
            logger.warning("Voice API rate limited: %s", exc)
            raise VoiceUnavailableError(
                "Voice service is currently unavailable due to rate limiting. "
                "Please continue using text input."
            ) from exc
        except Exception as exc:
            logger.error("Transcription failed: %s", exc)
            raise VoiceServiceError(
                f"Transcription failed: {exc}"
            ) from exc

        # Extract text from transcription response
        text = transcription.text.strip() if transcription.text else ""

        # Check for recognizable words
        has_recognizable_words = self._has_recognizable_words(text)

        if not has_recognizable_words:
            raise UnrecognizableAudioError(
                "Your input could not be understood. "
                "Please try again or switch to text input."
            )

        # Estimate confidence based on text quality
        # Whisper doesn't provide a direct confidence score in the simple API,
        # so we use a heuristic based on text length and word count
        confidence = self._estimate_confidence(text, duration_seconds)

        return TranscriptionResult(
            text=text,
            confidence=confidence,
            has_recognizable_words=True,
        )

    async def synthesize(self, text: str) -> bytes:
        """Convert text to audio output using OpenAI TTS API.

        Args:
            text: The text to convert to speech.

        Returns:
            Audio bytes of the synthesized speech.

        Raises:
            VoiceUnavailableError: If the TTS API is unavailable.
            VoiceServiceError: For other synthesis failures.
        """
        if not text or not text.strip():
            raise VoiceServiceError("Cannot synthesize empty text.")

        try:
            response = await self._call_tts(text)
            # Read the audio content from the response
            audio_bytes = await self._read_tts_response(response)
            return audio_bytes
        except (APIConnectionError, APITimeoutError) as exc:
            logger.warning("TTS API unavailable: %s", exc)
            raise VoiceUnavailableError(
                "Voice service is currently unavailable. "
                "Text response has been provided instead."
            ) from exc
        except RateLimitError as exc:
            logger.warning("TTS API rate limited: %s", exc)
            raise VoiceUnavailableError(
                "Voice service is currently unavailable due to rate limiting. "
                "Text response has been provided instead."
            ) from exc
        except Exception as exc:
            logger.error("Speech synthesis failed: %s", exc)
            raise VoiceServiceError(
                f"Speech synthesis failed: {exc}"
            ) from exc

    async def _call_whisper(self, audio_data: bytes) -> Any:
        """Call the OpenAI Whisper API for transcription.

        Args:
            audio_data: Raw audio bytes.

        Returns:
            The transcription response from the API.
        """
        # Create a file-like object from audio bytes
        audio_file = io.BytesIO(audio_data)
        audio_file.name = "audio.webm"

        response = await self._client.audio.transcriptions.create(
            model=self._stt_model,
            file=audio_file,
        )
        return response

    async def _call_tts(self, text: str) -> Any:
        """Call the OpenAI TTS API for speech synthesis.

        Args:
            text: Text to synthesize.

        Returns:
            The TTS response (streaming or complete).
        """
        response = await self._client.audio.speech.create(
            model=self._tts_model,
            voice=self._tts_voice,
            input=text,
        )
        return response

    async def _read_tts_response(self, response: Any) -> bytes:
        """Read audio bytes from a TTS API response.

        Args:
            response: The TTS API response object.

        Returns:
            The audio content as bytes.
        """
        # The OpenAI TTS response has a read() method or content attribute
        if hasattr(response, "read"):
            return await response.aread()
        elif hasattr(response, "content"):
            return response.content
        else:
            # Fallback: iterate over the response
            chunks = []
            async for chunk in response.iter_bytes():
                chunks.append(chunk)
            return b"".join(chunks)

    @staticmethod
    def _has_recognizable_words(text: str) -> bool:
        """Check if transcribed text contains recognizable words.

        Args:
            text: The transcribed text to check.

        Returns:
            True if the text contains at least one alphabetic word.
        """
        if not text:
            return False

        # Check if there's at least one word with alphabetic characters
        words = text.split()
        return any(
            any(c.isalpha() for c in word)
            for word in words
        )

    @staticmethod
    def _estimate_confidence(text: str, duration_seconds: float) -> float:
        """Estimate transcription confidence based on text characteristics.

        Uses heuristics since the simple Whisper API doesn't return confidence.
        Higher confidence for text that has reasonable word density relative
        to audio duration.

        Args:
            text: The transcribed text.
            duration_seconds: The audio duration in seconds.

        Returns:
            A confidence score between 0.0 and 1.0.
        """
        if not text or duration_seconds <= 0:
            return 0.0

        words = text.split()
        word_count = len(words)

        # Average speaking rate is ~130-150 words per minute (~2.2-2.5 words/sec)
        # If word density is reasonable, confidence is higher
        expected_words = duration_seconds * 2.3
        if expected_words == 0:
            return 0.5

        # Ratio of actual to expected words (capped at 1.0)
        density_ratio = min(word_count / expected_words, 1.5)

        # Base confidence from density
        if 0.3 <= density_ratio <= 1.5:
            confidence = 0.85
        elif 0.1 <= density_ratio < 0.3:
            confidence = 0.6
        else:
            confidence = 0.4

        # Boost for longer, more coherent text
        if word_count >= 5:
            confidence = min(confidence + 0.1, 1.0)

        return round(confidence, 2)
