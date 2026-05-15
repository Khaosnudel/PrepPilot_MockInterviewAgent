"""Domain and API models for Prep Pilot."""

from prep_pilot.models.domain import (
    Experience,
    FeedbackReport,
    ImprovedAnswer,
    ImprovementSuggestion,
    InterviewMode,
    InterviewQuestion,
    InterviewReadinessScore,
    InterviewSession,
    ParsedJobDescription,
    ParsedResume,
    QuestionRelevancyDetail,
    QuestionResponse,
    ResumeRelevancyResult,
    ScoreReasoning,
    SessionResults,
    SessionStatus,
    TranscriptionResult,
    ValidationResult,
)
from prep_pilot.models.api import (
    QuestionResponse as QuestionResponseAPI,
    SelectModeRequest,
    SessionResultsResponse,
    StartSessionResponse,
    SubmitAnswerRequest,
    UploadResumeResponse,
)

__all__ = [
    # Domain models
    "InterviewMode",
    "SessionStatus",
    "Experience",
    "ParsedResume",
    "ParsedJobDescription",
    "InterviewQuestion",
    "QuestionResponse",
    "InterviewSession",
    "InterviewReadinessScore",
    "QuestionRelevancyDetail",
    "ResumeRelevancyResult",
    "ImprovedAnswer",
    "ScoreReasoning",
    "ImprovementSuggestion",
    "FeedbackReport",
    "SessionResults",
    "ValidationResult",
    "TranscriptionResult",
    # API models
    "StartSessionResponse",
    "UploadResumeResponse",
    "SelectModeRequest",
    "QuestionResponseAPI",
    "SubmitAnswerRequest",
    "SessionResultsResponse",
]
