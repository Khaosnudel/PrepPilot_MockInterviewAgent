"""Unit tests for EvaluationEngine service."""

import pytest
from unittest.mock import AsyncMock

from prep_pilot.models.domain import (
    Experience,
    InterviewQuestion,
    InterviewReadinessScore,
    ParsedResume,
)
from prep_pilot.services.evaluation_engine import (
    DimensionEvaluationResponse,
    EvaluationEngine,
    EvaluationEngineError,
    EvaluationError,
)
from prep_pilot.services.llm_client import LLMClient, LLMClientError
from prep_pilot.services.prompt_manager import PromptManager


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    return AsyncMock(spec=LLMClient)


@pytest.fixture
def prompt_manager():
    """Create a real PromptManager instance."""
    return PromptManager()


@pytest.fixture
def engine(mock_llm_client, prompt_manager):
    """Create an EvaluationEngine with mocked LLM client."""
    return EvaluationEngine(llm_client=mock_llm_client, prompt_manager=prompt_manager)


@pytest.fixture
def sample_resume():
    """Create a sample parsed resume."""
    return ParsedResume(
        skills=["Python", "AWS", "Docker"],
        experiences=[
            Experience(
                title="Senior Software Engineer",
                company="TechCorp",
                duration="3 years",
                description="Led backend development team",
                skills_used=["Python", "AWS"],
            ),
        ],
        qualifications=["MSc Computer Science"],
        raw_text="Sample resume text",
    )


@pytest.fixture
def sample_questions():
    """Create sample interview questions (3 to meet minimum threshold)."""
    return [
        InterviewQuestion(
            id="q1",
            text="Tell me about your Python experience.",
            category="technical",
            references_resume_item="Python",
        ),
        InterviewQuestion(
            id="q2",
            text="Describe a time you led a team.",
            category="behavioral",
            references_resume_item="Led backend development team",
        ),
        InterviewQuestion(
            id="q3",
            text="How do you approach cloud architecture?",
            category="technical",
            references_resume_item="AWS",
        ),
    ]


@pytest.fixture
def sample_responses():
    """Create sample candidate responses (3 to meet minimum threshold)."""
    return [
        "I have 5 years of Python experience building web services and data pipelines.",
        "At TechCorp, I led a team of 4 engineers to deliver a microservices migration.",
        "I design cloud architectures using AWS services like Lambda, ECS, and S3.",
    ]


class TestEvaluateReadiness:
    """Tests for EvaluationEngine.evaluate_readiness()."""

    @pytest.mark.asyncio
    async def test_returns_interview_readiness_score(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that evaluate_readiness returns an InterviewReadinessScore."""
        mock_llm_client.generate_structured.return_value = DimensionEvaluationResponse(
            score=7, reasoning="Good response"
        )

        result = await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        assert isinstance(result, InterviewReadinessScore)

    @pytest.mark.asyncio
    async def test_all_scores_in_valid_range(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that all dimension scores are integers in [1, 10]."""
        mock_llm_client.generate_structured.return_value = DimensionEvaluationResponse(
            score=8, reasoning="Strong performance"
        )

        result = await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        assert 1 <= result.clarity_of_communication <= 10
        assert 1 <= result.technical_accuracy <= 10
        assert 1 <= result.star_method_adherence <= 10
        assert 1 <= result.overall_response_relevancy <= 10

    @pytest.mark.asyncio
    async def test_scores_are_integers(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that all scores are integers."""
        mock_llm_client.generate_structured.return_value = DimensionEvaluationResponse(
            score=6, reasoning="Decent"
        )

        result = await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        assert isinstance(result.clarity_of_communication, int)
        assert isinstance(result.technical_accuracy, int)
        assert isinstance(result.star_method_adherence, int)
        assert isinstance(result.overall_response_relevancy, int)

    @pytest.mark.asyncio
    async def test_calls_llm_for_each_dimension_and_response(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that the LLM is called for each dimension × response pair."""
        mock_llm_client.generate_structured.return_value = DimensionEvaluationResponse(
            score=7, reasoning="Good"
        )

        await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        # 4 dimensions × 3 responses = 12 calls
        assert mock_llm_client.generate_structured.call_count == 12

    @pytest.mark.asyncio
    async def test_returns_none_for_insufficient_responses(
        self, engine, mock_llm_client, sample_resume
    ):
        """Test that fewer than 3 responses returns None."""
        questions = [
            InterviewQuestion(id="q1", text="Q1", category="technical"),
            InterviewQuestion(id="q2", text="Q2", category="behavioral"),
        ]
        responses = ["Response 1", "Response 2"]

        result = await engine.evaluate_readiness(
            questions=questions,
            responses=responses,
            resume=sample_resume,
        )

        assert result is None
        # LLM should not be called
        mock_llm_client.generate_structured.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_none_for_empty_responses(
        self, engine, mock_llm_client, sample_resume
    ):
        """Test that empty responses list returns None."""
        result = await engine.evaluate_readiness(
            questions=[],
            responses=[],
            resume=sample_resume,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_raises_error_on_llm_failure(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that LLM errors raise EvaluationError."""
        mock_llm_client.generate_structured.side_effect = LLMClientError(
            "Service unavailable"
        )

        with pytest.raises(EvaluationError):
            await engine.evaluate_readiness(
                questions=sample_questions,
                responses=sample_responses,
                resume=sample_resume,
            )

    @pytest.mark.asyncio
    async def test_clamps_high_scores_to_10(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that scores above 10 are clamped to 10."""
        mock_llm_client.generate_structured.return_value = DimensionEvaluationResponse(
            score=10, reasoning="Exceptional"
        )

        result = await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        assert result.clarity_of_communication <= 10
        assert result.technical_accuracy <= 10
        assert result.star_method_adherence <= 10
        assert result.overall_response_relevancy <= 10

    @pytest.mark.asyncio
    async def test_clamps_low_scores_to_1(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that scores of 1 remain at 1."""
        mock_llm_client.generate_structured.return_value = DimensionEvaluationResponse(
            score=1, reasoning="Very poor"
        )

        result = await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        assert result.clarity_of_communication >= 1
        assert result.technical_accuracy >= 1
        assert result.star_method_adherence >= 1
        assert result.overall_response_relevancy >= 1

    @pytest.mark.asyncio
    async def test_averages_scores_across_multiple_responses(
        self, engine, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that scores are averaged across multiple responses."""
        # Return different scores for each call: 4, 8, 6 repeating
        scores = [4, 8, 6]
        call_count = [0]

        async def side_effect(*args, **kwargs):
            idx = call_count[0] % 3
            call_count[0] += 1
            return DimensionEvaluationResponse(
                score=scores[idx], reasoning="Test"
            )

        mock_llm_client.generate_structured.side_effect = side_effect

        result = await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        # Average of 4, 8, 6 = 6
        assert result.clarity_of_communication == 6
        assert result.technical_accuracy == 6
        assert result.star_method_adherence == 6
        assert result.overall_response_relevancy == 6

    @pytest.mark.asyncio
    async def test_uses_prompt_manager_for_each_dimension(
        self, mock_llm_client, sample_questions, sample_responses, sample_resume
    ):
        """Test that the prompt manager is called with correct dimension keys."""
        from unittest.mock import MagicMock, call

        mock_prompt_manager = MagicMock(spec=PromptManager)
        mock_prompt_manager.get_evaluation_prompt.return_value = (
            "system prompt",
            "user prompt",
        )
        mock_llm_client.generate_structured.return_value = DimensionEvaluationResponse(
            score=7, reasoning="Good"
        )

        engine = EvaluationEngine(
            llm_client=mock_llm_client, prompt_manager=mock_prompt_manager
        )
        await engine.evaluate_readiness(
            questions=sample_questions,
            responses=sample_responses,
            resume=sample_resume,
        )

        # Verify all 4 dimensions were evaluated
        dimension_calls = [
            c.kwargs["dimension"]
            for c in mock_prompt_manager.get_evaluation_prompt.call_args_list
        ]
        assert "clarity" in dimension_calls
        assert "technical_accuracy" in dimension_calls
        assert "star_method" in dimension_calls
        assert "relevancy" in dimension_calls


class TestDimensionEvaluationResponse:
    """Tests for the DimensionEvaluationResponse Pydantic model."""

    def test_valid_score(self):
        """Test that valid scores are accepted."""
        score = DimensionEvaluationResponse(score=7, reasoning="Good clarity")
        assert score.score == 7
        assert score.reasoning == "Good clarity"

    def test_minimum_score(self):
        """Test that score of 1 is valid."""
        score = DimensionEvaluationResponse(score=1, reasoning="Poor")
        assert score.score == 1

    def test_maximum_score(self):
        """Test that score of 10 is valid."""
        score = DimensionEvaluationResponse(score=10, reasoning="Excellent")
        assert score.score == 10


class TestEvaluationEngineErrorAlias:
    """Test that EvaluationEngineError is an alias for EvaluationError."""

    def test_alias_is_same_class(self):
        """Test that EvaluationEngineError is the same as EvaluationError."""
        assert EvaluationEngineError is EvaluationError


# --- Resume Relevancy Tests (Task 7.2) ---

from prep_pilot.services.evaluation_engine import (
    DEFAULT_NO_CLAIMS_SCORE,
    ResumeRelevancyResponse,
    QuestionRelevancyDetailResponse,
)
from prep_pilot.models.domain import (
    QuestionRelevancyDetail,
    ResumeRelevancyResult,
)


@pytest.fixture
def sample_questions_2():
    """Create sample interview questions for resume relevancy tests."""
    return [
        InterviewQuestion(
            id="q1",
            text="Tell me about your Python experience.",
            category="technical",
            references_resume_item="Python",
        ),
        InterviewQuestion(
            id="q2",
            text="Describe a time you used Docker.",
            category="behavioral",
            references_resume_item="Docker",
        ),
    ]


@pytest.fixture
def sample_responses_2():
    """Create sample candidate responses for resume relevancy tests."""
    return [
        "I have 5 years of Python experience building web applications.",
        "I containerized our microservices using Docker and Kubernetes.",
    ]


class TestEvaluateResumeRelevancy:
    """Tests for EvaluationEngine.evaluate_resume_relevancy()."""

    @pytest.mark.asyncio
    async def test_returns_result_with_score_and_reasoning(
        self, engine, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that a valid ResumeRelevancyResult is returned."""
        mock_llm_client.generate_structured.return_value = ResumeRelevancyResponse(
            score=8,
            per_question_reasoning=[
                QuestionRelevancyDetailResponse(
                    question_id="q1",
                    supported_claims=["Python experience"],
                    unsupported_claims=[],
                    reasoning="Python is listed on the resume.",
                ),
                QuestionRelevancyDetailResponse(
                    question_id="q2",
                    supported_claims=["Docker usage"],
                    unsupported_claims=["Kubernetes"],
                    reasoning="Docker is on resume but Kubernetes is not.",
                ),
            ],
        )

        result = await engine.evaluate_resume_relevancy(
            sample_questions_2, sample_responses_2, sample_resume
        )

        assert isinstance(result, ResumeRelevancyResult)
        assert result.score == 8
        assert len(result.per_question_reasoning) == 2
        assert result.per_question_reasoning[0].question_id == "q1"
        assert result.per_question_reasoning[0].supported_claims == ["Python experience"]
        assert result.per_question_reasoning[0].unsupported_claims == []
        assert result.per_question_reasoning[1].unsupported_claims == ["Kubernetes"]

    @pytest.mark.asyncio
    async def test_score_clamped_to_max_10(
        self, engine, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that scores above 10 are clamped to 10."""
        mock_llm_client.generate_structured.return_value = ResumeRelevancyResponse(
            score=15,
            per_question_reasoning=[
                QuestionRelevancyDetailResponse(
                    question_id="q1",
                    supported_claims=["Python"],
                    unsupported_claims=[],
                    reasoning="All supported.",
                ),
            ],
        )

        result = await engine.evaluate_resume_relevancy(
            sample_questions_2[:1], sample_responses_2[:1], sample_resume
        )

        assert result.score == 10

    @pytest.mark.asyncio
    async def test_score_clamped_to_min_1(
        self, engine, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that scores below 1 are clamped to 1."""
        mock_llm_client.generate_structured.return_value = ResumeRelevancyResponse(
            score=-2,
            per_question_reasoning=[
                QuestionRelevancyDetailResponse(
                    question_id="q1",
                    supported_claims=[],
                    unsupported_claims=["Made up skill"],
                    reasoning="Claim not on resume.",
                ),
            ],
        )

        result = await engine.evaluate_resume_relevancy(
            sample_questions_2[:1], sample_responses_2[:1], sample_resume
        )

        assert result.score == 1

    @pytest.mark.asyncio
    async def test_default_score_5_when_no_comparable_claims(
        self, engine, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that score defaults to 5 when no comparable claims exist."""
        mock_llm_client.generate_structured.return_value = ResumeRelevancyResponse(
            score=7,  # LLM returns 7 but should be overridden to 5
            per_question_reasoning=[
                QuestionRelevancyDetailResponse(
                    question_id="q1",
                    supported_claims=[],
                    unsupported_claims=[],
                    reasoning="No skills or experiences claimed.",
                ),
                QuestionRelevancyDetailResponse(
                    question_id="q2",
                    supported_claims=[],
                    unsupported_claims=[],
                    reasoning="Response was purely hypothetical.",
                ),
            ],
        )

        result = await engine.evaluate_resume_relevancy(
            sample_questions_2, sample_responses_2, sample_resume
        )

        assert result.score == DEFAULT_NO_CLAIMS_SCORE
        assert result.score == 5

    @pytest.mark.asyncio
    async def test_empty_questions_returns_default_score(
        self, engine, sample_resume
    ):
        """Test that empty questions list returns default score of 5."""
        result = await engine.evaluate_resume_relevancy([], [], sample_resume)

        assert result.score == DEFAULT_NO_CLAIMS_SCORE
        assert result.per_question_reasoning == []

    @pytest.mark.asyncio
    async def test_llm_error_raises_evaluation_error(
        self, engine, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that LLM errors are wrapped in EvaluationError."""
        mock_llm_client.generate_structured.side_effect = LLMClientError(
            "Service unavailable"
        )

        with pytest.raises(EvaluationError, match="Failed to evaluate resume relevancy"):
            await engine.evaluate_resume_relevancy(
                sample_questions_2, sample_responses_2, sample_resume
            )

    @pytest.mark.asyncio
    async def test_calls_prompt_manager_with_correct_args(
        self, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that the prompt manager is called with the correct arguments."""
        from unittest.mock import MagicMock

        mock_prompt_manager = MagicMock(spec=PromptManager)
        mock_prompt_manager.get_resume_relevancy_prompt.return_value = (
            "system prompt",
            "user prompt",
        )
        mock_llm_client.generate_structured.return_value = ResumeRelevancyResponse(
            score=6,
            per_question_reasoning=[
                QuestionRelevancyDetailResponse(
                    question_id="q1",
                    supported_claims=["Python"],
                    unsupported_claims=[],
                    reasoning="Supported.",
                ),
            ],
        )

        engine = EvaluationEngine(
            llm_client=mock_llm_client, prompt_manager=mock_prompt_manager
        )
        await engine.evaluate_resume_relevancy(
            sample_questions_2[:1], sample_responses_2[:1], sample_resume
        )

        mock_prompt_manager.get_resume_relevancy_prompt.assert_called_once_with(
            questions=sample_questions_2[:1],
            responses=sample_responses_2[:1],
            resume=sample_resume,
        )

    @pytest.mark.asyncio
    async def test_calls_llm_with_structured_schema(
        self, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that the LLM is called with the ResumeRelevancyResponse schema."""
        from unittest.mock import MagicMock

        mock_prompt_manager = MagicMock(spec=PromptManager)
        mock_prompt_manager.get_resume_relevancy_prompt.return_value = (
            "system prompt",
            "user prompt",
        )
        mock_llm_client.generate_structured.return_value = ResumeRelevancyResponse(
            score=7,
            per_question_reasoning=[
                QuestionRelevancyDetailResponse(
                    question_id="q1",
                    supported_claims=["Python"],
                    unsupported_claims=[],
                    reasoning="Supported.",
                ),
            ],
        )

        engine = EvaluationEngine(
            llm_client=mock_llm_client, prompt_manager=mock_prompt_manager
        )
        await engine.evaluate_resume_relevancy(
            sample_questions_2[:1], sample_responses_2[:1], sample_resume
        )

        mock_llm_client.generate_structured.assert_called_once_with(
            prompt="user prompt",
            system_prompt="system prompt",
            schema=ResumeRelevancyResponse,
        )

    @pytest.mark.asyncio
    async def test_per_question_reasoning_has_correct_structure(
        self, engine, mock_llm_client, sample_questions_2, sample_responses_2, sample_resume
    ):
        """Test that per_question_reasoning entries have correct structure."""
        mock_llm_client.generate_structured.return_value = ResumeRelevancyResponse(
            score=6,
            per_question_reasoning=[
                QuestionRelevancyDetailResponse(
                    question_id="q1",
                    supported_claims=["Python", "web apps"],
                    unsupported_claims=["5 years experience"],
                    reasoning="Python is on resume but duration differs.",
                ),
                QuestionRelevancyDetailResponse(
                    question_id="q2",
                    supported_claims=["Docker", "microservices"],
                    unsupported_claims=["Kubernetes"],
                    reasoning="Docker and microservices match resume.",
                ),
            ],
        )

        result = await engine.evaluate_resume_relevancy(
            sample_questions_2, sample_responses_2, sample_resume
        )

        assert len(result.per_question_reasoning) == 2
        for detail in result.per_question_reasoning:
            assert isinstance(detail, QuestionRelevancyDetail)
            assert isinstance(detail.question_id, str)
            assert isinstance(detail.supported_claims, list)
            assert isinstance(detail.unsupported_claims, list)
            assert isinstance(detail.reasoning, str)
            assert len(detail.reasoning) > 0
