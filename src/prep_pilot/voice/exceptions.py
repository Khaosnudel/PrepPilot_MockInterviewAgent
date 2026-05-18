"""Custom exceptions for the voice orchestration system."""


class VoiceOrchestratorError(Exception):
    """Base exception for voice orchestrator errors."""


class TTSTimeoutError(VoiceOrchestratorError):
    """Raised when TTS synthesis exceeds the configured timeout."""


class TTSConnectionError(VoiceOrchestratorError):
    """Raised when the TTS API connection fails."""


class STTTimeoutError(VoiceOrchestratorError):
    """Raised when STT transcription exceeds the configured timeout."""


class STTUnavailableError(VoiceOrchestratorError):
    """Raised when the STT service is unreachable."""


class AudioDurationError(VoiceOrchestratorError):
    """Raised when audio exceeds the maximum recording duration."""
