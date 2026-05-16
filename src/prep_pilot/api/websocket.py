"""WebSocket endpoint for real-time voice interaction during interview sessions.

Handles the voice streaming lifecycle: accepts audio data from clients,
transcribes via VoiceService, submits responses to SessionManager, and
returns both text (JSON) and synthesized audio (binary) responses.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from prep_pilot.models.domain import SessionStatus
from prep_pilot.services.session_manager import (
    InvalidStateError,
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

logger = logging.getLogger(__name__)

ws_router = APIRouter()


class VoiceWebSocketHandler:
    """Manages a single WebSocket voice interaction session.

    Coordinates between the WebSocket connection, VoiceService for
    transcription/synthesis, and SessionManager for interview flow.
    """

    def __init__(
        self,
        websocket: WebSocket,
        session_manager: SessionManager,
        voice_service: VoiceService,
        session_id: str,
    ) -> None:
        self._ws = websocket
        self._session_manager = session_manager
        self._voice_service = voice_service
        self._session_id = session_id

    async def handle(self) -> None:
        """Run the WebSocket connection lifecycle.

        Validates the session, accepts the connection, processes messages
        until the client disconnects or the session concludes.
        """
        # Validate session exists and is IN_PROGRESS before accepting
        try:
            session = self._session_manager.get_session(self._session_id)
        except SessionNotFoundError:
            await self._ws.close(code=4004, reason="Session not found")
            return

        if session.status != SessionStatus.IN_PROGRESS:
            await self._ws.close(
                code=4022,
                reason=f"Session is not in progress (status: {session.status.value})",
            )
            return

        # Accept the WebSocket connection
        await self._ws.accept()
        logger.info("WebSocket connected for session %s", self._session_id)

        # Send initial greeting with current question
        await self._send_current_question()

        try:
            await self._message_loop()
        except WebSocketDisconnect:
            logger.info("WebSocket disconnected for session %s", self._session_id)
        except Exception as exc:
            logger.error(
                "WebSocket error for session %s: %s", self._session_id, exc
            )
            await self._send_error("internal_error", "An unexpected error occurred.")
            await self._ws.close(code=1011, reason="Internal server error")

    async def _message_loop(self) -> None:
        """Process incoming messages until disconnect or session conclusion."""
        while True:
            message = await self._ws.receive()

            if message.get("type") == "websocket.disconnect":
                break

            # Handle JSON text messages (metadata)
            if "text" in message:
                await self._handle_text_message(message["text"])
            # Handle binary audio data
            elif "bytes" in message:
                # Binary-only messages without prior metadata are rejected
                await self._send_error(
                    "invalid_message",
                    "Please send a JSON metadata message with duration before sending audio.",
                )

    async def _handle_text_message(self, raw_text: str) -> None:
        """Handle an incoming JSON text message.

        Expected format:
        {
            "type": "audio_metadata",
            "duration": <float seconds>
        }

        After receiving metadata, the next binary frame is expected to contain
        the audio data.

        Also supports:
        {
            "type": "audio_data",
            "duration": <float seconds>,
            "audio_base64": "<base64 encoded audio>"  (optional alternative)
        }
        """
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            await self._send_error("invalid_json", "Message must be valid JSON.")
            return

        msg_type = data.get("type")

        if msg_type == "audio_metadata":
            # Client is about to send audio binary frame
            duration = data.get("duration")
            if duration is None:
                await self._send_error(
                    "missing_duration", "Audio metadata must include 'duration' field."
                )
                return

            # Wait for the next binary frame
            audio_message = await self._ws.receive()
            if "bytes" in audio_message:
                await self._process_audio(audio_message["bytes"], float(duration))
            else:
                await self._send_error(
                    "expected_audio",
                    "Expected binary audio data after metadata message.",
                )

        elif msg_type == "ping":
            # Keep-alive ping
            await self._send_json({"type": "pong"})

        else:
            await self._send_error(
                "unknown_message_type",
                f"Unknown message type: {msg_type}. Expected 'audio_metadata' or 'ping'.",
            )

    async def _process_audio(self, audio_data: bytes, duration: float) -> None:
        """Process received audio data through the voice pipeline.

        1. Transcribe audio via VoiceService
        2. Submit transcription as response to SessionManager
        3. Get next question or conclude signal
        4. Synthesize response audio
        5. Send back text (JSON) and audio (binary) responses
        """
        # Step 1: Transcribe
        try:
            transcription = await self._voice_service.transcribe(audio_data, duration)
        except AudioDurationError as exc:
            await self._send_error(
                "audio_duration_exceeded",
                str(exc),
            )
            return
        except UnrecognizableAudioError as exc:
            await self._send_error(
                "unrecognizable_audio",
                str(exc),
            )
            return
        except VoiceUnavailableError as exc:
            await self._send_error(
                "voice_unavailable",
                str(exc),
                suggest_text_mode=True,
            )
            return

        # Send transcription confirmation to client
        await self._send_json({
            "type": "transcription",
            "text": transcription.text,
            "confidence": transcription.confidence,
        })

        # Step 2: Submit response to session manager
        try:
            next_action = await self._session_manager.submit_response(
                session_id=self._session_id,
                response_text=transcription.text,
                input_mode="voice",
            )
        except SessionNotFoundError:
            await self._send_error("session_not_found", "Session no longer exists.")
            await self._ws.close(code=4004, reason="Session not found")
            return
        except InvalidStateError as exc:
            await self._send_error("invalid_state", str(exc))
            await self._ws.close(code=4022, reason="Invalid session state")
            return

        # Step 3: Determine next action
        if next_action.action == NextActionType.CONCLUDE:
            # Session is complete
            await self._send_json({
                "type": "session_concluded",
                "message": "All questions have been answered. The session is now concluded.",
            })

            # Try to synthesize the conclusion message
            await self._synthesize_and_send(
                "All questions have been answered. The session is now concluded. "
                "You can view your results."
            )

            await self._ws.close(code=1000, reason="Session concluded")
            return

        # Step 4: Send next question
        if next_action.question:
            question_text = next_action.question.text

            # Send text response
            await self._send_json({
                "type": "next_question",
                "question_id": next_action.question.id,
                "question_text": question_text,
                "category": next_action.question.category,
            })

            # Step 5: Synthesize and send audio
            await self._synthesize_and_send(question_text)

    async def _send_current_question(self) -> None:
        """Send the current question to the client upon connection."""
        try:
            question = await self._session_manager.get_current_question(
                self._session_id
            )
            await self._send_json({
                "type": "current_question",
                "question_id": question.id,
                "question_text": question.text,
                "category": question.category,
            })

            # Synthesize and send audio for the current question
            await self._synthesize_and_send(question.text)

        except Exception as exc:
            logger.warning(
                "Could not send current question for session %s: %s",
                self._session_id,
                exc,
            )
            await self._send_error(
                "no_question_available",
                "Could not retrieve the current question.",
            )

    async def _synthesize_and_send(self, text: str) -> None:
        """Synthesize text to audio and send as binary frame.

        If synthesis fails, logs the error but does not disconnect—
        the client still has the text response.
        """
        try:
            audio_bytes = await self._voice_service.synthesize(text)
            await self._ws.send_bytes(audio_bytes)
        except VoiceUnavailableError:
            # Voice synthesis unavailable; client already has text
            logger.warning(
                "TTS unavailable for session %s, text-only response sent",
                self._session_id,
            )
            await self._send_json({
                "type": "tts_unavailable",
                "message": "Voice synthesis is unavailable. Text response provided.",
            })
        except Exception as exc:
            logger.error("TTS synthesis error for session %s: %s", self._session_id, exc)

    async def _send_json(self, data: dict) -> None:
        """Send a JSON message to the client."""
        await self._ws.send_text(json.dumps(data))

    async def _send_error(
        self,
        error_code: str,
        message: str,
        suggest_text_mode: bool = False,
    ) -> None:
        """Send an error message to the client."""
        payload: dict = {
            "type": "error",
            "error_code": error_code,
            "message": message,
        }
        if suggest_text_mode:
            payload["suggest_text_mode"] = True
        await self._send_json(payload)


# --- Dependency holders (set by the application entry point) ---

_session_manager: Optional[SessionManager] = None
_voice_service: Optional[VoiceService] = None


def set_voice_dependencies(
    session_manager: SessionManager,
    voice_service: VoiceService,
) -> None:
    """Configure the WebSocket handler dependencies.

    Called during application startup to inject the session manager
    and voice service instances.
    """
    global _session_manager, _voice_service
    _session_manager = session_manager
    _voice_service = voice_service


def get_session_manager() -> SessionManager:
    """Get the configured SessionManager instance."""
    if _session_manager is None:
        raise RuntimeError("SessionManager not configured for WebSocket handler")
    return _session_manager


def get_voice_service() -> VoiceService:
    """Get the configured VoiceService instance."""
    if _voice_service is None:
        raise RuntimeError("VoiceService not configured for WebSocket handler")
    return _voice_service


@ws_router.websocket("/sessions/{session_id}/voice")
async def voice_websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
) -> None:
    """WebSocket endpoint for real-time voice interaction.

    Accepts a WebSocket connection for a given session, validates the session
    is in progress, and handles the voice interaction lifecycle.

    Protocol:
    - Client sends JSON: {"type": "audio_metadata", "duration": <seconds>}
    - Client sends binary: raw audio bytes
    - Server responds with JSON: {"type": "transcription", "text": "...", "confidence": 0.85}
    - Server responds with JSON: {"type": "next_question", ...} or {"type": "session_concluded", ...}
    - Server responds with binary: synthesized audio bytes

    Error codes:
    - 4004: Session not found
    - 4022: Session not in valid state
    - 1011: Internal server error
    """
    session_manager = get_session_manager()
    voice_service = get_voice_service()

    handler = VoiceWebSocketHandler(
        websocket=websocket,
        session_manager=session_manager,
        voice_service=voice_service,
        session_id=session_id,
    )
    await handler.handle()
