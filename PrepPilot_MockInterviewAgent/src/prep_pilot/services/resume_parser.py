"""Resume parser service for extracting structured data from resume documents."""

import io
import logging
from typing import Optional

from pydantic import BaseModel, Field

from prep_pilot.models.domain import Experience, ParsedResume
from prep_pilot.services.llm_client import LLMClient, LLMClientError

logger = logging.getLogger(__name__)


class ResumeParseError(Exception):
    """Raised when resume parsing fails."""


class _ExperienceSchema(BaseModel):
    """Pydantic schema for a single experience entry (used for LLM extraction)."""

    title: str = Field(description="Job title or role name")
    company: str = Field(description="Company or organization name")
    duration: str = Field(description="Duration of the role (e.g., '2 years', '2019-2021')")
    description: str = Field(description="Brief description of the role and responsibilities")
    skills_used: list[str] = Field(
        default_factory=list,
        description="Technical and soft skills used in this role",
    )


class _ParsedResumeSchema(BaseModel):
    """Pydantic schema for structured resume extraction (used for LLM output)."""

    skills: list[str] = Field(
        default_factory=list,
        description="All identifiable technical and soft skills",
    )
    experiences: list[_ExperienceSchema] = Field(
        default_factory=list,
        description="Work experiences extracted from the resume",
    )
    qualifications: list[str] = Field(
        default_factory=list,
        description="Educational qualifications, certifications, and credentials",
    )


_RESUME_EXTRACTION_SYSTEM_PROMPT = (
    "You are an expert resume parser. Your task is to extract structured "
    "information from a resume's raw text content.\n\n"
    "Extract the following:\n"
    "1. **Skills**: All identifiable technical skills (programming languages, "
    "frameworks, tools) and soft skills (leadership, communication, etc.).\n"
    "2. **Experiences**: Each work experience entry with title, company, "
    "duration, description, and skills used in that role.\n"
    "3. **Qualifications**: Educational degrees, certifications, professional "
    "credentials, and relevant coursework.\n\n"
    "Rules:\n"
    "- Extract only information explicitly stated in the resume text.\n"
    "- Do not infer or fabricate information not present in the text.\n"
    "- If a section is not present or empty, return an empty list for that field.\n"
    "- For experiences, extract as many distinct roles as identifiable.\n"
    "- Skills should be deduplicated and normalized (e.g., 'JS' -> 'JavaScript')."
)


class ResumeParser:
    """Parses resume documents (PDF, DOCX) and extracts structured data.

    Uses PyPDF2 for PDF text extraction and python-docx for DOCX text extraction,
    then passes the raw text to an LLM for structured information extraction.

    Args:
        llm_client: An instance of LLMClient for structured extraction.
    """

    def __init__(self, llm_client: LLMClient) -> None:
        self._llm_client = llm_client

    async def parse(self, file_content: bytes, file_type: str) -> ParsedResume:
        """Parse a resume file and extract skills, experiences, and qualifications.

        Args:
            file_content: Raw bytes of the resume file.
            file_type: MIME type of the file. Supported types:
                - "application/pdf"
                - "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

        Returns:
            A ParsedResume dataclass with extracted skills, experiences,
            qualifications, and the raw text.

        Raises:
            ResumeParseError: If the file cannot be parsed (corrupted, empty,
                unsupported format, or LLM extraction fails).
        """
        if not file_content:
            raise ResumeParseError("File content is empty.")

        # Extract raw text based on file type
        raw_text = self._extract_text(file_content, file_type)

        if not raw_text.strip():
            raise ResumeParseError(
                "Unable to extract readable text from the document. "
                "Please ensure the file contains text content."
            )

        # Use LLM for structured extraction
        parsed_data = await self._extract_structured_data(raw_text)

        return ParsedResume(
            skills=parsed_data.skills,
            experiences=[
                Experience(
                    title=exp.title,
                    company=exp.company,
                    duration=exp.duration,
                    description=exp.description,
                    skills_used=exp.skills_used,
                )
                for exp in parsed_data.experiences
            ],
            qualifications=parsed_data.qualifications,
            raw_text=raw_text,
        )

    def _extract_text(self, file_content: bytes, file_type: str) -> str:
        """Extract raw text from a file based on its MIME type.

        Args:
            file_content: Raw bytes of the file.
            file_type: MIME type of the file.

        Returns:
            Extracted text content as a string.

        Raises:
            ResumeParseError: If the file type is unsupported or extraction fails.
        """
        if file_type == "application/pdf":
            return self._extract_text_from_pdf(file_content)
        elif (
            file_type
            == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ):
            return self._extract_text_from_docx(file_content)
        else:
            raise ResumeParseError(
                f"Unsupported file type: '{file_type}'. "
                "Supported formats are PDF and DOCX."
            )

    def _extract_text_from_pdf(self, file_content: bytes) -> str:
        """Extract text from a PDF file using PyPDF2.

        Args:
            file_content: Raw bytes of the PDF file.

        Returns:
            Extracted text from all pages concatenated.

        Raises:
            ResumeParseError: If the PDF cannot be read.
        """
        try:
            from PyPDF2 import PdfReader

            reader = PdfReader(io.BytesIO(file_content))
            pages_text: list[str] = []
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    pages_text.append(text)
            return "\n".join(pages_text)
        except Exception as exc:
            logger.error("Failed to extract text from PDF: %s", exc)
            raise ResumeParseError(
                "Unable to parse the PDF document. "
                "The file may be corrupted or password-protected."
            ) from exc

    def _extract_text_from_docx(self, file_content: bytes) -> str:
        """Extract text from a DOCX file using python-docx.

        Args:
            file_content: Raw bytes of the DOCX file.

        Returns:
            Extracted text from all paragraphs concatenated.

        Raises:
            ResumeParseError: If the DOCX cannot be read.
        """
        try:
            from docx import Document

            doc = Document(io.BytesIO(file_content))
            paragraphs_text: list[str] = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    paragraphs_text.append(paragraph.text)
            return "\n".join(paragraphs_text)
        except Exception as exc:
            logger.error("Failed to extract text from DOCX: %s", exc)
            raise ResumeParseError(
                "Unable to parse the DOCX document. "
                "The file may be corrupted or in an unsupported format."
            ) from exc

    async def _extract_structured_data(
        self, raw_text: str
    ) -> _ParsedResumeSchema:
        """Use the LLM to extract structured resume data from raw text.

        Args:
            raw_text: The raw text content extracted from the resume file.

        Returns:
            A _ParsedResumeSchema with extracted fields.

        Raises:
            ResumeParseError: If the LLM extraction fails.
        """
        user_prompt = (
            f"Extract structured information from the following resume text:\n\n"
            f"---\n{raw_text}\n---\n\n"
            f"Return the extracted skills, experiences, and qualifications."
        )

        try:
            result = await self._llm_client.generate_structured(
                prompt=user_prompt,
                system_prompt=_RESUME_EXTRACTION_SYSTEM_PROMPT,
                schema=_ParsedResumeSchema,
            )
            return result
        except LLMClientError as exc:
            logger.error("LLM extraction failed for resume: %s", exc)
            raise ResumeParseError(
                "Failed to extract structured data from the resume. "
                "Please try again later."
            ) from exc
