"""Shared pytest fixtures for voice orchestration tests.

Provides mock TTS/STT engines, sample personas, conversation contexts,
and orchestrator configuration for use across property, unit, and
integration test suites.
"""

from datetime import datetime
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest

from prep_pilot.voice.models import (
    ConversationTurn,
    InterviewerPersona,
    OrchestratorConfig,
    TranscriptionResult,
    TurnState,
)
from prep_pilot.voice.persona_manager import INTERVIEWER_PERSONAS


# ---------------------------------------------------------------------------
# Mock TTS Engine
# ---------------------------------------------------------------------------


class MockTTSEngine:
    """Mock TTS engine that returns fake audio bytes."""

    def __init__(self, audio_bytes: bytes = b"\x00\x01\x02\x03" * 256) -> None:
        self._audio_bytes = audio_bytes
        self.synthesize_stream_called = False
        self.synthesize_full_called = False
        self.last_text: str | None = None
        self.last_voice: str | None = None
        self.should_fail = False
        self.failure_exception: Exception | None = None

    async def synthesize_stream(self, text: str, voice: str) -> AsyncIterator[bytes]:
        """Yield fake audio chunks."""
        self.synthesize_stream_called = True
        self.last_text = text
        self.last_voice = voice

        if self.should_fail and self.failure_exception:
            raise self.failure_exception

        chunk_size = 256
        for i in range(0, len(self._audio_bytes), chunk_size):
            yield self._audio_bytes[i : i + chunk_size]

    async def synthesize_full(self, text: str, voice: str) -> bytes:
        """Return complete fake audio bytes."""
        self.synthesize_full_called = True
        self.last_text = text
        self.last_voice = voice

        if self.should_fail and self.failure_exception:
            raise self.failure_exception

        return self._audio_bytes


# ---------------------------------------------------------------------------
# Mock STT Engine
# ---------------------------------------------------------------------------


class MockSTTEngine:
    """Mock STT engine that returns configurable TranscriptionResult."""

    def __init__(
        self,
        default_text: str = "I led a team of five engineers to deliver the project on time.",
        default_confidence: float = 0.92,
        default_has_recognizable_words: bool = True,
        default_duration_seconds: float = 5.0,
    ) -> None:
        self._default_text = default_text
        self._default_confidence = default_confidence
        self._default_has_recognizable_words = default_has_recognizable_words
        self._default_duration_seconds = default_duration_seconds
        self.transcribe_called = False
        self.should_fail = False
        self.failure_exception: Exception | None = None
        self._custom_result: TranscriptionResult | None = None

    def set_result(self, result: TranscriptionResult) -> None:
        """Configure a custom transcription result."""
        self._custom_result = result

    async def transcribe(self, audio_data: bytes, duration: float) -> TranscriptionResult:
        """Return a configurable TranscriptionResult."""
        self.transcribe_called = True

        if self.should_fail and self.failure_exception:
            raise self.failure_exception

        if self._custom_result is not None:
            return self._custom_result

        return TranscriptionResult(
            text=self._default_text,
            confidence=self._default_confidence,
            has_recognizable_words=self._default_has_recognizable_words,
            duration_seconds=self._default_duration_seconds,
        )

    def detect_end_of_speech(self, silence_duration: float) -> bool:
        """Detect end of speech based on 2-second silence threshold."""
        return silence_duration >= 2.0


# ---------------------------------------------------------------------------
# Fixtures: Mock Engines
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_tts_engine() -> MockTTSEngine:
    """Provide a mock TTS engine that returns fake audio bytes."""
    return MockTTSEngine()


@pytest.fixture
def mock_stt_engine() -> MockSTTEngine:
    """Provide a mock STT engine with configurable transcription results."""
    return MockSTTEngine()


# ---------------------------------------------------------------------------
# Fixtures: Personas
# ---------------------------------------------------------------------------


@pytest.fixture
def professional_persona() -> InterviewerPersona:
    """Provide the professional (Alex) persona."""
    return INTERVIEWER_PERSONAS[0]


@pytest.fixture
def friendly_persona() -> InterviewerPersona:
    """Provide the friendly (Sam) persona."""
    return INTERVIEWER_PERSONAS[1]


@pytest.fixture
def challenger_persona() -> InterviewerPersona:
    """Provide the challenger (Morgan) persona."""
    return INTERVIEWER_PERSONAS[2]


@pytest.fixture
def all_personas() -> list[InterviewerPersona]:
    """Provide all three interviewer personas."""
    return list(INTERVIEWER_PERSONAS)


# ---------------------------------------------------------------------------
# Fixtures: Conversation Context
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_turns() -> list[ConversationTurn]:
    """Provide a list of pre-populated conversation turns."""
    return [
        ConversationTurn(
            question_id="q1",
            question_text="Tell me about a time you led a technical project.",
            response_text=(
                "I led the migration of our monolith to microservices. "
                "We reduced deployment time by 60% over six months."
            ),
            response_confidence=0.95,
            timestamp=datetime(2025, 1, 15, 10, 0, 0),
            topic="leadership",
            probing_depth=0,
        ),
        ConversationTurn(
            question_id="q2",
            question_text="What specific challenges did you face during that migration?",
            response_text=(
                "The biggest challenge was data consistency across services. "
                "I implemented an event-driven architecture using Kafka to "
                "ensure eventual consistency."
            ),
            response_confidence=0.88,
            timestamp=datetime(2025, 1, 15, 10, 2, 0),
            topic="leadership",
            probing_depth=1,
        ),
        ConversationTurn(
            question_id="q3",
            question_text="How do you approach debugging complex distributed systems?",
            response_text=(
                "I rely on structured logging and distributed tracing. "
                "At my last company, I set up Jaeger for tracing which "
                "cut our mean time to resolution by 40%."
            ),
            response_confidence=0.91,
            timestamp=datetime(2025, 1, 15, 10, 5, 0),
            topic="technical_skills",
            probing_depth=0,
        ),
    ]


# ---------------------------------------------------------------------------
# Fixtures: Orchestrator Config
# ---------------------------------------------------------------------------


@pytest.fixture
def default_config() -> OrchestratorConfig:
    """Provide an OrchestratorConfig with default values."""
    return OrchestratorConfig()


@pytest.fixture
def fast_config() -> OrchestratorConfig:
    """Provide an OrchestratorConfig with reduced timeouts for testing."""
    return OrchestratorConfig(
        tts_timeout=1.0,
        stt_timeout=1.0,
        silence_end_of_turn=0.5,
        silence_prompt=3.0,
        silence_timeout=5.0,
        followup_timeout=1.0,
        turn_transition_delay=0.1,
    )
