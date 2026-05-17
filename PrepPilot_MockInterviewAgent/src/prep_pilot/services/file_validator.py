"""File validation service for uploaded documents."""

from prep_pilot.models.domain import ValidationResult


class FileValidator:
    """Validates uploaded files for format and size constraints."""

    ALLOWED_RESUME_FORMATS: list[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    ALLOWED_JD_FORMATS: list[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ]
    MAX_FILE_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB

    def validate(
        self, file_content: bytes, mime_type: str, allowed_formats: list[str]
    ) -> ValidationResult:
        """Validate file format and size.

        Args:
            file_content: The raw bytes of the uploaded file.
            mime_type: The MIME type of the uploaded file.
            allowed_formats: List of acceptable MIME types for this document type.

        Returns:
            ValidationResult with is_valid=True if the file passes all checks,
            or is_valid=False with an error_message describing the failure.
        """
        if mime_type not in allowed_formats:
            supported = ", ".join(allowed_formats)
            return ValidationResult(
                is_valid=False,
                error_message=(
                    f"Unsupported file format '{mime_type}'. "
                    f"Allowed formats: {supported}"
                ),
            )

        file_size = len(file_content)
        if file_size > self.MAX_FILE_SIZE_BYTES:
            max_mb = self.MAX_FILE_SIZE_BYTES / (1024 * 1024)
            return ValidationResult(
                is_valid=False,
                error_message=(
                    f"File exceeds the {max_mb:.0f} MB size limit. "
                    f"Please upload a smaller file."
                ),
            )

        return ValidationResult(is_valid=True)
