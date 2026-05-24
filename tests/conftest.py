"""Shared pytest fixtures."""
import json
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
    """Hard block on the Gemini SDK so tests cannot make real network calls.

    Sets a fake API key AND patches the SDK's network entry points. Tests that
    exercise the Gemini path should still use @patch("enrich.genai") for
    deterministic behaviour — this is the belt-and-braces fallback.
    """
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-real")
    monkeypatch.setattr("google.generativeai.configure", lambda **kwargs: None)
    monkeypatch.setattr("google.generativeai.GenerativeModel",
                        lambda *args, **kwargs: (_ for _ in ()).throw(
                            RuntimeError("_no_real_gemini: SDK blocked; use @patch('enrich.genai')")
                        ))
