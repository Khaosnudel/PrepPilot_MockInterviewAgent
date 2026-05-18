"""Hypothesis strategies and fixtures for property-based testing.

Provides reusable Hypothesis strategies for generating voice orchestration
domain objects: personas, transcription results, conversation turns,
orchestrator configs, and related models.
"""

from datetime import datetime, timedelta

import pytest
from hypothesis import strategies as st

from prep_pilot.voice.models import (
    ClosingStatement,
    ConversationTurn,
    InterviewerPersona,
    OrchestratorConfig,
    ResponseAssessment,
    TranscriptionResult,
    TurnState,
    VoiceSessionConfig,
    VoiceSessionState,
)
from prep_pilot.voice.persona_manager import INTERVIEWER_PERSONAS


# ---------------------------------------------------------------------------
# Primitive Strategies
# ---------------------------------------------------------------------------

# Confidence scores in valid range [0.0, 1.0]
confidence_scores = st.floats(min_value=0.0, max_value=1.0, allow_nan=False)

# Confidence scores above the acceptance threshold (>= 0.4)
high_confidence_scores = st.floats(min_value=0.4, max_value=1.0, allow_nan=False)

# Confidence scores below the acceptance threshold (< 0.4)
low_confidence_scores = st.floats(
    min_value=0.0, max_value=0.39999, allow_nan=False
)

# Duration values in seconds (positive, bounded)
audio_durations = st.floats(min_value=0.1, max_value=120.0, allow_nan=False)

# Short durations for silence detection testing
silence_durations = st.floats(min_value=0.0, max_value=10.0, allow_nan=False)

# Silence durations that should trigger end-of-turn (>= 2.0s)
end_of_turn_silence = st.floats(min_value=2.0, max_value=10.0, allow_nan=False)

# Silence durations that should NOT trigger end-of-turn (< 2.0s)
non_end_of_turn_silence = st.floats(
    min_value=0.0, max_value=1.999, allow_nan=False
)

# Topic names for conversation context
topic_names = st.sampled_from([
    "leadership",
    "technical_skills",
    "problem_solving",
    "teamwork",
    "communication",
    "project_management",
    "conflict_resolution",
    "adaptability",
    "innovation",
    "mentoring",
])

# TTS voice identifiers
tts_voices = st.sampled_from(["alloy", "nova", "onyx", "echo", "fable", "shimmer"])

# Interview styles
interview_styles = st.sampled_from(["formal", "conversational", "challenging"])

# Difficulty levels
difficulty_levels = st.sampled_from(["easy", "moderate", "hard"])

# Non-empty text strings for questions and responses
question_texts = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=10,
    max_size=200,
).filter(lambda t: t.strip())

response_texts = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=5,
    max_size=500,
).filter(lambda t: t.strip())


# ---------------------------------------------------------------------------
# Composite Strategies: Domain Models
# ---------------------------------------------------------------------------


@st.composite
def transcription_results(draw: st.DrawFn) -> TranscriptionResult:
    """Generate arbitrary TranscriptionResult instances."""
    text = draw(response_texts)
    confidence = draw(confidence_scores)
    has_words = draw(st.booleans())
    duration = draw(audio_durations)
    return TranscriptionResult(
        text=text,
        confidence=confidence,
        has_recognizable_words=has_words,
        duration_seconds=duration,
    )


@st.composite
def valid_transcription_results(draw: st.DrawFn) -> TranscriptionResult:
    """Generate TranscriptionResult with confidence >= 0.4."""
    text = draw(response_texts)
    confidence = draw(high_confidence_scores)
    duration = draw(audio_durations)
    return TranscriptionResult(
        text=text,
        confidence=confidence,
        has_recognizable_words=True,
        duration_seconds=duration,
    )


@st.composite
def low_confidence_transcription_results(draw: st.DrawFn) -> TranscriptionResult:
    """Generate TranscriptionResult with confidence < 0.4."""
    text = draw(response_texts)
    confidence = draw(low_confidence_scores)
    duration = draw(audio_durations)
    return TranscriptionResult(
        text=text,
        confidence=confidence,
        has_recognizable_words=draw(st.booleans()),
        duration_seconds=duration,
    )


@st.composite
def interviewer_personas(draw: st.DrawFn) -> InterviewerPersona:
    """Generate arbitrary InterviewerPersona instances."""
    persona_id = draw(st.text(min_size=3, max_size=20, alphabet="abcdefghijklmnopqrstuvwxyz_"))
    name = draw(st.text(min_size=2, max_size=15, alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"))
    voice = draw(tts_voices)
    style = draw(interview_styles)
    difficulty = draw(difficulty_levels)
    return InterviewerPersona(
        id=persona_id,
        name=name,
        tts_voice=voice,
        style=style,
        difficulty=difficulty,
        greeting_template=f"Hello {{name}}. I'm {name}. This is a {{mode}} interview with {{question_count}} questions.",
        question_style_prompt=f"Ask questions in a {style} tone at {difficulty} difficulty.",
    )


@st.composite
def known_personas(draw: st.DrawFn) -> InterviewerPersona:
    """Select from the predefined INTERVIEWER_PERSONAS list."""
    return draw(st.sampled_from(INTERVIEWER_PERSONAS))


@st.composite
def conversation_turns(draw: st.DrawFn) -> ConversationTurn:
    """Generate arbitrary ConversationTurn instances."""
    return ConversationTurn(
        question_id=draw(st.text(min_size=2, max_size=10, alphabet="abcdefghijklmnopqrstuvwxyz0123456789")),
        question_text=draw(question_texts),
        response_text=draw(response_texts),
        response_confidence=draw(confidence_scores),
        timestamp=draw(st.datetimes(
            min_value=datetime(2024, 1, 1),
            max_value=datetime(2026, 1, 1),
        )),
        topic=draw(topic_names),
        probing_depth=draw(st.integers(min_value=0, max_value=3)),
    )


@st.composite
def conversation_histories(
    draw: st.DrawFn,
    min_turns: int = 1,
    max_turns: int = 10,
) -> list[ConversationTurn]:
    """Generate a list of conversation turns with increasing timestamps."""
    num_turns = draw(st.integers(min_value=min_turns, max_value=max_turns))
    base_time = draw(st.datetimes(
        min_value=datetime(2024, 1, 1),
        max_value=datetime(2025, 12, 1),
    ))
    turns = []
    for i in range(num_turns):
        turn = draw(conversation_turns())
        # Ensure timestamps are ordered
        turn.timestamp = base_time + timedelta(minutes=i * 2)
        turns.append(turn)
    return turns


@st.composite
def orchestrator_configs(draw: st.DrawFn) -> OrchestratorConfig:
    """Generate OrchestratorConfig with valid parameter ranges."""
    return OrchestratorConfig(
        tts_timeout=draw(st.floats(min_value=1.0, max_value=30.0, allow_nan=False)),
        stt_timeout=draw(st.floats(min_value=1.0, max_value=30.0, allow_nan=False)),
        silence_end_of_turn=draw(st.floats(min_value=0.5, max_value=5.0, allow_nan=False)),
        silence_prompt=draw(st.floats(min_value=5.0, max_value=60.0, allow_nan=False)),
        silence_timeout=draw(st.floats(min_value=10.0, max_value=120.0, allow_nan=False)),
        max_recording_duration=draw(st.floats(min_value=30.0, max_value=300.0, allow_nan=False)),
        min_confidence=draw(st.floats(min_value=0.1, max_value=0.9, allow_nan=False)),
        max_retry_attempts=draw(st.integers(min_value=1, max_value=5)),
        followup_timeout=draw(st.floats(min_value=1.0, max_value=10.0, allow_nan=False)),
        max_probing_depth=draw(st.integers(min_value=1, max_value=5)),
        greeting_min_duration=draw(st.floats(min_value=5.0, max_value=15.0, allow_nan=False)),
        greeting_max_duration=draw(st.floats(min_value=20.0, max_value=60.0, allow_nan=False)),
        closing_min_duration=draw(st.floats(min_value=5.0, max_value=15.0, allow_nan=False)),
        closing_max_duration=draw(st.floats(min_value=20.0, max_value=60.0, allow_nan=False)),
        websocket_keepalive_interval=draw(st.floats(min_value=10.0, max_value=60.0, allow_nan=False)),
        websocket_reconnect_timeout=draw(st.floats(min_value=1.0, max_value=10.0, allow_nan=False)),
        websocket_max_reconnect_attempts=draw(st.integers(min_value=1, max_value=5)),
        context_retention_duration=draw(st.floats(min_value=30.0, max_value=300.0, allow_nan=False)),
        max_roundtrip_time=draw(st.floats(min_value=2.0, max_value=15.0, allow_nan=False)),
        turn_transition_delay=draw(st.floats(min_value=0.1, max_value=2.0, allow_nan=False)),
    )


@st.composite
def response_assessments(draw: st.DrawFn) -> ResponseAssessment:
    """Generate arbitrary ResponseAssessment instances."""
    has_example = draw(st.booleans())
    has_result = draw(st.booleans())
    sentence_count = draw(st.integers(min_value=0, max_value=10))
    is_thorough = (has_example or has_result) and sentence_count >= 2
    return ResponseAssessment(
        has_specific_example=has_example,
        has_quantifiable_result=has_result,
        sentence_count=sentence_count,
        is_thorough=is_thorough,
    )


@st.composite
def thorough_response_assessments(draw: st.DrawFn) -> ResponseAssessment:
    """Generate ResponseAssessment that meets thoroughness criteria."""
    has_example = draw(st.booleans())
    has_result = draw(st.booleans())
    # Ensure at least one of example or result is present
    if not has_example and not has_result:
        has_example = True
    sentence_count = draw(st.integers(min_value=2, max_value=10))
    return ResponseAssessment(
        has_specific_example=has_example,
        has_quantifiable_result=has_result,
        sentence_count=sentence_count,
        is_thorough=True,
    )


@st.composite
def insufficient_response_assessments(draw: st.DrawFn) -> ResponseAssessment:
    """Generate ResponseAssessment that does NOT meet thoroughness criteria."""
    # Either no example/result, or fewer than 2 sentences
    choice = draw(st.integers(min_value=0, max_value=2))
    if choice == 0:
        # No example and no result
        has_example = False
        has_result = False
        sentence_count = draw(st.integers(min_value=0, max_value=10))
    elif choice == 1:
        # Has example/result but fewer than 2 sentences
        has_example = draw(st.booleans())
        has_result = not has_example or draw(st.booleans())
        sentence_count = draw(st.integers(min_value=0, max_value=1))
    else:
        # Neither condition met
        has_example = False
        has_result = False
        sentence_count = draw(st.integers(min_value=0, max_value=1))
    return ResponseAssessment(
        has_specific_example=has_example,
        has_quantifiable_result=has_result,
        sentence_count=sentence_count,
        is_thorough=False,
    )


@st.composite
def turn_states(draw: st.DrawFn) -> TurnState:
    """Generate arbitrary TurnState enum values."""
    return draw(st.sampled_from(list(TurnState)))


@st.composite
def closing_statements(draw: st.DrawFn) -> ClosingStatement:
    """Generate arbitrary ClosingStatement instances."""
    topics = draw(st.lists(topic_names, min_size=2, max_size=5, unique=True))
    return ClosingStatement(
        text=draw(st.text(min_size=50, max_size=300).filter(lambda t: t.strip())),
        topics_referenced=topics,
        acknowledgment=draw(st.sampled_from([
            "Thanks for your time today.",
            "It was great speaking with you.",
            "I appreciate you sharing those experiences.",
            "Thank you for the thoughtful responses.",
        ])),
        sign_off=draw(st.sampled_from([
            "Best of luck with your preparation!",
            "Good luck with your interviews!",
            "Wishing you all the best!",
            "Take care and good luck!",
        ])),
        duration_estimate=draw(st.floats(min_value=10.0, max_value=30.0, allow_nan=False)),
    )


@st.composite
def voice_session_configs(draw: st.DrawFn) -> VoiceSessionConfig:
    """Generate arbitrary VoiceSessionConfig instances."""
    return VoiceSessionConfig(
        session_id=draw(st.text(min_size=8, max_size=32, alphabet="abcdefghijklmnopqrstuvwxyz0123456789")),
        persona_id=draw(st.one_of(
            st.none(),
            st.sampled_from(["professional", "friendly", "challenger"]),
        )),
        question_count=draw(st.integers(min_value=5, max_value=20)),
    )
