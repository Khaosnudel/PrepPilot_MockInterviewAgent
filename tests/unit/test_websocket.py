"""Unit tests for the WebSocket voice interaction handler."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocket

from prep_pilot.api.websocket import (
    VoiceWebSocketHandler,
    ws_router,
    set_voice_dependencies,
)
from prep_pilot.models.domain import (
    InterviewMode,
    InterviewQuestion,
    InterviewSession,
    ParsedResume,
    SessionStatus,
    TranscriptionResult,
)
from prep_pilot.services.session_manager import (
    InvalidStateError,
    NextAction,
    NextActionType,
    SessionManager,
    SessionNotFoundError,
)
from prep_pilot.services.voice_service import (
    AudioDurationError,
    UnrecognizableAudioError,
    VoiceService,
    VoiceUnavailableError,
)


# --- Fixtures ---


@pytest.fixture
def mock_session_manager():
    """Create a mock SessionManager."""
    manager = MagicMock(spec=SessionManager)
    manager.get_session = MagicMock()
    manager.get_current_question = AsyncMock()
    manager.submit_response = AsyncMock()
    return manager


@pytest.fixture
def mock_voice_service():
    """Create a mock VoiceService."""
    service = MagicMock(spec=VoiceService)
    service.transcribe = AsyncMock()
    service.synthesize = AsyncMock()
    return service


@pytest.fixture
def sample_session():
    """Create a sample in-progress session."""
    return InterviewSession(
        id="test-session-123",
        mode=InterviewMode.OPEN_PRACTICE,
        status=SessionStatus.IN_PROGRESS,
        resume=ParsedResume(
            skills=["Python"], experiences=[], qualifications=[], raw_text=""
        ),
        questions=[
            InterviewQuestion(
                id="q1", text="Tell me about Python.", category="technical"
            ),
            InterviewQuestion(
                id="q2", text="Describe a challenge.", category="behavioral"
            ),
        ],
        current_question_index=0,
    )


@pytest.fixture
def sample_question():
    """Create a sample interview question."""
    return InterviewQuestion(
        id="q1", text="Tell me about Python.", category="technical"
    )


@pytest.fixture
def app(mock_session_manager, mock_voice_service):
    """Create a FastAPI app with the WebSocket router for testing."""
    app = FastAPI()
    app.include_router(ws_router)
    set_voice_dependencies(mock_session_manager, mock_voice_service)
    return app


# --- Tests ---


class TestWebSocketSessionValidation:
    """Tests for session validation on WebSocket connection."""

    def test_rejects_connection_for_nonexistent_session(
        self, app, mock_session_manager
    ):
        """WebSocket should close with 4004 if session not found."""
        mock_session_manager.get_session.side_effect = SessionNotFoundError(
            "Session not found"
        )

        client = TestClient(app)
        with pytest.raises(Exception):
            with client.websocket_connect("/sessions/bad-id/voice"):
                pass

    def test_rejects_connection_for_non_in_progress_session(
        self, app, mock_session_manager
    ):
        """WebSocket should close with 4022 if session is not IN_PROGRESS."""
        session = InterviewSession(
            id="test-session",
            mode=InterviewMode.OPEN_PRACTICE,
            status=SessionStatus.CONCLUDED,
            resume=ParsedResume(
                skills=[], experiences=[], qualifications=[], raw_text=""
            ),
        )
        mock_session_manager.get_session.return_value = session

        client = TestClient(app)
        with pytest.raises(Exception):
            with client.websocket_connect("/sessions/test-session/voice"):
                pass

    def test_accepts_connection_for_in_progress_session(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """WebSocket should accept connection for valid IN_PROGRESS session."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"fake-audio"

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            # Should receive current question as first message
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "current_question"
            assert data["question_id"] == "q1"
            assert data["question_text"] == "Tell me about Python."

            # Should also receive synthesized audio
            audio = ws.receive_bytes()
            assert audio == b"fake-audio"


class TestWebSocketAudioProcessing:
    """Tests for audio processing through the WebSocket."""

    def test_successful_audio_transcription_and_next_question(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """Full flow: audio → transcription → submit → next question → audio response."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question

        next_question = InterviewQuestion(
            id="q2", text="Describe a challenge.", category="behavioral"
        )
        mock_session_manager.submit_response.return_value = NextAction(
            action=NextActionType.NEXT_QUESTION, question=next_question
        )

        mock_voice_service.transcribe.return_value = TranscriptionResult(
            text="I have 5 years of Python experience.",
            confidence=0.9,
            has_recognizable_words=True,
        )
        mock_voice_service.synthesize.return_value = b"synthesized-audio"

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            # Receive initial question (text + audio)
            ws.receive_text()  # current_question
            ws.receive_bytes()  # audio

            # Send audio metadata
            ws.send_text(json.dumps({"type": "audio_metadata", "duration": 5.0}))
            # Send audio binary
            ws.send_bytes(b"fake-audio-data")

            # Receive transcription confirmation
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "transcription"
            assert data["text"] == "I have 5 years of Python experience."
            assert data["confidence"] == 0.9

            # Receive next question
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "next_question"
            assert data["question_id"] == "q2"
            assert data["question_text"] == "Describe a challenge."

            # Receive synthesized audio for next question
            audio = ws.receive_bytes()
            assert audio == b"synthesized-audio"

    def test_session_concludes_after_last_question(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """When all questions answered, session concludes and connection closes."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question

        mock_session_manager.submit_response.return_value = NextAction(
            action=NextActionType.CONCLUDE
        )

        mock_voice_service.transcribe.return_value = TranscriptionResult(
            text="My answer.",
            confidence=0.85,
            has_recognizable_words=True,
        )
        mock_voice_service.synthesize.return_value = b"conclusion-audio"

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            # Receive initial question
            ws.receive_text()
            ws.receive_bytes()

            # Send audio
            ws.send_text(json.dumps({"type": "audio_metadata", "duration": 3.0}))
            ws.send_bytes(b"audio-data")

            # Receive transcription
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "transcription"

            # Receive conclusion message
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "session_concluded"

            # Receive conclusion audio
            audio = ws.receive_bytes()
            assert audio == b"conclusion-audio"


class TestWebSocketErrorHandling:
    """Tests for error handling in the WebSocket handler."""

    def test_audio_duration_exceeded_error(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """AudioDurationError should send error and not disconnect."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"audio"

        mock_voice_service.transcribe.side_effect = AudioDurationError(
            "Audio duration exceeds 120 seconds."
        )

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            # Receive initial question
            ws.receive_text()
            ws.receive_bytes()

            # Send audio that's too long
            ws.send_text(json.dumps({"type": "audio_metadata", "duration": 150.0}))
            ws.send_bytes(b"long-audio")

            # Receive error
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "error"
            assert data["error_code"] == "audio_duration_exceeded"

    def test_unrecognizable_audio_error(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """UnrecognizableAudioError should ask user to repeat."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"audio"

        mock_voice_service.transcribe.side_effect = UnrecognizableAudioError(
            "Your input could not be understood."
        )

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            ws.receive_text()
            ws.receive_bytes()

            ws.send_text(json.dumps({"type": "audio_metadata", "duration": 2.0}))
            ws.send_bytes(b"noise")

            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "error"
            assert data["error_code"] == "unrecognizable_audio"

    def test_voice_unavailable_suggests_text_mode(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """VoiceUnavailableError should suggest switching to text mode."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"audio"

        mock_voice_service.transcribe.side_effect = VoiceUnavailableError(
            "Voice service is currently unavailable."
        )

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            ws.receive_text()
            ws.receive_bytes()

            ws.send_text(json.dumps({"type": "audio_metadata", "duration": 5.0}))
            ws.send_bytes(b"audio-data")

            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "error"
            assert data["error_code"] == "voice_unavailable"
            assert data["suggest_text_mode"] is True

    def test_invalid_json_message(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """Invalid JSON should return an error message."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"audio"

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            ws.receive_text()
            ws.receive_bytes()

            ws.send_text("not valid json {{{")

            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "error"
            assert data["error_code"] == "invalid_json"

    def test_missing_duration_in_metadata(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """Missing duration field should return an error."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"audio"

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            ws.receive_text()
            ws.receive_bytes()

            ws.send_text(json.dumps({"type": "audio_metadata"}))

            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "error"
            assert data["error_code"] == "missing_duration"

    def test_unknown_message_type(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """Unknown message type should return an error."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"audio"

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            ws.receive_text()
            ws.receive_bytes()

            ws.send_text(json.dumps({"type": "unknown_type"}))

            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "error"
            assert data["error_code"] == "unknown_message_type"

    def test_ping_pong(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """Ping message should receive pong response."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question
        mock_voice_service.synthesize.return_value = b"audio"

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            ws.receive_text()
            ws.receive_bytes()

            ws.send_text(json.dumps({"type": "ping"}))

            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "pong"

    def test_tts_unavailable_still_sends_text(
        self, app, mock_session_manager, mock_voice_service, sample_session, sample_question
    ):
        """When TTS is unavailable, text response is still sent."""
        mock_session_manager.get_session.return_value = sample_session
        mock_session_manager.get_current_question.return_value = sample_question

        # First synthesize call (for initial question) succeeds
        # Second synthesize call (for next question) fails
        next_question = InterviewQuestion(
            id="q2", text="Next question.", category="behavioral"
        )
        mock_session_manager.submit_response.return_value = NextAction(
            action=NextActionType.NEXT_QUESTION, question=next_question
        )
        mock_voice_service.transcribe.return_value = TranscriptionResult(
            text="My answer.", confidence=0.85, has_recognizable_words=True
        )

        # First call succeeds, second raises VoiceUnavailableError
        mock_voice_service.synthesize.side_effect = [
            b"initial-audio",
            VoiceUnavailableError("TTS unavailable"),
        ]

        client = TestClient(app)
        with client.websocket_connect("/sessions/test-session-123/voice") as ws:
            # Receive initial question text + audio
            ws.receive_text()
            ws.receive_bytes()

            # Send audio
            ws.send_text(json.dumps({"type": "audio_metadata", "duration": 3.0}))
            ws.send_bytes(b"audio")

            # Receive transcription
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "transcription"

            # Receive next question text (still works)
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "next_question"
            assert data["question_text"] == "Next question."

            # Receive TTS unavailable notice instead of audio
            msg = ws.receive_text()
            data = json.loads(msg)
            assert data["type"] == "tts_unavailable"
