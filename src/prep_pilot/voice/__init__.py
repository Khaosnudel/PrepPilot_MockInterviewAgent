"""Voice orchestration package for Prep Pilot mock interviews."""

from prep_pilot.voice.models import (
    ClosingStatement,
    ConversationTurn,
    InterviewerPersona,
    OrchestratorConfig,
    ResponseAssessment,
    TranscriptionResult,
    TurnState,
    VoiceSessionConfig,
    VoiceSessionState,
)
from prep_pilot.voice.exceptions import (
    AudioDurationError,
    STTTimeoutError,
    STTUnavailableError,
    TTSConnectionError,
    TTSTimeoutError,
    VoiceOrchestratorError,
)
from prep_pilot.voice.persona_manager import PersonaManager

__all__ = [
    # Data models
    "ClosingStatement",
    "ConversationTurn",
    "InterviewerPersona",
    "OrchestratorConfig",
    "ResponseAssessment",
    "TranscriptionResult",
    "TurnState",
    "VoiceSessionConfig",
    "VoiceSessionState",
    # Exceptions
    "AudioDurationError",
    "STTTimeoutError",
    "STTUnavailableError",
    "TTSConnectionError",
    "TTSTimeoutError",
    "VoiceOrchestratorError",
    # Managers
    "PersonaManager",
]
