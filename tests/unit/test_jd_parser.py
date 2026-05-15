"""Unit tests for the JobDescriptionParser service."""

import io
from unittest.mock import AsyncMock, patch

import pytest

from prep_pilot.models.domain import ParsedJobDescription
from prep_pilot.services.jd_parser import (
    JDContentError,
    JDExtractionError,
    JDParserError,
    JobDescriptionParser,
    ParsedJDSchema,
)
from prep_pilot.services.llm_client import LLMClient, LLMClientError


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    client = AsyncMock(spec=LLMClient)
    return client


@pytest.fixture
def parser(mock_llm_client):
    """Create a JobDescriptionParser with a mocked LLM client."""
    return JobDescriptionParser(llm_client=mock_llm_client)


@pytest.fixture
def sample_jd_text():
    """Sample job description text content."""
    return (
        "Senior Software Engineer\n\n"
        "About the Role:\n"
        "We are looking for a Senior Software Engineer to join our platform team.\n\n"
        "Requirements:\n"
        "- 5+ years of experience in Python\n"
        "- Experience with distributed systems\n"
        "- Strong knowledge of AWS services\n\n"
        "Responsibilities:\n"
        "- Design and implement scalable microservices\n"
        "- Mentor junior engineers\n"
        "- Participate in code reviews\n\n"
        "Qualifications:\n"
        "- Bachelor's degree in Computer Science or equivalent\n"
        "- AWS certification preferred\n"
    )


@pytest.fixture
def sample_parsed_jd_schema():
    """Sample parsed JD schema result from LLM."""
    return ParsedJDSchema(
        requirements=[
            "5+ years of experience in Python",
            "Experience with distributed systems",
            "Strong knowledge of AWS services",
        ],
        responsibilities=[
            "Design and implement scalable microservices",
            "Mentor junior engineers",
            "Participate in code reviews",
        ],
        qualifications=[
            "Bachelor's degree in Computer Science or equivalent",
            "AWS certification preferred",
        ],
        summary="Senior Software Engineer role on the platform team focused on scalable microservices.",
    )


class TestJobDescriptionParserTextExtraction:
    """Tests for text extraction from different file formats."""

    def test_extract_text_from_txt(self, parser):
        """Test plain text extraction."""
        content = b"This is a job description in plain text."
        result = parser._extract_text(content, "text/plain")
        assert result == "This is a job description in plain text."

    def test_extract_text_from_txt_utf8(self, parser):
        """Test UTF-8 encoded text extraction."""
        content = "Rôle: Développeur Senior".encode("utf-8")
        result = parser._extract_text(content, "text/plain")
        assert "Développeur" in result

    def test_extract_text_from_txt_latin1_fallback(self, parser):
        """Test Latin-1 fallback for non-UTF-8 text."""
        content = "Rôle: Développeur".encode("latin-1")
        result = parser._extract_text(content, "text/plain")
        assert "veloppeur" in result

    def test_extract_text_unsupported_type(self, parser):
        """Test that unsupported file types raise JDExtractionError."""
        with pytest.raises(JDExtractionError, match="Unsupported file type"):
            parser._extract_text(b"content", "application/json")

    def test_extract_text_from_pdf_corrupted(self, parser):
        """Test that corrupted PDF raises JDExtractionError."""
        with pytest.raises(JDExtractionError, match="Failed to read PDF"):
            parser._extract_text(b"not a real pdf", "application/pdf")

    def test_extract_text_from_docx_corrupted(self, parser):
        """Test that corrupted DOCX raises JDExtractionError."""
        with pytest.raises(JDExtractionError, match="Failed to read DOCX"):
            parser._extract_text(
                b"not a real docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )


class TestJobDescriptionParserParse:
    """Tests for the main parse() method."""

    @pytest.mark.asyncio
    async def test_parse_txt_success(
        self, parser, mock_llm_client, sample_jd_text, sample_parsed_jd_schema
    ):
        """Test successful parsing of a plain text job description."""
        mock_llm_client.generate_structured.return_value = sample_parsed_jd_schema
        file_content = sample_jd_text.encode("utf-8")

        result = await parser.parse(file_content, "text/plain")

        assert isinstance(result, ParsedJobDescription)
        assert len(result.requirements) == 3
        assert "5+ years of experience in Python" in result.requirements
        assert len(result.responsibilities) == 3
        assert "Mentor junior engineers" in result.responsibilities
        assert len(result.qualifications) == 2
        assert "Senior Software Engineer" in result.summary
        mock_llm_client.generate_structured.assert_called_once()

    @pytest.mark.asyncio
    async def test_parse_empty_content_raises(self, parser):
        """Test that empty file content raises JDExtractionError."""
        with pytest.raises(JDExtractionError, match="empty"):
            await parser.parse(b"", "text/plain")

    @pytest.mark.asyncio
    async def test_parse_whitespace_only_raises(self, parser):
        """Test that whitespace-only content raises JDContentError."""
        with pytest.raises(JDContentError, match="no readable text"):
            await parser.parse(b"   \n\t  \n  ", "text/plain")

    @pytest.mark.asyncio
    async def test_parse_no_identifiable_content_raises(
        self, parser, mock_llm_client
    ):
        """Test that content with no extractable JD data raises JDContentError."""
        # LLM returns empty fields
        mock_llm_client.generate_structured.return_value = ParsedJDSchema(
            requirements=[],
            responsibilities=[],
            qualifications=[],
            summary="",
        )

        with pytest.raises(JDContentError, match="No identifiable"):
            await parser.parse(b"random text with no job info", "text/plain")

    @pytest.mark.asyncio
    async def test_parse_llm_failure_raises(self, parser, mock_llm_client):
        """Test that LLM client failure raises JDParserError."""
        mock_llm_client.generate_structured.side_effect = LLMClientError(
            "LLM service unavailable"
        )

        with pytest.raises(JDParserError, match="Failed to extract"):
            await parser.parse(b"Some job description text", "text/plain")

    @pytest.mark.asyncio
    async def test_parse_partial_content_succeeds(
        self, parser, mock_llm_client
    ):
        """Test that a JD with only requirements (no responsibilities) still succeeds."""
        mock_llm_client.generate_structured.return_value = ParsedJDSchema(
            requirements=["Python experience required"],
            responsibilities=[],
            qualifications=[],
            summary="A Python developer role.",
        )

        result = await parser.parse(
            b"We need a Python developer.", "text/plain"
        )

        assert isinstance(result, ParsedJobDescription)
        assert result.requirements == ["Python experience required"]
        assert result.responsibilities == []
        assert result.qualifications == []

    @pytest.mark.asyncio
    async def test_parse_calls_llm_with_correct_schema(
        self, parser, mock_llm_client, sample_parsed_jd_schema
    ):
        """Test that the LLM is called with the correct schema type."""
        mock_llm_client.generate_structured.return_value = sample_parsed_jd_schema

        await parser.parse(b"Job description content", "text/plain")

        call_kwargs = mock_llm_client.generate_structured.call_args
        assert call_kwargs.kwargs["schema"] == ParsedJDSchema
        assert "job description" in call_kwargs.kwargs["prompt"].lower()
