"""Unit tests for the ResumeParser service."""

import io
from unittest.mock import AsyncMock, patch

import pytest

from prep_pilot.models.domain import Experience, ParsedResume
from prep_pilot.services.llm_client import LLMClient, LLMClientError
from prep_pilot.services.resume_parser import (
    ResumeParseError,
    ResumeParser,
    _ParsedResumeSchema,
    _ExperienceSchema,
)


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    client = AsyncMock(spec=LLMClient)
    return client


@pytest.fixture
def parser(mock_llm_client):
    """Create a ResumeParser with a mocked LLM client."""
    return ResumeParser(llm_client=mock_llm_client)


@pytest.fixture
def sample_llm_response():
    """Create a sample structured LLM response."""
    return _ParsedResumeSchema(
        skills=["Python", "FastAPI", "Machine Learning"],
        experiences=[
            _ExperienceSchema(
                title="Software Engineer",
                company="Acme Corp",
                duration="2020-2023",
                description="Built backend services using Python and FastAPI",
                skills_used=["Python", "FastAPI", "PostgreSQL"],
            )
        ],
        qualifications=["B.S. Computer Science", "AWS Certified"],
    )


def _create_pdf_bytes(text: str) -> bytes:
    """Create a valid PDF with the given text content using PyPDF2's PdfWriter."""
    from PyPDF2 import PdfWriter

    writer = PdfWriter()
    # Add a blank page
    writer.add_blank_page(width=612, height=792)

    # Add text as a page annotation (metadata) since PyPDF2 doesn't easily
    # support adding text content streams. Instead, we'll use reportlab-style
    # approach via fpdf2 or just mock the text extraction in tests.
    # For a simpler approach, we'll write a proper PDF using the raw approach
    # with correct xref offsets.

    output = io.BytesIO()
    writer.write(output)
    pdf_bytes = output.getvalue()

    # Since PyPDF2's PdfWriter creates valid PDFs but without text content,
    # we'll use python-docx for the success test and test PDF with a real file.
    # Instead, let's patch the text extraction for the PDF success test.
    return pdf_bytes


def _create_docx_bytes(text: str) -> bytes:
    """Create a minimal valid DOCX with the given text content."""
    from docx import Document

    doc = Document()
    doc.add_paragraph(text)
    output = io.BytesIO()
    doc.save(output)
    return output.getvalue()


class TestResumeParserPDF:
    """Tests for PDF parsing."""

    @pytest.mark.asyncio
    async def test_parse_pdf_success(self, parser, mock_llm_client, sample_llm_response):
        """Test successful parsing of a PDF resume."""
        mock_llm_client.generate_structured.return_value = sample_llm_response

        # Use a valid PDF (blank page) and patch the text extraction to return content
        pdf_bytes = _create_pdf_bytes("John Doe - Software Engineer")

        with patch.object(
            parser, "_extract_text_from_pdf", return_value="John Doe - Software Engineer"
        ):
            result = await parser.parse(pdf_bytes, "application/pdf")

        assert isinstance(result, ParsedResume)
        assert result.skills == ["Python", "FastAPI", "Machine Learning"]
        assert len(result.experiences) == 1
        assert result.experiences[0].title == "Software Engineer"
        assert result.experiences[0].company == "Acme Corp"
        assert result.qualifications == ["B.S. Computer Science", "AWS Certified"]
        assert result.raw_text == "John Doe - Software Engineer"
        mock_llm_client.generate_structured.assert_called_once()

    @pytest.mark.asyncio
    async def test_parse_corrupted_pdf(self, parser):
        """Test that corrupted PDF raises ResumeParseError."""
        corrupted_bytes = b"not a valid pdf content at all"

        with pytest.raises(ResumeParseError, match="Unable to parse the PDF"):
            await parser.parse(corrupted_bytes, "application/pdf")

    @pytest.mark.asyncio
    async def test_parse_valid_pdf_structure(self, parser, mock_llm_client, sample_llm_response):
        """Test that a valid PDF with blank page is handled (no text -> error)."""
        # A blank page PDF created by PdfWriter has no text content
        pdf_bytes = _create_pdf_bytes("")

        with pytest.raises(ResumeParseError, match="Unable to extract readable text"):
            await parser.parse(pdf_bytes, "application/pdf")


class TestResumeParserDOCX:
    """Tests for DOCX parsing."""

    @pytest.mark.asyncio
    async def test_parse_docx_success(self, parser, mock_llm_client, sample_llm_response):
        """Test successful parsing of a DOCX resume."""
        mock_llm_client.generate_structured.return_value = sample_llm_response
        docx_bytes = _create_docx_bytes("Jane Smith - Data Scientist with 5 years experience")

        result = await parser.parse(
            docx_bytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        assert isinstance(result, ParsedResume)
        assert result.skills == ["Python", "FastAPI", "Machine Learning"]
        assert len(result.experiences) == 1
        assert result.qualifications == ["B.S. Computer Science", "AWS Certified"]
        assert "Jane Smith" in result.raw_text
        mock_llm_client.generate_structured.assert_called_once()

    @pytest.mark.asyncio
    async def test_parse_corrupted_docx(self, parser):
        """Test that corrupted DOCX raises ResumeParseError."""
        corrupted_bytes = b"not a valid docx content"

        with pytest.raises(ResumeParseError, match="Unable to parse the DOCX"):
            await parser.parse(
                corrupted_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )


class TestResumeParserEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_empty_content_raises_error(self, parser):
        """Test that empty file content raises ResumeParseError."""
        with pytest.raises(ResumeParseError, match="File content is empty"):
            await parser.parse(b"", "application/pdf")

    @pytest.mark.asyncio
    async def test_unsupported_file_type_raises_error(self, parser):
        """Test that unsupported file type raises ResumeParseError."""
        with pytest.raises(ResumeParseError, match="Unsupported file type"):
            await parser.parse(b"some content", "text/plain")

    @pytest.mark.asyncio
    async def test_llm_failure_raises_error(self, parser, mock_llm_client):
        """Test that LLM failure is wrapped in ResumeParseError."""
        mock_llm_client.generate_structured.side_effect = LLMClientError("LLM unavailable")
        docx_bytes = _create_docx_bytes("Some resume content here")

        with pytest.raises(ResumeParseError, match="Failed to extract structured data"):
            await parser.parse(
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

    @pytest.mark.asyncio
    async def test_pdf_with_no_extractable_text(self, parser):
        """Test that a PDF with no extractable text raises ResumeParseError."""
        # Create a valid PDF with a blank page (no text content)
        pdf_bytes = _create_pdf_bytes("")

        with pytest.raises(ResumeParseError, match="Unable to extract readable text"):
            await parser.parse(pdf_bytes, "application/pdf")

    @pytest.mark.asyncio
    async def test_experience_conversion_to_domain_model(
        self, parser, mock_llm_client
    ):
        """Test that LLM schema experiences are correctly converted to domain Experience objects."""
        mock_llm_client.generate_structured.return_value = _ParsedResumeSchema(
            skills=["Python"],
            experiences=[
                _ExperienceSchema(
                    title="Lead Engineer",
                    company="Tech Inc",
                    duration="3 years",
                    description="Led a team of 5 engineers",
                    skills_used=["Python", "Leadership"],
                ),
                _ExperienceSchema(
                    title="Junior Dev",
                    company="Startup Co",
                    duration="1 year",
                    description="Full-stack development",
                    skills_used=["JavaScript", "React"],
                ),
            ],
            qualifications=["M.S. Computer Science"],
        )
        docx_bytes = _create_docx_bytes("Resume with multiple experiences")

        result = await parser.parse(
            docx_bytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        assert len(result.experiences) == 2
        assert isinstance(result.experiences[0], Experience)
        assert result.experiences[0].title == "Lead Engineer"
        assert result.experiences[0].skills_used == ["Python", "Leadership"]
        assert result.experiences[1].title == "Junior Dev"
        assert result.experiences[1].company == "Startup Co"
