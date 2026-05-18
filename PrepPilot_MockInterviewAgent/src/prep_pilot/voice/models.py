"""Core data models for the voice orchestration system."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from prep_pilot.voice.conversation_context import ConversationContext

from prep_pilot.models.domain import (
    InterviewMode,
    InterviewQuestion,
    ParsedJobDescription,
    ParsedResume,
)


class TurnState(Enum):
    """States in the conversational turn-taking state machine."""

    IDLE = "idle"
    DELIVERING_QUESTION = "delivering_question"
    AWAITING_RESPONSE = "awaiting_response"
    PROCESSING_RESPONSE = "processing_response"
    GENERATING_FOLLOWUP = "generating_followup"
    DELIVERING_CLOSING = "delivering_closing"
    SESSION_ENDED = "session_ended"


@dataclass
class InterviewerPersona:
    """Configuration for an interviewer persona."""

    id: str
    name: str
    tts_voice: str  # OpenAI TTS voice identifier
    style: str  # "formal", "conversational", "challenging"
    difficulty: str  # "easy", "moderate", "hard"
    greeting_template: str
    question_style_prompt: str  # Injected into LLM prompts to shape phrasing


@dataclass
class OrchestratorConfig:
    """Configuration constants for the Voice Orchestrator."""

    tts_timeout: float = 5.0  # seconds before TTS fallback
    stt_timeout: float = 5.0  # seconds for transcription
    silence_end_of_turn: float = 2.0  # seconds of silence = end of turn
    silence_prompt: float = 15.0  # seconds before prompting candidate
    silence_timeout: float = 30.0  # seconds before requiring text input
    max_recording_duration: float = 120.0  # max candidate response length
    min_confidence: float = 0.4  # minimum STT confidence threshold
    max_retry_attempts: int = 2  # retries for low-confidence transcription
    followup_timeout: float = 4.0  # seconds for follow-up generation
    max_probing_depth: int = 3  # max consecutive probing questions
    greeting_min_duration: float = 10.0  # seconds
    greeting_max_duration: float = 30.0  # seconds
    closing_min_duration: float = 10.0  # seconds
    closing_max_duration: float = 30.0  # seconds
    websocket_keepalive_interval: float = 30.0  # seconds
    websocket_reconnect_timeout: float = 3.0  # seconds per attempt
    websocket_max_reconnect_attempts: int = 3
    context_retention_duration: float = 120.0  # seconds to preserve context during interruption
    max_roundtrip_time: float = 6.0  # seconds from end-of-speech to next question audio
    turn_transition_delay: float = 0.5  # seconds after TTS completes before listening


@dataclass
class TranscriptionResult:
    """Result from speech-to-text transcription."""

    text: str
    confidence: float  # 0.0 to 1.0
    has_recognizable_words: bool
    duration_seconds: float


@dataclass
class ResponseAssessment:
    """Assessment of candidate response thoroughness."""

    has_specific_example: bool
    has_quantifiable_result: bool
    sentence_count: int
    is_thorough: bool  # True if example/result present AND >= 2 sentences


@dataclass
class ConversationTurn:
    """A single question-response pair in the conversation."""

    question: InterviewQuestion
    question_text: str
    response_text: str
    response_confidence: float
    timestamp: datetime
    topic: str
    probing_depth: int  # How many probing questions on this topic


@dataclass
class VoiceSessionState:
    """Runtime state of an active voice session."""

    session_id: str
    persona: InterviewerPersona
    mode: InterviewMode
    turn_state: TurnState
    conversation_context: Optional[ConversationContext]
    current_question_index: int
    total_questions: int
    retry_count: int  # Current retry count for low-confidence transcriptions
    tts_available: bool
    stt_available: bool
    websocket_connected: bool
    last_confirmed_index: int  # For reconnection recovery
    created_at: datetime
    last_activity_at: datetime


@dataclass
class VoiceSessionConfig:
    """Configuration provided at session start."""

    session_id: str
    mode: InterviewMode
    resume: ParsedResume
    persona_id: Optional[str] = None  # None = use default
    job_description: Optional[ParsedJobDescription] = None
    role: Optional[str] = None
    question_count: int = 10


@dataclass
class ClosingStatement:
    """Generated closing statement for session conclusion."""

    text: str
    topics_referenced: list[str] = field(default_factory=list)  # At least 2 topics
    acknowledgment: str = ""  # Positive acknowledgment phrase
    sign_off: str = ""  # Natural sign-off phrase
    duration_estimate: float = 0.0  # Estimated audio duration in seconds
