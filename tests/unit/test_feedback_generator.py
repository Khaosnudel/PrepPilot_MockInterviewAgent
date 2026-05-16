"""Unit tests for the FeedbackGenerator service."""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from prep_pilot.models.domain import (
    Experience,
    FeedbackReport,
    InterviewMode,
    InterviewQuestion,
    InterviewSession,
    ParsedResume,
    QuestionResponse,
    SessionStatus,
)
from prep_pilot.services.feedback_generator import (
    EVALUATION_DIMENSIONS,
    FEEDBACK_GENERATION_TIMEOUT,
    FeedbackGenerationError,
    FeedbackGenerator,
    FeedbackReportResponse,
    ImprovedAnswerResponse,
    ImprovementSuggestionResponse,
    ScoreReasoningResponse,
)
from prep_pilot.services.llm_client import LLMClientError
from prep_pilot.services.prompt_manager import PromptManager


def _make_session(num_responses: int = 3) -> InterviewSession:
    """Create a test session with the given number of responses."""
    resume = ParsedResume(
        skills=["Python", "FastAPI", "Machine Learning"],
        experiences=[
            Experience(
                title="Software Engineer",
                company="Acme Corp",
                duration="2 years",
                description="Built web services",
                skills_used=["Python", "FastAPI"],
            )
        ],
        qualifications=["BSc Computer Science"],
        raw_text="Sample resume text",
    )

    questions = [
        InterviewQuestion(
            id=f"q{i+1}",
            text=f"Question {i+1} text",
            category="behavioral",
            references_resume_item="Python",
        )
        for i in range(num_responses)
    ]

    responses = [
        QuestionResponse(
            question=questions[i],
            response_text=f"Response {i+1} text",
            response_timestamp=datetime.now(),
            input_mode="text",
        )
        for i in range(num_responses)
    ]

    return InterviewSession(
        id="test-session-1",
        mode=InterviewMode.OPEN_PRACTICE,
        status=SessionStatus.CONCLUDED,
        resume=resume,
        selected_role="Software Engineer",
        questions=questions,
        responses=responses,
        current_question_index=num_responses,
    )


def _make_valid_llm_response(num_responses: int = 3) -> FeedbackReportResponse:
    """Create a valid LLM response matching the session."""
    return FeedbackReportResponse(
        improved_answers=[
            ImprovedAnswerResponse(
                question_id=f"q{i+1}",
                original_response=f"Response {i+1} text",
                improved_response=f"Improved response {i+1}",
            )
            for i in range(num_responses)
        ],
        follow_up_questions=[
            "Follow-up question 1?",
            "Follow-up question 2?",
            "Follow-up question 3?",
        ],
        score_reasoning=[
            ScoreReasoningResponse(
                dimension=dim,
                score=7,
                reasoning=f"Reasoning for {dim}",
                referenced_responses=[f"Response 1 text"],
            )
            for dim in EVALUATION_DIMENSIONS
        ],
        improvement_suggestions=[
            ImprovementSuggestionResponse(
                dimension=dim,
                suggestion=f"Suggestion for {dim}",
                referenced_response="Response 1 text",
            )
            for dim in EVALUATION_DIMENSIONS
        ],
    )


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    client = MagicMock()
    client.generate_structured = AsyncMock()
    return client


@pytest.fixture
def prompt_manager():
    """Create a real PromptManager instance."""
    return PromptManager()


@pytest.fixture
def feedback_generator(mock_llm_client, prompt_manager):
    """Create a FeedbackGenerator with mocked dependencies."""
    return FeedbackGenerator(
        llm_client=mock_llm_client,
        prompt_manager=prompt_manager,
    )


@pytest.mark.asyncio
async def test_generate_success(feedback_generator, mock_llm_client):
    """Test successful feedback generation with valid session data."""
    session = _make_session(num_responses=3)
    mock_llm_client.generate_structured.return_value = _make_valid_llm_response(3)

    report = await feedback_generator.generate(session)

    assert isinstance(report, FeedbackReport)
    assert len(report.improved_answers) == 3
    assert len(report.follow_up_questions) == 3
    assert len(report.score_reasoning) == 4
    assert len(report.improvement_suggestions) == 4


@pytest.mark.asyncio
async def test_generate_calls_llm_with_correct_schema(
    feedback_generator, mock_llm_client
):
    """Test that generate calls LLM with FeedbackReportResponse schema."""
    session = _make_session(num_responses=2)
    mock_llm_client.generate_structured.return_value = _make_valid_llm_response(2)

    await feedback_generator.generate(session)

    mock_llm_client.generate_structured.assert_called_once()
    call_kwargs = mock_llm_client.generate_structured.call_args.kwargs
    assert call_kwargs["schema"] is FeedbackReportResponse
    assert "prompt" in call_kwargs
    assert "system_prompt" in call_kwargs


@pytest.mark.asyncio
async def test_generate_no_responses_raises_error(feedback_generator):
    """Test that generating feedback with no responses raises an error."""
    session = _make_session(num_responses=0)
    session.responses = []

    with pytest.raises(FeedbackGenerationError, match="no responses"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_llm_error_raises_feedback_error(
    feedback_generator, mock_llm_client
):
    """Test that LLM errors are wrapped in FeedbackGenerationError."""
    session = _make_session(num_responses=3)
    mock_llm_client.generate_structured.side_effect = LLMClientError("LLM failed")

    with pytest.raises(FeedbackGenerationError, match="Failed to generate"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_timeout_raises_feedback_error(
    feedback_generator, mock_llm_client, monkeypatch
):
    """Test that timeout is enforced and raises FeedbackGenerationError."""
    import prep_pilot.services.feedback_generator as fb_module

    # Patch the timeout to a very short value for testing
    monkeypatch.setattr(fb_module, "FEEDBACK_GENERATION_TIMEOUT", 0.1)

    session = _make_session(num_responses=3)

    async def slow_response(*args, **kwargs):
        await asyncio.sleep(1.0)
        return _make_valid_llm_response(3)

    mock_llm_client.generate_structured.side_effect = slow_response

    with pytest.raises(FeedbackGenerationError, match="timed out"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_validates_improved_answers_count(
    feedback_generator, mock_llm_client
):
    """Test validation fails when improved answers count doesn't match responses."""
    session = _make_session(num_responses=3)
    # Return only 2 improved answers for 3 responses
    response = _make_valid_llm_response(3)
    response.improved_answers = response.improved_answers[:2]
    mock_llm_client.generate_structured.return_value = response

    with pytest.raises(FeedbackGenerationError, match="improved answers"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_validates_follow_up_questions_count(
    feedback_generator, mock_llm_client
):
    """Test validation fails when follow-up questions are outside 2-5 range."""
    session = _make_session(num_responses=3)
    response = _make_valid_llm_response(3)
    response.follow_up_questions = ["Only one?"]
    mock_llm_client.generate_structured.return_value = response

    with pytest.raises(FeedbackGenerationError, match="follow-up questions"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_validates_score_reasoning_count(
    feedback_generator, mock_llm_client
):
    """Test validation fails when score reasoning entries != 4."""
    session = _make_session(num_responses=3)
    response = _make_valid_llm_response(3)
    response.score_reasoning = response.score_reasoning[:2]
    mock_llm_client.generate_structured.return_value = response

    with pytest.raises(FeedbackGenerationError, match="score reasoning"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_validates_improvement_suggestions_minimum(
    feedback_generator, mock_llm_client
):
    """Test validation fails when fewer than 4 improvement suggestions."""
    session = _make_session(num_responses=3)
    response = _make_valid_llm_response(3)
    response.improvement_suggestions = response.improvement_suggestions[:2]
    mock_llm_client.generate_structured.return_value = response

    with pytest.raises(FeedbackGenerationError, match="improvement suggestions"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_validates_suggestions_cover_all_dimensions(
    feedback_generator, mock_llm_client
):
    """Test validation fails when not all dimensions have suggestions."""
    session = _make_session(num_responses=3)
    response = _make_valid_llm_response(3)
    # All suggestions for same dimension
    response.improvement_suggestions = [
        ImprovementSuggestionResponse(
            dimension="clarity_of_communication",
            suggestion=f"Suggestion {i}",
            referenced_response="Response 1 text",
        )
        for i in range(4)
    ]
    mock_llm_client.generate_structured.return_value = response

    with pytest.raises(FeedbackGenerationError, match="Missing improvement suggestions"):
        await feedback_generator.generate(session)


@pytest.mark.asyncio
async def test_generate_clamps_scores_to_valid_range(
    feedback_generator, mock_llm_client
):
    """Test that scores are clamped to [1, 10] range."""
    session = _make_session(num_responses=3)
    response = _make_valid_llm_response(3)
    # Set out-of-range scores
    response.score_reasoning[0].score = 15
    response.score_reasoning[1].score = 0
    mock_llm_client.generate_structured.return_value = response

    report = await feedback_generator.generate(session)

    assert report.score_reasoning[0].score == 10
    assert report.score_reasoning[1].score == 1


@pytest.mark.asyncio
async def test_generate_single_response_session(
    feedback_generator, mock_llm_client
):
    """Test feedback generation works with a single response."""
    session = _make_session(num_responses=1)
    mock_llm_client.generate_structured.return_value = _make_valid_llm_response(1)

    report = await feedback_generator.generate(session)

    assert len(report.improved_answers) == 1
    assert len(report.score_reasoning) == 4
    assert len(report.improvement_suggestions) >= 4
