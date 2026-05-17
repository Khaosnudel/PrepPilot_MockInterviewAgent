"""Pydantic request/response models for the Prep Pilot API."""

from pydantic import BaseModel


class StartSessionResponse(BaseModel):
    """Response returned when a new interview session is created."""

    session_id: str
    status: str


class UploadResumeResponse(BaseModel):
    """Response returned after a resume is uploaded and parsed."""

    skills: list[str]
    experiences: list[dict]
    qualifications: list[str]
    confirmation_required: bool = True


class SelectModeRequest(BaseModel):
    """Request to select an interview mode for a session."""

    mode: str  # "open_practice" or "job_specific"
    role: str | None = None  # Required for open_practice


class QuestionResponse(BaseModel):
    """Response containing a single interview question."""

    question_id: str
    question_text: str
    category: str


class SubmitAnswerRequest(BaseModel):
    """Request to submit an answer to the current question."""

    response_text: str
    input_mode: str = "text"


class SessionResultsResponse(BaseModel):
    """Response containing the full session evaluation results."""

    readiness_score: dict | None
    resume_relevancy: dict | None
    feedback_report: dict | None
    message: str | None = None
