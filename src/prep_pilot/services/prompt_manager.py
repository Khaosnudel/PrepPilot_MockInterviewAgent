"""Prompt Manager - Manages prompt templates for all LLM operations."""

from typing import Optional

from prep_pilot.models.domain import (
    InterviewQuestion,
    InterviewSession,
    ParsedJobDescription,
    ParsedResume,
    QuestionResponse,
)


class PromptManager:
    """Manages prompt templates for question generation, evaluation, and feedback.

    Generates detailed system and user prompts for each LLM operation,
    including instructions for structured output where needed.
    """

    # --- Question Generation Prompts ---

    def get_question_generation_prompt(
        self,
        role: str,
        resume: ParsedResume,
        mode: str,
        job_description: Optional[ParsedJobDescription] = None,
        count: int = 10,
    ) -> tuple[str, str]:
        """Get system and user prompts for interview question generation.

        Args:
            role: The target role for the interview.
            resume: Parsed resume data with skills, experiences, qualifications.
            mode: Either "open_practice" or "job_specific".
            job_description: Parsed JD data (required for job_specific mode).
            count: Number of questions to generate (5-15 for open practice).

        Returns:
            A tuple of (system_prompt, user_prompt).
        """
        if mode == "job_specific" and job_description is not None:
            return self._get_job_specific_question_prompt(
                resume, job_description, count
            )
        return self._get_open_practice_question_prompt(role, resume, count)

    def _get_open_practice_question_prompt(
        self, role: str, resume: ParsedResume, count: int
    ) -> tuple[str, str]:
        """Generate prompts for open practice mode question generation."""
        system_prompt = (
            "You are an expert interview coach specializing in conducting "
            "realistic mock interviews. Your task is to generate interview "
            "questions for a candidate based on their resume and target role.\n\n"
            "Rules:\n"
            "- Generate questions that are relevant to the target role.\n"
            "- Each question MUST reference at least one specific skill, "
            "experience, or qualification from the candidate's resume.\n"
            "- Include a mix of behavioral, technical, and situational questions.\n"
            "- Questions should progressively increase in difficulty.\n"
            "- Each question must have a category (behavioral, technical, or situational).\n"
            "- Each question must specify which resume item it references in the "
            "'references_resume_item' field.\n\n"
            "Output format: Return a JSON array of objects with fields:\n"
            '- "id": unique string identifier (e.g., "q1", "q2")\n'
            '- "text": the interview question text\n'
            '- "category": one of "behavioral", "technical", "situational"\n'
            '- "references_resume_item": the specific skill, experience, or '
            "qualification from the resume that this question references"
        )

        resume_summary = self._format_resume_context(resume)

        user_prompt = (
            f"Generate exactly {count} interview questions for a candidate "
            f"applying for the role of **{role}**.\n\n"
            f"Candidate's Resume:\n{resume_summary}\n\n"
            f"Generate {count} questions that reference the candidate's "
            f"background while being relevant to the {role} position."
        )

        return system_prompt, user_prompt

    def _get_job_specific_question_prompt(
        self,
        resume: ParsedResume,
        job_description: ParsedJobDescription,
        count: int,
    ) -> tuple[str, str]:
        """Generate prompts for job-specific mode question generation."""
        system_prompt = (
            "You are an expert interview coach specializing in conducting "
            "targeted mock interviews for specific job positions. Your task is "
            "to generate interview questions that assess the candidate's fit "
            "for a specific role based on both their resume and the job description.\n\n"
            "Rules:\n"
            "- Each question MUST reference at least one specific requirement, "
            "responsibility, or qualification from the job description.\n"
            "- Each question MUST also reference at least one skill, experience, "
            "or qualification from the candidate's resume.\n"
            "- PRIORITIZE questions that address intersections between the job "
            "description requirements and the candidate's resume (skills/experiences "
            "that appear in both). These intersection questions MUST appear FIRST "
            "in the list.\n"
            "- After intersection questions, include questions that reference "
            "job description items not directly matched in the resume.\n"
            "- Include a mix of behavioral, technical, and situational questions.\n"
            "- Each question must have a category and specify both the resume item "
            "and JD item it references.\n\n"
            "Output format: Return a JSON array of objects with fields:\n"
            '- "id": unique string identifier (e.g., "q1", "q2")\n'
            '- "text": the interview question text\n'
            '- "category": one of "behavioral", "technical", "situational"\n'
            '- "references_resume_item": the specific skill/experience from the resume\n'
            '- "references_jd_item": the specific requirement/responsibility from the JD'
        )

        resume_summary = self._format_resume_context(resume)
        jd_summary = self._format_jd_context(job_description)

        user_prompt = (
            f"Generate at least {count} interview questions for a candidate "
            f"applying to the following position.\n\n"
            f"Candidate's Resume:\n{resume_summary}\n\n"
            f"Job Description:\n{jd_summary}\n\n"
            f"Generate questions that prioritize intersections between the "
            f"candidate's background and the job requirements. Intersection "
            f"questions (where resume skills match JD requirements) must appear "
            f"first in the list."
        )

        return system_prompt, user_prompt

    # --- Evaluation Prompts ---

    def get_evaluation_prompt(
        self,
        dimension: str,
        question: str,
        response: str,
        resume: Optional[ParsedResume] = None,
    ) -> tuple[str, str]:
        """Get system and user prompts for evaluating a response on a dimension.

        Args:
            dimension: One of "clarity", "technical_accuracy", "star_method",
                       "relevancy".
            question: The interview question that was asked.
            response: The candidate's response text.
            resume: Optional parsed resume for context.

        Returns:
            A tuple of (system_prompt, user_prompt).
        """
        dimension_prompts = {
            "clarity": self._get_clarity_evaluation_prompt,
            "technical_accuracy": self._get_technical_accuracy_evaluation_prompt,
            "star_method": self._get_star_method_evaluation_prompt,
            "relevancy": self._get_relevancy_evaluation_prompt,
        }

        if dimension not in dimension_prompts:
            raise ValueError(
                f"Unknown evaluation dimension: {dimension}. "
                f"Must be one of: {list(dimension_prompts.keys())}"
            )

        return dimension_prompts[dimension](question, response, resume)

    def _get_clarity_evaluation_prompt(
        self,
        question: str,
        response: str,
        resume: Optional[ParsedResume] = None,
    ) -> tuple[str, str]:
        """Prompt for evaluating clarity of communication."""
        system_prompt = (
            "You are an expert interview evaluator assessing the clarity of "
            "communication in interview responses.\n\n"
            "Evaluate the response on a scale of 1-10 based on:\n"
            "- Logical structure: Does the response follow a clear, organized flow?\n"
            "- Concise language: Is the response free of unnecessary verbosity?\n"
            "- Absence of ambiguity: Are statements clear and unambiguous?\n"
            "- Minimal filler words: Does the response avoid excessive filler "
            '(e.g., "um", "like", "you know")?\n'
            "- Coherence: Do ideas connect logically from one to the next?\n\n"
            "Scoring guide:\n"
            "- 1-3: Disorganized, unclear, excessive filler, hard to follow\n"
            "- 4-6: Somewhat organized but with notable clarity issues\n"
            "- 7-9: Well-structured, clear, concise with minor issues\n"
            "- 10: Exceptionally clear, perfectly structured, no ambiguity\n\n"
            "Output format: Return a JSON object with fields:\n"
            '- "score": integer from 1 to 10\n'
            '- "reasoning": explanation of the score referencing specific parts '
            "of the response"
        )

        user_prompt = (
            f"Evaluate the clarity of communication in this interview response.\n\n"
            f"Question asked: {question}\n\n"
            f"Candidate's response: {response}\n\n"
            f"Provide a score from 1-10 and reasoning."
        )

        return system_prompt, user_prompt

    def _get_technical_accuracy_evaluation_prompt(
        self,
        question: str,
        response: str,
        resume: Optional[ParsedResume] = None,
    ) -> tuple[str, str]:
        """Prompt for evaluating technical accuracy."""
        system_prompt = (
            "You are an expert interview evaluator assessing the technical "
            "accuracy of interview responses.\n\n"
            "Evaluate the response on a scale of 1-10 based on:\n"
            "- Correctness of technical claims: Are technical statements factually accurate?\n"
            "- Specificity: Does the candidate provide specific technical details "
            "rather than vague generalizations?\n"
            "- Depth of understanding: Does the response demonstrate genuine "
            "understanding of the technical concepts mentioned?\n"
            "- Appropriate terminology: Is technical vocabulary used correctly?\n"
            "- Practical application: Does the candidate show how technical "
            "knowledge was applied in practice?\n\n"
            "Scoring guide:\n"
            "- 1-3: Incorrect claims, vague, shows misunderstanding\n"
            "- 4-6: Partially correct but lacks specificity or depth\n"
            "- 7-9: Accurate, specific, demonstrates solid understanding\n"
            "- 10: Exceptionally accurate, deeply specific, expert-level detail\n\n"
            "Output format: Return a JSON object with fields:\n"
            '- "score": integer from 1 to 10\n'
            '- "reasoning": explanation of the score referencing specific '
            "technical claims in the response"
        )

        user_prompt = (
            f"Evaluate the technical accuracy of this interview response.\n\n"
            f"Question asked: {question}\n\n"
            f"Candidate's response: {response}\n\n"
            f"Provide a score from 1-10 and reasoning."
        )

        return system_prompt, user_prompt

    def _get_star_method_evaluation_prompt(
        self,
        question: str,
        response: str,
        resume: Optional[ParsedResume] = None,
    ) -> tuple[str, str]:
        """Prompt for evaluating STAR method adherence."""
        system_prompt = (
            "You are an expert interview evaluator assessing adherence to the "
            "STAR method (Situation, Task, Action, Result) in interview responses.\n\n"
            "Evaluate the response on a scale of 1-10 based on the presence and "
            "quality of each STAR component:\n"
            "- Situation: Does the candidate clearly describe the context or "
            "background of the scenario?\n"
            "- Task: Does the candidate explain their specific responsibility "
            "or challenge within the situation?\n"
            "- Action: Does the candidate detail the specific steps they took "
            "to address the task?\n"
            "- Result: Does the candidate describe the outcome, including "
            "measurable impact where possible?\n\n"
            "Scoring guide:\n"
            "- 1-3: Missing most STAR components, no structured narrative\n"
            "- 4-5: Has 1-2 STAR components but missing others\n"
            "- 6-7: Has 3 STAR components or all 4 with weak detail\n"
            "- 8-9: All 4 STAR components present with good detail\n"
            "- 10: All 4 STAR components clearly present with excellent detail "
            "and measurable results\n\n"
            "Output format: Return a JSON object with fields:\n"
            '- "score": integer from 1 to 10\n'
            '- "reasoning": explanation identifying which STAR components are '
            "present/missing and their quality"
        )

        user_prompt = (
            f"Evaluate the STAR method adherence in this interview response.\n\n"
            f"Question asked: {question}\n\n"
            f"Candidate's response: {response}\n\n"
            f"Identify which STAR components (Situation, Task, Action, Result) "
            f"are present and provide a score from 1-10."
        )

        return system_prompt, user_prompt

    def _get_relevancy_evaluation_prompt(
        self,
        question: str,
        response: str,
        resume: Optional[ParsedResume] = None,
    ) -> tuple[str, str]:
        """Prompt for evaluating overall response relevancy."""
        system_prompt = (
            "You are an expert interview evaluator assessing the relevancy of "
            "interview responses to the questions asked.\n\n"
            "Evaluate the response on a scale of 1-10 based on:\n"
            "- Direct address: Does the response directly answer the question asked?\n"
            "- Topic alignment: Does the response stay on topic throughout?\n"
            "- Absence of tangents: Does the response avoid introducing unrelated "
            "information or going off on tangents?\n"
            "- Completeness: Does the response fully address all parts of the question?\n"
            "- Focus: Is the core of the response centered on what was asked?\n\n"
            "Scoring guide:\n"
            "- 1-3: Does not address the question, mostly irrelevant content\n"
            "- 4-6: Partially addresses the question but includes significant tangents\n"
            "- 7-9: Directly addresses the question with minimal irrelevant content\n"
            "- 10: Perfectly focused, fully addresses the question with no tangents\n\n"
            "Output format: Return a JSON object with fields:\n"
            '- "score": integer from 1 to 10\n'
            '- "reasoning": explanation of how well the response addresses the '
            "specific question asked"
        )

        user_prompt = (
            f"Evaluate the relevancy of this interview response to the question.\n\n"
            f"Question asked: {question}\n\n"
            f"Candidate's response: {response}\n\n"
            f"Provide a score from 1-10 and reasoning."
        )

        return system_prompt, user_prompt

    # --- Resume Relevancy Prompt ---

    def get_resume_relevancy_prompt(
        self,
        questions: list[InterviewQuestion],
        responses: list[str],
        resume: ParsedResume,
    ) -> tuple[str, str]:
        """Get prompts for evaluating resume relevancy across all responses.

        Evaluates alignment between interview responses and resume content,
        identifying supported and unsupported claims.

        Args:
            questions: List of interview questions asked.
            responses: List of candidate response texts (parallel to questions).
            resume: Parsed resume for comparison.

        Returns:
            A tuple of (system_prompt, user_prompt).
        """
        system_prompt = (
            "You are an expert interview evaluator assessing how well a "
            "candidate's interview responses align with their resume content.\n\n"
            "Your task:\n"
            "1. For each question-response pair, identify skills and experiences "
            "claimed by the candidate in their response.\n"
            "2. Determine whether each claim is supported by content present on "
            "the candidate's resume.\n"
            "3. A claim is 'supported' if the resume contains matching skills, "
            "experiences, or qualifications.\n"
            "4. A claim is 'unsupported' if the candidate mentions skills or "
            "experiences not found anywhere in the resume.\n"
            "5. Lower the overall score for responses containing unsupported claims.\n"
            "6. If no comparable claims exist in the responses, assign a score of 5.\n\n"
            "Scoring guide (1-10):\n"
            "- 1-3: Most claims are unsupported by the resume\n"
            "- 4-5: Mix of supported and unsupported claims, or no comparable claims\n"
            "- 6-8: Most claims are supported by the resume\n"
            "- 9-10: All claims are fully supported by resume content\n\n"
            "Output format: Return a JSON object with fields:\n"
            '- "score": integer from 1 to 10\n'
            '- "per_question_reasoning": array of objects, one per question, with:\n'
            '  - "question_id": the question identifier\n'
            '  - "supported_claims": list of claims supported by the resume\n'
            '  - "unsupported_claims": list of claims not found in the resume\n'
            '  - "reasoning": explanation of the alignment assessment'
        )

        resume_summary = self._format_resume_context(resume)

        qa_pairs = self._format_qa_pairs(questions, responses)

        user_prompt = (
            f"Evaluate the resume relevancy of the following interview responses.\n\n"
            f"Candidate's Resume:\n{resume_summary}\n\n"
            f"Interview Questions and Responses:\n{qa_pairs}\n\n"
            f"For each response, identify supported and unsupported claims "
            f"relative to the resume, and provide an overall score from 1-10."
        )

        return system_prompt, user_prompt

    # --- Feedback Prompt ---

    def get_feedback_prompt(
        self, session: InterviewSession
    ) -> tuple[str, str]:
        """Get prompts for generating a complete feedback report.

        Generates improved answers, follow-up questions, score reasoning,
        and improvement suggestions.

        Args:
            session: The concluded interview session with all data.

        Returns:
            A tuple of (system_prompt, user_prompt).
        """
        system_prompt = (
            "You are an expert interview coach generating a comprehensive "
            "feedback report for a candidate after a mock interview session.\n\n"
            "Your feedback report must include:\n\n"
            "1. **Improved Answers**: For EACH question answered, provide an "
            "improved version of the candidate's response that better addresses "
            "the question. The improved answer should demonstrate ideal structure, "
            "specificity, and relevance.\n\n"
            "2. **Follow-up Questions**: Generate between 2 and 5 follow-up "
            "questions related to the topics covered during the interview. These "
            "should help the candidate prepare for deeper exploration of the "
            "same topics.\n\n"
            "3. **Score Reasoning**: For each of the 4 evaluation dimensions "
            "(clarity_of_communication, technical_accuracy, star_method_adherence, "
            "overall_response_relevancy), provide:\n"
            "   - The dimension name\n"
            "   - A score from 1-10\n"
            "   - Detailed reasoning referencing the candidate's actual responses\n"
            "   - List of specific responses that influenced the score\n\n"
            "4. **Improvement Suggestions**: Provide at least 1 actionable "
            "improvement suggestion per scored dimension (minimum 4 total). Each "
            "suggestion must:\n"
            "   - Reference a specific response from the candidate\n"
            "   - Describe what the candidate should do differently\n"
            "   - Be actionable and specific\n\n"
            "Output format: Return a JSON object with fields:\n"
            '- "improved_answers": array of objects with "question_id", '
            '"original_response", "improved_response"\n'
            '- "follow_up_questions": array of 2-5 question strings\n'
            '- "score_reasoning": array of exactly 4 objects with "dimension", '
            '"score", "reasoning", "referenced_responses"\n'
            '- "improvement_suggestions": array of at least 4 objects with '
            '"dimension", "suggestion", "referenced_response"'
        )

        # Build context from session data
        role_context = self._get_role_context(session)
        qa_section = self._format_session_qa(session)
        resume_summary = self._format_resume_context(session.resume)

        user_prompt = (
            f"Generate a comprehensive feedback report for this mock interview.\n\n"
            f"Interview Context:\n{role_context}\n\n"
            f"Candidate's Resume:\n{resume_summary}\n\n"
            f"Interview Questions and Responses:\n{qa_section}\n\n"
            f"Provide improved answers for each question, 2-5 follow-up questions, "
            f"score reasoning for all 4 dimensions, and at least 4 improvement "
            f"suggestions (at least 1 per dimension)."
        )

        return system_prompt, user_prompt

    # --- Helper Methods ---

    def _format_resume_context(self, resume: ParsedResume) -> str:
        """Format parsed resume data into a readable context string."""
        sections = []

        if resume.skills:
            sections.append(f"Skills: {', '.join(resume.skills)}")

        if resume.experiences:
            exp_lines = []
            for exp in resume.experiences:
                exp_lines.append(
                    f"- {exp.title} at {exp.company} ({exp.duration}): "
                    f"{exp.description}"
                )
                if exp.skills_used:
                    exp_lines.append(
                        f"  Skills used: {', '.join(exp.skills_used)}"
                    )
            sections.append("Experiences:\n" + "\n".join(exp_lines))

        if resume.qualifications:
            sections.append(
                "Qualifications: " + ", ".join(resume.qualifications)
            )

        return "\n\n".join(sections) if sections else "No resume data available."

    def _format_jd_context(self, jd: ParsedJobDescription) -> str:
        """Format parsed job description into a readable context string."""
        sections = []

        if jd.summary:
            sections.append(f"Summary: {jd.summary}")

        if jd.requirements:
            sections.append(
                "Requirements:\n" + "\n".join(f"- {r}" for r in jd.requirements)
            )

        if jd.responsibilities:
            sections.append(
                "Responsibilities:\n"
                + "\n".join(f"- {r}" for r in jd.responsibilities)
            )

        if jd.qualifications:
            sections.append(
                "Qualifications:\n"
                + "\n".join(f"- {q}" for q in jd.qualifications)
            )

        return "\n\n".join(sections) if sections else "No job description data available."

    def _format_qa_pairs(
        self, questions: list[InterviewQuestion], responses: list[str]
    ) -> str:
        """Format question-response pairs for prompt context."""
        pairs = []
        for i, (q, r) in enumerate(zip(questions, responses), 1):
            pairs.append(
                f"Q{i} (ID: {q.id}, Category: {q.category}): {q.text}\n"
                f"A{i}: {r}"
            )
        return "\n\n".join(pairs) if pairs else "No responses recorded."

    def _format_session_qa(self, session: InterviewSession) -> str:
        """Format session question-response pairs from QuestionResponse objects."""
        pairs = []
        for i, qr in enumerate(session.responses, 1):
            pairs.append(
                f"Q{i} (ID: {qr.question.id}, Category: {qr.question.category}): "
                f"{qr.question.text}\n"
                f"A{i}: {qr.response_text}"
            )
        return "\n\n".join(pairs) if pairs else "No responses recorded."

    def _get_role_context(self, session: InterviewSession) -> str:
        """Get role/mode context string from session."""
        if session.mode.value == "job_specific" and session.job_description:
            return (
                f"Mode: Job Specific\n"
                f"Job Description Summary: {session.job_description.summary}"
            )
        role = session.selected_role or "General"
        return f"Mode: Open Practice\nTarget Role: {role}"
