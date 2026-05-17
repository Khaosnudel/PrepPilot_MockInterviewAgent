"""Unit tests for QuestionGenerator service."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from prep_pilot.models.domain import (
    Experience,
    InterviewQuestion,
    ParsedJobDescription,
    ParsedResume,
)
from prep_pilot.services.llm_client import LLMClient, LLMClientError
from prep_pilot.services.prompt_manager import PromptManager
from prep_pilot.services.question_generator import (
    GeneratedQuestion,
    JobSpecificQuestionsResponse,
    QuestionGenerationError,
    QuestionGenerator,
)


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    client = AsyncMock(spec=LLMClient)
    return client


@pytest.fixture
def prompt_manager():
    """Create a real PromptManager instance."""
    return PromptManager()


@pytest.fixture
def generator(mock_llm_client, prompt_manager):
    """Create a QuestionGenerator with mocked LLM client."""
    return QuestionGenerator(llm_client=mock_llm_client, prompt_manager=prompt_manager)


@pytest.fixture
def sample_resume():
    """Create a sample parsed resume."""
    return ParsedResume(
        skills=["Python", "AWS", "Docker", "Machine Learning"],
        experiences=[
            Experience(
                title="Senior Software Engineer",
                company="TechCorp",
                duration="3 years",
                description="Led backend development team",
                skills_used=["Python", "AWS", "Docker"],
            ),
            Experience(
                title="ML Engineer",
                company="DataCo",
                duration="2 years",
                description="Built ML pipelines",
                skills_used=["Python", "Machine Learning"],
            ),
        ],
        qualifications=["MSc Computer Science", "AWS Certified"],
        raw_text="Sample resume text",
    )


@pytest.fixture
def sample_job_description():
    """Create a sample parsed job description."""
    return ParsedJobDescription(
        requirements=[
            "5+ years Python experience",
            "Experience with cloud platforms (AWS/GCP)",
            "Strong knowledge of containerization (Docker/Kubernetes)",
        ],
        responsibilities=[
            "Design and implement scalable backend services",
            "Lead technical architecture decisions",
            "Mentor junior engineers",
        ],
        qualifications=[
            "Bachelor's degree in Computer Science",
            "AWS certification preferred",
        ],
        summary="Senior Backend Engineer at TechStartup",
    )


def _make_job_specific_questions(count=6, all_intersection=False):
    """Helper to create mock question schemas for job-specific mode."""
    questions = []
    for i in range(count):
        if all_intersection or i < count - 2:
            # Intersection question (both resume + JD references)
            questions.append(
                GeneratedQuestion(
                    id=f"q{i+1}",
                    text=f"Tell me about your experience with requirement {i+1}",
                    category="technical" if i % 2 == 0 else "behavioral",
                    references_resume_item="Python experience at TechCorp",
                    references_jd_item="5+ years Python experience",
                )
            )
        else:
            # JD-only question (no resume reference)
            questions.append(
                GeneratedQuestion(
                    id=f"q{i+1}",
                    text=f"How would you approach responsibility {i+1}?",
                    category="situational",
                    references_resume_item=None,
                    references_jd_item="Mentor junior engineers",
                )
            )
    return JobSpecificQuestionsResponse(questions=questions)


class TestGenerateJobSpecific:
    """Tests for QuestionGenerator.generate_job_specific()."""

    @pytest.mark.asyncio
    async def test_generates_at_least_5_questions(
        self, generator, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that job-specific mode generates at least 5 questions."""
        mock_llm_client.generate_structured.return_value = _make_job_specific_questions(
            count=7, all_intersection=True
        )

        questions = await generator.generate_job_specific(
            resume=sample_resume, job_description=sample_job_description
        )

        assert len(questions) >= 5

    @pytest.mark.asyncio
    async def test_all_questions_reference_jd_item(
        self, generator, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that every question references at least one JD item."""
        mock_llm_client.generate_structured.return_value = _make_job_specific_questions(
            count=6, all_intersection=True
        )

        questions = await generator.generate_job_specific(
            resume=sample_resume, job_description=sample_job_description
        )

        for q in questions:
            assert q.references_jd_item is not None
            assert q.references_jd_item != ""

    @pytest.mark.asyncio
    async def test_intersection_questions_appear_first(
        self, generator, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that intersection questions (resume + JD) appear before non-intersection."""
        # Create mixed questions: some intersection, some JD-only
        mock_llm_client.generate_structured.return_value = _make_job_specific_questions(
            count=6, all_intersection=False
        )

        questions = await generator.generate_job_specific(
            resume=sample_resume, job_description=sample_job_description
        )

        # Find the boundary between intersection and non-intersection
        found_non_intersection = False
        for q in questions:
            is_intersection = (
                q.references_resume_item is not None and q.references_jd_item is not None
            )
            if not is_intersection:
                found_non_intersection = True
            elif found_non_intersection:
                # Found an intersection question after a non-intersection one
                pytest.fail(
                    "Intersection questions must appear before non-intersection questions"
                )

    @pytest.mark.asyncio
    async def test_raises_error_when_fewer_than_5_questions(
        self, generator, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that an error is raised when LLM generates fewer than 5 questions."""
        mock_llm_client.generate_structured.return_value = JobSpecificQuestionsResponse(
            questions=[
                GeneratedQuestion(
                    id="q1",
                    text="Tell me about Python",
                    category="technical",
                    references_resume_item="Python",
                    references_jd_item="5+ years Python experience",
                ),
                GeneratedQuestion(
                    id="q2",
                    text="Tell me about AWS",
                    category="technical",
                    references_resume_item="AWS",
                    references_jd_item="Experience with cloud platforms",
                ),
            ]
        )

        with pytest.raises(QuestionGenerationError, match="minimum 5 required"):
            await generator.generate_job_specific(
                resume=sample_resume, job_description=sample_job_description
            )

    @pytest.mark.asyncio
    async def test_raises_error_when_question_missing_jd_reference(
        self, generator, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that an error is raised when a question doesn't reference a JD item."""
        questions = [
            GeneratedQuestion(
                id=f"q{i+1}",
                text=f"Question {i+1}",
                category="technical",
                references_resume_item="Python",
                references_jd_item="5+ years Python experience" if i < 4 else None,
            )
            for i in range(5)
        ]
        mock_llm_client.generate_structured.return_value = JobSpecificQuestionsResponse(
            questions=questions
        )

        with pytest.raises(
            QuestionGenerationError, match="does not reference a job description item"
        ):
            await generator.generate_job_specific(
                resume=sample_resume, job_description=sample_job_description
            )

    @pytest.mark.asyncio
    async def test_raises_error_on_llm_failure(
        self, generator, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that LLM failures are wrapped in QuestionGenerationError."""
        mock_llm_client.generate_structured.side_effect = LLMClientError(
            "LLM service unavailable"
        )

        with pytest.raises(
            QuestionGenerationError, match="Failed to generate interview questions"
        ):
            await generator.generate_job_specific(
                resume=sample_resume, job_description=sample_job_description
            )

    @pytest.mark.asyncio
    async def test_uses_prompt_manager_for_job_specific_mode(
        self, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that the prompt manager is called with job_specific mode."""
        mock_prompt_manager = MagicMock(spec=PromptManager)
        mock_prompt_manager.get_question_generation_prompt.return_value = (
            "system prompt",
            "user prompt",
        )
        mock_llm_client.generate_structured.return_value = _make_job_specific_questions(
            count=5, all_intersection=True
        )

        gen = QuestionGenerator(
            llm_client=mock_llm_client, prompt_manager=mock_prompt_manager
        )
        await gen.generate_job_specific(
            resume=sample_resume, job_description=sample_job_description
        )

        mock_prompt_manager.get_question_generation_prompt.assert_called_once_with(
            role="",
            resume=sample_resume,
            mode="job_specific",
            job_description=sample_job_description,
            count=5,
        )

    @pytest.mark.asyncio
    async def test_returns_interview_question_objects(
        self, generator, mock_llm_client, sample_resume, sample_job_description
    ):
        """Test that the method returns proper InterviewQuestion domain objects."""
        mock_llm_client.generate_structured.return_value = _make_job_specific_questions(
            count=5, all_intersection=True
        )

        questions = await generator.generate_job_specific(
            resume=sample_resume, job_description=sample_job_description
        )

        for q in questions:
            assert isinstance(q, InterviewQuestion)
            assert q.id is not None
            assert q.text is not None
            assert q.category in ("behavioral", "technical", "situational")
