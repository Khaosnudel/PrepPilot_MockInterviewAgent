"""Unit tests for the SessionManager service."""

import pytest
import pytest_asyncio

from prep_pilot.models.domain import (
    InterviewMode,
    InterviewQuestion,
    InterviewSession,
    ParsedJobDescription,
    ParsedResume,
    SessionStatus,
)
from prep_pilot.services.session_manager import (
    InvalidStateError,
    NextAction,
    NextActionType,
    SessionManager,
    SessionManagerError,
    SessionNotFoundError,
)


# --- Fixtures ---


def _make_resume() -> ParsedResume:
    """Create a sample parsed resume for testing."""
    return ParsedResume(
        skills=["Python", "FastAPI", "Machine Learning"],
        experiences=[],
        qualifications=["BSc Computer Science"],
        raw_text="Sample resume text",
    )


def _make_jd() -> ParsedJobDescription:
    """Create a sample parsed job description for testing."""
    return ParsedJobDescription(
        requirements=["Python 3.10+", "REST API design"],
        responsibilities=["Build microservices", "Code reviews"],
        qualifications=["3+ years experience"],
        summary="Senior Python Developer",
    )


def _make_questions(count: int = 3) -> list[InterviewQuestion]:
    """Create sample interview questions."""
    return [
        InterviewQuestion(
            id=f"q{i+1}",
            text=f"Tell me about your experience with topic {i+1}.",
            category="behavioral",
            references_resume_item="Python",
        )
        for i in range(count)
    ]


class FakeQuestionGenerator:
    """Fake question generator for testing."""

    def __init__(self, questions: list[InterviewQuestion] | None = None):
        self._questions = questions or _make_questions(5)

    async def generate_open_practice(
        self, role: str, resume: ParsedResume, count: int
    ) -> list[InterviewQuestion]:
        return self._questions[:count]

    async def generate_job_specific(
        self, resume: ParsedResume, job_description: ParsedJobDescription
    ) -> list[InterviewQuestion]:
        return self._questions


# --- Tests ---


class TestCreateSession:
    """Tests for session creation."""

    @pytest.mark.asyncio
    async def test_create_session_returns_session(self):
        manager = SessionManager()
        session = await manager.create_session()

        assert isinstance(session, InterviewSession)
        assert session.status == SessionStatus.AWAITING_RESUME
        assert session.id is not None
        assert len(session.id) > 0

    @pytest.mark.asyncio
    async def test_create_session_generates_unique_ids(self):
        manager = SessionManager()
        session1 = await manager.create_session()
        session2 = await manager.create_session()

        assert session1.id != session2.id

    @pytest.mark.asyncio
    async def test_create_session_stored_in_manager(self):
        manager = SessionManager()
        session = await manager.create_session()

        retrieved = manager.get_session(session.id)
        assert retrieved is session


class TestUploadResume:
    """Tests for resume upload."""

    @pytest.mark.asyncio
    async def test_upload_resume_transitions_to_awaiting_mode(self):
        manager = SessionManager()
        session = await manager.create_session()
        resume = _make_resume()

        updated = await manager.upload_resume(session.id, resume)

        assert updated.status == SessionStatus.AWAITING_MODE_SELECTION
        assert updated.resume == resume

    @pytest.mark.asyncio
    async def test_upload_resume_invalid_state(self):
        manager = SessionManager()
        session = await manager.create_session()
        resume = _make_resume()

        # Upload once to move to AWAITING_MODE_SELECTION
        await manager.upload_resume(session.id, resume)

        # Try uploading again - should fail
        with pytest.raises(InvalidStateError):
            await manager.upload_resume(session.id, resume)

    @pytest.mark.asyncio
    async def test_upload_resume_session_not_found(self):
        manager = SessionManager()

        with pytest.raises(SessionNotFoundError):
            await manager.upload_resume("nonexistent-id", _make_resume())


class TestSelectMode:
    """Tests for mode selection."""

    @pytest.mark.asyncio
    async def test_select_open_practice_transitions_to_in_progress(self):
        questions = _make_questions(5)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())

        updated = await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        assert updated.status == SessionStatus.IN_PROGRESS
        assert updated.mode == InterviewMode.OPEN_PRACTICE
        assert updated.selected_role == "Software Engineer"
        assert len(updated.questions) > 0

    @pytest.mark.asyncio
    async def test_select_open_practice_without_role_raises(self):
        manager = SessionManager()
        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())

        with pytest.raises(SessionManagerError, match="role must be specified"):
            await manager.select_mode(session.id, InterviewMode.OPEN_PRACTICE)

    @pytest.mark.asyncio
    async def test_select_job_specific_transitions_to_awaiting_jd(self):
        manager = SessionManager()
        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())

        updated = await manager.select_mode(
            session.id, InterviewMode.JOB_SPECIFIC
        )

        assert updated.status == SessionStatus.AWAITING_JOB_DESCRIPTION
        assert updated.mode == InterviewMode.JOB_SPECIFIC

    @pytest.mark.asyncio
    async def test_select_mode_invalid_state(self):
        manager = SessionManager()
        session = await manager.create_session()

        # Session is in AWAITING_RESUME, not AWAITING_MODE_SELECTION
        with pytest.raises(InvalidStateError):
            await manager.select_mode(
                session.id, InterviewMode.OPEN_PRACTICE, role="Engineer"
            )


class TestUploadJobDescription:
    """Tests for job description upload."""

    @pytest.mark.asyncio
    async def test_upload_jd_transitions_to_in_progress(self):
        questions = _make_questions(5)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(session.id, InterviewMode.JOB_SPECIFIC)

        jd = _make_jd()
        updated = await manager.upload_job_description(session.id, jd)

        assert updated.status == SessionStatus.IN_PROGRESS
        assert updated.job_description == jd
        assert len(updated.questions) > 0

    @pytest.mark.asyncio
    async def test_upload_jd_invalid_state(self):
        manager = SessionManager()
        session = await manager.create_session()

        # Session is in AWAITING_RESUME, not AWAITING_JOB_DESCRIPTION
        with pytest.raises(InvalidStateError):
            await manager.upload_job_description(session.id, _make_jd())


class TestGetCurrentQuestion:
    """Tests for getting the current question."""

    @pytest.mark.asyncio
    async def test_get_current_question_returns_first(self):
        questions = _make_questions(3)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        question = await manager.get_current_question(session.id)
        assert question.id == "q1"

    @pytest.mark.asyncio
    async def test_get_current_question_invalid_state(self):
        manager = SessionManager()
        session = await manager.create_session()

        with pytest.raises(InvalidStateError):
            await manager.get_current_question(session.id)


class TestSubmitResponse:
    """Tests for response submission."""

    @pytest.mark.asyncio
    async def test_submit_response_advances_index(self):
        questions = _make_questions(3)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        result = await manager.submit_response(session.id, "My answer to q1")

        assert result.action == NextActionType.NEXT_QUESTION
        assert result.question is not None
        assert result.question.id == "q2"
        assert session.current_question_index == 1

    @pytest.mark.asyncio
    async def test_submit_response_records_response(self):
        questions = _make_questions(3)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        await manager.submit_response(session.id, "My answer", "voice")

        assert len(session.responses) == 1
        assert session.responses[0].response_text == "My answer"
        assert session.responses[0].input_mode == "voice"
        assert session.responses[0].question.id == "q1"

    @pytest.mark.asyncio
    async def test_submit_all_responses_concludes_session(self):
        questions = _make_questions(3)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        # Answer all 3 questions
        await manager.submit_response(session.id, "Answer 1")
        await manager.submit_response(session.id, "Answer 2")
        result = await manager.submit_response(session.id, "Answer 3")

        assert result.action == NextActionType.CONCLUDE
        assert result.question is None
        assert session.status == SessionStatus.CONCLUDED

    @pytest.mark.asyncio
    async def test_submit_response_invalid_state(self):
        manager = SessionManager()
        session = await manager.create_session()

        with pytest.raises(InvalidStateError):
            await manager.submit_response(session.id, "Some answer")

    @pytest.mark.asyncio
    async def test_submit_response_after_concluded_raises(self):
        questions = _make_questions(1)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        # Answer the only question to conclude
        await manager.submit_response(session.id, "Answer 1")
        assert session.status == SessionStatus.CONCLUDED

        # Try to submit another response
        with pytest.raises(InvalidStateError):
            await manager.submit_response(session.id, "Another answer")


class TestConcludeSession:
    """Tests for session conclusion."""

    @pytest.mark.asyncio
    async def test_conclude_with_zero_responses(self):
        questions = _make_questions(3)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        # Manually set to CONCLUDED with 0 responses (simulating early end)
        session.status = SessionStatus.CONCLUDED

        results = await manager.conclude_session(session.id)

        assert results.insufficient_responses is True
        assert results.readiness_score is None
        assert results.resume_relevancy is None
        assert results.feedback_report is None

    @pytest.mark.asyncio
    async def test_conclude_with_insufficient_responses(self):
        questions = _make_questions(3)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        # Submit only 2 responses (< 3 minimum for scoring)
        await manager.submit_response(session.id, "Answer 1")
        await manager.submit_response(session.id, "Answer 2")

        # Manually conclude (normally would need all questions answered)
        session.status = SessionStatus.CONCLUDED

        results = await manager.conclude_session(session.id)

        assert results.insufficient_responses is True
        assert results.readiness_score is None
        assert results.resume_relevancy is None

    @pytest.mark.asyncio
    async def test_conclude_with_sufficient_responses_no_engines(self):
        questions = _make_questions(3)
        generator = FakeQuestionGenerator(questions)
        manager = SessionManager(question_generator=generator)

        session = await manager.create_session()
        await manager.upload_resume(session.id, _make_resume())
        await manager.select_mode(
            session.id, InterviewMode.OPEN_PRACTICE, role="Software Engineer"
        )

        # Submit all 3 responses
        await manager.submit_response(session.id, "Answer 1")
        await manager.submit_response(session.id, "Answer 2")
        await manager.submit_response(session.id, "Answer 3")

        results = await manager.conclude_session(session.id)

        # No evaluation/feedback engines, so results are None but not insufficient
        assert results.insufficient_responses is False
        assert results.readiness_score is None
        assert results.resume_relevancy is None
        assert results.feedback_report is None

    @pytest.mark.asyncio
    async def test_conclude_invalid_state(self):
        manager = SessionManager()
        session = await manager.create_session()

        # Session is in AWAITING_RESUME, not CONCLUDED
        with pytest.raises(InvalidStateError):
            await manager.conclude_session(session.id)


class TestSessionNotFound:
    """Tests for session not found errors."""

    @pytest.mark.asyncio
    async def test_get_session_not_found(self):
        manager = SessionManager()

        with pytest.raises(SessionNotFoundError):
            manager.get_session("nonexistent-id")

    @pytest.mark.asyncio
    async def test_submit_response_session_not_found(self):
        manager = SessionManager()

        with pytest.raises(SessionNotFoundError):
            await manager.submit_response("nonexistent-id", "answer")

    @pytest.mark.asyncio
    async def test_conclude_session_not_found(self):
        manager = SessionManager()

        with pytest.raises(SessionNotFoundError):
            await manager.conclude_session("nonexistent-id")
