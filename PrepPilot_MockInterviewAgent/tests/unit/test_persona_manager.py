"""Unit tests for PersonaManager."""

import pytest

from prep_pilot.voice.models import InterviewerPersona
from prep_pilot.voice.persona_manager import INTERVIEWER_PERSONAS, PersonaManager


class TestPersonaManager:
    """Tests for PersonaManager class."""

    def setup_method(self):
        self.manager = PersonaManager()

    def test_get_available_personas_returns_all_three(self):
        """get_available_personas returns exactly 3 personas."""
        personas = self.manager.get_available_personas()
        assert len(personas) == 3

    def test_get_available_personas_returns_interviewer_persona_instances(self):
        """All returned personas are InterviewerPersona instances."""
        personas = self.manager.get_available_personas()
        for persona in personas:
            assert isinstance(persona, InterviewerPersona)

    def test_get_available_personas_contains_expected_ids(self):
        """Available personas include professional, friendly, and challenger."""
        personas = self.manager.get_available_personas()
        ids = {p.id for p in personas}
        assert ids == {"professional", "friendly", "challenger"}

    def test_get_persona_professional(self):
        """get_persona returns the professional persona with correct config."""
        persona = self.manager.get_persona("professional")
        assert persona.id == "professional"
        assert persona.name == "Alex"
        assert persona.tts_voice == "alloy"
        assert persona.style == "formal"
        assert persona.difficulty == "moderate"

    def test_get_persona_friendly(self):
        """get_persona returns the friendly persona with correct config."""
        persona = self.manager.get_persona("friendly")
        assert persona.id == "friendly"
        assert persona.name == "Sam"
        assert persona.tts_voice == "nova"
        assert persona.style == "conversational"
        assert persona.difficulty == "easy"

    def test_get_persona_challenger(self):
        """get_persona returns the challenger persona with correct config."""
        persona = self.manager.get_persona("challenger")
        assert persona.id == "challenger"
        assert persona.name == "Morgan"
        assert persona.tts_voice == "onyx"
        assert persona.style == "challenging"
        assert persona.difficulty == "hard"

    def test_get_persona_invalid_id_raises_key_error(self):
        """get_persona raises KeyError for unknown persona ID."""
        with pytest.raises(KeyError, match="not found"):
            self.manager.get_persona("nonexistent")

    def test_get_default_persona_is_professional(self):
        """Default persona is the professional persona (formal/moderate)."""
        default = self.manager.get_default_persona()
        assert default.id == "professional"
        assert default.style == "formal"
        assert default.difficulty == "moderate"

    def test_default_persona_uses_formal_style(self):
        """Default persona uses formal interview style."""
        default = self.manager.get_default_persona()
        assert default.style == "formal"

    def test_default_persona_uses_moderate_difficulty(self):
        """Default persona uses moderate difficulty level."""
        default = self.manager.get_default_persona()
        assert default.difficulty == "moderate"

    def test_each_persona_has_unique_tts_voice(self):
        """Each persona uses a distinct TTS voice identifier."""
        personas = self.manager.get_available_personas()
        voices = [p.tts_voice for p in personas]
        assert len(voices) == len(set(voices))

    def test_each_persona_has_greeting_template(self):
        """Each persona has a non-empty greeting template."""
        personas = self.manager.get_available_personas()
        for persona in personas:
            assert persona.greeting_template
            assert len(persona.greeting_template) > 0

    def test_each_persona_has_question_style_prompt(self):
        """Each persona has a non-empty question style prompt."""
        personas = self.manager.get_available_personas()
        for persona in personas:
            assert persona.question_style_prompt
            assert len(persona.question_style_prompt) > 0

    def test_greeting_template_has_placeholders(self):
        """Greeting templates contain expected format placeholders."""
        personas = self.manager.get_available_personas()
        for persona in personas:
            assert "{name}" in persona.greeting_template
            assert "{mode}" in persona.greeting_template
            assert "{question_count}" in persona.greeting_template


class TestInterviewerPersonasData:
    """Tests for the INTERVIEWER_PERSONAS module-level data."""

    def test_interviewer_personas_is_list(self):
        """INTERVIEWER_PERSONAS is a list."""
        assert isinstance(INTERVIEWER_PERSONAS, list)

    def test_interviewer_personas_has_three_entries(self):
        """INTERVIEWER_PERSONAS contains exactly 3 personas."""
        assert len(INTERVIEWER_PERSONAS) == 3

    def test_all_personas_have_unique_ids(self):
        """All persona IDs are unique."""
        ids = [p.id for p in INTERVIEWER_PERSONAS]
        assert len(ids) == len(set(ids))
