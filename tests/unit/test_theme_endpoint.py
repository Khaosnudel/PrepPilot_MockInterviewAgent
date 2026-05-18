"""Unit tests for the /theme endpoint with elements support."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from prep_pilot.main import app, _static_dir


@pytest.fixture
def client():
    """Create a test client for the main app."""
    return TestClient(app)


@pytest.fixture
def theme_file(tmp_path):
    """Create a temporary theme.json file and patch _static_dir."""
    theme_path = tmp_path / "theme.json"
    with patch("prep_pilot.main._static_dir", tmp_path):
        yield theme_path


class TestGetTheme:
    """Tests for GET /theme endpoint."""

    def test_get_theme_returns_elements_empty_array_when_no_file(self, client, tmp_path):
        """When theme.json doesn't exist, return empty dict with elements array."""
        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.get("/theme")
        assert response.status_code == 200
        data = response.json()
        assert "elements" in data
        assert data["elements"] == []

    def test_get_theme_returns_existing_elements(self, client, tmp_path):
        """When theme.json has elements, return them."""
        theme_data = {
            "main": {"colors": {"background": "#000"}},
            "elements": [
                {
                    "id": "test-1",
                    "type": "icon",
                    "iconId": "lucide-star",
                    "x": 100,
                    "y": 50,
                    "width": 32,
                    "height": 32,
                    "color": "#000000",
                    "opacity": 1.0,
                    "zIndex": 1,
                }
            ],
        }
        theme_file = tmp_path / "theme.json"
        theme_file.write_text(json.dumps(theme_data))

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.get("/theme")
        assert response.status_code == 200
        data = response.json()
        assert len(data["elements"]) == 1
        assert data["elements"][0]["type"] == "icon"
        assert data["elements"][0]["iconId"] == "lucide-star"

    def test_get_theme_adds_empty_elements_when_missing(self, client, tmp_path):
        """When theme.json exists but has no elements key, add empty array."""
        theme_data = {"main": {"colors": {"background": "#000"}}}
        theme_file = tmp_path / "theme.json"
        theme_file.write_text(json.dumps(theme_data))

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.get("/theme")
        assert response.status_code == 200
        data = response.json()
        assert "elements" in data
        assert data["elements"] == []
        # Existing theme data preserved
        assert data["main"]["colors"]["background"] == "#000"

    def test_get_theme_handles_corrupted_json(self, client, tmp_path):
        """When theme.json is corrupted, return empty with elements array."""
        theme_file = tmp_path / "theme.json"
        theme_file.write_text("not valid json {{{")

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.get("/theme")
        assert response.status_code == 200
        data = response.json()
        assert "elements" in data
        assert data["elements"] == []

    def test_get_theme_filters_invalid_elements(self, client, tmp_path):
        """Invalid elements are filtered out, valid ones are kept."""
        theme_data = {
            "elements": [
                {
                    "id": "valid-icon",
                    "type": "icon",
                    "iconId": "star",
                    "x": 10,
                    "y": 20,
                    "width": 32,
                    "height": 32,
                    "color": "#fff",
                    "opacity": 1.0,
                    "zIndex": 1,
                },
                {"type": "icon", "x": 10},  # Missing required fields
                "not-an-object",  # Not a dict
                {
                    "type": "unknown",
                    "x": 0,
                    "y": 0,
                    "width": 10,
                    "height": 10,
                    "opacity": 1.0,
                    "zIndex": 0,
                },  # Invalid type
            ]
        }
        theme_file = tmp_path / "theme.json"
        theme_file.write_text(json.dumps(theme_data))

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.get("/theme")
        assert response.status_code == 200
        data = response.json()
        assert len(data["elements"]) == 1
        assert data["elements"][0]["iconId"] == "star"

    def test_get_theme_handles_non_list_elements(self, client, tmp_path):
        """When elements is not a list, fall back to empty array."""
        theme_data = {"main": {}, "elements": "not-a-list"}
        theme_file = tmp_path / "theme.json"
        theme_file.write_text(json.dumps(theme_data))

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.get("/theme")
        assert response.status_code == 200
        data = response.json()
        assert data["elements"] == []


class TestSaveTheme:
    """Tests for PUT /theme endpoint."""

    def test_save_theme_with_elements(self, client, tmp_path):
        """Save theme data including elements array."""
        theme_data = {
            "main": {"colors": {"background": "#111"}},
            "elements": [
                {
                    "id": "el-1",
                    "type": "icon",
                    "iconId": "lucide-home",
                    "x": 50,
                    "y": 60,
                    "width": 32,
                    "height": 32,
                    "color": "#ff0000",
                    "opacity": 0.8,
                    "zIndex": 1,
                }
            ],
        }

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 200
        assert response.json() == {"status": "saved"}

        # Verify file was written correctly
        saved = json.loads((tmp_path / "theme.json").read_text())
        assert len(saved["elements"]) == 1
        assert saved["elements"][0]["iconId"] == "lucide-home"
        assert saved["main"]["colors"]["background"] == "#111"

    def test_save_theme_without_elements_adds_empty_array(self, client, tmp_path):
        """When no elements key is provided, add empty array."""
        theme_data = {"main": {"colors": {"background": "#222"}}}

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 200

        saved = json.loads((tmp_path / "theme.json").read_text())
        assert "elements" in saved
        assert saved["elements"] == []

    def test_save_theme_validates_elements_schema(self, client, tmp_path):
        """Invalid elements are filtered out during save."""
        theme_data = {
            "elements": [
                {
                    "id": "valid",
                    "type": "image",
                    "source": "https://example.com/img.png",
                    "x": 0,
                    "y": 0,
                    "width": 100,
                    "height": 100,
                    "opacity": 1.0,
                    "zIndex": 1,
                },
                {"type": "icon", "x": 10},  # Invalid - missing fields
            ]
        }

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 200

        saved = json.loads((tmp_path / "theme.json").read_text())
        assert len(saved["elements"]) == 1
        assert saved["elements"][0]["type"] == "image"

    def test_save_theme_rejects_non_array_elements(self, client, tmp_path):
        """When elements is not an array, return 422."""
        theme_data = {"elements": "not-an-array"}

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 422
        assert "'elements' must be an array" in response.json()["detail"]

    def test_save_theme_with_text_element(self, client, tmp_path):
        """Save theme with a valid text element."""
        theme_data = {
            "elements": [
                {
                    "id": "text-1",
                    "type": "text",
                    "content": "Hello World",
                    "x": 10,
                    "y": 20,
                    "width": 200,
                    "height": 40,
                    "fontSize": 16,
                    "fontWeight": "bold",
                    "color": "#e2e8f0",
                    "opacity": 1.0,
                    "zIndex": 2,
                }
            ]
        }

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 200

        saved = json.loads((tmp_path / "theme.json").read_text())
        assert len(saved["elements"]) == 1
        assert saved["elements"][0]["content"] == "Hello World"
        assert saved["elements"][0]["fontWeight"] == "bold"

    def test_save_theme_rejects_invalid_text_fontweight(self, client, tmp_path):
        """Text element with invalid fontWeight is filtered out."""
        theme_data = {
            "elements": [
                {
                    "id": "text-bad",
                    "type": "text",
                    "content": "Test",
                    "x": 0,
                    "y": 0,
                    "width": 100,
                    "height": 30,
                    "fontSize": 16,
                    "fontWeight": "italic",  # Invalid - must be normal or bold
                    "color": "#000",
                    "opacity": 1.0,
                    "zIndex": 1,
                }
            ]
        }

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 200

        saved = json.loads((tmp_path / "theme.json").read_text())
        assert len(saved["elements"]) == 0

    def test_save_theme_rejects_invalid_opacity(self, client, tmp_path):
        """Element with opacity > 1.0 is filtered out."""
        theme_data = {
            "elements": [
                {
                    "id": "bad-opacity",
                    "type": "icon",
                    "iconId": "star",
                    "x": 0,
                    "y": 0,
                    "width": 32,
                    "height": 32,
                    "color": "#000",
                    "opacity": 1.5,  # Invalid
                    "zIndex": 1,
                }
            ]
        }

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 200

        saved = json.loads((tmp_path / "theme.json").read_text())
        assert len(saved["elements"]) == 0

    def test_save_theme_preserves_existing_theme_data(self, client, tmp_path):
        """Saving with elements preserves other theme keys."""
        theme_data = {
            "main": {"colors": {"background": "#0f172a"}},
            "questions": {"colors": {"boxBg": "#111"}},
            "elements": [
                {
                    "type": "icon",
                    "iconId": "check",
                    "x": 5,
                    "y": 5,
                    "width": 24,
                    "height": 24,
                    "color": "#00ff00",
                    "opacity": 1.0,
                    "zIndex": 0,
                }
            ],
        }

        with patch("prep_pilot.main._static_dir", tmp_path):
            response = client.put("/theme", json=theme_data)
        assert response.status_code == 200

        saved = json.loads((tmp_path / "theme.json").read_text())
        assert saved["main"]["colors"]["background"] == "#0f172a"
        assert saved["questions"]["colors"]["boxBg"] == "#111"
        assert len(saved["elements"]) == 1
