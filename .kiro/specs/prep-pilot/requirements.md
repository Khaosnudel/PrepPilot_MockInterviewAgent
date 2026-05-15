# Requirements Document

## Introduction

Prep Pilot is an AI-powered mock interview agent built on a software platform using Python. It conducts realistic interview sessions tailored to a user's resume and target role. The system supports two interview modes (Open Practice and Job Specific), evaluates responses across multiple dimensions, provides actionable feedback, and accepts both voice and text input.

## Glossary

- **Prep_Pilot**: The AI agent system that conducts mock interviews and provides evaluation feedback
- **User**: A person using the platform to practice interview skills
- **Interview_Session**: A single mock interview interaction from start to finish between the User and Prep Pilot
- **Open_Practice_Mode**: An interview mode where the User selects a role from a predefined list to guide the interview experience
- **Job_Specific_Mode**: An interview mode where the User uploads a job description to tailor the interview to a specific position
- **Resume**: A document uploaded by the User containing their professional experience, skills, and qualifications
- **Job_Description**: A document uploaded by the User describing a specific role's requirements and responsibilities
- **Role_List**: A predefined catalog of professional roles available for selection in Open Practice Mode
- **Interview_Readiness_Score**: A composite evaluation of the User's interview performance across four dimensions
- **Resume_Relevancy_Score**: A numeric score between 1 and 10 evaluating alignment between interview responses and resume content
- **STAR_Method**: A structured response format consisting of Situation, Task, Action, and Result
- **Voice_API**: The interactive voice interface enabling spoken input and output during an Interview Session
- **Feedback_Report**: A structured set of improvement suggestions generated after an Interview Session

## Requirements

### Requirement 1: Resume Upload

**User Story:** As a user, I want to upload my resume before starting an interview, so that the interview experience is personalized to my background.

#### Acceptance Criteria

1. WHEN a User initiates a new Interview_Session, THE Prep_Pilot SHALL require the User to upload a Resume in PDF or DOCX format, with a maximum file size of 5 MB, before proceeding
2. WHEN a Resume is uploaded, THE Prep_Pilot SHALL parse the Resume and extract identifiable skills, experiences, and qualifications within 30 seconds, and display the extracted information to the User for confirmation before starting the Interview_Session
3. IF a User attempts to start an Interview_Session without uploading a Resume, THEN THE Prep_Pilot SHALL display an error message indicating that a Resume is required and prevent the Interview_Session from starting
4. IF the uploaded Resume cannot be parsed due to an unsupported format, corrupted file, or unreadable content, THEN THE Prep_Pilot SHALL display an error message indicating the parsing failure reason and prompt the User to upload a different file
5. WHILE an Interview_Session is active, THE Prep_Pilot SHALL generate interview questions and follow-up prompts that reference at least one skill, experience, or qualification extracted from the uploaded Resume

### Requirement 2: Open Practice Mode

**User Story:** As a user, I want to select a role from a list and practice general interview questions for that role, so that I can prepare for interviews in my target field.

#### Acceptance Criteria

1. WHEN a User selects Open_Practice_Mode, THE Prep_Pilot SHALL display the Role_List containing at least 5 professional roles for the User to choose from
2. WHEN a User selects a role from the Role_List, THE Prep_Pilot SHALL generate between 5 and 15 interview questions aligned with that role's responsibilities and required skills
3. WHILE an Interview_Session is in Open_Practice_Mode, THE Prep_Pilot SHALL incorporate the User's skills and experiences extracted from the uploaded Resume when selecting and phrasing questions for the chosen role
4. IF the Role_List fails to load or is unavailable, THEN THE Prep_Pilot SHALL display an error message indicating that the role selection is temporarily unavailable
5. WHEN all generated questions have been asked and answered, THE Prep_Pilot SHALL conclude the Interview_Session and proceed to evaluation

### Requirement 3: Job Specific Mode

**User Story:** As a user, I want to upload a job description and practice interview questions specific to that position, so that I can prepare for a particular opportunity.

#### Acceptance Criteria

1. WHEN a User selects Job_Specific_Mode, THE Prep_Pilot SHALL prompt the User to upload a Job_Description in PDF, DOCX, or plain text format with a maximum file size of 5 MB
2. WHEN a Job_Description is uploaded, THE Prep_Pilot SHALL parse the Job_Description and extract role requirements, responsibilities, and desired qualifications, and display a summary of the extracted information to the User for confirmation before proceeding
3. IF the uploaded Job_Description cannot be parsed or contains no identifiable role requirements, THEN THE Prep_Pilot SHALL display an error message indicating the document could not be processed and prompt the User to upload a different Job_Description
4. WHILE an Interview_Session is in Job_Specific_Mode, THE Prep_Pilot SHALL generate a minimum of 5 interview questions, where each question references at least one specific requirement, responsibility, or qualification extracted from the uploaded Job_Description
5. WHILE an Interview_Session is in Job_Specific_Mode, THE Prep_Pilot SHALL incorporate the User's uploaded Resume by prioritizing questions that address intersections between the Job_Description requirements and the skills or experiences listed in the Resume

### Requirement 4: Interview Readiness Evaluation

**User Story:** As a user, I want to receive scores on my interview performance across multiple dimensions, so that I understand my strengths and areas for improvement.

#### Acceptance Criteria

1. WHEN an Interview_Session concludes, THE Prep_Pilot SHALL generate and display to the User an Interview_Readiness_Score containing four sub-scores: Clarity of Communication, Technical Accuracy, STAR Method adherence, and Overall Response Relevancy, each as a numeric value between 1 and 10
2. WHEN scoring Clarity of Communication, THE Prep_Pilot SHALL evaluate whether the User's responses have a logical structure, use concise language, and avoid ambiguity or excessive filler words
3. WHEN scoring Technical Accuracy, THE Prep_Pilot SHALL evaluate the correctness of technical claims and the level of specificity in technical explanations provided in the User's responses
4. WHEN scoring STAR Method adherence, THE Prep_Pilot SHALL evaluate whether the User's responses include each of the four STAR_Method components: Situation, Task, Action, and Result, and assign a higher score when all four components are clearly present
5. WHEN scoring Overall Response Relevancy, THE Prep_Pilot SHALL evaluate whether the User's responses directly address the topic of the question asked without introducing unrelated information
6. IF an Interview_Session concludes with fewer than 3 answered questions, THEN THE Prep_Pilot SHALL notify the User that an Interview_Readiness_Score cannot be generated due to insufficient responses

### Requirement 5: Resume Relevancy Scoring

**User Story:** As a user, I want to know how well my interview responses align with my resume, so that I can ensure consistency between what I say and what my resume presents.

#### Acceptance Criteria

1. WHEN an Interview_Session concludes, THE Prep_Pilot SHALL generate a Resume_Relevancy_Score as an integer value between 1 and 10, where 1 indicates no alignment between responses and Resume content and 10 indicates full alignment
2. WHEN calculating the Resume_Relevancy_Score, THE Prep_Pilot SHALL evaluate each interview response by identifying skills and experiences claimed by the User and determining whether each claim is supported by content present on the uploaded Resume
3. WHEN calculating the Resume_Relevancy_Score, THE Prep_Pilot SHALL lower the score for responses that contain claims about skills or experiences not present on the uploaded Resume
4. WHEN the Resume_Relevancy_Score is generated, THE Prep_Pilot SHALL provide a per-question reasoning that identifies which specific claims in each response were supported by the Resume and which were not
5. IF the Interview_Session responses contain no claims about skills or experiences that can be compared to the Resume, THEN THE Prep_Pilot SHALL assign a Resume_Relevancy_Score of 5 and indicate that insufficient comparable content was available for scoring

### Requirement 6: Feedback System

**User Story:** As a user, I want to receive detailed feedback after my interview, so that I know exactly how to improve my responses.

#### Acceptance Criteria

1. WHEN an Interview_Session concludes, THE Prep_Pilot SHALL generate a Feedback_Report for the User within 60 seconds of session conclusion
2. WHEN generating the Feedback_Report, THE Prep_Pilot SHALL include an improved answer suggestion for each question answered during the Interview_Session, demonstrating how the User's original response could better address the question
3. WHEN generating the Feedback_Report, THE Prep_Pilot SHALL include between 2 and 5 follow-up questions that are related to the topics covered during the Interview_Session and aligned with the selected role or uploaded Job_Description
4. WHEN generating the Feedback_Report, THE Prep_Pilot SHALL include reasoning for each evaluation score assigned in the Interview_Readiness_Score, referencing the User's actual responses that influenced the score
5. WHEN generating the Feedback_Report, THE Prep_Pilot SHALL include at least 1 actionable improvement suggestion per scored dimension, referencing the User's actual responses and describing what the User should do differently
6. IF an Interview_Session concludes with no questions answered by the User, THEN THE Prep_Pilot SHALL not generate a Feedback_Report and SHALL display a message indicating that at least one question must be answered to receive feedback

### Requirement 7: Voice Interaction

**User Story:** As a user, I want to interact with the interview agent using my voice, so that the experience simulates a real interview conversation.

#### Acceptance Criteria

1. WHILE an Interview_Session is active, THE Prep_Pilot SHALL accept voice input from the User through the Voice_API, with a maximum single recording duration of 120 seconds per response
2. WHILE an Interview_Session is active, THE Prep_Pilot SHALL accept text input from the User as an alternative to voice input
3. WHEN the User provides voice input, THE Prep_Pilot SHALL transcribe the voice input into text within 10 seconds of the User completing their spoken response and display the transcribed text to the User before processing
4. WHEN the Prep_Pilot generates a response, THE Prep_Pilot SHALL deliver the response through both voice output and text display simultaneously
5. IF the Voice_API fails to process voice input, THEN THE Prep_Pilot SHALL display an error message indicating the voice service is unavailable and prompt the User to continue using text input
6. IF the Voice_API returns a transcription with no recognizable words, THEN THE Prep_Pilot SHALL inform the User that the input was not understood and prompt the User to repeat their response or switch to text input

### Requirement 8: Python Core Implementation

**User Story:** As a developer, I want the system built with Python at its core, so that the team can leverage Python's AI/ML ecosystem for interview intelligence.

#### Acceptance Criteria

1. THE Prep_Pilot SHALL implement core application logic using Python 3.10 or higher, including resume parsing, question generation, interview evaluation, scoring, and feedback generation
2. THE Prep_Pilot SHALL use Python-based libraries for AI model integration, natural language processing, and resume parsing
3. THE Prep_Pilot SHALL expose any non-Python components (such as front-end interfaces) through well-defined interfaces that communicate with the Python core
