"""Job Description Parser - Extracts structured data from job description documents."""

import io
import logging
from typing import Optional

from pydantic import BaseModel, Field

from prep_pilot.models.domain import ParsedJobDescription
from prep_pilot.services.llm_client import LLMClient, LLMClientError

logger = logging.getLogger(__name__)


class ParsedJDSchema(BaseModel):
    """Pydantic schema for LLM structured output of job description parsing."""

    requirements: list[str] = Field(
        default_factory=list,
        description="List of role requirements extracted from the job description",
    )
    responsibilities: list[str] = Field(
        default_factory=list,
        description="List of job responsibilities extracted from the job description",
    )
    qualifications: list[str] = Field(
        default_factory=list,
        description="List of desired qualifications extracted from the job description",
    )
    summary: str = Field(
        default="",
        description="A brief summary of the role described in the job description",
    )


class JDParserError(Exception):
    """Base exception for job description parsing errors."""


class JDExtractionError(JDParserError):
    """Raised when text extraction from the document fails."""


class JDContentError(JDParserError):
    """Raised when the document has no identifiable job description content."""


class JobDescriptionParser:
    """Parses job description documents and extracts structured information.

    Supports PDF, DOCX, and plain text formats. Uses an LLM client to
    perform structured extraction of requirements, responsibilities,
    qualifications, and a summary from the raw text.
    """

    _SYSTEM_PROMPT = (
        "You are an expert job description analyst. Your task is to extract "
        "structured information from a job description document.\n\n"
        "Extract the following:\n"
        "1. **Requirements**: Technical skills, tools, frameworks, or specific "
        "capabilities required for the role.\n"
        "2. **Responsibilities**: Day-to-day duties and tasks the role involves.\n"
        "3. **Qualifications**: Education, certifications, years of experience, "
        "or other formal qualifications.\n"
        "4. **Summary**: A brief 1-2 sentence summary of the role.\n\n"
        "Rules:\n"
        "- Extract actual content from the document; do not invent information.\n"
        "- If a section is not present in the document, return an empty list "
        "for that field.\n"
        "- Each item in requirements, responsibilities, and qualifications "
        "should be a concise, standalone statement.\n"
        "- The summary should capture the role title and primary purpose."
    )

    def __init__(self, llm_client: LLMClient) -> None:
        """Initialize the parser with an LLM client.

        Args:
            llm_client: The LLM client to use for structured extraction.
        """
        self._llm_client = llm_client

    async def parse(
        self, file_content: bytes, file_type: str
    ) -> ParsedJobDescription:
        """Parse a job description document and extract structured data.

        Args:
            file_content: The raw bytes of the uploaded file.
            file_type: The MIME type of the file (e.g., "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "text/plain").

        Returns:
            A ParsedJobDescription with extracted requirements, responsibilities,
            qualifications, and summary.

        Raises:
            JDExtractionError: If the document cannot be read or is corrupted.
            JDContentError: If no identifiable job description content is found.
            JDParserError: For other parsing failures.
        """
        if not file_content:
            raise JDExtractionError("File content is empty.")

        # Extract raw text from the document
        raw_text = self._extract_text(file_content, file_type)

        if not raw_text or not raw_text.strip():
            raise JDContentError(
                "The document contains no readable text content."
            )

        # Use LLM to extract structured data
        parsed = await self._extract_structured_data(raw_text)

        # Validate that we got meaningful content
        if (
            not parsed.requirements
            and not parsed.responsibilities
            and not parsed.qualifications
        ):
            raise JDContentError(
                "No identifiable requirements, responsibilities, or "
                "qualifications found in the document."
            )

        return ParsedJobDescription(
            requirements=parsed.requirements,
            responsibilities=parsed.responsibilities,
            qualifications=parsed.qualifications,
            summary=parsed.summary,
        )

    def _extract_text(self, file_content: bytes, file_type: str) -> str:
        """Extract raw text from the document based on file type.

        Args:
            file_content: The raw bytes of the file.
            file_type: The MIME type of the file.

        Returns:
            The extracted text content.

        Raises:
            JDExtractionError: If the file cannot be read.
        """
        extractors = {
            "application/pdf": self._extract_text_from_pdf,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": self._extract_text_from_docx,
            "text/plain": self._extract_text_from_txt,
        }

        extractor = extractors.get(file_type)
        if extractor is None:
            raise JDExtractionError(
                f"Unsupported file type: {file_type}. "
                f"Supported types: PDF, DOCX, TXT."
            )

        try:
            return extractor(file_content)
        except JDExtractionError:
            raise
        except Exception as exc:
            raise JDExtractionError(
                f"Failed to extract text from document: {exc}"
            ) from exc

    def _extract_text_from_pdf(self, file_content: bytes) -> str:
        """Extract text from a PDF file using PyPDF2.

        Args:
            file_content: The raw bytes of the PDF file.

        Returns:
            The extracted text content.

        Raises:
            JDExtractionError: If the PDF cannot be read.
        """
        try:
            from PyPDF2 import PdfReader
        except ImportError as exc:
            raise JDExtractionError(
                "PyPDF2 is required for PDF parsing but is not installed."
            ) from exc

        try:
            reader = PdfReader(io.BytesIO(file_content))
            text_parts: list[str] = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            return "\n".join(text_parts)
        except Exception as exc:
            raise JDExtractionError(
                f"Failed to read PDF file. The file may be corrupted or "
                f"password-protected: {exc}"
            ) from exc

    def _extract_text_from_docx(self, file_content: bytes) -> str:
        """Extract text from a DOCX file using python-docx.

        Args:
            file_content: The raw bytes of the DOCX file.

        Returns:
            The extracted text content.

        Raises:
            JDExtractionError: If the DOCX cannot be read.
        """
        try:
            from docx import Document
        except ImportError as exc:
            raise JDExtractionError(
                "python-docx is required for DOCX parsing but is not installed."
            ) from exc

        try:
            doc = Document(io.BytesIO(file_content))
            text_parts: list[str] = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_parts.append(paragraph.text)
            return "\n".join(text_parts)
        except Exception as exc:
            raise JDExtractionError(
                f"Failed to read DOCX file. The file may be corrupted: {exc}"
            ) from exc

    def _extract_text_from_txt(self, file_content: bytes) -> str:
        """Extract text from a plain text file.

        Args:
            file_content: The raw bytes of the text file.

        Returns:
            The decoded text content.

        Raises:
            JDExtractionError: If the file cannot be decoded.
        """
        try:
            return file_content.decode("utf-8")
        except UnicodeDecodeError:
            try:
                return file_content.decode("latin-1")
            except Exception as exc:
                raise JDExtractionError(
                    f"Failed to decode text file: {exc}"
                ) from exc

    async def _extract_structured_data(
        self, raw_text: str
    ) -> ParsedJDSchema:
        """Use the LLM to extract structured job description data from raw text.

        Args:
            raw_text: The raw text content of the job description.

        Returns:
            A ParsedJDSchema with extracted fields.

        Raises:
            JDParserError: If the LLM call fails.
        """
        user_prompt = (
            "Extract structured information from the following job description:\n\n"
            f"{raw_text}\n\n"
            "Provide the requirements, responsibilities, qualifications, and "
            "a brief summary of the role."
        )

        try:
            result = await self._llm_client.generate_structured(
                prompt=user_prompt,
                system_prompt=self._SYSTEM_PROMPT,
                schema=ParsedJDSchema,
            )
            return result
        except LLMClientError as exc:
            raise JDParserError(
                f"Failed to extract structured data from job description: {exc}"
            ) from exc
