"""FastAPI application entry point for Prep Pilot."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

# Load .env file if it exists (for local development)
_env_file = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_file.exists():
    with open(_env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

from prep_pilot.api.routes import router as api_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown events."""
    logger.info("Prep Pilot is ready and accepting requests.")
    yield
    logger.info("Prep Pilot is shutting down.")


app = FastAPI(
    title="Prep Pilot",
    description="AI-powered mock interview agent that conducts personalized interview sessions based on your resume and target role.",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS Middleware (allow all origins for development)
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(api_router)

# Include WebSocket router if available
try:
    from prep_pilot.api.websocket import router as ws_router  # noqa: E402

    app.include_router(ws_router)
except (ImportError, ModuleNotFoundError):
    logger.debug("WebSocket router not available, skipping registration.")


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

_static_dir = Path(__file__).resolve().parent / "static"


@app.get("/", status_code=status.HTTP_200_OK)
async def serve_frontend():
    """Serve the interview UI."""
    return FileResponse(_static_dir / "index.html")


@app.get("/test-evaluation", status_code=status.HTTP_200_OK)
async def serve_test_evaluation():
    """Serve the evaluation test page (dev only)."""
    return FileResponse(_static_dir / "test-evaluation.html")


@app.get("/ui-editor", status_code=status.HTTP_200_OK)
async def serve_ui_editor():
    """Serve the UI editor page (dev only)."""
    return FileResponse(_static_dir / "ui-editor.html")


@app.get("/preview/questions", status_code=status.HTTP_200_OK)
async def serve_preview_questions():
    """Serve the questions preview page for the UI editor."""
    return FileResponse(_static_dir / "preview-questions.html")


@app.get("/preview/evaluation", status_code=status.HTTP_200_OK)
async def serve_preview_evaluation():
    """Serve the evaluation preview page for the UI editor."""
    return FileResponse(_static_dir / "preview-evaluation.html")


@app.get("/theme", status_code=status.HTTP_200_OK)
async def get_theme():
    """Get the current theme configuration."""
    import json
    theme_file = _static_dir / "theme.json"
    if theme_file.exists():
        return JSONResponse(content=json.loads(theme_file.read_text()))
    return JSONResponse(content={})


@app.put("/theme", status_code=status.HTTP_200_OK)
async def save_theme(request: Request):
    """Save theme configuration to theme.json."""
    import json
    theme_data = await request.json()
    theme_file = _static_dir / "theme.json"
    theme_file.write_text(json.dumps(theme_data, indent=2))
    return {"status": "saved"}


@app.get("/health", status_code=status.HTTP_200_OK)
async def health_check() -> dict:
    """Health check endpoint."""
    return {"status": "healthy"}


# ---------------------------------------------------------------------------
# Global Exception Handlers
# ---------------------------------------------------------------------------


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """Handle ValueError exceptions as 400 Bad Request."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions as 500 Internal Server Error."""
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal error occurred. Please try again later."},
    )
