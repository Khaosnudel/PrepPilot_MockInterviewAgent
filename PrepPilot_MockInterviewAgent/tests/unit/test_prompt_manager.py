"""Unit tests for the PromptManager service."""

from datetime import datetime

import pytest

from prep_pilot.models.domain import (
    Experience,
    InterviewMode,
    InterviewQuestion,
    InterviewSession,
    ParsedJobDescription,
    ParsedResume,
    QuestionResponse,
    SessionStatus,
)
from prep_pilot.services.prompt_manager import PromptManager


@pytest.fixture
def prompt_manager() -> PromptManager:
    """Create a PromptManager instance."""
    return PromptManager()


@pytest.fixture
def sample_resume() -> ParsedResume:
    """Create a sample parsed resume."""
    return ParsedResume(
        skills=["Python", "AWS", "Machine Learning", "FastAPI"],
        experiences=[
            Experience(
                title="Senior Software Engineer",
                company="TechCorp",
                duration="2020-2023",
                description="Led backend development for ML platform",
                skills_used=["Python", "AWS", "Docker"],
            ),
            Experience(
                title="Software Engineer",
                company="StartupInc",
                duration="2018-2020",
                description="Built REST APIs and microservices",
                skills_used=["Python", "FastAPI", "PostgreSQL"],
            ),
        ],
        qualifications=["BS Computer Science", "AWS Solutions Architect"],
        raw_text="Full resume text here...",
    )


@pytest.fixture
def sample_jd() -> ParsedJobDescription:
    """Create a sample parsed job description."""
    return ParsedJobDescription(
        requirements=[
            "5+ years Python experience",
            "Experience with cloud platforms (AWS/GCP)",
            "Machine learning model deployment",
        ],
        responsibilities=[
            "Design and implement ML pipelines",
            "Mentor junior engineers",
            "Collaborate with data science team",
        ],
        qualifications=[
            "BS/MS in Computer Science",
            "AWS certification preferred",
        ],
        summary="Senior ML Engineer role focused on production ML systems",
    )


@pytest.fixture
def sample_session(sample_resume: ParsedResume) -> InterviewSession:
    """Create a sample interview session with responses."""
    questions = [
        InterviewQuestion(
            id="q1",
            text="Tell me about your experience with Python.",
            category="technical",
            references_resume_item="Python",
        ),
        InterviewQuestion(
            id="q2",
            text="Describe a time you led a team project.",
            category="behavioral",
            references_resume_item="Led backend development for ML platform",
        ),
    ]
    responses = [
        QuestionResponse(
            question=questions[0],
            response_text="I have 5 years of Python experience building APIs.",
            response_timestamp=datetime.now(),
            input_mode="text",
        ),
        QuestionResponse(
            question=questions[1],
            response_text="At TechCorp, I led a team of 4 engineers on an ML project.",
            response_timestamp=datetime.now(),
            input_mode="text",
        ),
    ]
    return InterviewSession(
        id="session-1",
        mode=InterviewMode.OPEN_PRACTICE,
        status=SessionStatus.CONCLUDED,
        resume=sample_resume,
        selected_role="Software Engineer",
        questions=questions,
        responses=responses,
    )


class TestQuestionGenerationPrompt:
    """Tests for get_question_generation_prompt()."""

    def test_open_practice_returns_tuple(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """Open practice mode returns a (system_prompt, user_prompt) tuple."""
        result = prompt_manager.get_question_generation_prompt(
            role="Software Engineer",
            resume=sample_resume,
            mode="open_practice",
        )
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_open_practice_system_prompt_contains_instructions(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """System prompt includes instructions for referencing resume items."""
        system_prompt, _ = prompt_manager.get_question_generation_prompt(
            role="Software Engineer",
            resume=sample_resume,
            mode="open_practice",
        )
        assert "resume" in system_prompt.lower()
        assert "references_resume_item" in system_prompt
        assert "JSON" in system_prompt

    def test_open_practice_user_prompt_contains_role(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """User prompt includes the target role."""
        _, user_prompt = prompt_manager.get_question_generation_prompt(
            role="Data Scientist",
            resume=sample_resume,
            mode="open_practice",
        )
        assert "Data Scientist" in user_prompt

    def test_open_practice_user_prompt_contains_resume_data(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """User prompt includes resume skills and experiences."""
        _, user_prompt = prompt_manager.get_question_generation_prompt(
            role="Software Engineer",
            resume=sample_resume,
            mode="open_practice",
        )
        assert "Python" in user_prompt
        assert "TechCorp" in user_prompt

    def test_open_practice_user_prompt_contains_count(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """User prompt specifies the requested question count."""
        _, user_prompt = prompt_manager.get_question_generation_prompt(
            role="Software Engineer",
            resume=sample_resume,
            mode="open_practice",
            count=7,
        )
        assert "7" in user_prompt

    def test_job_specific_returns_tuple(
        self,
        prompt_manager: PromptManager,
        sample_resume: ParsedResume,
        sample_jd: ParsedJobDescription,
    ):
        """Job-specific mode returns a (system_prompt, user_prompt) tuple."""
        result = prompt_manager.get_question_generation_prompt(
            role="ML Engineer",
            resume=sample_resume,
            mode="job_specific",
            job_description=sample_jd,
        )
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_job_specific_system_prompt_mentions_intersection(
        self,
        prompt_manager: PromptManager,
        sample_resume: ParsedResume,
        sample_jd: ParsedJobDescription,
    ):
        """Job-specific system prompt instructs prioritizing intersections."""
        system_prompt, _ = prompt_manager.get_question_generation_prompt(
            role="ML Engineer",
            resume=sample_resume,
            mode="job_specific",
            job_description=sample_jd,
        )
        assert "intersection" in system_prompt.lower()
        assert "references_jd_item" in system_prompt

    def test_job_specific_user_prompt_contains_jd_data(
        self,
        prompt_manager: PromptManager,
        sample_resume: ParsedResume,
        sample_jd: ParsedJobDescription,
    ):
        """Job-specific user prompt includes JD requirements and responsibilities."""
        _, user_prompt = prompt_manager.get_question_generation_prompt(
            role="ML Engineer",
            resume=sample_resume,
            mode="job_specific",
            job_description=sample_jd,
        )
        assert "5+ years Python experience" in user_prompt
        assert "ML pipelines" in user_prompt

    def test_job_specific_user_prompt_contains_resume_data(
        self,
        prompt_manager: PromptManager,
        sample_resume: ParsedResume,
        sample_jd: ParsedJobDescription,
    ):
        """Job-specific user prompt also includes resume context."""
        _, user_prompt = prompt_manager.get_question_generation_prompt(
            role="ML Engineer",
            resume=sample_resume,
            mode="job_specific",
            job_description=sample_jd,
        )
        assert "Python" in user_prompt
        assert "AWS" in user_prompt


class TestEvaluationPrompt:
    """Tests for get_evaluation_prompt()."""

    def test_clarity_prompt_returns_tuple(self, prompt_manager: PromptManager):
        """Clarity evaluation returns a (system_prompt, user_prompt) tuple."""
        result = prompt_manager.get_evaluation_prompt(
            dimension="clarity",
            question="Tell me about yourself.",
            response="I am a software engineer with 5 years experience.",
        )
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_clarity_prompt_mentions_criteria(self, prompt_manager: PromptManager):
        """Clarity prompt includes specific evaluation criteria."""
        system_prompt, _ = prompt_manager.get_evaluation_prompt(
            dimension="clarity",
            question="Tell me about yourself.",
            response="I am a software engineer.",
        )
        assert "logical structure" in system_prompt.lower()
        assert "concise" in system_prompt.lower()
        assert "ambiguity" in system_prompt.lower()
        assert "filler" in system_prompt.lower()

    def test_technical_accuracy_prompt_mentions_criteria(
        self, prompt_manager: PromptManager
    ):
        """Technical accuracy prompt includes correctness and specificity criteria."""
        system_prompt, _ = prompt_manager.get_evaluation_prompt(
            dimension="technical_accuracy",
            question="Explain how Docker works.",
            response="Docker uses containerization.",
        )
        assert "correctness" in system_prompt.lower()
        assert "specificity" in system_prompt.lower()

    def test_star_method_prompt_mentions_components(
        self, prompt_manager: PromptManager
    ):
        """STAR method prompt mentions all four STAR components."""
        system_prompt, _ = prompt_manager.get_evaluation_prompt(
            dimension="star_method",
            question="Tell me about a challenge you faced.",
            response="At my last job, I had to fix a production issue.",
        )
        assert "Situation" in system_prompt
        assert "Task" in system_prompt
        assert "Action" in system_prompt
        assert "Result" in system_prompt

    def test_relevancy_prompt_mentions_criteria(self, prompt_manager: PromptManager):
        """Relevancy prompt includes topic alignment and tangent criteria."""
        system_prompt, _ = prompt_manager.get_evaluation_prompt(
            dimension="relevancy",
            question="What is your greatest strength?",
            response="I am very organized.",
        )
        assert "directly address" in system_prompt.lower()
        assert "tangent" in system_prompt.lower()

    def test_evaluation_prompt_includes_question_and_response(
        self, prompt_manager: PromptManager
    ):
        """User prompt includes the actual question and response text."""
        _, user_prompt = prompt_manager.get_evaluation_prompt(
            dimension="clarity",
            question="Why do you want this job?",
            response="Because I love coding.",
        )
        assert "Why do you want this job?" in user_prompt
        assert "Because I love coding." in user_prompt

    def test_invalid_dimension_raises_error(self, prompt_manager: PromptManager):
        """Invalid dimension raises ValueError."""
        with pytest.raises(ValueError, match="Unknown evaluation dimension"):
            prompt_manager.get_evaluation_prompt(
                dimension="invalid_dimension",
                question="Test?",
                response="Test.",
            )

    def test_all_dimensions_request_score_1_to_10(
        self, prompt_manager: PromptManager
    ):
        """All dimension prompts request a score in the 1-10 range."""
        for dimension in ["clarity", "technical_accuracy", "star_method", "relevancy"]:
            system_prompt, _ = prompt_manager.get_evaluation_prompt(
                dimension=dimension,
                question="Test question?",
                response="Test response.",
            )
            assert "1" in system_prompt and "10" in system_prompt


class TestResumeRelevancyPrompt:
    """Tests for get_resume_relevancy_prompt()."""

    def test_returns_tuple(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """Returns a (system_prompt, user_prompt) tuple."""
        questions = [
            InterviewQuestion(id="q1", text="Tell me about Python.", category="technical")
        ]
        result = prompt_manager.get_resume_relevancy_prompt(
            questions=questions,
            responses=["I have used Python for 5 years."],
            resume=sample_resume,
        )
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_system_prompt_mentions_supported_unsupported(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """System prompt instructs identifying supported and unsupported claims."""
        questions = [
            InterviewQuestion(id="q1", text="Test?", category="technical")
        ]
        system_prompt, _ = prompt_manager.get_resume_relevancy_prompt(
            questions=questions,
            responses=["Test response."],
            resume=sample_resume,
        )
        assert "supported" in system_prompt.lower()
        assert "unsupported" in system_prompt.lower()

    def test_system_prompt_mentions_default_score(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """System prompt mentions default score of 5 for no comparable claims."""
        questions = [
            InterviewQuestion(id="q1", text="Test?", category="technical")
        ]
        system_prompt, _ = prompt_manager.get_resume_relevancy_prompt(
            questions=questions,
            responses=["Test response."],
            resume=sample_resume,
        )
        assert "5" in system_prompt

    def test_user_prompt_contains_resume_and_responses(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume
    ):
        """User prompt includes both resume data and interview responses."""
        questions = [
            InterviewQuestion(id="q1", text="Tell me about AWS.", category="technical")
        ]
        _, user_prompt = prompt_manager.get_resume_relevancy_prompt(
            questions=questions,
            responses=["I deployed services on AWS using ECS."],
            resume=sample_resume,
        )
        assert "AWS" in user_prompt
        assert "deployed services on AWS" in user_prompt


class TestFeedbackPrompt:
    """Tests for get_feedback_prompt()."""

    def test_returns_tuple(
        self, prompt_manager: PromptManager, sample_session: InterviewSession
    ):
        """Returns a (system_prompt, user_prompt) tuple."""
        result = prompt_manager.get_feedback_prompt(sample_session)
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_system_prompt_mentions_improved_answers(
        self, prompt_manager: PromptManager, sample_session: InterviewSession
    ):
        """System prompt instructs generating improved answers."""
        system_prompt, _ = prompt_manager.get_feedback_prompt(sample_session)
        assert "improved" in system_prompt.lower()

    def test_system_prompt_mentions_follow_up_questions(
        self, prompt_manager: PromptManager, sample_session: InterviewSession
    ):
        """System prompt instructs generating 2-5 follow-up questions."""
        system_prompt, _ = prompt_manager.get_feedback_prompt(sample_session)
        assert "follow-up" in system_prompt.lower()
        assert "2" in system_prompt and "5" in system_prompt

    def test_system_prompt_mentions_all_four_dimensions(
        self, prompt_manager: PromptManager, sample_session: InterviewSession
    ):
        """System prompt references all 4 evaluation dimensions."""
        system_prompt, _ = prompt_manager.get_feedback_prompt(sample_session)
        assert "clarity_of_communication" in system_prompt
        assert "technical_accuracy" in system_prompt
        assert "star_method_adherence" in system_prompt
        assert "overall_response_relevancy" in system_prompt

    def test_system_prompt_mentions_improvement_suggestions(
        self, prompt_manager: PromptManager, sample_session: InterviewSession
    ):
        """System prompt instructs at least 1 suggestion per dimension."""
        system_prompt, _ = prompt_manager.get_feedback_prompt(sample_session)
        assert "improvement" in system_prompt.lower()
        assert "at least 1" in system_prompt.lower()

    def test_user_prompt_contains_session_responses(
        self, prompt_manager: PromptManager, sample_session: InterviewSession
    ):
        """User prompt includes the actual session Q&A pairs."""
        _, user_prompt = prompt_manager.get_feedback_prompt(sample_session)
        assert "Tell me about your experience with Python" in user_prompt
        assert "5 years of Python experience" in user_prompt

    def test_user_prompt_contains_role_context(
        self, prompt_manager: PromptManager, sample_session: InterviewSession
    ):
        """User prompt includes the role/mode context."""
        _, user_prompt = prompt_manager.get_feedback_prompt(sample_session)
        assert "Software Engineer" in user_prompt

    def test_job_specific_session_includes_jd_summary(
        self, prompt_manager: PromptManager, sample_resume: ParsedResume, sample_jd: ParsedJobDescription
    ):
        """Job-specific session feedback prompt includes JD summary."""
        session = InterviewSession(
            id="session-2",
            mode=InterviewMode.JOB_SPECIFIC,
            status=SessionStatus.CONCLUDED,
            resume=sample_resume,
            job_description=sample_jd,
            questions=[],
            responses=[],
        )
        _, user_prompt = prompt_manager.get_feedback_prompt(session)
        assert "Job Specific" in user_prompt
        assert "Senior ML Engineer" in user_prompt
