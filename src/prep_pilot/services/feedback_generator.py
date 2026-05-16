"""Feedback Generator - Produces structured feedback reports from interview sessions."""

import asyncio
import logging

from pydantic import BaseModel, Field

from prep_pilot.models.domain import (
    FeedbackReport,
    ImprovedAnswer,
    ImprovementSuggestion,
    InterviewSession,
    ScoreReasoning,
)
from prep_pilot.services.llm_client import LLMClient, LLMClientError
from prep_pilot.services.prompt_manager import PromptManager

logger = logging.getLogger(__name__)

# Timeout for feedback generation (seconds)
FEEDBACK_GENERATION_TIMEOUT = 60

# Evaluation dimensions
EVALUATION_DIMENSIONS = [
    "clarity_of_communication",
    "technical_accuracy",
    "star_method_adherence",
    "overall_response_relevancy",
]


class FeedbackGenerationError(Exception):
    """Raised when feedback generation fails."""


# --- Pydantic schemas for LLM structured output ---


class ImprovedAnswerResponse(BaseModel):
    """LLM response schema for an improved answer."""

    question_id: str = Field(description="The question identifier")
    original_response: str = Field(description="The candidate's original response")
    improved_response: str = Field(description="An improved version of the response")


class ScoreReasoningResponse(BaseModel):
    """LLM response schema for score reasoning."""

    dimension: str = Field(description="The evaluation dimension name")
    score: int = Field(description="Score from 1 to 10")
    reasoning: str = Field(
        description="Detailed reasoning referencing the candidate's actual responses"
    )
    referenced_responses: list[str] = Field(
        description="List of specific responses that influenced the score"
    )


class ImprovementSuggestionResponse(BaseModel):
    """LLM response schema for an improvement suggestion."""

    dimension: str = Field(description="The evaluation dimension this suggestion targets")
    suggestion: str = Field(
        description="Actionable improvement suggestion referencing a specific response"
    )
    referenced_response: str = Field(
        description="The specific response this suggestion references"
    )


class FeedbackReportResponse(BaseModel):
    """LLM response schema for the complete feedback report."""

    improved_answers: list[ImprovedAnswerResponse] = Field(
        description="Improved answer for each question answered"
    )
    follow_up_questions: list[str] = Field(
        description="2-5 follow-up questions related to topics covered"
    )
    score_reasoning: list[ScoreReasoningResponse] = Field(
        description="Exactly 4 score reasoning entries, one per evaluation dimension"
    )
    improvement_suggestions: list[ImprovementSuggestionResponse] = Field(
        description="At least 4 improvement suggestions, at least 1 per dimension"
    )


class FeedbackGenerator:
    """Generates structured feedback reports from concluded interview sessions.

    Produces a FeedbackReport containing improved answers, follow-up questions,
    score reasoning, and improvement suggestions based on the session data.

    Args:
        llm_client: An instance of LLMClient for generation calls.
        prompt_manager: An instance of PromptManager for prompt templates.
    """

    def __init__(self, llm_client: LLMClient, prompt_manager: PromptManager) -> None:
        self._llm_client = llm_client
        self._prompt_manager = prompt_manager

    async def generate(self, session: InterviewSession) -> FeedbackReport:
        """Generate a complete feedback report from session data.

        Produces improved answers (one per answered question), 2-5 follow-up
        questions, 4 score reasoning entries (one per dimension), and at least
        4 improvement suggestions (at least 1 per dimension).

        Enforces a 60-second timeout for the entire generation process.

        Args:
            session: The concluded interview session with all data.

        Returns:
            A FeedbackReport with all required sections populated.

        Raises:
            FeedbackGenerationError: If generation fails due to LLM errors,
                timeout, or structural validation failure.
        """
        if not session.responses:
            raise FeedbackGenerationError(
                "Cannot generate feedback for a session with no responses."
            )

        system_prompt, user_prompt = self._prompt_manager.get_feedback_prompt(session)

        try:
            result = await asyncio.wait_for(
                self._llm_client.generate_structured(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    schema=FeedbackReportResponse,
                ),
                timeout=FEEDBACK_GENERATION_TIMEOUT,
            )
        except asyncio.TimeoutError:
            logger.error(
                "Feedback generation timed out after %d seconds.",
                FEEDBACK_GENERATION_TIMEOUT,
            )
            raise FeedbackGenerationError(
                f"Feedback generation timed out after {FEEDBACK_GENERATION_TIMEOUT} seconds."
            )
        except LLMClientError as exc:
            logger.error("LLM feedback generation failed: %s", exc)
            raise FeedbackGenerationError(
                "Failed to generate feedback report. Please try again later."
            ) from exc

        # Convert to domain model
        report = self._build_feedback_report(result)

        # Validate structural completeness
        num_answered = len(session.responses)
        self._validate_report(report, num_answered)

        return report

    def _build_feedback_report(
        self, response: FeedbackReportResponse
    ) -> FeedbackReport:
        """Convert the LLM structured response into a domain FeedbackReport."""
        improved_answers = [
            ImprovedAnswer(
                question_id=ans.question_id,
                original_response=ans.original_response,
                improved_response=ans.improved_response,
            )
            for ans in response.improved_answers
        ]

        score_reasoning = [
            ScoreReasoning(
                dimension=sr.dimension,
                score=max(1, min(10, sr.score)),
                reasoning=sr.reasoning,
                referenced_responses=sr.referenced_responses,
            )
            for sr in response.score_reasoning
        ]

        improvement_suggestions = [
            ImprovementSuggestion(
                dimension=sug.dimension,
                suggestion=sug.suggestion,
                referenced_response=sug.referenced_response,
            )
            for sug in response.improvement_suggestions
        ]

        return FeedbackReport(
            improved_answers=improved_answers,
            follow_up_questions=response.follow_up_questions,
            score_reasoning=score_reasoning,
            improvement_suggestions=improvement_suggestions,
        )

    def _validate_report(self, report: FeedbackReport, num_answered: int) -> None:
        """Validate the structural completeness of the feedback report.

        Checks:
        - Exactly N improved answers (one per answered question)
        - Between 2 and 5 follow-up questions
        - Exactly 4 score reasoning entries (one per dimension)
        - At least 4 improvement suggestions (at least 1 per dimension)

        Raises:
            FeedbackGenerationError: If validation fails.
        """
        errors: list[str] = []

        # Check improved answers count
        if len(report.improved_answers) != num_answered:
            errors.append(
                f"Expected {num_answered} improved answers, "
                f"got {len(report.improved_answers)}."
            )

        # Check follow-up questions count (2-5)
        if not (2 <= len(report.follow_up_questions) <= 5):
            errors.append(
                f"Expected 2-5 follow-up questions, "
                f"got {len(report.follow_up_questions)}."
            )

        # Check score reasoning count (exactly 4)
        if len(report.score_reasoning) != 4:
            errors.append(
                f"Expected exactly 4 score reasoning entries, "
                f"got {len(report.score_reasoning)}."
            )

        # Check improvement suggestions (at least 4, at least 1 per dimension)
        if len(report.improvement_suggestions) < 4:
            errors.append(
                f"Expected at least 4 improvement suggestions, "
                f"got {len(report.improvement_suggestions)}."
            )

        # Check at least 1 suggestion per dimension
        suggestion_dimensions = {
            sug.dimension for sug in report.improvement_suggestions
        }
        missing_dimensions = set(EVALUATION_DIMENSIONS) - suggestion_dimensions
        if missing_dimensions:
            errors.append(
                f"Missing improvement suggestions for dimensions: "
                f"{', '.join(sorted(missing_dimensions))}."
            )

        if errors:
            error_msg = "Feedback report validation failed: " + "; ".join(errors)
            logger.warning(error_msg)
            raise FeedbackGenerationError(error_msg)
