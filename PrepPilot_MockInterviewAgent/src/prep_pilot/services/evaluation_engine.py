"""Evaluation Engine - Scores interview responses across multiple dimensions."""

import logging
from typing import Optional

from pydantic import BaseModel, Field

from prep_pilot.models.domain import (
    InterviewQuestion,
    InterviewReadinessScore,
    ParsedResume,
    QuestionRelevancyDetail,
    ResumeRelevancyResult,
)
from prep_pilot.services.llm_client import LLMClient, LLMClientError
from prep_pilot.services.prompt_manager import PromptManager

logger = logging.getLogger(__name__)

# Minimum responses required for readiness evaluation
MIN_RESPONSES_FOR_EVALUATION = 3

# Default score when no comparable claims exist
DEFAULT_NO_CLAIMS_SCORE = 5


class EvaluationError(Exception):
    """Raised when evaluation fails."""


# Alias for backward compatibility with __init__.py exports
EvaluationEngineError = EvaluationError


# --- Pydantic schemas for LLM structured output ---


class DimensionScore(BaseModel):
    """A score for a single evaluation dimension."""

    dimension: str = Field(description="The evaluation dimension name")
    score: int = Field(description="Score from 1 to 10")
    reasoning: str = Field(description="Explanation of the score")


class DimensionEvaluationResponse(BaseModel):
    """LLM response schema for a single dimension evaluation."""

    score: int = Field(description="Score from 1 to 10")
    reasoning: str = Field(description="Explanation of the score")


class QuestionRelevancyDetailResponse(BaseModel):
    """LLM response schema for per-question resume relevancy detail."""

    question_id: str = Field(description="The question identifier")
    supported_claims: list[str] = Field(
        description="Claims in the response that are supported by the resume"
    )
    unsupported_claims: list[str] = Field(
        description="Claims in the response that are not found in the resume"
    )
    reasoning: str = Field(
        description="Explanation of the alignment assessment"
    )


class ResumeRelevancyResponse(BaseModel):
    """LLM response schema for resume relevancy evaluation."""

    score: int = Field(description="Overall resume relevancy score from 1 to 10")
    per_question_reasoning: list[QuestionRelevancyDetailResponse] = Field(
        description="Per-question reasoning with supported and unsupported claims"
    )


class EvaluationEngine:
    """Scores interview responses across multiple dimensions.

    Provides two main evaluation methods:
    - evaluate_readiness: Scores across 4 dimensions (clarity, technical accuracy,
      STAR method, relevancy)
    - evaluate_resume_relevancy: Scores alignment between responses and resume content

    Args:
        llm_client: An instance of LLMClient for evaluation calls.
        prompt_manager: An instance of PromptManager for prompt templates.
    """

    def __init__(self, llm_client: LLMClient, prompt_manager: PromptManager) -> None:
        self._llm_client = llm_client
        self._prompt_manager = prompt_manager

    async def evaluate_readiness(
        self,
        questions: list[InterviewQuestion],
        responses: list[str],
        resume: ParsedResume,
    ) -> Optional[InterviewReadinessScore]:
        """Evaluate interview performance across 4 dimensions.

        Scores clarity_of_communication, technical_accuracy, star_method_adherence,
        and overall_response_relevancy. Each score is an integer in [1, 10].

        Args:
            questions: List of interview questions asked.
            responses: List of candidate response texts (parallel to questions).
            resume: Parsed resume for context.

        Returns:
            An InterviewReadinessScore with all four dimension scores,
            or None if insufficient responses (fewer than 3).

        Raises:
            EvaluationError: If evaluation fails due to LLM errors.
        """
        if len(responses) < MIN_RESPONSES_FOR_EVALUATION:
            logger.info(
                "Insufficient responses (%d) for readiness evaluation. "
                "Minimum %d required.",
                len(responses),
                MIN_RESPONSES_FOR_EVALUATION,
            )
            return None

        dimensions = [
            "clarity",
            "technical_accuracy",
            "star_method",
            "relevancy",
        ]

        scores: dict[str, int] = {}

        for dimension in dimensions:
            dimension_scores: list[int] = []

            for question, response in zip(questions, responses):
                system_prompt, user_prompt = (
                    self._prompt_manager.get_evaluation_prompt(
                        dimension=dimension,
                        question=question.text,
                        response=response,
                        resume=resume,
                    )
                )

                try:
                    result = await self._llm_client.generate_structured(
                        prompt=user_prompt,
                        system_prompt=system_prompt,
                        schema=DimensionEvaluationResponse,
                    )
                    # Clamp score to [1, 10]
                    score = max(1, min(10, result.score))
                    dimension_scores.append(score)
                except LLMClientError as exc:
                    logger.error(
                        "LLM evaluation failed for dimension '%s': %s",
                        dimension,
                        exc,
                    )
                    raise EvaluationError(
                        f"Failed to evaluate dimension '{dimension}'. "
                        "Please try again later."
                    ) from exc

            # Average the per-question scores for this dimension
            avg_score = round(sum(dimension_scores) / len(dimension_scores))
            avg_score = max(1, min(10, avg_score))
            scores[dimension] = avg_score

        return InterviewReadinessScore(
            clarity_of_communication=scores["clarity"],
            technical_accuracy=scores["technical_accuracy"],
            star_method_adherence=scores["star_method"],
            overall_response_relevancy=scores["relevancy"],
        )

    async def evaluate_resume_relevancy(
        self,
        questions: list[InterviewQuestion],
        responses: list[str],
        resume: ParsedResume,
    ) -> ResumeRelevancyResult:
        """Score alignment between interview responses and resume content.

        Evaluates each response to identify claims that are supported or
        unsupported by the resume. Generates per-question reasoning with
        supported_claims and unsupported_claims lists.

        If no comparable claims exist across all responses, assigns a default
        score of 5.

        Args:
            questions: List of interview questions asked.
            responses: List of candidate response texts (parallel to questions).
            resume: Parsed resume for comparison.

        Returns:
            A ResumeRelevancyResult with score (1-10) and per_question_reasoning.

        Raises:
            EvaluationError: If evaluation fails due to LLM errors.
        """
        # Handle edge case: no questions/responses
        if not questions or not responses:
            return ResumeRelevancyResult(
                score=DEFAULT_NO_CLAIMS_SCORE,
                per_question_reasoning=[],
            )

        system_prompt, user_prompt = (
            self._prompt_manager.get_resume_relevancy_prompt(
                questions=questions,
                responses=responses,
                resume=resume,
            )
        )

        try:
            result = await self._llm_client.generate_structured(
                prompt=user_prompt,
                system_prompt=system_prompt,
                schema=ResumeRelevancyResponse,
            )
        except LLMClientError as exc:
            logger.error("LLM resume relevancy evaluation failed: %s", exc)
            raise EvaluationError(
                "Failed to evaluate resume relevancy. Please try again later."
            ) from exc

        # Check if no comparable claims exist
        has_comparable_claims = any(
            detail.supported_claims or detail.unsupported_claims
            for detail in result.per_question_reasoning
        )

        if not has_comparable_claims:
            score = DEFAULT_NO_CLAIMS_SCORE
        else:
            # Clamp score to [1, 10]
            score = max(1, min(10, result.score))

        # Convert Pydantic response to domain dataclass
        per_question_reasoning: list[QuestionRelevancyDetail] = []
        for detail in result.per_question_reasoning:
            per_question_reasoning.append(
                QuestionRelevancyDetail(
                    question_id=detail.question_id,
                    supported_claims=detail.supported_claims,
                    unsupported_claims=detail.unsupported_claims,
                    reasoning=detail.reasoning,
                )
            )

        return ResumeRelevancyResult(
            score=score,
            per_question_reasoning=per_question_reasoning,
        )
