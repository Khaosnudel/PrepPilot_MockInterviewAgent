"""REST API endpoints for Prep Pilot interview sessions."""

import logging
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, status

from prep_pilot.data.roles import get_roles
from prep_pilot.models.api import (
    QuestionResponse,
    SelectModeRequest,
    SessionResultsResponse,
    StartSessionResponse,
    SubmitAnswerRequest,
    UploadResumeResponse,
)
from prep_pilot.models.domain import InterviewMode, SessionStatus
from prep_pilot.services.evaluation_engine import EvaluationEngine
from prep_pilot.services.file_validator import FileValidator
from prep_pilot.services.jd_parser import (
    JobDescriptionParser,
    JDParserError,
)
from prep_pilot.services.llm_client import LLMClient
from prep_pilot.services.prompt_manager import PromptManager
from prep_pilot.services.question_generator import QuestionGenerator
from prep_pilot.services.resume_parser import ResumeParser, ResumeParseError
from prep_pilot.services.session_manager import (
    InvalidStateError,
    SessionManager,
    SessionManagerError,
    SessionNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Dependency Injection
# ---------------------------------------------------------------------------


class ServiceContainer:
    """Simple dependency injection container that creates all services
    with a shared LLMClient instance.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None) -> None:
        self.llm_client = llm_client or LLMClient()
        self.prompt_manager = PromptManager()
        self.file_validator = FileValidator()
        self.resume_parser = ResumeParser(llm_client=self.llm_client)
        self.jd_parser = JobDescriptionParser(llm_client=self.llm_client)
        self.question_generator = QuestionGenerator(
            llm_client=self.llm_client,
            prompt_manager=self.prompt_manager,
        )
        self.evaluation_engine = EvaluationEngine(
            llm_client=self.llm_client,
            prompt_manager=self.prompt_manager,
        )
        self.session_manager = SessionManager(
            question_generator=self.question_generator,
            evaluation_engine=self.evaluation_engine,
            feedback_generator=None,  # Not yet implemented (task 9.1)
        )


# Module-level container instance (can be overridden for testing)
_container: Optional[ServiceContainer] = None


def get_container() -> ServiceContainer:
    """Get or create the service container singleton."""
    global _container
    if _container is None:
        _container = ServiceContainer()
    return _container


def set_container(container: ServiceContainer) -> None:
    """Override the service container (useful for testing)."""
    global _container
    _container = container


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/sessions",
    response_model=StartSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    container: ServiceContainer = Depends(get_container),
) -> StartSessionResponse:
    """Create a new interview session.

    Returns a session ID and initial status (awaiting_resume).
    """
    session = await container.session_manager.create_session()
    return StartSessionResponse(
        session_id=session.id,
        status=session.status.value,
    )


@router.post(
    "/sessions/{session_id}/resume",
    response_model=UploadResumeResponse,
    status_code=status.HTTP_200_OK,
)
async def upload_resume(
    session_id: str,
    file: UploadFile = File(...),
    container: ServiceContainer = Depends(get_container),
) -> UploadResumeResponse:
    """Upload and parse a resume for the session.

    Validates the file format and size, parses the resume, and
    transitions the session to AWAITING_MODE_SELECTION.
    """
    # Validate the file
    content = await file.read()
    mime_type = file.content_type or ""

    validation = container.file_validator.validate(
        file_content=content,
        mime_type=mime_type,
        allowed_formats=FileValidator.ALLOWED_RESUME_FORMATS,
    )
    if not validation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation.error_message,
        )

    # Parse the resume
    try:
        parsed_resume = await container.resume_parser.parse(
            file_content=content, file_type=mime_type
        )
    except ResumeParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # Upload to session manager
    try:
        await container.session_manager.upload_resume(session_id, parsed_resume)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    except InvalidStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    # Build response
    experiences_dicts = [
        {
            "title": exp.title,
            "company": exp.company,
            "duration": exp.duration,
            "description": exp.description,
            "skills_used": exp.skills_used,
        }
        for exp in parsed_resume.experiences
    ]

    return UploadResumeResponse(
        skills=parsed_resume.skills,
        experiences=experiences_dicts,
        qualifications=parsed_resume.qualifications,
        confirmation_required=True,
    )


@router.post(
    "/sessions/{session_id}/mode",
    response_model=StartSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def select_mode(
    session_id: str,
    request: SelectModeRequest,
    container: ServiceContainer = Depends(get_container),
) -> StartSessionResponse:
    """Select the interview mode for a session.

    For open_practice mode, a role must be provided.
    For job_specific mode, the session transitions to AWAITING_JOB_DESCRIPTION.
    """
    # Validate mode value
    try:
        mode = InterviewMode(request.mode)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid mode '{request.mode}'. Must be 'open_practice' or 'job_specific'.",
        )

    # Validate role for open_practice
    if mode == InterviewMode.OPEN_PRACTICE and not request.role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A role must be specified for open practice mode.",
        )

    try:
        session = await container.session_manager.select_mode(
            session_id=session_id,
            mode=mode,
            role=request.role,
        )
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    except InvalidStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except SessionManagerError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    return StartSessionResponse(
        session_id=session.id,
        status=session.status.value,
    )


@router.post(
    "/sessions/{session_id}/job-description",
    status_code=status.HTTP_200_OK,
)
async def upload_job_description(
    session_id: str,
    file: UploadFile = File(...),
    container: ServiceContainer = Depends(get_container),
) -> dict:
    """Upload and parse a job description for job-specific mode.

    Validates the file, parses the JD, generates questions, and
    transitions the session to IN_PROGRESS.
    """
    # Validate the file
    content = await file.read()
    mime_type = file.content_type or ""

    validation = container.file_validator.validate(
        file_content=content,
        mime_type=mime_type,
        allowed_formats=FileValidator.ALLOWED_JD_FORMATS,
    )
    if not validation.is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation.error_message,
        )

    # Parse the job description
    try:
        parsed_jd = await container.jd_parser.parse(
            file_content=content, file_type=mime_type
        )
    except JDParserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # Upload to session manager
    try:
        session = await container.session_manager.upload_job_description(
            session_id, parsed_jd
        )
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    except InvalidStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return {
        "session_id": session.id,
        "status": session.status.value,
        "requirements": parsed_jd.requirements,
        "responsibilities": parsed_jd.responsibilities,
        "qualifications": parsed_jd.qualifications,
        "summary": parsed_jd.summary,
    }


@router.get(
    "/sessions/{session_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_200_OK,
)
async def get_current_question(
    session_id: str,
    container: ServiceContainer = Depends(get_container),
) -> QuestionResponse:
    """Get the current/next question for the session."""
    try:
        question = await container.session_manager.get_current_question(session_id)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    except InvalidStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except SessionManagerError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    return QuestionResponse(
        question_id=question.id,
        question_text=question.text,
        category=question.category,
    )


@router.post(
    "/sessions/{session_id}/answers",
    status_code=status.HTTP_200_OK,
)
async def submit_answer(
    session_id: str,
    request: SubmitAnswerRequest,
    container: ServiceContainer = Depends(get_container),
) -> dict:
    """Submit an answer to the current question (text mode).

    Returns the next action: either the next question or a conclude indicator.
    """
    try:
        next_action = await container.session_manager.submit_response(
            session_id=session_id,
            response_text=request.response_text,
            input_mode=request.input_mode,
        )
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    except InvalidStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except SessionManagerError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    response: dict = {"action": next_action.action.value}
    if next_action.question:
        response["next_question"] = {
            "question_id": next_action.question.id,
            "question_text": next_action.question.text,
            "category": next_action.question.category,
        }

    return response


@router.post(
    "/sessions/{session_id}/conclude",
    response_model=SessionResultsResponse,
    status_code=status.HTTP_200_OK,
)
async def conclude_session(
    session_id: str,
    container: ServiceContainer = Depends(get_container),
) -> SessionResultsResponse:
    """Conclude the session and get evaluation results.

    Triggers evaluation and feedback generation. Returns scores and feedback.
    """
    try:
        results = await container.session_manager.conclude_session(session_id)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )
    except InvalidStateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except SessionManagerError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    return _build_results_response(results)


@router.get(
    "/sessions/{session_id}/results",
    response_model=SessionResultsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_results(
    session_id: str,
    container: ServiceContainer = Depends(get_container),
) -> SessionResultsResponse:
    """Get evaluation results and feedback report for a concluded session."""
    try:
        session = container.session_manager.get_session(session_id)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    if session.status != SessionStatus.CONCLUDED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Session has not been concluded yet. Conclude the session first.",
        )

    # Re-run conclude to get results (idempotent for concluded sessions)
    try:
        results = await container.session_manager.conclude_session(session_id)
    except (InvalidStateError, SessionManagerError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    return _build_results_response(results)


@router.get(
    "/roles",
    status_code=status.HTTP_200_OK,
)
async def get_available_roles() -> dict:
    """Get the list of available professional roles for open practice mode."""
    roles = get_roles()
    return {"roles": roles}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_results_response(results) -> SessionResultsResponse:
    """Convert SessionResults domain object to API response model."""
    readiness_score_dict = None
    if results.readiness_score is not None:
        readiness_score_dict = asdict(results.readiness_score)

    resume_relevancy_dict = None
    if results.resume_relevancy is not None:
        resume_relevancy_dict = asdict(results.resume_relevancy)

    feedback_report_dict = None
    if results.feedback_report is not None:
        feedback_report_dict = asdict(results.feedback_report)

    message = None
    if results.insufficient_responses:
        message = (
            "Insufficient responses to generate a full evaluation. "
            "At least 3 questions must be answered for a readiness score."
        )

    return SessionResultsResponse(
        readiness_score=readiness_score_dict,
        resume_relevancy=resume_relevancy_dict,
        feedback_report=feedback_report_dict,
        message=message,
    )
