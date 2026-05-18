# Implementation Plan: Interviewer Workflow

## Overview

This plan implements the voice-first interview orchestration system for Prep Pilot. The Voice Orchestrator coordinates dynamic question generation, TTS delivery, STT capture, context-aware follow-ups, and natural turn-taking over a real-time WebSocket connection using LiveKit and OpenAI's voice APIs. Implementation is in Python, building on the existing `livekit-agents[openai]` infrastructure.

## Tasks

- [ ] 1. Set up project structure, core interfaces, and data models
  - [ ] 1.1 Create the voice orchestrator package structure and core data models
    - Create `src/prep_pilot/voice/` package with `__init__.py`
    - Create `src/prep_pilot/voice/models.py` with `OrchestratorConfig`, `VoiceSessionState`, `VoiceSessionConfig`, `ClosingStatement`, `TranscriptionResult`, `ResponseAssessment`, `ConversationTurn`, `TurnState` enum, and `InterviewerPersona` dataclass
    - Create `src/prep_pilot/voice/exceptions.py` with `TTSTimeoutError`, `TTSConnectionError`, `STTTimeoutError`, `STTUnavailableError`, `AudioDurationError`
    - _Requirements: 1.1, 1.4, 2.1, 2.3, 6.1, 6.2, 7.3, 8.2_

  - [ ] 1.2 Create the PersonaManager with default personas
    - Create `src/prep_pilot/voice/persona_manager.py` with `PersonaManager` class
    - Implement `INTERVIEWER_PERSONAS` list with "professional" (alloy/formal/moderate), "friendly" (nova/conversational/easy), and "challenger" (onyx/challenging/hard) personas
    - Implement `get_available_personas()`, `get_persona(persona_id)`, and `get_default_persona()` methods
    - Default persona uses formal style and moderate difficulty
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [ ] 1.3 Set up test infrastructure with Hypothesis and pytest
    - Create `tests/` directory structure: `tests/property/`, `tests/unit/`, `tests/integration/`
    - Add `hypothesis` and `pytest` to dev dependencies in `pyproject.toml`
    - Create `conftest.py` with shared fixtures for mock TTS/STT engines, personas, and conversation contexts
    - _Requirements: All (testing infrastructure)_

- [ ] 2. Implement TurnStateManager and silence detection
  - [ ] 2.1 Implement TurnStateManager with state transitions and silence timers
    - Create `src/prep_pilot/voice/turn_state_manager.py` with `TurnStateManager` class
    - Implement `TurnState` enum transitions: IDLE → DELIVERING_QUESTION → AWAITING_RESPONSE → PROCESSING_RESPONSE → GENERATING_FOLLOWUP → back to DELIVERING_QUESTION, plus DELIVERING_CLOSING → SESSION_ENDED
    - Implement `transition_to()` with validation of legal transitions
    - Implement `start_silence_timer()` with configurable thresholds: 2s end-of-turn, 15s prompt, 30s timeout
    - Implement `cancel_silence_timer()` when speech is detected
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 4.3, 4.6, 2.7_

  - [ ]* 2.2 Write property test for silence detection at 2-second threshold
    - **Property 23: Silence Detection at 2-Second Threshold**
    - **Validates: Requirements 4.2, 2.2**

  - [ ]* 2.3 Write property test for no interruption while candidate speaks
    - **Property 8: No Interruption While Candidate Speaks**
    - **Validates: Requirements 4.3**

  - [ ]* 2.4 Write unit tests for TurnStateManager
    - Test valid and invalid state transitions
    - Test 15-second silence triggers prompt (Req 4.6)
    - Test 30-second silence triggers text input requirement (Req 2.7)
    - _Requirements: 2.1, 4.1, 4.2, 4.3, 4.6, 2.7_

- [ ] 3. Implement ConversationContext and prompt construction
  - [ ] 3.1 Implement ConversationContext with history tracking and prompt building
    - Create `src/prep_pilot/voice/conversation_context.py` with `ConversationContext` class
    - Implement `add_turn()`, `get_full_history()`, `get_current_topic()`, `get_probing_depth()`, `get_topics_discussed()`
    - Implement `build_prompt_context()` that constructs the full context string including mode, persona, resume skills, job description elements, and all prior turns
    - Implement `MAX_CONTEXT_RETENTION` of 120 seconds for interruption tolerance
    - _Requirements: 3.1, 5.1, 5.2, 9.4_

  - [ ]* 3.2 Write property test for full context passed to follow-up generator
    - **Property 6: Full Context Passed to Follow-Up Generator**
    - **Validates: Requirements 3.1**

  - [ ]* 3.3 Write property test for prompt context includes mode-appropriate elements
    - **Property 10: Prompt Context Includes Mode-Appropriate Elements**
    - **Validates: Requirements 5.1, 5.2**

- [ ] 4. Implement TTSEngine with streaming and fallback
  - [ ] 4.1 Implement TTSEngine with streaming synthesis and timeout handling
    - Create `src/prep_pilot/voice/tts_engine.py` with `TTSEngine` class
    - Implement `synthesize_stream()` as an async generator yielding audio chunks using OpenAI TTS API
    - Implement `synthesize_full()` for short utterances
    - Implement 5-second timeout with `TTSTimeoutError`
    - Handle connection errors with `TTSConnectionError`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 7.1, 7.5_

  - [ ]* 4.2 Write property test for TTS failure always results in text fallback
    - **Property 1: TTS Failure Always Results in Text Fallback**
    - **Validates: Requirements 1.4, 1.5, 7.5, 9.1**

  - [ ]* 4.3 Write property test for text always accompanies audio delivery
    - **Property 14: Text Always Accompanies Audio Delivery**
    - **Validates: Requirements 1.3, 8.5**

- [ ] 5. Implement STTEngine with confidence scoring
  - [ ] 5.1 Implement STTEngine with transcription, confidence scoring, and end-of-speech detection
    - Create `src/prep_pilot/voice/stt_engine.py` with `STTEngine` class
    - Implement `transcribe()` returning `TranscriptionResult` with confidence score in [0.0, 1.0]
    - Implement `detect_end_of_speech()` using 2-second silence threshold
    - Implement 5-second transcription timeout with `STTTimeoutError`
    - Implement 120-second max recording duration with `AudioDurationError`
    - Handle unavailability with `STTUnavailableError`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 5.2 Write property test for confidence scoring and threshold decision
    - **Property 4: Confidence Scoring and Threshold Decision**
    - **Validates: Requirements 2.3, 2.4, 2.5**

  - [ ]* 5.3 Write property test for STT failure results in text input fallback
    - **Property 3: STT Failure Results in Text Input Fallback**
    - **Validates: Requirements 2.6, 9.2**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement FollowUpGenerator with response assessment and probing logic
  - [ ] 7.1 Implement FollowUpGenerator with response assessment and context-aware generation
    - Create `src/prep_pilot/voice/follow_up_generator.py` with `FollowUpGenerator` class
    - Implement `assess_response()` that checks for specific examples, quantifiable results, and sentence count (thorough = example/result present AND >= 2 sentences)
    - Implement `generate()` with probing logic: probe deeper if response not thorough (max 3 probes), advance to next topic if thorough
    - Implement 4-second generation timeout with fallback to pre-generated questions
    - Ensure generated follow-ups reference at least one element from the candidate's last response
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.5_

  - [ ]* 7.2 Write property test for response thoroughness determines probing vs advancing
    - **Property 5: Response Thoroughness Determines Probing vs Advancing**
    - **Validates: Requirements 3.3, 3.4, 3.6**

  - [ ]* 7.3 Write property test for follow-up references candidate's last response
    - **Property 7: Follow-Up References Candidate's Last Response**
    - **Validates: Requirements 3.2**

  - [ ]* 7.4 Write property test for follow-up timeout triggers fallback
    - **Property 21: Follow-Up Timeout Triggers Fallback**
    - **Validates: Requirements 9.5**

  - [ ]* 7.5 Write property test for Job Specific follow-ups reference job description
    - **Property 11: Job Specific Follow-Ups Reference Job Description**
    - **Validates: Requirements 5.4**

- [ ] 8. Implement VoiceOrchestrator core session lifecycle
  - [ ] 8.1 Implement VoiceOrchestrator with session start, greeting delivery, and question delivery
    - Create `src/prep_pilot/voice/voice_orchestrator.py` with `VoiceOrchestrator` class
    - Implement `start_session()` that initializes ConversationContext, applies persona, and delivers greeting
    - Implement `deliver_question()` that synthesizes via TTS and streams audio, sending text JSON alongside audio start
    - Implement greeting generation using persona template with persona name, interview mode, and question count
    - Implement turn transition: after TTS completes, transition to listening mode within 500ms
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 4.1, 4.4, 6.1_

  - [ ]* 8.2 Write property test for turn transition within 500 milliseconds
    - **Property 2: Turn Transition Within 500 Milliseconds**
    - **Validates: Requirements 2.1, 4.1, 7.2**

  - [ ]* 8.3 Write property test for greeting contains required elements
    - **Property 9: Greeting Contains Required Elements**
    - **Validates: Requirements 4.4**

  - [ ] 8.4 Implement VoiceOrchestrator response handling and retry logic
    - Implement `handle_candidate_audio()` that transcribes via STT, checks confidence threshold (>= 0.4 accept, < 0.4 retry up to 2 times then require text)
    - Implement `handle_silence_timeout()` with 15s prompt and 30s text input requirement
    - Wire response acceptance into ConversationContext and trigger FollowUpGenerator
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 3.1, 4.2, 4.6_

  - [ ]* 8.5 Write property test for slow responses never discarded
    - **Property 16: Slow Responses Never Discarded**
    - **Validates: Requirements 7.7**

- [ ] 9. Implement persona consistency and mode-specific behavior
  - [ ] 9.1 Implement persona-driven question phrasing and mode-specific prompt injection
    - Wire PersonaManager into VoiceOrchestrator so all TTS uses the session's persona voice
    - Inject persona `question_style_prompt` into all LLM calls for question generation
    - Implement Open Practice mode: include role name + resume skills in prompt context
    - Implement Job Specific mode: include JD requirements/responsibilities + resume skills in prompt context
    - Handle empty resume case: generate questions from role or JD only
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3_

  - [ ]* 9.2 Write property test for persona consistency throughout session
    - **Property 12: Persona Consistency Throughout Session**
    - **Validates: Requirements 6.1**

  - [ ]* 9.3 Write property test for different personas produce different wording
    - **Property 13: Different Personas Produce Different Wording**
    - **Validates: Requirements 6.3**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement session conclusion and closing statement
  - [ ] 11.1 Implement contextual closing statement generation and session conclusion
    - Implement `conclude_session()` in VoiceOrchestrator
    - Generate closing statement referencing at least 2 topics/skills discussed
    - Include positive acknowledgment and natural sign-off phrase
    - Ensure closing audio duration between 10 and 30 seconds
    - Handle early exit: reference topics covered so far, acknowledge early conclusion
    - Deliver closing via TTS with text JSON alongside
    - Transition to evaluation phase after closing audio completes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 11.2 Write property test for closing references topics discussed
    - **Property 17: Closing References Topics Discussed**
    - **Validates: Requirements 8.2, 8.7**

  - [ ]* 11.3 Write property test for closing contains acknowledgment and sign-off
    - **Property 18: Closing Contains Acknowledgment and Sign-Off**
    - **Validates: Requirements 8.3**

  - [ ]* 11.4 Write property test for closing duration within bounds
    - **Property 19: Closing Duration Within Bounds**
    - **Validates: Requirements 8.4**

- [ ] 12. Implement error recovery and graceful degradation
  - [ ] 12.1 Implement TTS and STT failure handling with graceful degradation
    - Implement `handle_tts_failure()` in VoiceOrchestrator: deliver text-only + voice_unavailable notification
    - Implement `handle_stt_failure()`: prompt text input, session continues
    - Implement degradation hierarchy: Full Voice → TTS Fallback → STT Fallback → Text-Only
    - Implement service restoration detection and voice_restored notification
    - Preserve ConversationContext during interruptions up to 120 seconds
    - _Requirements: 1.4, 1.5, 2.6, 9.1, 9.2, 9.4_

  - [ ]* 12.2 Write property test for context preserved during interruption
    - **Property 20: Context Preserved During Interruption**
    - **Validates: Requirements 9.4**

  - [ ] 12.3 Implement WebSocket reconnection with bounded retries and state recovery
    - Implement reconnection logic: 3 attempts, 3 seconds per attempt
    - On successful reconnect: resume from last confirmed question-response pair
    - On all retries exhausted: end connection, preserve context, provide resume option to client
    - Send keep-alive messages at 30-second intervals
    - _Requirements: 7.4, 7.6, 9.3, 9.6_

  - [ ]* 12.4 Write property test for WebSocket reconnection with bounded retries
    - **Property 15: WebSocket Reconnection with Bounded Retries and State Recovery**
    - **Validates: Requirements 7.6, 9.3**

  - [ ]* 12.5 Write property test for all retries exhausted preserves context
    - **Property 22: All Retries Exhausted Preserves Context with Resume Option**
    - **Validates: Requirements 9.6**

- [ ] 13. Implement WebSocket protocol and LiveKit agent integration
  - [ ] 13.1 Implement WebSocket protocol messages and LiveKit agent wiring
    - Create `src/prep_pilot/voice/websocket_protocol.py` with server message types: QUESTION, READY_TO_RECEIVE, TRANSCRIPTION, SESSION_CONCLUDED, VOICE_UNAVAILABLE, VOICE_RESTORED, SILENCE_PROMPT, CONNECTION_LOST
    - Wire VoiceOrchestrator as a LiveKit agent using `livekit-agents` framework
    - Implement session join handler that initializes VoiceOrchestrator with session config
    - Implement audio stream routing: incoming audio → STT pipeline, outgoing audio → TTS stream to client
    - Implement streaming TTS delivery (chunks sent as generated, not waiting for full synthesis)
    - _Requirements: 1.1, 1.3, 2.1, 7.1, 7.2, 7.4_

  - [ ]* 13.2 Write unit tests for WebSocket protocol message formatting
    - Test all server message types have correct structure
    - Test session conclusion message includes closing text
    - _Requirements: 1.3, 8.5, 8.6_

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using Hypothesis
- Unit tests validate specific examples and edge cases
- The project uses Python 3.14+ with `livekit-agents[openai]~=1.2` and `hypothesis` for PBT
- All mock strategies for OpenAI TTS/Whisper/GPT-4o and LiveKit are defined in the design's Testing Strategy section

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.2", "5.3", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4", "7.5", "8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 6, "tasks": ["8.5", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "11.1"] },
    { "id": 8, "tasks": ["11.2", "11.3", "11.4", "12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3"] },
    { "id": 10, "tasks": ["12.4", "12.5", "13.1"] },
    { "id": 11, "tasks": ["13.2"] }
  ]
}
```
