"""Unit tests for the REST API routes."""

import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from prep_pilot.api.routes import router, ServiceContainer, set_container
from prep_pilot.models.domain import (
    Experience,
    InterviewMode,
    InterviewQuestion,
    InterviewReadinessScore,
    InterviewSession,
    ParsedJobDescription,
    ParsedResume,
    QuestionResponse as DomainQuestionResponse,
    ResumeRelevancyResult,
    SessionResults,
    SessionStatus,
    ValidationResult,
)
from prep_pilot.services.session_manager import (
    InvalidStateError,
    NextAction,
    NextActionType,
    SessionManagerError,
    SessionNotFoundError,
)
from prep_pilot.services.resume_parser import ResumeParseError
from prep_pilot.services.jd_parser import JDParserError


@pytest.fixture
def app():
    """Create a FastAPI app with the router for testing."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def mock_container():
    """Create a mock service container with all services mocked."""
    container = MagicMock(spec=ServiceContainer)
    container.file_validator = MagicMock()
    container.resume_parser = AsyncMock()
    container.jd_parser = AsyncMock()
    container.session_manager = AsyncMock()
    container.session_manager.get_session = MagicMock()
    set_container(container)
    return container


@pytest.fixture
def client(app, mock_container):
    """Create a test client with mocked services."""
    return TestClient(app)


@pytest.fixture
def sample_session():
    """Create a sample InterviewSession for testing."""
    return InterviewSession(
        id="test-session-123",
        mode=InterviewMode.OPEN_PRACTICE,
        status=SessionStatus.AWAITING_RESUME,
        resume=ParsedResume(skills=[], experiences=[], qualifications=[], raw_text=""),
    )


@pytest.fixture
def sample_resume():
    """Create a sample ParsedResume for testing."""
    return ParsedResume(
        skills=["Python", "FastAPI"],
        experiences=[
            Experience(
                title="Software Engineer",
                company="Acme Corp",
                duration="2 years",
                description="Built APIs",
                skills_used=["Python", "FastAPI"],
            )
        ],
        qualifications=["BS Computer Science"],
        raw_text="Sample resume text",
    )


class TestCreateSession:
    """Tests for POST /sessions endpoint."""

    def test_create_session_success(self, client, mock_container, sample_session):
        mock_container.session_manager.create_session.return_value = sample_session

        response = client.post("/sessions")

        assert response.status_code == 201
        data = response.json()
        assert data["session_id"] == "test-session-123"
        assert data["status"] == "awaiting_resume"


class TestUploadResume:
    """Tests for POST /sessions/{id}/resume endpoint."""

    def test_upload_resume_success(self, client, mock_container, sample_session, sample_resume):
        mock_container.file_validator.validate.return_value = ValidationResult(is_valid=True)
        mock_container.resume_parser.parse.return_value = sample_resume
        sample_session.status = SessionStatus.AWAITING_MODE_SELECTION
        mock_container.session_manager.upload_resume.return_value = sample_session

        file_content = b"fake pdf content"
        response = client.post(
            "/sessions/test-session-123/resume",
            files={"file": ("resume.pdf", io.BytesIO(file_content), "application/pdf")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["skills"] == ["Python", "FastAPI"]
        assert data["qualifications"] == ["BS Computer Science"]
        assert data["confirmation_required"] is True
        assert len(data["experiences"]) == 1

    def test_upload_resume_invalid_format(self, client, mock_container):
        mock_container.file_validator.validate.return_value = ValidationResult(
            is_valid=False,
            error_message="Unsupported file format 'text/plain'.",
        )

        response = client.post(
            "/sessions/test-session-123/resume",
            files={"file": ("resume.txt", io.BytesIO(b"text"), "text/plain")},
        )

        assert response.status_code == 400
        assert "Unsupported file format" in response.json()["detail"]

    def test_upload_resume_parse_error(self, client, mock_container):
        mock_container.file_validator.validate.return_value = ValidationResult(is_valid=True)
        mock_container.resume_parser.parse.side_effect = ResumeParseError(
            "Unable to parse the document."
        )

        response = client.post(
            "/sessions/test-session-123/resume",
            files={"file": ("resume.pdf", io.BytesIO(b"bad"), "application/pdf")},
        )

        assert response.status_code == 400
        assert "Unable to parse" in response.json()["detail"]

    def test_upload_resume_session_not_found(self, client, mock_container):
        mock_container.file_validator.validate.return_value = ValidationResult(is_valid=True)
        mock_container.resume_parser.parse.return_value = ParsedResume(
            skills=[], experiences=[], qualifications=[], raw_text=""
        )
        mock_container.session_manager.upload_resume.side_effect = SessionNotFoundError(
            "Session not found"
        )

        response = client.post(
            "/sessions/nonexistent/resume",
            files={"file": ("resume.pdf", io.BytesIO(b"data"), "application/pdf")},
        )

        assert response.status_code == 404

    def test_upload_resume_invalid_state(self, client, mock_container):
        mock_container.file_validator.validate.return_value = ValidationResult(is_valid=True)
        mock_container.resume_parser.parse.return_value = ParsedResume(
            skills=[], experiences=[], qualifications=[], raw_text=""
        )
        mock_container.session_manager.upload_resume.side_effect = InvalidStateError(
            "Session is not in AWAITING_RESUME state."
        )

        response = client.post(
            "/sessions/test-session-123/resume",
            files={"file": ("resume.pdf", io.BytesIO(b"data"), "application/pdf")},
        )

        assert response.status_code == 422


class TestSelectMode:
    """Tests for POST /sessions/{id}/mode endpoint."""

    def test_select_open_practice_mode(self, client, mock_container, sample_session):
        sample_session.status = SessionStatus.IN_PROGRESS
        mock_container.session_manager.select_mode.return_value = sample_session

        response = client.post(
            "/sessions/test-session-123/mode",
            json={"mode": "open_practice", "role": "Software Engineer"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == "test-session-123"
        assert data["status"] == "in_progress"

    def test_select_job_specific_mode(self, client, mock_container, sample_session):
        sample_session.status = SessionStatus.AWAITING_JOB_DESCRIPTION
        mock_container.session_manager.select_mode.return_value = sample_session

        response = client.post(
            "/sessions/test-session-123/mode",
            json={"mode": "job_specific"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "awaiting_job_description"

    def test_select_invalid_mode(self, client, mock_container):
        response = client.post(
            "/sessions/test-session-123/mode",
            json={"mode": "invalid_mode"},
        )

        assert response.status_code == 400
        assert "Invalid mode" in response.json()["detail"]

    def test_select_open_practice_without_role(self, client, mock_container):
        response = client.post(
            "/sessions/test-session-123/mode",
            json={"mode": "open_practice"},
        )

        assert response.status_code == 400
        assert "role must be specified" in response.json()["detail"]

    def test_select_mode_session_not_found(self, client, mock_container):
        mock_container.session_manager.select_mode.side_effect = SessionNotFoundError(
            "Session not found"
        )

        response = client.post(
            "/sessions/nonexistent/mode",
            json={"mode": "job_specific"},
        )

        assert response.status_code == 404


class TestUploadJobDescription:
    """Tests for POST /sessions/{id}/job-description endpoint."""

    def test_upload_jd_success(self, client, mock_container, sample_session):
        mock_container.file_validator.validate.return_value = ValidationResult(is_valid=True)
        parsed_jd = ParsedJobDescription(
            requirements=["Python 3+"],
            responsibilities=["Build APIs"],
            qualifications=["BS degree"],
            summary="Backend engineer role",
        )
        mock_container.jd_parser.parse.return_value = parsed_jd
        sample_session.status = SessionStatus.IN_PROGRESS
        mock_container.session_manager.upload_job_description.return_value = sample_session

        response = client.post(
            "/sessions/test-session-123/job-description",
            files={"file": ("jd.pdf", io.BytesIO(b"jd content"), "application/pdf")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["requirements"] == ["Python 3+"]
        assert data["summary"] == "Backend engineer role"

    def test_upload_jd_invalid_format(self, client, mock_container):
        mock_container.file_validator.validate.return_value = ValidationResult(
            is_valid=False,
            error_message="Unsupported file format.",
        )

        response = client.post(
            "/sessions/test-session-123/job-description",
            files={"file": ("jd.exe", io.BytesIO(b"bad"), "application/octet-stream")},
        )

        assert response.status_code == 400

    def test_upload_jd_parse_error(self, client, mock_container):
        mock_container.file_validator.validate.return_value = ValidationResult(is_valid=True)
        mock_container.jd_parser.parse.side_effect = JDParserError("Parse failed")

        response = client.post(
            "/sessions/test-session-123/job-description",
            files={"file": ("jd.pdf", io.BytesIO(b"bad"), "application/pdf")},
        )

        assert response.status_code == 400


class TestGetCurrentQuestion:
    """Tests for GET /sessions/{id}/questions endpoint."""

    def test_get_question_success(self, client, mock_container):
        question = InterviewQuestion(
            id="q1",
            text="Tell me about your Python experience.",
            category="technical",
            references_resume_item="Python",
        )
        mock_container.session_manager.get_current_question.return_value = question

        response = client.get("/sessions/test-session-123/questions")

        assert response.status_code == 200
        data = response.json()
        assert data["question_id"] == "q1"
        assert data["question_text"] == "Tell me about your Python experience."
        assert data["category"] == "technical"

    def test_get_question_session_not_found(self, client, mock_container):
        mock_container.session_manager.get_current_question.side_effect = (
            SessionNotFoundError("Session not found")
        )

        response = client.get("/sessions/nonexistent/questions")

        assert response.status_code == 404

    def test_get_question_invalid_state(self, client, mock_container):
        mock_container.session_manager.get_current_question.side_effect = (
            InvalidStateError("Session is not IN_PROGRESS.")
        )

        response = client.get("/sessions/test-session-123/questions")

        assert response.status_code == 422


class TestSubmitAnswer:
    """Tests for POST /sessions/{id}/answers endpoint."""

    def test_submit_answer_next_question(self, client, mock_container):
        next_question = InterviewQuestion(
            id="q2", text="Next question?", category="behavioral"
        )
        mock_container.session_manager.submit_response.return_value = NextAction(
            action=NextActionType.NEXT_QUESTION, question=next_question
        )

        response = client.post(
            "/sessions/test-session-123/answers",
            json={"response_text": "My answer is...", "input_mode": "text"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["action"] == "next_question"
        assert data["next_question"]["question_id"] == "q2"

    def test_submit_answer_conclude(self, client, mock_container):
        mock_container.session_manager.submit_response.return_value = NextAction(
            action=NextActionType.CONCLUDE
        )

        response = client.post(
            "/sessions/test-session-123/answers",
            json={"response_text": "Final answer"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["action"] == "conclude"

    def test_submit_answer_session_not_found(self, client, mock_container):
        mock_container.session_manager.submit_response.side_effect = (
            SessionNotFoundError("Session not found")
        )

        response = client.post(
            "/sessions/nonexistent/answers",
            json={"response_text": "answer"},
        )

        assert response.status_code == 404


class TestConcludeSession:
    """Tests for POST /sessions/{id}/conclude endpoint."""

    def test_conclude_session_success(self, client, mock_container):
        results = SessionResults(
            readiness_score=InterviewReadinessScore(
                clarity_of_communication=7,
                technical_accuracy=8,
                star_method_adherence=6,
                overall_response_relevancy=7,
            ),
            resume_relevancy=None,
            feedback_report=None,
            insufficient_responses=False,
        )
        mock_container.session_manager.conclude_session.return_value = results

        response = client.post("/sessions/test-session-123/conclude")

        assert response.status_code == 200
        data = response.json()
        assert data["readiness_score"]["clarity_of_communication"] == 7
        assert data["message"] is None

    def test_conclude_session_insufficient_responses(self, client, mock_container):
        results = SessionResults(
            readiness_score=None,
            resume_relevancy=None,
            feedback_report=None,
            insufficient_responses=True,
        )
        mock_container.session_manager.conclude_session.return_value = results

        response = client.post("/sessions/test-session-123/conclude")

        assert response.status_code == 200
        data = response.json()
        assert data["readiness_score"] is None
        assert "Insufficient responses" in data["message"]

    def test_conclude_session_not_found(self, client, mock_container):
        mock_container.session_manager.conclude_session.side_effect = (
            SessionNotFoundError("Session not found")
        )

        response = client.post("/sessions/nonexistent/conclude")

        assert response.status_code == 404


class TestGetResults:
    """Tests for GET /sessions/{id}/results endpoint."""

    def test_get_results_success(self, client, mock_container):
        session = InterviewSession(
            id="test-session-123",
            mode=InterviewMode.OPEN_PRACTICE,
            status=SessionStatus.CONCLUDED,
            resume=ParsedResume(skills=[], experiences=[], qualifications=[], raw_text=""),
        )
        mock_container.session_manager.get_session.return_value = session

        results = SessionResults(
            readiness_score=InterviewReadinessScore(
                clarity_of_communication=8,
                technical_accuracy=9,
                star_method_adherence=7,
                overall_response_relevancy=8,
            ),
            resume_relevancy=None,
            feedback_report=None,
            insufficient_responses=False,
        )
        mock_container.session_manager.conclude_session.return_value = results

        response = client.get("/sessions/test-session-123/results")

        assert response.status_code == 200
        data = response.json()
        assert data["readiness_score"]["technical_accuracy"] == 9

    def test_get_results_not_concluded(self, client, mock_container):
        session = InterviewSession(
            id="test-session-123",
            mode=InterviewMode.OPEN_PRACTICE,
            status=SessionStatus.IN_PROGRESS,
            resume=ParsedResume(skills=[], experiences=[], qualifications=[], raw_text=""),
        )
        mock_container.session_manager.get_session.return_value = session

        response = client.get("/sessions/test-session-123/results")

        assert response.status_code == 422
        assert "not been concluded" in response.json()["detail"]

    def test_get_results_session_not_found(self, client, mock_container):
        mock_container.session_manager.get_session.side_effect = SessionNotFoundError(
            "Session not found"
        )

        response = client.get("/sessions/nonexistent/results")

        assert response.status_code == 404


class TestGetRoles:
    """Tests for GET /roles endpoint."""

    def test_get_roles_success(self, client, mock_container):
        response = client.get("/roles")

        assert response.status_code == 200
        data = response.json()
        assert "roles" in data
        assert len(data["roles"]) >= 5
        assert "Software Engineer" in data["roles"]
