# Implementation Plan: Prep Pilot

## Overview

This plan implements the Prep Pilot AI-powered mock interview agent in Python using FastAPI. Tasks are organized to build foundational components first (data models, validation, parsing), then core business logic (question generation, evaluation, feedback), session orchestration, voice services, and finally the API layer that wires everything together.

## Tasks

- [x] 1. Set up project structure and core dependencies
  - [x] 1.1 Initialize Python project with pyproject.toml and install dependencies
    - Create project directory structure: `src/prep_pilot/`, `tests/`, `tests/property/`, `tests/unit/`, `tests/integration/`
    - Configure pyproject.toml with dependencies: fastapi, uvicorn, pydantic, openai, python-multipart, python-docx, PyPDF2, hypothesis, pytest, pytest-asyncio, pytest-mock
    - Create `src/prep_pilot/__init__.py` and sub-packages: `models/`, `services/`, `api/`, `prompts/`
    - _Requirements: 8.1, 8.2_

  - [x] 1.2 Define core domain data models
    - Create `src/prep_pilot/models/domain.py` with all dataclasses: `InterviewMode`, `SessionStatus`, `Experience`, `ParsedResume`, `ParsedJobDescription`, `InterviewQuestion`, `QuestionResponse`, `InterviewSession`, `InterviewReadinessScore`, `QuestionRelevancyDetail`, `ResumeRelevancyResult`, `ImprovedAnswer`, `ScoreReasoning`, `ImprovementSuggestion`, `FeedbackReport`, `SessionResults`, `ValidationResult`, `TranscriptionResult`
    - Create `src/prep_pilot/models/api.py` with Pydantic request/response models: `StartSessionResponse`, `UploadResumeResponse`, `SelectModeRequest`, `QuestionResponse`, `SubmitAnswerRequest`, `SessionResultsResponse`
    - _Requirements: 4.1, 5.1, 6.2, 7.1_

- [x] 2. Implement file validation and document parsing
  - [x] 2.1 Implement file validator
    - Create `src/prep_pilot/services/file_validator.py` with `FileValidator` class
    - Implement `validate()` method checking MIME type against allowed formats (PDF/DOCX for resumes; PDF/DOCX/TXT for job descriptions) and file size ≤ 5 MB
    - Return `ValidationResult` with `is_valid` and `error_message`
    - _Requirements: 1.1, 1.4, 3.1_

  - [ ]* 2.2 Write property test for file validation
    - **Property 1: File validation accepts only valid formats and sizes**
    - Use Hypothesis to generate random bytes with random MIME types and sizes (0 to 10 MB)
    - Verify acceptance iff MIME type is in allowed list AND size ≤ 5 MB
    - **Validates: Requirements 1.1, 1.4, 3.1**

  - [x] 2.3 Implement resume parser
    - Create `src/prep_pilot/services/resume_parser.py` with `ResumeParser` class
    - Implement `async parse()` method that extracts skills, experiences, and qualifications from PDF (using PyPDF2) and DOCX (using python-docx) files
    - Use LLM client for structured extraction from raw text
    - Return `ParsedResume` dataclass
    - _Requirements: 1.2, 1.5_

  - [x] 2.4 Implement job description parser
    - Create `src/prep_pilot/services/jd_parser.py` with `JobDescriptionParser` class
    - Implement `async parse()` method that extracts requirements, responsibilities, qualifications, and summary from PDF/DOCX/TXT files
    - Use LLM client for structured extraction from raw text
    - Return `ParsedJobDescription` dataclass
    - _Requirements: 3.1, 3.2_

  - [ ]* 2.5 Write unit tests for resume and JD parsers
    - Test parsing of sample PDF and DOCX content
    - Test error handling for corrupted/empty files
    - Test extraction of skills, experiences, qualifications from known content
    - _Requirements: 1.2, 1.4, 3.2, 3.3_

- [x] 3. Implement LLM client and prompt manager
  - [x] 3.1 Implement LLM client
    - Create `src/prep_pilot/services/llm_client.py` with `LLMClient` class
    - Implement `async generate()` for free-text LLM responses
    - Implement `async generate_structured()` for structured output parsing into typed objects
    - Configure timeout (30s per call), retry with exponential backoff (max 3 retries)
    - _Requirements: 8.1, 8.2_

  - [x] 3.2 Implement prompt manager
    - Create `src/prep_pilot/services/prompt_manager.py` with `PromptManager` class
    - Implement `get_question_generation_prompt()` for both open practice and job-specific modes
    - Implement `get_evaluation_prompt()` for each scoring dimension (clarity, technical accuracy, STAR method, relevancy)
    - Implement `get_feedback_prompt()` for feedback report generation
    - Implement `get_resume_relevancy_prompt()` for resume relevancy evaluation
    - _Requirements: 1.5, 2.3, 4.2, 4.3, 4.4, 4.5, 5.2, 6.2_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement question generator
  - [x] 5.1 Implement question generator for open practice mode
    - Create `src/prep_pilot/services/question_generator.py` with `QuestionGenerator` class
    - Implement `async generate_open_practice()` that generates 5-15 questions for a selected role, incorporating resume content
    - Each question must reference at least one resume item in `references_resume_item` field
    - Create `src/prep_pilot/data/roles.py` with a predefined role list (at least 5 roles)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 5.2 Implement question generator for job-specific mode
    - Implement `async generate_job_specific()` that generates ≥5 questions targeting intersections of resume and job description
    - Each question must reference at least one JD item in `references_jd_item` field
    - Prioritize intersection questions (resume + JD overlap) before JD-only or resume-only questions
    - _Requirements: 3.4, 3.5_

  - [ ]* 5.3 Write property test for question count bounds
    - **Property 3: Question count is within bounds**
    - Use Hypothesis to generate random roles, verify output count in [5, 15] for open practice
    - Verify output count ≥ 5 for job-specific mode
    - **Validates: Requirements 2.2, 3.4**

  - [ ]* 5.4 Write property test for questions referencing resume
    - **Property 2: Generated questions reference resume content**
    - Use Hypothesis to generate random `ParsedResume` objects with at least one skill/experience/qualification
    - Verify every generated question references at least one resume item
    - **Validates: Requirements 1.5, 2.3**

  - [ ]* 5.5 Write property test for JD question references
    - **Property 4: Job-specific questions reference job description items**
    - Use Hypothesis to generate random `ParsedJobDescription` objects
    - Verify every question in job-specific mode references at least one JD item
    - **Validates: Requirements 3.4**

  - [ ]* 5.6 Write property test for intersection prioritization
    - **Property 5: Intersection prioritization in job-specific mode**
    - Use Hypothesis to generate resume + JD with known overlaps
    - Verify intersection questions appear before non-intersection questions in the list
    - **Validates: Requirements 3.5**

- [x] 6. Implement session manager with state machine
  - [x] 6.1 Implement session manager
    - Create `src/prep_pilot/services/session_manager.py` with `SessionManager` class
    - Implement `async create_session()` that initializes a session with status AWAITING_RESUME
    - Implement `async submit_response()` that records a response, advances `current_question_index`, and transitions to CONCLUDED after all questions answered
    - Implement `async conclude_session()` that triggers evaluation and feedback generation
    - Implement state validation: reject operations that don't match current session status
    - Create in-memory session store with dict-based storage
    - _Requirements: 1.1, 1.3, 2.5, 4.6, 6.6_

  - [ ]* 6.2 Write property test for session state transitions
    - **Property 6: Session concludes after all questions answered**
    - Use Hypothesis to generate sequences of N responses for sessions with N questions
    - Verify status transitions to CONCLUDED after exactly N responses, remains IN_PROGRESS before
    - **Validates: Requirements 2.5**

  - [ ]* 6.3 Write unit tests for session manager edge cases
    - Test session creation without resume (error case)
    - Test submitting response when session is concluded (error case)
    - Test role list availability check
    - _Requirements: 1.3, 2.4_

- [x] 7. Implement evaluation engine
  - [x] 7.1 Implement interview readiness evaluation
    - Create `src/prep_pilot/services/evaluation_engine.py` with `EvaluationEngine` class
    - Implement `async evaluate_readiness()` that scores across 4 dimensions: clarity_of_communication, technical_accuracy, star_method_adherence, overall_response_relevancy
    - Each score is an integer in [1, 10]
    - Use LLM client with dimension-specific prompts for evaluation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.2 Implement resume relevancy evaluation
    - Implement `async evaluate_resume_relevancy()` that scores alignment between responses and resume content
    - Generate per-question reasoning with supported_claims and unsupported_claims lists
    - Assign default score of 5 when no comparable claims exist
    - Return `ResumeRelevancyResult` with score and per_question_reasoning
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 7.3 Write property test for score range invariant
    - **Property 7: All evaluation scores are integers in range 1-10**
    - Use Hypothesis to generate evaluation results
    - Verify all sub-scores in InterviewReadinessScore and ResumeRelevancyResult are integers where 1 ≤ score ≤ 10
    - **Validates: Requirements 4.1, 5.1**

  - [ ]* 7.4 Write property test for insufficient responses
    - **Property 8: Insufficient responses prevent score generation**
    - Use Hypothesis to generate sessions with 0-2 responses
    - Verify no InterviewReadinessScore is generated and insufficient_responses is True
    - Verify sessions with 0 responses produce no FeedbackReport
    - **Validates: Requirements 4.6, 6.6**

  - [ ]* 7.5 Write property test for resume relevancy reasoning structure
    - **Property 11: Resume relevancy reasoning structure**
    - Use Hypothesis to generate sessions with varying response counts
    - Verify per_question_reasoning has one entry per answered question with non-empty reasoning and present supported/unsupported claims lists
    - **Validates: Requirements 5.4**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement feedback generator
  - [x] 9.1 Implement feedback generator
    - Create `src/prep_pilot/services/feedback_generator.py` with `FeedbackGenerator` class
    - Implement `async generate()` that produces a `FeedbackReport` from session data
    - Report must contain: N improved answers (one per question), 2-5 follow-up questions, 4 score reasoning entries, ≥4 improvement suggestions (≥1 per dimension)
    - Enforce 60-second timeout for generation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 9.2 Write property test for feedback report structural completeness
    - **Property 9: Feedback report structural completeness**
    - Use Hypothesis to generate sessions with 1-15 answered questions
    - Verify report contains exactly N improved answers, 2-5 follow-up questions, exactly 4 score reasoning entries, ≥4 improvement suggestions
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

- [x] 10. Implement voice service
  - [x] 10.1 Implement voice service
    - Create `src/prep_pilot/services/voice_service.py` with `VoiceService` class
    - Implement `async transcribe()` that converts audio to text within 10-second timeout
    - Implement `async synthesize()` that converts text to audio output
    - Enforce max recording duration of 120 seconds; reject audio exceeding limit
    - Handle unrecognizable audio (no words) with appropriate error
    - Implement fallback to text mode when voice API is unavailable
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 10.2 Write property test for voice input duration constraint
    - **Property 10: Voice input duration constraint**
    - Use Hypothesis to generate audio metadata with random durations (0-300 seconds)
    - Verify acceptance for duration ≤ 120s and rejection for duration > 120s
    - **Validates: Requirements 7.1**

  - [ ]* 10.3 Write unit tests for voice service edge cases
    - Test voice API failure fallback to text mode
    - Test unrecognizable audio handling
    - Test dual output (voice + text) delivery
    - _Requirements: 7.4, 7.5, 7.6_

- [x] 11. Implement FastAPI REST endpoints and WebSocket handler
  - [x] 11.1 Implement REST API endpoints
    - Create `src/prep_pilot/api/routes.py` with FastAPI router
    - Implement `POST /sessions` - create new session
    - Implement `POST /sessions/{id}/resume` - upload and parse resume
    - Implement `POST /sessions/{id}/mode` - select interview mode (open_practice or job_specific)
    - Implement `POST /sessions/{id}/job-description` - upload job description (job-specific mode)
    - Implement `GET /sessions/{id}/questions` - get current/next question
    - Implement `POST /sessions/{id}/answers` - submit answer (text mode)
    - Implement `POST /sessions/{id}/conclude` - conclude session and get results
    - Implement `GET /sessions/{id}/results` - get evaluation results and feedback report
    - Implement `GET /roles` - get available role list
    - Wire all endpoints to SessionManager and related services
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.5, 3.1, 3.2, 7.2_

  - [x] 11.2 Implement WebSocket handler for voice interaction
    - Create `src/prep_pilot/api/websocket.py` with WebSocket endpoint
    - Implement `WS /sessions/{id}/voice` - handle real-time voice streaming
    - Accept audio data, pass to VoiceService for transcription
    - Return transcribed text and synthesized audio responses
    - Handle connection lifecycle (open, message, close, error)
    - _Requirements: 7.1, 7.3, 7.4_

  - [x] 11.3 Create FastAPI application entry point
    - Create `src/prep_pilot/main.py` with FastAPI app instance
    - Register all routers and WebSocket handlers
    - Configure CORS, error handlers, and middleware
    - Add health check endpoint
    - _Requirements: 8.1, 8.3_

- [ ] 12. Implement integration tests
  - [ ]* 12.1 Write integration tests for full session flow
    - Test end-to-end flow: upload resume → select mode → receive questions → submit answers → get evaluation → get feedback
    - Test both open practice and job-specific mode flows
    - Use mocked LLM client to verify orchestration logic
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.5, 3.1, 3.4, 4.1, 5.1, 6.1_

  - [ ]* 12.2 Write integration tests for error scenarios
    - Test invalid file upload (wrong format, too large)
    - Test session not found (404)
    - Test operations on concluded session
    - Test voice API failure fallback
    - Test insufficient responses handling
    - _Requirements: 1.3, 1.4, 3.3, 4.6, 6.6, 7.5_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All LLM interactions should be mocked in tests using pytest-mock
- The project uses Python 3.10+, FastAPI, Hypothesis, and pytest as specified in the design

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["2.1", "3.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.5", "5.6", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.5", "9.1"] },
    { "id": 8, "tasks": ["9.2", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "11.1"] },
    { "id": 10, "tasks": ["11.2", "11.3"] },
    { "id": 11, "tasks": ["12.1", "12.2"] }
  ]
}
```
