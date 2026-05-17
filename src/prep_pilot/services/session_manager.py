"""Session Manager - Orchestrates interview flow and maintains session state."""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional, Protocol

from prep_pilot.models.domain import (
    InterviewMode,
    InterviewQuestion,
    InterviewSession,
    ParsedJobDescription,
    ParsedResume,
    QuestionResponse,
    SessionResults,
    SessionStatus,
)

logger = logging.getLogger(__name__)


class SessionManagerError(Exception):
    """Base exception for session manager errors."""


class SessionNotFoundError(SessionManagerError):
    """Raised when a session ID does not exist in the store."""


class InvalidStateError(SessionManagerError):
    """Raised when an operation is attempted in an invalid session state."""


class NextActionType(Enum):
    """Indicates what the client should do next after submitting a response."""

    NEXT_QUESTION = "next_question"
    CONCLUDE = "conclude"


@dataclass
class NextAction:
    """Result of submitting a response, indicating the next step."""

    action: NextActionType
    question: Optional[InterviewQuestion] = None
    closing_message: Optional[str] = None


class QuestionGeneratorProtocol(Protocol):
    """Protocol for the question generator dependency."""

    async def generate_open_practice(
        self, role: str, resume: ParsedResume, count: int
    ) -> list[InterviewQuestion]: ...

    async def generate_job_specific(
        self, resume: ParsedResume, job_description: ParsedJobDescription
    ) -> list[InterviewQuestion]: ...


class EvaluationEngineProtocol(Protocol):
    """Protocol for the evaluation engine dependency."""

    async def evaluate_readiness(
        self, questions: list[InterviewQuestion], responses: list[str], resume: ParsedResume
    ) -> object: ...

    async def evaluate_resume_relevancy(
        self, questions: list[InterviewQuestion], responses: list[str], resume: ParsedResume
    ) -> object: ...


class FeedbackGeneratorProtocol(Protocol):
    """Protocol for the feedback generator dependency."""

    async def generate(self, session: InterviewSession) -> object: ...


# Valid state transitions map: current_state -> set of allowed next states
_VALID_TRANSITIONS: dict[SessionStatus, set[SessionStatus]] = {
    SessionStatus.AWAITING_RESUME: {SessionStatus.AWAITING_MODE_SELECTION},
    SessionStatus.AWAITING_MODE_SELECTION: {
        SessionStatus.IN_PROGRESS,
        SessionStatus.AWAITING_JOB_DESCRIPTION,
    },
    SessionStatus.AWAITING_JOB_DESCRIPTION: {SessionStatus.IN_PROGRESS},
    SessionStatus.IN_PROGRESS: {SessionStatus.CONCLUDED},
    SessionStatus.CONCLUDED: set(),
}

# Minimum responses required for scoring
MIN_RESPONSES_FOR_SCORING = 3


class SessionManager:
    """Orchestrates the interview session lifecycle and maintains state.

    Manages session creation, state transitions, response submission,
    and session conclusion. Uses an in-memory dict-based session store.

    Args:
        question_generator: Service for generating interview questions.
        evaluation_engine: Service for evaluating interview responses (optional).
        feedback_generator: Service for generating feedback reports (optional).
    """

    def __init__(
        self,
        question_generator: Optional[QuestionGeneratorProtocol] = None,
        evaluation_engine: Optional[EvaluationEngineProtocol] = None,
        feedback_generator: Optional[FeedbackGeneratorProtocol] = None,
    ) -> None:
        self._question_generator = question_generator
        self._evaluation_engine = evaluation_engine
        self._feedback_generator = feedback_generator
        self._sessions: dict[str, InterviewSession] = {}

    async def create_session(self) -> InterviewSession:
        """Create a new interview session in AWAITING_RESUME state.

        Returns:
            A new InterviewSession with a unique ID and initial state.
        """
        session_id = str(uuid.uuid4())
        session = InterviewSession(
            id=session_id,
            mode=InterviewMode.OPEN_PRACTICE,  # Default, will be set during mode selection
            status=SessionStatus.AWAITING_RESUME,
            resume=ParsedResume(skills=[], experiences=[], qualifications=[], raw_text=""),
        )
        self._sessions[session_id] = session
        logger.info("Created session %s", session_id)
        return session

    async def upload_resume(
        self, session_id: str, resume: ParsedResume
    ) -> InterviewSession:
        """Upload a parsed resume to the session.

        Transitions the session from AWAITING_RESUME to AWAITING_MODE_SELECTION.

        Args:
            session_id: The session identifier.
            resume: The parsed resume data.

        Returns:
            The updated InterviewSession.

        Raises:
            SessionNotFoundError: If the session does not exist.
            InvalidStateError: If the session is not in AWAITING_RESUME state.
        """
        session = self._get_session(session_id)
        self._validate_state(session, SessionStatus.AWAITING_RESUME)

        session.resume = resume
        session.status = SessionStatus.AWAITING_MODE_SELECTION
        logger.info("Session %s: resume uploaded, now AWAITING_MODE_SELECTION", session_id)
        return session

    async def select_mode(
        self,
        session_id: str,
        mode: InterviewMode,
        role: Optional[str] = None,
    ) -> InterviewSession:
        """Select the interview mode for the session.

        For OPEN_PRACTICE mode, a role must be provided and questions are
        generated immediately, transitioning to IN_PROGRESS.

        For JOB_SPECIFIC mode, transitions to AWAITING_JOB_DESCRIPTION.

        Args:
            session_id: The session identifier.
            mode: The interview mode to use.
            role: The target role (required for open_practice mode).

        Returns:
            The updated InterviewSession.

        Raises:
            SessionNotFoundError: If the session does not exist.
            InvalidStateError: If the session is not in AWAITING_MODE_SELECTION state.
            SessionManagerError: If open_practice mode is selected without a role.
        """
        session = self._get_session(session_id)
        self._validate_state(session, SessionStatus.AWAITING_MODE_SELECTION)

        session.mode = mode

        if mode == InterviewMode.OPEN_PRACTICE:
            if not role:
                raise SessionManagerError(
                    "A role must be specified for open practice mode."
                )
            session.selected_role = role

            # Generate initial questions (reduced count for faster startup)
            # The conversational follow-up system will handle the rest dynamically
            if self._question_generator:
                questions = await self._question_generator.generate_open_practice(
                    role=role, resume=session.resume, count=10
                )
                session.questions = questions

            session.status = SessionStatus.IN_PROGRESS
            logger.info(
                "Session %s: open practice mode selected (role=%s), now IN_PROGRESS",
                session_id,
                role,
            )
        elif mode == InterviewMode.JOB_SPECIFIC:
            session.status = SessionStatus.AWAITING_JOB_DESCRIPTION
            logger.info(
                "Session %s: job specific mode selected, now AWAITING_JOB_DESCRIPTION",
                session_id,
            )

        return session

    async def upload_job_description(
        self, session_id: str, jd: ParsedJobDescription
    ) -> InterviewSession:
        """Upload a parsed job description and transition to IN_PROGRESS.

        Generates job-specific questions based on the resume and JD.

        Args:
            session_id: The session identifier.
            jd: The parsed job description data.

        Returns:
            The updated InterviewSession.

        Raises:
            SessionNotFoundError: If the session does not exist.
            InvalidStateError: If the session is not in AWAITING_JOB_DESCRIPTION state.
        """
        session = self._get_session(session_id)
        self._validate_state(session, SessionStatus.AWAITING_JOB_DESCRIPTION)

        session.job_description = jd

        # Generate questions if question generator is available
        if self._question_generator:
            questions = await self._question_generator.generate_job_specific(
                resume=session.resume, job_description=jd
            )
            session.questions = questions

        session.status = SessionStatus.IN_PROGRESS
        logger.info(
            "Session %s: job description uploaded, now IN_PROGRESS", session_id
        )
        return session

    async def get_current_question(
        self, session_id: str
    ) -> InterviewQuestion:
        """Get the current question for the session.

        Args:
            session_id: The session identifier.

        Returns:
            The current InterviewQuestion.

        Raises:
            SessionNotFoundError: If the session does not exist.
            InvalidStateError: If the session is not IN_PROGRESS.
            SessionManagerError: If no questions are available or all have been answered.
        """
        session = self._get_session(session_id)
        self._validate_state(session, SessionStatus.IN_PROGRESS)

        if not session.questions:
            raise SessionManagerError("No questions available for this session.")

        if session.current_question_index >= len(session.questions):
            raise SessionManagerError(
                "All questions have been answered. Conclude the session."
            )

        return session.questions[session.current_question_index]

    async def submit_response(
        self, session_id: str, response_text: str, input_mode: str = "text"
    ) -> NextAction:
        """Submit a response to the current question.

        Records the response, advances the question index, and determines
        the next action. If all questions have been answered, transitions
        the session to CONCLUDED.

        Args:
            session_id: The session identifier.
            response_text: The user's response text.
            input_mode: How the response was provided ("text" or "voice").

        Returns:
            A NextAction indicating whether to proceed to the next question
            or conclude the session.

        Raises:
            SessionNotFoundError: If the session does not exist.
            InvalidStateError: If the session is not IN_PROGRESS.
            SessionManagerError: If no questions are available.
        """
        session = self._get_session(session_id)
        self._validate_state(session, SessionStatus.IN_PROGRESS)

        if not session.questions:
            raise SessionManagerError("No questions available for this session.")

        if session.current_question_index >= len(session.questions):
            raise SessionManagerError(
                "All questions have already been answered."
            )

        # Record the response
        current_question = session.questions[session.current_question_index]
        question_response = QuestionResponse(
            question=current_question,
            response_text=response_text,
            response_timestamp=datetime.now(),
            input_mode=input_mode,
        )
        session.responses.append(question_response)

        # Advance the question index
        session.current_question_index += 1

        # Check if all questions have been answered
        if session.current_question_index >= len(session.questions):
            session.status = SessionStatus.CONCLUDED
            logger.info(
                "Session %s: all questions answered, now CONCLUDED", session_id
            )

            # Generate a natural conversational close
            closing_message = await self._generate_closing(session)
            return NextAction(
                action=NextActionType.CONCLUDE,
                closing_message=closing_message,
            )

        # Generate a conversational follow-up question based on the dialogue so far
        if self._question_generator and len(session.responses) > 0:
            try:
                remaining = session.questions[session.current_question_index:]
                followup = await self._question_generator.generate_followup(
                    resume=session.resume,
                    conversation_history=session.responses,
                    remaining_topics=remaining,
                    role=session.selected_role,
                    job_description=session.job_description,
                )
                # Replace the next pre-generated question with the conversational one
                session.questions[session.current_question_index] = followup
                next_question = followup
            except Exception as exc:
                logger.warning(
                    "Conversational follow-up failed, using pre-generated: %s", exc
                )
                next_question = session.questions[session.current_question_index]
        else:
            next_question = session.questions[session.current_question_index]

        return NextAction(
            action=NextActionType.NEXT_QUESTION, question=next_question
        )

    async def conclude_session(self, session_id: str) -> SessionResults:
        """Conclude the session and generate evaluation results.

        Triggers evaluation and feedback generation if sufficient responses
        exist. Sessions with < 3 responses get no readiness score.
        Sessions with 0 responses get no feedback report.

        Args:
            session_id: The session identifier.

        Returns:
            SessionResults with evaluation scores and feedback (or None if
            insufficient responses).

        Raises:
            SessionNotFoundError: If the session does not exist.
            InvalidStateError: If the session is not CONCLUDED.
        """
        session = self._get_session(session_id)
        self._validate_state(session, SessionStatus.CONCLUDED)

        num_responses = len(session.responses)

        # No responses: no evaluation or feedback
        if num_responses == 0:
            logger.info(
                "Session %s: 0 responses, skipping all evaluation", session_id
            )
            return SessionResults(
                readiness_score=None,
                resume_relevancy=None,
                feedback_report=None,
                insufficient_responses=True,
            )

        # Fewer than MIN_RESPONSES_FOR_SCORING: no scoring, but feedback is possible
        if num_responses < MIN_RESPONSES_FOR_SCORING:
            logger.info(
                "Session %s: %d responses (< %d), skipping scoring",
                session_id,
                num_responses,
                MIN_RESPONSES_FOR_SCORING,
            )
            feedback_report = None
            if self._feedback_generator:
                feedback_report = await self._feedback_generator.generate(session)

            return SessionResults(
                readiness_score=None,
                resume_relevancy=None,
                feedback_report=feedback_report,
                insufficient_responses=True,
            )

        # Sufficient responses: full evaluation
        readiness_score = None
        resume_relevancy = None
        feedback_report = None

        response_texts = [r.response_text for r in session.responses]
        answered_questions = [r.question for r in session.responses]

        if self._evaluation_engine:
            readiness_score = await self._evaluation_engine.evaluate_readiness(
                questions=answered_questions,
                responses=response_texts,
                resume=session.resume,
            )
            resume_relevancy = await self._evaluation_engine.evaluate_resume_relevancy(
                questions=answered_questions,
                responses=response_texts,
                resume=session.resume,
            )

        if self._feedback_generator:
            feedback_report = await self._feedback_generator.generate(session)

        logger.info("Session %s: evaluation complete", session_id)
        return SessionResults(
            readiness_score=readiness_score,
            resume_relevancy=resume_relevancy,
            feedback_report=feedback_report,
            insufficient_responses=False,
        )

    async def _generate_closing(self, session: InterviewSession) -> str:
        """Generate a natural conversational closing for the interview.

        References the candidate's responses to create a warm, personalized
        sign-off that feels like a real interviewer wrapping up.

        Args:
            session: The concluded interview session.

        Returns:
            A natural closing message string.
        """
        if not self._question_generator:
            return (
                "Thank you so much for your time today. You gave some really "
                "thoughtful answers, and I enjoyed our conversation. I'm going "
                "to review everything and put together your evaluation now. "
                "You'll have your results in just a moment."
            )

        # Build a brief summary of what was discussed
        topics_discussed = []
        for qr in session.responses[-3:]:  # Reference last few answers
            snippet = qr.response_text[:80]
            topics_discussed.append(snippet)

        context = "; ".join(topics_discussed) if topics_discussed else "various topics"

        system_prompt = (
            "You are an expert interviewer wrapping up a mock interview session. "
            "Generate a brief, warm, natural closing statement (2-3 sentences). "
            "Reference something specific from the conversation to make it personal. "
            "Let them know their evaluation is coming. Keep it professional but friendly. "
            "Do NOT use bullet points or formatting — just natural speech."
        )

        user_prompt = (
            f"The candidate just finished answering {len(session.responses)} questions "
            f"for a {session.selected_role or 'general'} role interview. "
            f"Recent topics they discussed: {context}. "
            f"Generate a natural closing statement."
        )

        try:
            closing = await self._question_generator._llm_client.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
            )
            return closing.strip() if closing.strip() else self._default_closing()
        except Exception as exc:
            logger.warning("Failed to generate closing: %s", exc)
            return self._default_closing()

    @staticmethod
    def _default_closing() -> str:
        """Return a default closing message when LLM generation fails."""
        return (
            "Thank you so much for your time today. You gave some really "
            "thoughtful answers, and I enjoyed our conversation. I'm going "
            "to review everything and put together your evaluation now. "
            "You'll have your results in just a moment."
        )

    def get_session(self, session_id: str) -> InterviewSession:
        """Get a session by ID (public accessor).

        Args:
            session_id: The session identifier.

        Returns:
            The InterviewSession.

        Raises:
            SessionNotFoundError: If the session does not exist.
        """
        return self._get_session(session_id)

    def _get_session(self, session_id: str) -> InterviewSession:
        """Retrieve a session from the store.

        Args:
            session_id: The session identifier.

        Returns:
            The InterviewSession.

        Raises:
            SessionNotFoundError: If the session does not exist.
        """
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionNotFoundError(
                f"Session not found: {session_id}"
            )
        return session

    def _validate_state(
        self, session: InterviewSession, expected_status: SessionStatus
    ) -> None:
        """Validate that the session is in the expected state.

        Args:
            session: The session to validate.
            expected_status: The required status for the operation.

        Raises:
            InvalidStateError: If the session is not in the expected state.
        """
        if session.status != expected_status:
            raise InvalidStateError(
                f"Operation requires session status '{expected_status.value}', "
                f"but session '{session.id}' is in status '{session.status.value}'."
            )
