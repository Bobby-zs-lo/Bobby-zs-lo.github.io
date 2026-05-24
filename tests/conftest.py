"""Shared pytest fixtures."""
import json
import os
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def openalex_work():
    with open(FIXTURES / "openalex_work.json", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def pubmed_efetch_xml():
    return (FIXTURES / "pubmed_efetch.xml").read_text(encoding="utf-8")


@pytest.fixture
def idconv_response():
    with open(FIXTURES / "idconv_response.json", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(autouse=True)
def _no_real_gemini(monkeypatch):
    """Belt-and-braces: ensure no test accidentally hits the real Gemini API."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-real")
