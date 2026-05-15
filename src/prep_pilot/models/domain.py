"""Core domain data models for Prep Pilot."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class InterviewMode(Enum):
    """Interview mode selection."""

    OPEN_PRACTICE = "open_practice"
    JOB_SPECIFIC = "job_specific"


class SessionStatus(Enum):
    """Interview session lifecycle states."""

    AWAITING_RESUME = "awaiting_resume"
    AWAITING_MODE_SELECTION = "awaiting_mode_selection"
    AWAITING_ROLE_SELECTION = "awaiting_role_selection"
    AWAITING_JOB_DESCRIPTION = "awaiting_job_description"
    IN_PROGRESS = "in_progress"
    CONCLUDED = "concluded"


@dataclass
class Experience:
    """A single work experience entry from a resume."""

    title: str
    company: str
    duration: str
    description: str
    skills_used: list[str]


@dataclass
class ParsedResume:
    """Structured data extracted from a resume document."""

    skills: list[str]
    experiences: list[Experience]
    qualifications: list[str]
    raw_text: str


@dataclass
class ParsedJobDescription:
    """Structured data extracted from a job description document."""

    requirements: list[str]
    responsibilities: list[str]
    qualifications: list[str]
    summary: str


@dataclass
class InterviewQuestion:
    """A single interview question generated for a session."""

    id: str
    text: str
    category: str
    references_resume_item: Optional[str] = None
    references_jd_item: Optional[str] = None


@dataclass
class QuestionResponse:
    """A user's response to an interview question."""

    question: InterviewQuestion
    response_text: str
    response_timestamp: datetime
    input_mode: str  # "voice" or "text"


@dataclass
class InterviewSession:
    """The full state of an interview session."""

    id: str
    mode: InterviewMode
    status: SessionStatus
    resume: ParsedResume
    job_description: Optional[ParsedJobDescription] = None
    selected_role: Optional[str] = None
    questions: list[InterviewQuestion] = field(default_factory=list)
    responses: list[QuestionResponse] = field(default_factory=list)
    current_question_index: int = 0
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class InterviewReadinessScore:
    """Composite interview performance score across four dimensions."""

    clarity_of_communication: int  # 1-10
    technical_accuracy: int  # 1-10
    star_method_adherence: int  # 1-10
    overall_response_relevancy: int  # 1-10


@dataclass
class QuestionRelevancyDetail:
    """Per-question reasoning for resume relevancy evaluation."""

    question_id: str
    supported_claims: list[str]
    unsupported_claims: list[str]
    reasoning: str


@dataclass
class ResumeRelevancyResult:
    """Result of resume relevancy evaluation."""

    score: int  # 1-10
    per_question_reasoning: list[QuestionRelevancyDetail]


@dataclass
class ImprovedAnswer:
    """An improved version of a user's original response."""

    question_id: str
    original_response: str
    improved_response: str


@dataclass
class ScoreReasoning:
    """Reasoning for a specific evaluation dimension score."""

    dimension: str
    score: int
    reasoning: str
    referenced_responses: list[str]


@dataclass
class ImprovementSuggestion:
    """An actionable improvement suggestion for a specific dimension."""

    dimension: str
    suggestion: str
    referenced_response: str


@dataclass
class FeedbackReport:
    """Complete feedback report generated after an interview session."""

    improved_answers: list[ImprovedAnswer]
    follow_up_questions: list[str]
    score_reasoning: list[ScoreReasoning]
    improvement_suggestions: list[ImprovementSuggestion]


@dataclass
class SessionResults:
    """Aggregated results from a concluded interview session."""

    readiness_score: Optional[InterviewReadinessScore]
    resume_relevancy: Optional[ResumeRelevancyResult]
    feedback_report: Optional[FeedbackReport]
    insufficient_responses: bool = False


@dataclass
class ValidationResult:
    """Result of file validation."""

    is_valid: bool
    error_message: Optional[str] = None


@dataclass
class TranscriptionResult:
    """Result of voice-to-text transcription."""

    text: str
    confidence: float
    has_recognizable_words: bool
