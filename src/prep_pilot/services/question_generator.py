"""Question Generator - Generates interview questions based on mode, resume, and JD."""

import logging
from typing import Optional

from pydantic import BaseModel, Field

from prep_pilot.data.roles import AVAILABLE_ROLES
from prep_pilot.models.domain import (
    InterviewQuestion,
    ParsedJobDescription,
    ParsedResume,
)
from prep_pilot.services.llm_client import LLMClient, LLMClientError
from prep_pilot.services.prompt_manager import PromptManager

logger = logging.getLogger(__name__)

# Bounds for question generation
MIN_OPEN_PRACTICE_QUESTIONS = 5
MAX_OPEN_PRACTICE_QUESTIONS = 15
MIN_JOB_SPECIFIC_QUESTIONS = 5


class QuestionGenerationError(Exception):
    """Raised when question generation fails."""


class GeneratedQuestion(BaseModel):
    """Pydantic schema for a single generated question (LLM output)."""

    id: str = Field(description="Unique question identifier (e.g., 'q1', 'q2')")
    text: str = Field(description="The interview question text")
    category: str = Field(
        description="Question category: 'behavioral', 'technical', or 'situational'"
    )
    references_resume_item: Optional[str] = Field(
        default=None,
        description="The specific skill/experience from the resume this question references",
    )
    references_jd_item: Optional[str] = Field(
        default=None,
        description="The specific requirement/responsibility from the JD this question references",
    )


class OpenPracticeQuestionsResponse(BaseModel):
    """Pydantic schema for the list of generated open practice questions."""

    questions: list[GeneratedQuestion] = Field(
        description="List of generated interview questions"
    )


class JobSpecificQuestionsResponse(BaseModel):
    """Pydantic schema for the list of generated job-specific questions."""

    questions: list[GeneratedQuestion] = Field(
        description="List of generated interview questions"
    )


class QuestionGenerator:
    """Generates interview questions for both open practice and job-specific modes.

    Uses the LLM client and prompt manager to generate contextual interview
    questions based on the candidate's resume, selected role, and optionally
    a job description.

    Args:
        llm_client: An instance of LLMClient for question generation.
        prompt_manager: An instance of PromptManager for prompt templates.
    """

    def __init__(self, llm_client: LLMClient, prompt_manager: PromptManager) -> None:
        self._llm_client = llm_client
        self._prompt_manager = prompt_manager

    async def generate_open_practice(
        self, role: str, resume: ParsedResume, count: int = 10
    ) -> list[InterviewQuestion]:
        """Generate interview questions for open practice mode.

        Generates 5-15 questions for a selected role, incorporating resume content.
        Each question references at least one resume item in the
        references_resume_item field.

        Args:
            role: The target role for the interview (must be from available roles).
            resume: Parsed resume data with skills, experiences, qualifications.
            count: Number of questions to generate (clamped to [5, 15]).

        Returns:
            A list of InterviewQuestion objects (between 5 and 15).

        Raises:
            QuestionGenerationError: If generation fails or produces invalid output.
            ValueError: If the role is not in the available roles list.
        """
        if role not in AVAILABLE_ROLES:
            raise ValueError(
                f"Role '{role}' is not available. "
                f"Choose from: {AVAILABLE_ROLES}"
            )

        # Clamp count to valid range
        count = max(
            MIN_OPEN_PRACTICE_QUESTIONS,
            min(count, MAX_OPEN_PRACTICE_QUESTIONS),
        )

        system_prompt, user_prompt = self._prompt_manager.get_question_generation_prompt(
            role=role,
            resume=resume,
            mode="open_practice",
            count=count,
        )

        questions = await self._generate_questions(
            system_prompt, user_prompt, OpenPracticeQuestionsResponse
        )

        # Validate minimum count
        if len(questions) < MIN_OPEN_PRACTICE_QUESTIONS:
            raise QuestionGenerationError(
                f"Generated only {len(questions)} questions, "
                f"minimum {MIN_OPEN_PRACTICE_QUESTIONS} required."
            )

        # Trim to max if LLM over-generated
        questions = questions[:MAX_OPEN_PRACTICE_QUESTIONS]

        # Validate each question references a resume item
        self._validate_resume_references(questions)

        return questions

    async def generate_job_specific(
        self, resume: ParsedResume, job_description: ParsedJobDescription
    ) -> list[InterviewQuestion]:
        """Generate interview questions for job-specific mode.

        Generates ≥5 questions targeting intersections of resume and job description.
        Each question references at least one JD item. Intersection questions
        (those referencing both resume and JD items) appear first in the list.

        Args:
            resume: Parsed resume data with skills, experiences, qualifications.
            job_description: Parsed job description with requirements,
                responsibilities, and qualifications.

        Returns:
            A list of InterviewQuestion objects, sorted with intersection
            questions first, then JD-only or resume-only questions.

        Raises:
            QuestionGenerationError: If generation fails or produces invalid output.
        """
        system_prompt, user_prompt = self._prompt_manager.get_question_generation_prompt(
            role="",  # Not used in job-specific mode
            resume=resume,
            mode="job_specific",
            job_description=job_description,
            count=MIN_JOB_SPECIFIC_QUESTIONS,
        )

        questions = await self._generate_questions(
            system_prompt, user_prompt, JobSpecificQuestionsResponse
        )

        # Validate minimum count
        if len(questions) < MIN_JOB_SPECIFIC_QUESTIONS:
            raise QuestionGenerationError(
                f"Generated only {len(questions)} questions, "
                f"minimum {MIN_JOB_SPECIFIC_QUESTIONS} required."
            )

        # Validate each question references at least one JD item
        for q in questions:
            if not q.references_jd_item:
                raise QuestionGenerationError(
                    f"Question '{q.id}' does not reference a job description item. "
                    "All job-specific questions must reference at least one "
                    "requirement, responsibility, or qualification from the JD."
                )

        # Sort: intersection questions first (those with both resume + JD references),
        # then JD-only or resume-only questions
        intersection_questions = [
            q for q in questions
            if q.references_resume_item and q.references_jd_item
        ]
        non_intersection_questions = [
            q for q in questions
            if not (q.references_resume_item and q.references_jd_item)
        ]

        return intersection_questions + non_intersection_questions

    async def _generate_questions(
        self, system_prompt: str, user_prompt: str, schema: type[BaseModel]
    ) -> list[InterviewQuestion]:
        """Call the LLM to generate questions and parse the response.

        Args:
            system_prompt: The system prompt for the LLM.
            user_prompt: The user prompt for the LLM.
            schema: The Pydantic schema for structured output parsing.

        Returns:
            A list of InterviewQuestion objects parsed from the LLM response.

        Raises:
            QuestionGenerationError: If the LLM call fails or response is unparseable.
        """
        try:
            result = await self._llm_client.generate_structured(
                prompt=user_prompt,
                system_prompt=system_prompt,
                schema=schema,
            )
        except LLMClientError as exc:
            logger.error("LLM question generation failed: %s", exc)
            raise QuestionGenerationError(
                "Failed to generate interview questions. Please try again later."
            ) from exc

        # Convert Pydantic models to domain dataclasses
        questions: list[InterviewQuestion] = []
        for q_schema in result.questions:
            questions.append(
                InterviewQuestion(
                    id=q_schema.id,
                    text=q_schema.text,
                    category=q_schema.category,
                    references_resume_item=q_schema.references_resume_item,
                    references_jd_item=q_schema.references_jd_item,
                )
            )

        return questions

    def _validate_resume_references(
        self, questions: list[InterviewQuestion]
    ) -> None:
        """Validate that every question has a non-empty references_resume_item.

        Args:
            questions: List of generated questions to validate.

        Raises:
            QuestionGenerationError: If any question lacks a resume reference.
        """
        for question in questions:
            if not question.references_resume_item:
                raise QuestionGenerationError(
                    f"Question '{question.id}' does not reference a resume item. "
                    "All questions must reference at least one resume skill, "
                    "experience, or qualification."
                )
