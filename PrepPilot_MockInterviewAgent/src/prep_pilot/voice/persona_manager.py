"""Manages interviewer persona configurations for voice sessions."""

from prep_pilot.voice.models import InterviewerPersona


INTERVIEWER_PERSONAS: list[InterviewerPersona] = [
    InterviewerPersona(
        id="professional",
        name="Alex",
        tts_voice="alloy",
        style="formal",
        difficulty="moderate",
        greeting_template=(
            "Good day, {name}. I'm Alex, and I'll be conducting your {mode} "
            "interview today. We have approximately {question_count} questions "
            "prepared. Shall we begin?"
        ),
        question_style_prompt=(
            "Ask questions in a professional, formal tone. Use precise language "
            "and expect structured, detailed answers."
        ),
    ),
    InterviewerPersona(
        id="friendly",
        name="Sam",
        tts_voice="nova",
        style="conversational",
        difficulty="easy",
        greeting_template=(
            "Hey {name}! I'm Sam. Welcome to your {mode} practice session. "
            "We've got about {question_count} questions lined up, but don't "
            "worry — just think of this as a friendly chat. Ready when you are!"
        ),
        question_style_prompt=(
            "Ask questions in a warm, conversational tone. Use casual language "
            "and encourage the candidate to share stories naturally."
        ),
    ),
    InterviewerPersona(
        id="challenger",
        name="Morgan",
        tts_voice="onyx",
        style="challenging",
        difficulty="hard",
        greeting_template=(
            "Hello {name}. I'm Morgan. This will be a rigorous {mode} interview "
            "with {question_count} questions. I'll be looking for depth, specifics, "
            "and evidence of impact. Let's begin."
        ),
        question_style_prompt=(
            "Ask probing, challenging questions. Push for specifics, metrics, and "
            "evidence. Use a direct, no-nonsense tone that tests the candidate's "
            "composure."
        ),
    ),
]


class PersonaManager:
    """Manages available interviewer personas."""

    def __init__(self) -> None:
        self._personas: dict[str, InterviewerPersona] = {
            persona.id: persona for persona in INTERVIEWER_PERSONAS
        }

    def get_available_personas(self) -> list[InterviewerPersona]:
        """Return all available interviewer personas."""
        return list(self._personas.values())

    def get_persona(self, persona_id: str) -> InterviewerPersona:
        """Return a specific persona by ID.

        Args:
            persona_id: The unique identifier of the persona.

        Returns:
            The matching InterviewerPersona.

        Raises:
            KeyError: If no persona with the given ID exists.
        """
        if persona_id not in self._personas:
            available = ", ".join(self._personas.keys())
            raise KeyError(
                f"Persona '{persona_id}' not found. "
                f"Available personas: {available}"
            )
        return self._personas[persona_id]

    def get_default_persona(self) -> InterviewerPersona:
        """Return the default persona (formal style, moderate difficulty)."""
        return self._personas["professional"]
