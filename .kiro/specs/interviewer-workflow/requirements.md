# Requirements Document

## Introduction

This feature makes voice the primary interaction mode for Prep Pilot's interview process. The AI interviewer generates questions dynamically, speaks them aloud via text-to-speech, listens to the candidate's spoken responses via speech-to-text, and adapts follow-up questions based on conversational context. The experience should feel like a natural conversation with a real interviewer rather than a scripted quiz, leveraging the existing real-time voice infrastructure and OpenAI's voice APIs.

## Glossary

- **Voice_Orchestrator**: The service component that coordinates the full voice interview loop — generating questions, synthesizing speech, capturing audio input, transcribing responses, and determining the next conversational action.
- **TTS_Engine**: The text-to-speech subsystem that converts generated question text into audible speech audio using OpenAI's TTS API.
- **STT_Engine**: The speech-to-text subsystem that converts candidate audio input into text transcriptions using OpenAI's Whisper API.
- **Conversation_Context**: The accumulated history of questions asked and responses given during a session, used to inform follow-up question generation.
- **Follow_Up_Generator**: The component that produces context-aware follow-up questions by analyzing the candidate's previous answers and remaining interview topics.
- **Voice_Session**: A real-time WebSocket-based connection through which all voice audio and control messages flow between the client and server during an interview.
- **Interviewer_Persona**: The configurable voice personality (tone, style, difficulty level) that shapes how the AI interviewer speaks and interacts.
- **Turn_Transition**: The handoff between the interviewer finishing a question (TTS complete) and the candidate beginning their response (STT listening).

## Requirements

### Requirement 1: Voice-First Question Delivery

**User Story:** As a candidate, I want the AI interviewer to speak each question aloud automatically, so that I experience a realistic verbal interview without needing to read text.

#### Acceptance Criteria

1. WHEN a new interview question is generated, THE Voice_Orchestrator SHALL synthesize the question text into audio using the TTS_Engine and begin streaming the audio to the client within 3 seconds of generation.
2. WHILE an Interview_Session is active with voice output enabled, THE Voice_Orchestrator SHALL deliver all interview questions as audible speech before accepting the candidate's next response, using audio as the default output channel with text displayed simultaneously.
3. WHILE an Interview_Session is active with voice output enabled, THE Voice_Orchestrator SHALL send the question text as a JSON message to the client no later than the start of audio playback so the client can display a synchronized text transcript.
4. IF the TTS_Engine fails to respond within 5 seconds or returns a connection error, THEN THE Voice_Orchestrator SHALL deliver the question as text-only via JSON message and include a notification field indicating that voice output is temporarily unavailable.
5. IF audio streaming is interrupted after delivery has started, THEN THE Voice_Orchestrator SHALL deliver the complete question text as a JSON message so the candidate can read the full question.

### Requirement 2: Voice-First Response Capture

**User Story:** As a candidate, I want to speak my answers naturally and have them understood by the system, so that I can practice interviewing without typing.

#### Acceptance Criteria

1. WHEN the TTS_Engine finishes delivering a question, THE Voice_Orchestrator SHALL transition to listening mode within 500 milliseconds, indicate to the candidate that the system is ready to receive audio input, and accept audio input for a maximum duration of 120 seconds.
2. WHEN the candidate has been silent for 2 seconds or more during listening mode, THE STT_Engine SHALL treat the audio segment as complete and transcribe the audio into text within 5 seconds of detecting end-of-speech.
3. WHEN the STT_Engine produces a transcription, THE STT_Engine SHALL include a confidence score between 0.0 and 1.0 for the transcription result.
4. IF the STT_Engine produces a transcription with a confidence score of 0.4 or higher, THEN THE Voice_Orchestrator SHALL accept the transcription and pass it to the session as the candidate's response.
5. IF the STT_Engine produces a transcription with a confidence score below 0.4 or cannot produce any recognizable words, THEN THE Voice_Orchestrator SHALL prompt the candidate to repeat their answer or switch to text input, allowing a maximum of 2 retry attempts before requiring text input.
6. IF the STT_Engine is unavailable, THEN THE Voice_Orchestrator SHALL notify the client to fall back to text input mode without ending the session.
7. IF the candidate does not begin speaking within 30 seconds of the Voice_Orchestrator entering listening mode, THEN THE Voice_Orchestrator SHALL prompt the candidate to respond or switch to text input.

### Requirement 3: Context-Aware Conversational Follow-Ups

**User Story:** As a candidate, I want the interviewer to acknowledge what I said and ask relevant follow-up questions, so that the interview feels like a natural conversation rather than a list of disconnected questions.

#### Acceptance Criteria

1. WHEN a candidate response is transcribed, THE Follow_Up_Generator SHALL use the full Conversation_Context (all prior questions and answers in the session) to generate the next question.
2. WHEN the Follow_Up_Generator produces a follow-up question, THE Follow_Up_Generator SHALL include a reference to or acknowledgment of at least one specific element (a named skill, claim, example, or topic) from the candidate's most recent response.
3. WHILE the candidate provides a response that lacks a specific example or quantifiable result and contains fewer than 2 complete sentences, THE Follow_Up_Generator SHALL probe deeper on the same topic by asking for elaboration rather than advancing to a new topic, for a maximum of 3 consecutive probing questions on the same topic.
4. WHILE the candidate provides a response that includes at least one specific example or quantifiable result and contains 2 or more complete sentences, THE Follow_Up_Generator SHALL transition to the next topic by generating a question that begins with a brief reference to the candidate's previous answer before introducing the new topic.
5. WHEN the Follow_Up_Generator receives a transcribed response, THE Follow_Up_Generator SHALL generate the next question within 4 seconds of receiving the transcribed response to maintain conversational flow.
6. IF the Follow_Up_Generator has asked 3 consecutive probing questions on the same topic without receiving a response that meets the thoroughness criteria, THEN THE Follow_Up_Generator SHALL advance to the next topic.

### Requirement 4: Natural Turn-Taking and Conversational Flow

**User Story:** As a candidate, I want the conversation to flow naturally with clear turn-taking cues, so that I know when to speak and when to listen.

#### Acceptance Criteria

1. WHEN the TTS_Engine completes audio playback of a question, THE Voice_Orchestrator SHALL signal the client that it is ready to receive the candidate's response within 500 milliseconds of playback completion.
2. THE Voice_Orchestrator SHALL detect a silence gap of 2 seconds or more as an end-of-turn signal from the candidate.
3. WHILE the candidate is speaking, THE Voice_Orchestrator SHALL NOT interrupt with the next question or any audio output.
4. WHEN the session begins, THE Voice_Orchestrator SHALL deliver a spoken greeting between 10 and 30 seconds in duration that states the interviewer persona name, the interview mode, and the expected number of questions.
5. WHEN all questions have been answered, THE Voice_Orchestrator SHALL deliver a contextual closing statement as defined in Requirement 8.
6. IF the candidate remains silent for 15 seconds or more after the ready-to-receive signal is sent, THEN THE Voice_Orchestrator SHALL deliver an audible prompt asking the candidate if they would like the question repeated or to move to the next question.

### Requirement 5: Support for Both Interview Modes

**User Story:** As a candidate, I want voice-first interaction to work in both Open Practice and Job Specific modes, so that I get the same natural experience regardless of which mode I choose.

#### Acceptance Criteria

1. WHEN the session mode is Open Practice, THE Voice_Orchestrator SHALL include the selected role name and at least one skill or experience extracted from the parsed resume in the prompt context used for question generation and follow-up generation.
2. WHEN the session mode is Job Specific, THE Voice_Orchestrator SHALL include at least one requirement, responsibility, or qualification extracted from the parsed job description, along with at least one skill or experience from the parsed resume, in the prompt context used for question generation and follow-up generation.
3. THE Voice_Orchestrator SHALL maintain the same voice interaction protocol across both interview modes, including TTS audio delivery within 3 seconds of question generation, STT transcription within 5 seconds of candidate speech completion, 2-second silence detection for end-of-turn, and context-aware follow-up generation within 4 seconds of transcription.
4. WHILE in Job Specific mode, THE Follow_Up_Generator SHALL reference at least one specific requirement, responsibility, or qualification from the parsed job description in each generated follow-up question.
5. IF the Voice_Orchestrator receives a session with a parsed resume containing no extractable skills or experiences, THEN THE Voice_Orchestrator SHALL generate questions based solely on the selected role (in Open Practice mode) or the job description (in Job Specific mode) and proceed without referencing resume content.

### Requirement 6: Interviewer Persona and Voice Configuration

**User Story:** As a candidate, I want to choose the interviewer's voice and style, so that I can practice with different interviewer personalities.

#### Acceptance Criteria

1. WHEN a Voice_Session is initiated, THE Voice_Orchestrator SHALL apply the selected Interviewer_Persona configuration (TTS voice identifier, interview style, and difficulty level) to all TTS output and question phrasing for the entire duration of the session.
2. THE Voice_Orchestrator SHALL support at least three distinct Interviewer_Persona options, where each persona uses a unique TTS voice identifier, a defined interview style (formal, conversational, or challenging), and a difficulty level (easy, moderate, or hard).
3. THE Interviewer_Persona SHALL alter the phrasing and tone of generated questions according to its configured style and difficulty level, such that the same underlying question topic produces observably different wording across different personas, while preserving the core subject matter being asked about.
4. IF no Interviewer_Persona is selected, THEN THE Voice_Orchestrator SHALL use a default persona configured with a formal interview style and moderate difficulty level.
5. WHEN a candidate begins session configuration, THE Voice_Orchestrator SHALL present the list of available Interviewer_Persona options with each persona's name, interview style, and difficulty level so the candidate can make a selection before the Voice_Session starts.

### Requirement 7: Real-Time Audio Streaming

**User Story:** As a candidate, I want minimal delay between my answer and the next question, so that the conversation feels responsive and natural.

#### Acceptance Criteria

1. THE Voice_Orchestrator SHALL stream TTS audio to the client as it is generated rather than waiting for the full audio to be synthesized before sending.
2. WHEN the end-of-turn signal is detected, THE Voice_Orchestrator SHALL begin processing the candidate's audio for transcription within 500 milliseconds, without waiting for additional buffering.
3. THE total round-trip time from end of candidate speech to beginning of next question audio SHALL be less than 6 seconds when network latency is 100 milliseconds or less and available bandwidth is 1 Mbps or greater.
4. WHILE audio is being streamed, THE Voice_Session SHALL maintain the WebSocket connection with keep-alive messages sent at intervals of no more than 30 seconds.
5. IF TTS audio streaming fails or is interrupted before completion, THEN THE Voice_Orchestrator SHALL notify the client of the streaming failure and provide the response as text-only output.
6. IF the WebSocket connection is lost while audio is being streamed, THEN THE Voice_Session SHALL attempt to reconnect within 3 seconds for a maximum of 3 attempts, and if reconnection fails, SHALL notify the User that the voice connection was lost and prompt them to rejoin or continue via text.
7. IF the total round-trip time exceeds 6 seconds, THEN THE Voice_Orchestrator SHALL deliver the next question audio as soon as processing completes and SHALL not discard or skip the pending response.

### Requirement 8: Contextual Closing Statement

**User Story:** As a candidate, I want the interviewer to deliver a personalized closing statement when the interview ends, so that I feel the session was a complete and coherent experience.

#### Acceptance Criteria

1. WHEN all interview questions have been answered and the session is ready to conclude, THE Voice_Orchestrator SHALL generate a contextual closing statement using the full Conversation_Context before triggering evaluation.
2. THE closing statement SHALL reference at least 2 specific topics, skills, or examples the candidate discussed during the session.
3. THE closing statement SHALL include a brief positive acknowledgment of the candidate's participation and a natural sign-off phrase (e.g., "Thanks for your time today" or "It was great speaking with you").
4. THE Voice_Orchestrator SHALL deliver the closing statement as audible speech via the TTS_Engine, with a duration between 10 and 30 seconds.
5. THE Voice_Orchestrator SHALL send the closing statement text as a JSON message alongside the audio so the client can display it as a transcript.
6. WHEN the closing statement audio finishes playing, THE Voice_Orchestrator SHALL transition the session to the evaluation phase and notify the client that results are being generated.
7. IF the candidate ends the session early (before all questions are answered), THEN THE Voice_Orchestrator SHALL still deliver a contextual closing that references the topics covered so far and acknowledges the early conclusion gracefully.

### Requirement 9: Graceful Degradation and Error Recovery

**User Story:** As a candidate, I want the interview to continue smoothly even if there are temporary voice service issues, so that my practice session is not disrupted.

#### Acceptance Criteria

1. IF the TTS_Engine fails mid-session, THEN THE Voice_Orchestrator SHALL fall back to text-only question delivery and inform the candidate that voice output is temporarily unavailable.
2. IF the STT_Engine fails mid-session, THEN THE Voice_Orchestrator SHALL prompt the candidate to provide their response via text input without ending the session.
3. IF the WebSocket connection drops, THEN THE Voice_Session SHALL attempt to reconnect with a maximum of 3 attempts within 5 seconds each, and upon successful reconnection SHALL resume from the last confirmed question-response pair.
4. THE Voice_Orchestrator SHALL preserve all Conversation_Context for the duration of any service interruption lasting up to 120 seconds, and WHEN a previously failed service (TTS_Engine or STT_Engine) becomes available again, THE Voice_Orchestrator SHALL resume voice interaction mode and notify the candidate that voice has been restored.
5. IF the Follow_Up_Generator fails to produce a context-aware question within 4 seconds of receiving the transcribed response, THEN THE Voice_Orchestrator SHALL fall back to the next pre-generated question from the session's question list.
6. IF all 3 WebSocket reconnection attempts fail, THEN THE Voice_Session SHALL end the real-time connection, preserve the current Conversation_Context, and display a message to the candidate indicating the session was interrupted with an option to start a new Voice_Session that resumes from the last confirmed question-response pair.
