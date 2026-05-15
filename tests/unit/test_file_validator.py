"""Unit tests for the FileValidator service."""

import pytest

from prep_pilot.services.file_validator import FileValidator


@pytest.fixture
def validator() -> FileValidator:
    return FileValidator()


class TestFileValidatorResumeFormats:
    """Tests for resume file format validation."""

    def test_accepts_pdf_resume(self, validator: FileValidator) -> None:
        content = b"fake pdf content"
        result = validator.validate(
            content, "application/pdf", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is True
        assert result.error_message is None

    def test_accepts_docx_resume(self, validator: FileValidator) -> None:
        content = b"fake docx content"
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        result = validator.validate(
            content, mime, FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is True
        assert result.error_message is None

    def test_rejects_txt_resume(self, validator: FileValidator) -> None:
        content = b"plain text resume"
        result = validator.validate(
            content, "text/plain", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is False
        assert "Unsupported file format" in result.error_message

    def test_rejects_image_resume(self, validator: FileValidator) -> None:
        content = b"image data"
        result = validator.validate(
            content, "image/png", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is False
        assert "Unsupported file format" in result.error_message


class TestFileValidatorJDFormats:
    """Tests for job description file format validation."""

    def test_accepts_pdf_jd(self, validator: FileValidator) -> None:
        content = b"fake pdf jd"
        result = validator.validate(
            content, "application/pdf", FileValidator.ALLOWED_JD_FORMATS
        )
        assert result.is_valid is True

    def test_accepts_docx_jd(self, validator: FileValidator) -> None:
        content = b"fake docx jd"
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        result = validator.validate(
            content, mime, FileValidator.ALLOWED_JD_FORMATS
        )
        assert result.is_valid is True

    def test_accepts_txt_jd(self, validator: FileValidator) -> None:
        content = b"plain text job description"
        result = validator.validate(
            content, "text/plain", FileValidator.ALLOWED_JD_FORMATS
        )
        assert result.is_valid is True

    def test_rejects_html_jd(self, validator: FileValidator) -> None:
        content = b"<html>job desc</html>"
        result = validator.validate(
            content, "text/html", FileValidator.ALLOWED_JD_FORMATS
        )
        assert result.is_valid is False
        assert "Unsupported file format" in result.error_message


class TestFileValidatorSize:
    """Tests for file size validation."""

    def test_accepts_file_at_max_size(self, validator: FileValidator) -> None:
        content = b"x" * FileValidator.MAX_FILE_SIZE_BYTES
        result = validator.validate(
            content, "application/pdf", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is True

    def test_rejects_file_exceeding_max_size(self, validator: FileValidator) -> None:
        content = b"x" * (FileValidator.MAX_FILE_SIZE_BYTES + 1)
        result = validator.validate(
            content, "application/pdf", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is False
        assert "5 MB size limit" in result.error_message

    def test_accepts_empty_file(self, validator: FileValidator) -> None:
        content = b""
        result = validator.validate(
            content, "application/pdf", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is True

    def test_rejects_oversized_file_with_valid_format(
        self, validator: FileValidator
    ) -> None:
        content = b"y" * (6 * 1024 * 1024)  # 6 MB
        result = validator.validate(
            content, "text/plain", FileValidator.ALLOWED_JD_FORMATS
        )
        assert result.is_valid is False
        assert "size limit" in result.error_message


class TestFileValidatorErrorMessages:
    """Tests for error message content."""

    def test_format_error_includes_mime_type(self, validator: FileValidator) -> None:
        result = validator.validate(
            b"data", "application/zip", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert "application/zip" in result.error_message

    def test_format_error_lists_allowed_formats(
        self, validator: FileValidator
    ) -> None:
        result = validator.validate(
            b"data", "image/jpeg", FileValidator.ALLOWED_JD_FORMATS
        )
        assert "text/plain" in result.error_message

    def test_format_checked_before_size(self, validator: FileValidator) -> None:
        """Format validation should occur before size validation."""
        large_invalid = b"x" * (6 * 1024 * 1024)
        result = validator.validate(
            large_invalid, "image/png", FileValidator.ALLOWED_RESUME_FORMATS
        )
        assert result.is_valid is False
        assert "Unsupported file format" in result.error_message
