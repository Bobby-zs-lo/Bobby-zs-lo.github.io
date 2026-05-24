# Resume Enrichment & Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gemini-powered lay summaries (cached per OpenAlex work) to every publication; make the publications page topic-filterable and summary-searchable; convert the home-page "Major Research Projects" and outreach sections to YAML-driven content; publish an RSS feed; have the weekly GitHub Action spend zero tokens on already-cached papers.

**Architecture:** A new `enrich.py` module is the only place that talks to PubMed and Gemini. It produces a JSON cache (`data/abstract_cache.json`) keyed by OpenAlex work ID, append-only by design (failed/null summaries get retried, successful ones never re-run). `generate_publications.py` is refactored to consume the cache when rendering `publications.html` and `publications.xml`. A new `generate_index.py` reads `data/research_projects.yaml` + `data/activity.yaml` + the cache and injects content between sentinel comments in `index.html`, preserving manual edits outside the sentinels. The GitHub Action runs both generators weekly with `GEMINI_API_KEY` in env.

**Tech Stack:** Python 3.11+, `requests`, `google-generativeai`, `pyyaml`, stdlib `xml.etree.ElementTree`, `pytest`, `responses` (HTTP mocking). Vanilla JS for chip toggle. CSS additions in `style.css`.

**Spec:** `docs/superpowers/specs/2026-05-24-resume-enrichment-and-automation-design.md`

---

## File map

**New files:**
- `enrich.py` — abstract reconstruction, PubMed lookup, Gemini call, cache I/O, `enrich()` orchestrator
- `generate_index.py` — render research projects + outreach into `index.html` between sentinels
- `topics.py` — `TOPIC_VOCAB` dict + `matches_topic()` helper (kept separate so renderer and tests share it)
- `tests/__init__.py`, `tests/conftest.py` — pytest config
- `tests/test_enrich.py`, `tests/test_topics.py`, `tests/test_generate_publications.py`, `tests/test_generate_index.py`
- `tests/fixtures/openalex_work.json`, `tests/fixtures/pubmed_efetch.xml`, `tests/fixtures/idconv_response.json`
- `data/abstract_cache.json` — populated by `enrich.py` (committed)
- `data/research_projects.yaml`, `data/activity.yaml` — hand-maintained
- `publications.xml` — generated, committed

**Modified files:**
- `generate_publications.py` — calls `enrich()`, renders summary blurb + `data-search` + `data-topics` + chip bar + RSS; CLI `--max-new`
- `script.js` — new `filterPublications()` (reads `dataset.search`) + topic chip toggle handler
- `style.css` — `.pub-summary`, `.topic-chips`, `.topic-chip[aria-pressed]`
- `index.html` — sentinel comments around research + outreach sections (one-time prep edit)
- `.github/workflows/update-publications.yml` — `GEMINI_API_KEY` env, install new deps, run both generators, commit `data/*` + `publications.xml`
- `requirements.txt` — add `google-generativeai`, `pyyaml`, `pytest`, `responses`
- `EDITING.md` — YAML recipes; deprecate hand-edit recipes for outreach

---

## Task 1: Project scaffolding — dependencies, test layout, .gitignore

**Files:**
- Modify: `requirements.txt`
- Modify: `.gitignore`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `tests/fixtures/.gitkeep`

- [ ] **Step 1: Replace `requirements.txt`**

```
requests
google-generativeai
pyyaml
pytest
responses
```

- [ ] **Step 2: Append to `.gitignore`**

Add these lines (preserving existing content):

```
.venv/
__pycache__/
*.pyc
.pytest_cache/
.env
```

- [ ] **Step 3: Create `tests/__init__.py`**

Empty file.

- [ ] **Step 4: Create `tests/conftest.py`**

```python
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
```

- [ ] **Step 5: Create `tests/fixtures/.gitkeep`**

Empty file (placeholder; real fixtures land in Task 2/3).

- [ ] **Step 6: Install and verify**

Run: `python -m pip install -r requirements.txt`
Expected: installs without error.

Run: `python -m pytest tests/ -v`
Expected: `no tests ran in 0.XXs` (no failures; the test directory exists but is empty).

- [ ] **Step 7: Commit**

```
git add requirements.txt .gitignore tests/
git commit -m "chore: add test scaffold and enrichment deps"
```

---

## Task 2: Abstract reconstruction (pure function, TDD)

OpenAlex stores abstracts as `abstract_inverted_index`: `{word: [positions]}`. We need to invert it back to readable text.

**Files:**
- Create: `enrich.py`
- Create: `tests/test_enrich.py`
- Create: `tests/fixtures/openalex_work.json`

- [ ] **Step 1: Create the fixture `tests/fixtures/openalex_work.json`**

```json
{
  "id": "https://openalex.org/W4392104410",
  "doi": "https://doi.org/10.1053/j.gastro.2024.01.001",
  "title": "Real-time AI for ulcerative colitis endoscopy",
  "publication_year": 2024,
  "publication_date": "2024-03-12",
  "cited_by_count": 17,
  "primary_location": {
    "source": {"display_name": "Gastroenterology"}
  },
  "authorships": [
    {"author": {"display_name": "Bobby Zhao Sheng Lo"}}
  ],
  "abstract_inverted_index": {
    "We": [0],
    "tested": [1],
    "a": [2, 6],
    "deep": [3],
    "learning": [4],
    "system": [5],
    "live": [7],
    "endoscopy": [8],
    "video.": [9]
  },
  "concepts": [
    {"display_name": "Gastroenterology", "level": 1},
    {"display_name": "Machine learning", "level": 1}
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_enrich.py`:

```python
"""Tests for enrich.py."""
import enrich


class TestReconstructAbstract:
    def test_inverts_positions_to_words(self, openalex_work):
        inverted = openalex_work["abstract_inverted_index"]
        assert enrich.reconstruct_abstract(inverted) == \
            "We tested a deep learning system a live endoscopy video."

    def test_returns_none_for_missing_index(self):
        assert enrich.reconstruct_abstract(None) is None

    def test_returns_none_for_empty_index(self):
        assert enrich.reconstruct_abstract({}) is None
```

- [ ] **Step 3: Run the tests; verify they fail**

Run: `python -m pytest tests/test_enrich.py -v`
Expected: `ModuleNotFoundError: No module named 'enrich'`.

- [ ] **Step 4: Create `enrich.py` with the minimal implementation**

```python
"""Enrichment pipeline: OpenAlex abstracts, PubMed metadata, Gemini summaries."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> Optional[str]:
    """Reconstruct a readable abstract from OpenAlex's inverted index.

    OpenAlex stores abstracts as {word: [positions]}. This function
    inverts that mapping back to the original word order.
    Returns None if the index is missing or empty.
    """
    if not inverted_index:
        return None
    positions: list[tuple[int, str]] = []
    for word, idxs in inverted_index.items():
        for i in idxs:
            positions.append((i, word))
    positions.sort(key=lambda p: p[0])
    return " ".join(word for _, word in positions)
```

- [ ] **Step 5: Run the tests; verify they pass**

Run: `python -m pytest tests/test_enrich.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```
git add enrich.py tests/test_enrich.py tests/fixtures/openalex_work.json
git commit -m "feat(enrich): reconstruct OpenAlex inverted-index abstracts"
```

---

## Task 3: DOI → PMID lookup via NCBI ID Converter

NCBI's ID Converter accepts DOIs and returns PMIDs in JSON.

**Files:**
- Modify: `enrich.py`
- Modify: `tests/test_enrich.py`
- Create: `tests/fixtures/idconv_response.json`

- [ ] **Step 1: Create the fixture `tests/fixtures/idconv_response.json`**

```json
{
  "status": "ok",
  "responseDate": "2026-05-24 00:00:00",
  "request": "ids=10.1053%2Fj.gastro.2024.01.001;format=json",
  "records": [
    {
      "pmcid": "PMC10995123",
      "pmid": "38449034",
      "doi": "10.1053/j.gastro.2024.01.001"
    }
  ]
}
```

- [ ] **Step 2: Append failing tests to `tests/test_enrich.py`**

```python
import responses


class TestDoiToPmid:
    @responses.activate
    def test_returns_pmid_for_known_doi(self, idconv_response):
        responses.get(
            "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/",
            json=idconv_response,
        )
        assert enrich.doi_to_pmid("10.1053/j.gastro.2024.01.001") == "38449034"

    @responses.activate
    def test_strips_doi_url_prefix(self, idconv_response):
        responses.get(
            "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/",
            json=idconv_response,
        )
        assert enrich.doi_to_pmid("https://doi.org/10.1053/j.gastro.2024.01.001") == "38449034"

    @responses.activate
    def test_returns_none_when_no_record(self):
        responses.get(
            "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/",
            json={"status": "ok", "records": [{"doi": "10.x/y", "live": "false"}]},
        )
        assert enrich.doi_to_pmid("10.x/y") is None

    def test_returns_none_for_empty_doi(self):
        assert enrich.doi_to_pmid(None) is None
        assert enrich.doi_to_pmid("") is None
```

- [ ] **Step 3: Run tests; verify the new ones fail**

Run: `python -m pytest tests/test_enrich.py::TestDoiToPmid -v`
Expected: 4 failures (function doesn't exist yet).

- [ ] **Step 4: Add `doi_to_pmid` to `enrich.py`**

Append to `enrich.py`:

```python
import requests

ID_CONVERTER_URL = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/"
CONTACT_EMAIL = "bobby.lo@regionh.dk"
USER_AGENT = f"bobby-zs-lo.github.io enrichment ({CONTACT_EMAIL})"


def _strip_doi(doi: Optional[str]) -> Optional[str]:
    if not doi:
        return None
    return doi.replace("https://doi.org/", "").replace("http://doi.org/", "").strip()


def doi_to_pmid(doi: Optional[str], timeout: float = 10.0) -> Optional[str]:
    """Resolve a DOI to a PMID via NCBI's ID converter.

    Returns None if the DOI is missing, the API errors, or no PMID is found.
    """
    clean = _strip_doi(doi)
    if not clean:
        return None
    try:
        r = requests.get(
            ID_CONVERTER_URL,
            params={"ids": clean, "format": "json", "tool": "bobby-zs-lo-site", "email": CONTACT_EMAIL},
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        r.raise_for_status()
        for record in r.json().get("records", []):
            if "pmid" in record:
                return str(record["pmid"])
    except (requests.RequestException, ValueError) as e:
        print(f"Warning: DOI→PMID lookup failed for {clean}: {e}")
    return None
```

- [ ] **Step 5: Run tests; verify pass**

Run: `python -m pytest tests/test_enrich.py -v`
Expected: 7 passed.

- [ ] **Step 6: Commit**

```
git add enrich.py tests/test_enrich.py tests/fixtures/idconv_response.json
git commit -m "feat(enrich): DOI→PMID lookup via NCBI ID converter"
```

---

## Task 4: PubMed efetch — MeSH terms + abstract fallback

**Files:**
- Modify: `enrich.py`
- Modify: `tests/test_enrich.py`
- Create: `tests/fixtures/pubmed_efetch.xml`

- [ ] **Step 1: Create the fixture `tests/fixtures/pubmed_efetch.xml`**

```xml
<?xml version="1.0" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID Version="1">38449034</PMID>
      <Article>
        <ArticleTitle>Real-time AI for ulcerative colitis endoscopy</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">UC endoscopy is subjective.</AbstractText>
          <AbstractText Label="METHODS">We trained a CNN on 1200 videos.</AbstractText>
          <AbstractText Label="RESULTS">Agreement with experts: 92%.</AbstractText>
        </Abstract>
      </Article>
      <MeshHeadingList>
        <MeshHeading>
          <DescriptorName UI="D003424">Colitis, Ulcerative</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName UI="D001185">Artificial Intelligence</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName UI="D003113">Colonoscopy</DescriptorName>
        </MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>
```

- [ ] **Step 2: Append failing tests to `tests/test_enrich.py`**

```python
class TestFetchPubmed:
    @responses.activate
    def test_extracts_mesh_and_abstract(self, pubmed_efetch_xml):
        responses.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
            body=pubmed_efetch_xml, content_type="application/xml",
        )
        result = enrich.fetch_pubmed("38449034")
        assert result["mesh_terms"] == [
            "Colitis, Ulcerative", "Artificial Intelligence", "Colonoscopy"
        ]
        assert "BACKGROUND: UC endoscopy is subjective." in result["abstract"]
        assert "METHODS: We trained a CNN on 1200 videos." in result["abstract"]
        assert "RESULTS: Agreement with experts: 92%." in result["abstract"]

    def test_returns_empty_for_missing_pmid(self):
        assert enrich.fetch_pubmed(None) == {"mesh_terms": [], "abstract": None}
        assert enrich.fetch_pubmed("") == {"mesh_terms": [], "abstract": None}

    @responses.activate
    def test_returns_empty_on_http_error(self):
        responses.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
            status=500,
        )
        assert enrich.fetch_pubmed("999") == {"mesh_terms": [], "abstract": None}
```

- [ ] **Step 3: Run tests; verify failure**

Run: `python -m pytest tests/test_enrich.py::TestFetchPubmed -v`
Expected: 3 failures.

- [ ] **Step 4: Add `fetch_pubmed` to `enrich.py`**

Append to `enrich.py`:

```python
import xml.etree.ElementTree as ET

EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


def fetch_pubmed(pmid: Optional[str], timeout: float = 10.0) -> Dict[str, Any]:
    """Fetch MeSH terms and abstract text from PubMed for a given PMID.

    Returns {"mesh_terms": [...], "abstract": str|None}.
    On any failure (missing PMID, network, malformed XML) returns empty fields.
    """
    empty: Dict[str, Any] = {"mesh_terms": [], "abstract": None}
    if not pmid:
        return empty
    try:
        r = requests.get(
            EFETCH_URL,
            params={"db": "pubmed", "id": pmid, "retmode": "xml",
                    "tool": "bobby-zs-lo-site", "email": CONTACT_EMAIL},
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        r.raise_for_status()
        root = ET.fromstring(r.content)
    except (requests.RequestException, ET.ParseError) as e:
        print(f"Warning: PubMed efetch failed for PMID {pmid}: {e}")
        return empty

    mesh: List[str] = []
    for desc in root.iter("DescriptorName"):
        if desc.text:
            mesh.append(desc.text)

    abstract_parts: List[str] = []
    for at in root.iter("AbstractText"):
        label = at.get("Label")
        text = "".join(at.itertext()).strip()
        if not text:
            continue
        abstract_parts.append(f"{label}: {text}" if label else text)
    abstract = " ".join(abstract_parts) if abstract_parts else None

    return {"mesh_terms": mesh, "abstract": abstract}
```

- [ ] **Step 5: Run tests; verify pass**

Run: `python -m pytest tests/test_enrich.py -v`
Expected: 10 passed.

- [ ] **Step 6: Commit**

```
git add enrich.py tests/test_enrich.py tests/fixtures/pubmed_efetch.xml
git commit -m "feat(enrich): fetch MeSH terms and abstract from PubMed"
```

---

## Task 5: Gemini summariser

**Files:**
- Modify: `enrich.py`
- Modify: `tests/test_enrich.py`

- [ ] **Step 1: Append failing tests to `tests/test_enrich.py`**

```python
from unittest.mock import MagicMock, patch


class TestSummariseWithGemini:
    @patch("enrich.genai")
    def test_returns_stripped_summary(self, mock_genai):
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "  Tested an AI tool on UC endoscopy; matched experts in 92% of cases.  "
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = enrich.summarise_with_gemini("BACKGROUND: ...")
        assert result == "Tested an AI tool on UC endoscopy; matched experts in 92% of cases."
        mock_genai.GenerativeModel.assert_called_once_with("gemini-3.5-flash")

    @patch("enrich.genai")
    def test_returns_none_on_api_error(self, mock_genai):
        mock_genai.GenerativeModel.side_effect = RuntimeError("API down")
        assert enrich.summarise_with_gemini("anything") is None

    def test_returns_none_for_empty_abstract(self):
        assert enrich.summarise_with_gemini(None) is None
        assert enrich.summarise_with_gemini("") is None
```

- [ ] **Step 2: Run tests; verify failure**

Run: `python -m pytest tests/test_enrich.py::TestSummariseWithGemini -v`
Expected: 3 failures.

- [ ] **Step 3: Add `summarise_with_gemini` to `enrich.py`**

Prepend the import to the top of `enrich.py`:

```python
import os
import google.generativeai as genai
```

Append to `enrich.py`:

```python
GEMINI_MODEL = "gemini-3.5-flash"
SUMMARY_PROMPT = (
    "Summarise this medical research abstract in one plain-English sentence of at most "
    "30 words, aimed at an educated non-specialist. State what was tested and the main "
    "finding. Do not invent details or add caveats not present in the abstract. Output "
    "only the sentence, no preamble.\n\nAbstract:\n{abstract}"
)


def summarise_with_gemini(abstract: Optional[str]) -> Optional[str]:
    """Call Gemini to produce a ≤30-word lay summary. Returns None on failure."""
    if not abstract:
        return None
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Warning: GEMINI_API_KEY not set; skipping summary.")
        return None
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(SUMMARY_PROMPT.format(abstract=abstract))
        return (response.text or "").strip() or None
    except Exception as e:
        print(f"Warning: Gemini summarisation failed: {e}")
        return None
```

- [ ] **Step 4: Run tests; verify pass**

Run: `python -m pytest tests/test_enrich.py -v`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```
git add enrich.py tests/test_enrich.py
git commit -m "feat(enrich): Gemini lay-summary call with graceful fallback"
```

---

## Task 6: Cache I/O + `enrich()` orchestrator with `--max-new`

**Files:**
- Modify: `enrich.py`
- Modify: `tests/test_enrich.py`

- [ ] **Step 1: Append failing tests to `tests/test_enrich.py`**

```python
import time


class TestCacheIO:
    def test_load_returns_empty_dict_when_missing(self, tmp_path):
        path = tmp_path / "missing.json"
        assert enrich.load_cache(path) == {}

    def test_save_then_load_roundtrip(self, tmp_path):
        path = tmp_path / "cache.json"
        data = {"https://openalex.org/W1": {"summary": "X", "pmid": "1"}}
        enrich.save_cache(path, data)
        assert enrich.load_cache(path) == data

    def test_save_sorts_keys_for_deterministic_diffs(self, tmp_path):
        path = tmp_path / "cache.json"
        enrich.save_cache(path, {"b": 1, "a": 2})
        text = path.read_text(encoding="utf-8")
        assert text.index('"a"') < text.index('"b"')


class TestEnrich:
    @patch("enrich.summarise_with_gemini", return_value="A lay summary.")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": ["UC"], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value="38449034")
    def test_enriches_one_new_work(self, m_pmid, m_pubmed, m_summary,
                                    openalex_work, tmp_path, monkeypatch):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)  # speed up test
        cache: Dict[str, Any] = {}
        result = enrich.enrich([openalex_work], cache)
        wid = openalex_work["id"]
        assert wid in result
        assert result[wid]["pmid"] == "38449034"
        assert result[wid]["mesh_terms"] == ["UC"]
        assert result[wid]["summary"] == "A lay summary."
        assert result[wid]["summary_model"] == "gemini-3.5-flash"
        assert "summary_generated_at" in result[wid]
        assert result[wid]["openalex_concepts"] == ["Gastroenterology", "Machine learning"]

    @patch("enrich.summarise_with_gemini")
    def test_skips_when_summary_already_cached(self, m_summary, openalex_work, monkeypatch):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        wid = openalex_work["id"]
        cache = {wid: {"summary": "Already done.", "pmid": "X", "mesh_terms": []}}
        enrich.enrich([openalex_work], cache)
        m_summary.assert_not_called()

    @patch("enrich.summarise_with_gemini", return_value="Now done.")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": [], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value=None)
    def test_retries_when_cached_summary_is_none(
        self, m_pmid, m_pubmed, m_summary, openalex_work, monkeypatch
    ):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        wid = openalex_work["id"]
        cache = {wid: {"summary": None, "abstract": "old"}}
        result = enrich.enrich([openalex_work], cache)
        m_summary.assert_called_once()
        assert result[wid]["summary"] == "Now done."

    @patch("enrich.summarise_with_gemini", return_value="S")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": [], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value=None)
    def test_max_new_caps_enrichment(self, m_pmid, m_pubmed, m_summary,
                                      openalex_work, monkeypatch):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        works = [
            {**openalex_work, "id": f"https://openalex.org/W{i}"} for i in range(5)
        ]
        result = enrich.enrich(works, {}, max_new=2)
        summarised = [k for k, v in result.items() if v.get("summary")]
        assert len(summarised) == 2
```

- [ ] **Step 2: Run tests; verify failure**

Run: `python -m pytest tests/test_enrich.py -v`
Expected: 7 new failures (`load_cache`, `save_cache`, `enrich` don't exist).

- [ ] **Step 3: Add cache I/O + orchestrator to `enrich.py`**

Prepend imports:

```python
import json
import time
from datetime import datetime, timezone
from pathlib import Path
```

Append to `enrich.py`:

```python
def load_cache(path: Path) -> Dict[str, Dict[str, Any]]:
    """Load the enrichment cache. Returns {} if the file is missing or unreadable."""
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with p.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"Warning: cache at {p} unreadable, starting fresh: {e}")
        return {}


def save_cache(path: Path, cache: Dict[str, Dict[str, Any]]) -> None:
    """Persist cache with sorted keys and indent for clean git diffs."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")


def _needs_enrichment(entry: Optional[Dict[str, Any]]) -> bool:
    """True if the entry is missing or has no successful summary yet."""
    if entry is None:
        return True
    return not entry.get("summary")


def enrich(
    works: List[Dict[str, Any]],
    cache: Dict[str, Dict[str, Any]],
    max_new: Optional[int] = None,
    pubmed_delay: float = 0.4,
    gemini_delay: float = 1.0,
) -> Dict[str, Dict[str, Any]]:
    """Populate the cache with abstracts, MeSH terms, and Gemini summaries.

    Mutates and returns `cache`. Skips works whose cache entry already has
    a non-empty summary. Respects `max_new` to cap per-run enrichment cost.
    """
    new_count = 0
    for work in works:
        wid = work.get("id")
        if not wid:
            continue
        entry = cache.get(wid)
        if not _needs_enrichment(entry):
            continue
        if max_new is not None and new_count >= max_new:
            break

        doi = _strip_doi(work.get("doi"))
        existing = entry or {}
        abstract = existing.get("abstract") or reconstruct_abstract(work.get("abstract_inverted_index"))
        abstract_source = "openalex" if abstract else None

        pmid = existing.get("pmid") or doi_to_pmid(doi)
        time.sleep(pubmed_delay)
        pm = fetch_pubmed(pmid)
        mesh_terms = existing.get("mesh_terms") or pm["mesh_terms"]
        if not abstract and pm["abstract"]:
            abstract = pm["abstract"]
            abstract_source = "pubmed"

        summary = summarise_with_gemini(abstract) if abstract else None
        time.sleep(gemini_delay)

        cache[wid] = {
            "doi": doi,
            "pmid": pmid,
            "abstract": abstract,
            "abstract_source": abstract_source,
            "mesh_terms": mesh_terms,
            "openalex_concepts": [c["display_name"] for c in (work.get("concepts") or [])],
            "summary": summary,
            "summary_model": GEMINI_MODEL,
            "summary_generated_at": datetime.now(timezone.utc).isoformat(),
        }
        new_count += 1
        print(f"Enriched {wid}: summary={'ok' if summary else 'none'}, pmid={pmid or '-'}")

    return cache
```

- [ ] **Step 4: Run tests; verify pass**

Run: `python -m pytest tests/test_enrich.py -v`
Expected: 20 passed.

- [ ] **Step 5: Commit**

```
git add enrich.py tests/test_enrich.py
git commit -m "feat(enrich): cache I/O and enrich() orchestrator with --max-new cap"
```

---

## Task 7: Topic vocabulary + matcher

**Files:**
- Create: `topics.py`
- Create: `tests/test_topics.py`

- [ ] **Step 1: Write the failing test `tests/test_topics.py`**

```python
"""Tests for topics.py."""
import topics


class TestMatchesTopic:
    def test_matches_via_mesh_term(self):
        terms = ["Colitis, Ulcerative", "Adult"]
        assert topics.matches_topic("UC", terms, []) is True

    def test_matches_via_openalex_concept(self):
        assert topics.matches_topic("AI", [], ["Deep Learning"]) is True

    def test_is_case_insensitive(self):
        assert topics.matches_topic("IBD", ["inflammatory bowel disease"], []) is True

    def test_no_match_returns_false(self):
        assert topics.matches_topic("IBD", ["Adult"], ["Medicine"]) is False

    def test_unknown_topic_returns_false(self):
        assert topics.matches_topic("Nonexistent", ["UC"], []) is False


class TestTopicsFor:
    def test_returns_all_matching_topics(self):
        result = topics.topics_for(
            mesh_terms=["Colitis, Ulcerative", "Artificial Intelligence", "Colonoscopy"],
            concepts=[],
        )
        assert set(result) == {"UC", "AI", "Endoscopy"}

    def test_returns_empty_when_no_match(self):
        assert topics.topics_for([], ["Sociology"]) == []
```

- [ ] **Step 2: Run tests; verify failure**

Run: `python -m pytest tests/test_topics.py -v`
Expected: `ModuleNotFoundError: No module named 'topics'`.

- [ ] **Step 3: Create `topics.py`**

```python
"""Curated topic vocabulary for publication filtering."""
from __future__ import annotations

from typing import List, Sequence

TOPIC_VOCAB: dict[str, list[str]] = {
    "IBD":          ["Inflammatory Bowel Diseases", "Inflammatory bowel disease"],
    "Crohn's":      ["Crohn Disease", "Crohn's disease"],
    "UC":           ["Colitis, Ulcerative", "Ulcerative colitis"],
    "Microbiome":   ["Gastrointestinal Microbiome", "Microbiome"],
    "AI":           ["Artificial Intelligence", "Deep Learning", "Machine learning"],
    "Endoscopy":    ["Endoscopy", "Colonoscopy"],
    "Epidemiology": ["Epidemiology", "Cohort Studies"],
    "Registry":     ["Registries"],
}

# Stable display order for chip rendering.
TOPIC_ORDER: list[str] = list(TOPIC_VOCAB.keys())


def matches_topic(topic: str, mesh_terms: Sequence[str], concepts: Sequence[str]) -> bool:
    """True if any synonym for `topic` appears (case-insensitive substring) in either list."""
    needles = [n.lower() for n in TOPIC_VOCAB.get(topic, [])]
    if not needles:
        return False
    haystack = " | ".join(list(mesh_terms) + list(concepts)).lower()
    return any(n in haystack for n in needles)


def topics_for(mesh_terms: Sequence[str], concepts: Sequence[str]) -> List[str]:
    """Return all topics from TOPIC_ORDER that match this paper's terms."""
    return [t for t in TOPIC_ORDER if matches_topic(t, mesh_terms, concepts)]
```

- [ ] **Step 4: Run tests; verify pass**

Run: `python -m pytest tests/test_topics.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```
git add topics.py tests/test_topics.py
git commit -m "feat(topics): curated vocabulary + matcher for publication chips"
```

---

## Task 8: Refactor `generate_publications.py` — render summary, data-search, data-topics, chips, CLI

This task changes a large existing file. The strategy: keep all existing rendering logic, just augment the `.pub-row` blocks and add a chip bar. Add a `__main__` block with `argparse` and call `enrich()` before rendering.

**Files:**
- Modify: `generate_publications.py`
- Create: `tests/test_generate_publications.py`

- [ ] **Step 1: Write the failing test `tests/test_generate_publications.py`**

```python
"""Tests for the publications renderer's data-attribute output."""
import generate_publications as gp


SAMPLE_PUB = {
    "id": "https://openalex.org/W1",
    "title": "Real-time AI for UC",
    "publication_year": 2024,
    "authorships": [{"author": {"display_name": "Bobby Lo"}}],
    "primary_location": {"source": {"display_name": "Gastroenterology"}},
}
SAMPLE_CACHE = {
    "https://openalex.org/W1": {
        "summary": "Tested an AI tool on UC endoscopy.",
        "mesh_terms": ["Colitis, Ulcerative", "Artificial Intelligence"],
        "openalex_concepts": [],
    }
}


class TestRenderPubRow:
    def test_includes_summary_topics_and_search(self):
        html = gp.render_pub_row(SAMPLE_PUB, SAMPLE_CACHE)
        assert "Tested an AI tool on UC endoscopy." in html
        assert 'data-topics="UC AI"' in html
        assert "data-search=" in html
        assert "real-time ai for uc" in html.lower()  # title appears in data-search

    def test_renders_without_cache_entry(self):
        html = gp.render_pub_row(SAMPLE_PUB, {})
        assert 'data-topics=""' in html
        assert "Tested an AI tool" not in html
        assert "Real-time AI for UC" in html

    def test_search_includes_summary_text(self):
        html = gp.render_pub_row(SAMPLE_PUB, SAMPLE_CACHE)
        assert "tested an ai tool" in html.lower()


class TestRenderChipBar:
    def test_lists_topics_present_in_cache(self):
        html = gp.render_chip_bar(SAMPLE_CACHE)
        assert 'data-topic="UC"' in html
        assert 'data-topic="AI"' in html
        assert 'data-topic="Microbiome"' not in html  # not in any cache entry
        assert 'data-topic="all"' in html  # "All" chip always present

    def test_renders_empty_chip_bar_when_no_topics(self):
        html = gp.render_chip_bar({})
        assert 'data-topic="all"' in html
```

- [ ] **Step 2: Run tests; verify failure**

Run: `python -m pytest tests/test_generate_publications.py -v`
Expected: errors (functions don't exist; current `generate_publications.py` is a top-level script).

- [ ] **Step 3: Refactor `generate_publications.py`**

The file is currently a top-level script with no functions for individual rows. Wrap it. Replace the **entire** existing file with:

```python
"""Generate publications.html, publications.xml, and abstract_cache.json.

Run weekly via GitHub Action, or locally with --max-new to stage backfill.
"""
from __future__ import annotations

import argparse
import html
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests

import enrich
import topics

# === Settings ===
AUTHOR_ID = "a5078664290"
MAILTO = "bobby.lo@regionh.dk"
OUTPUT_HTML = Path("publications.html")
OUTPUT_RSS = Path("publications.xml")
CACHE_PATH = Path("data/abstract_cache.json")
SITE_BASE = "https://bobby-zs-lo.github.io"

HIGH_IMPACT_KEYWORDS = [
    "nature", "gastroenterology", "gut", "lancet", "jama", "new england journal",
]


def fetch_author() -> Dict[str, Any]:
    url = f"https://api.openalex.org/authors/{AUTHOR_ID}?mailto={MAILTO}"
    try:
        return requests.get(url, timeout=20).json()
    except requests.RequestException as e:
        print(f"Warning: author fetch failed: {e}")
        return {}


def fetch_works() -> List[Dict[str, Any]]:
    url = (
        f"https://api.openalex.org/works?filter=authorships.author.id:{AUTHOR_ID}"
        f"&per_page=200&sort=publication_date:desc&mailto={MAILTO}"
    )
    try:
        return requests.get(url, timeout=30).json().get("results", []) or []
    except requests.RequestException as e:
        print(f"Warning: works fetch failed: {e}")
        return []


def author_name_keywords(author: Dict[str, Any]) -> List[str]:
    names = list(author.get("display_name_alternatives", []) or [])
    if author.get("display_name"):
        names.append(author["display_name"])
    return names or ["Bobby Lo"]


def highlight_name(authors_list: List[Dict[str, Any]], keywords: List[str]) -> str:
    out = []
    for a in authors_list:
        name = str((a.get("author") or {}).get("display_name", "Unknown"))
        is_hl = any(k.lower() in name.lower() for k in keywords if k)
        out.append(f"<b>{html.escape(name)}</b>" if is_hl else html.escape(name))
    return ", ".join(out)


def highlight_name_short(authors_list: List[Dict[str, Any]], keywords: List[str]) -> str:
    pairs = []
    for a in authors_list:
        name = str((a.get("author") or {}).get("display_name", "Unknown"))
        pairs.append((name, any(k.lower() in name.lower() for k in keywords if k)))
    if len(pairs) <= 3:
        return ", ".join(f"<b>{html.escape(n)}</b>" if hl else html.escape(n) for n, hl in pairs)
    top3 = [f"<b>{html.escape(n)}</b>" if hl else html.escape(n) for n, hl in pairs[:3]]
    bobby_in_top3 = any(hl for _, hl in pairs[:3])
    if bobby_in_top3:
        return ", ".join(top3) + " ..."
    for n, hl in pairs[3:]:
        if hl:
            return ", ".join(top3) + f" ... <b>{html.escape(n)}</b> ..."
    return ", ".join(top3) + " ..."


def render_pub_row(pub: Dict[str, Any], cache: Dict[str, Dict[str, Any]],
                   authors_renderer=None, keywords: List[str] | None = None) -> str:
    """Render one <li class='pub-row'> with summary blurb + data-search + data-topics."""
    keywords = keywords or ["Bobby Lo"]
    authors_renderer = authors_renderer or (lambda a: highlight_name(a, keywords))
    title = pub.get("title") or "Untitled"
    year = pub.get("publication_year") or "n.d."
    authors_html = authors_renderer(pub.get("authorships", []) or [])
    primary = pub.get("primary_location") or {}
    source = primary.get("source") or {}
    venue = source.get("display_name") or "Unknown journal or conference"

    entry = cache.get(pub.get("id") or "") or {}
    summary = entry.get("summary") or ""
    mesh = entry.get("mesh_terms") or []
    concepts = entry.get("openalex_concepts") or []
    topic_list = topics.topics_for(mesh, concepts)
    topics_attr = html.escape(" ".join(topic_list))

    # Build data-search blob (lowercase, plain text — strips tags from authors)
    plain_authors = ", ".join(
        (a.get("author") or {}).get("display_name", "") for a in pub.get("authorships", []) or []
    )
    search_blob = " ".join([str(title), plain_authors, str(venue), summary]).lower()
    search_attr = html.escape(search_blob, quote=True)

    summary_block = (
        f'<p class="pub-summary">{html.escape(summary)}</p>'
        if summary else ""
    )

    return (
        f'<li class="pub-row" data-topics="{topics_attr}" data-search="{search_attr}">'
        f'<span class="pub-year">{html.escape(str(year))}</span>'
        f'<div>'
        f'<strong>{html.escape(str(title))}</strong>'
        f'<span class="pub-meta">{authors_html} · {html.escape(str(venue))}</span>'
        f'{summary_block}'
        f'</div>'
        f'</li>'
    )


def render_chip_bar(cache: Dict[str, Dict[str, Any]]) -> str:
    """Render the topic chip bar. Only shows chips with at least one matching paper."""
    present: set[str] = set()
    for entry in cache.values():
        for t in topics.topics_for(entry.get("mesh_terms") or [], entry.get("openalex_concepts") or []):
            present.add(t)
    chips = ['<button class="topic-chip" data-topic="all" aria-pressed="true">All</button>']
    for t in topics.TOPIC_ORDER:
        if t in present:
            chips.append(
                f'<button class="topic-chip" data-topic="{html.escape(t)}" '
                f'aria-pressed="false">{html.escape(t)}</button>'
            )
    return f'<div class="topic-chips" role="group" aria-label="Filter by topic">{"".join(chips)}</div>'


def render_rss(works: List[Dict[str, Any]], cache: Dict[str, Dict[str, Any]]) -> str:
    """Render a minimal RSS 2.0 feed of the 25 most recent publications."""
    items = []
    for pub in works[:25]:
        title = html.escape(pub.get("title") or "Untitled")
        link = pub.get("doi") or pub.get("id") or SITE_BASE
        entry = cache.get(pub.get("id") or "") or {}
        desc = html.escape(entry.get("summary") or pub.get("title") or "")
        pub_date = pub.get("publication_date") or ""
        items.append(
            f"<item><title>{title}</title><link>{html.escape(link)}</link>"
            f"<guid isPermaLink='false'>{html.escape(pub.get('id') or link)}</guid>"
            f"<description>{desc}</description>"
            f"<pubDate>{html.escape(pub_date)}</pubDate></item>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0"><channel>'
        '<title>Publications — Bobby Zhao Sheng Lo, MD, PhD</title>'
        f'<link>{SITE_BASE}/publications.html</link>'
        '<description>Latest peer-reviewed publications.</description>'
        f'<lastBuildDate>{datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")}</lastBuildDate>'
        + "".join(items) + "</channel></rss>"
    )


# === Rendering helpers (highlights, JSON-LD) — kept from original ===

def _esc_json(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", " ")


def build_pub_jsonld(pub: Dict[str, Any]) -> str:
    title = _esc_json(pub.get("title", "Untitled"))
    year = pub.get("publication_year", "")
    date = pub.get("publication_date", "") or (str(year) if year else "")
    primary = pub.get("primary_location") or {}
    source = primary.get("source") or {}
    venue = _esc_json(source.get("display_name", ""))
    doi = pub.get("doi") or ""
    cites = pub.get("cited_by_count", 0)
    author_objs = []
    for a in (pub.get("authorships") or [])[:10]:
        nm = _esc_json(((a.get("author") or {}).get("display_name")) or "Unknown")
        author_objs.append(f'{{"@type":"Person","name":"{nm}"}}')
    authors_str = ",".join(author_objs)
    doi_block = f',"sameAs":"{_esc_json(doi)}"' if doi else ""
    venue_block = f',"isPartOf":{{"@type":"Periodical","name":"{venue}"}}' if venue else ""
    return (
        "{"
        '"@context":"https://schema.org","@type":"ScholarlyArticle",'
        f'"headline":"{title}","datePublished":"{date}",'
        f'"author":[{authors_str}],"citationCount":{int(cites)}'
        f'{doi_block}{venue_block}'
        "}"
    )


# === Main render ===

def render_html(author: Dict[str, Any], works: List[Dict[str, Any]],
                cache: Dict[str, Dict[str, Any]]) -> str:
    """Produce the full publications.html string."""
    h_index = author.get("summary_stats", {}).get("h_index", 0)
    i10_index = author.get("summary_stats", {}).get("i10_index", 0)
    citations = author.get("cited_by_count", 0)
    openalex_url = author.get("id", "#")
    keywords = author_name_keywords(author)

    by_year: Dict[Any, List[Dict[str, Any]]] = {}
    highlighted: List[tuple] = []
    for pub in works:
        year = pub.get("publication_year", "n.d.")
        by_year.setdefault(year, []).append(pub)
        venue = ((pub.get("primary_location") or {}).get("source") or {}).get(
            "display_name", "") or ""
        cites = pub.get("cited_by_count", 0)
        if cites > 50 or any(k in venue.lower() for k in HIGH_IMPACT_KEYWORDS):
            highlighted.append((pub, cites, venue, pub.get("publication_year", "n.d.")))
    highlighted.sort(key=lambda x: x[1], reverse=True)
    top_highlights = highlighted[:5]

    highlights_jsonld = ""
    if top_highlights:
        items = ",".join(build_pub_jsonld(p) for p, _c, _v, _y in top_highlights)
        highlights_jsonld = (
            '<script type="application/ld+json">{'
            '"@context":"https://schema.org","@type":"ItemList",'
            '"name":"Highlighted publications",'
            f'"itemListElement":[{items}]}}</script>'
        )

    chip_bar = render_chip_bar(cache)

    highlights_html = ""
    if top_highlights:
        rows = []
        for pub, cites, venue, year in top_highlights:
            rows.append(
                render_pub_row(
                    pub, cache,
                    authors_renderer=lambda a: highlight_name_short(a, keywords),
                    keywords=keywords,
                )
            )
        highlights_html = f"""
      <section class="section">
        <div class="container section-inner">
          <div class="section-gutter"><span class="eyebrow">// 02  Highlighted</span></div>
          <div class="section-body">
            <h2>Highlighted publications</h2>
            <ul class="pubs-preview">{''.join(rows)}</ul>
          </div>
        </div>
      </section>
"""

    year_blocks = []
    for year in sorted(by_year.keys(), key=lambda y: int(y) if str(y).isdigit() else 0, reverse=True):
        rows = "".join(render_pub_row(p, cache, keywords=keywords) for p in by_year[year])
        year_blocks.append(f"""
              <div class="collapsible-section">
                <button class="collapsible">{year}</button>
                <div class="content">
                  <ul class="pubs-preview">{rows}</ul>
                </div>
              </div>""")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Publications — Bobby Zhao Sheng Lo, MD, PhD · {len(works)} peer-reviewed works</title>
    <meta name="description" content="Peer-reviewed publications by Bobby Zhao Sheng Lo, MD, PhD. {citations:,} citations · h-index {h_index} · i10-index {i10_index}.">
    <meta name="author" content="Bobby Zhao Sheng Lo">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
    <meta name="theme-color" content="#1A1614">
    <link rel="stylesheet" href="style.css">
    <link rel="canonical" href="{SITE_BASE}/publications.html" />
    <link rel="alternate" type="application/rss+xml" title="Publications RSS" href="{SITE_BASE}/publications.xml" />
    <link rel="icon" type="image/jpeg" href="image/profile-2026.jpg">
    {highlights_jsonld}
</head>
<body>
    <nav class="nav">
      <div class="container nav-inner">
        <a href="index.html" class="nav-brand">Bobby<span class="nav-brand-dot">.</span>Lo</a>
        <ul class="nav-links">
          <li><a href="index.html">Home</a></li>
          <li><a href="publications.html" class="active">Publications</a></li>
        </ul>
      </div>
    </nav>
    <main>
      <section class="section metrics-page">
        <div class="container section-inner">
          <div class="section-gutter"><span class="eyebrow">// 01  Scholar metrics</span></div>
          <div class="section-body">
            <h2>Scholar metrics</h2>
            <div class="metrics-inner" style="margin-top:24px">
              <div class="metric"><div class="metric-value">{citations:,}</div><div class="metric-label">Citations</div></div>
              <div class="metric"><div class="metric-value">{h_index}</div><div class="metric-label">h-index</div></div>
              <div class="metric"><div class="metric-value">{i10_index}</div><div class="metric-label">i10-index</div></div>
            </div>
            <a href="{openalex_url}" target="_blank" rel="noopener" class="btn btn-outline" style="margin-top:24px">View OpenAlex profile →</a>
          </div>
        </div>
      </section>
      {highlights_html}
      <section class="section">
        <div class="container section-inner">
          <div class="section-gutter"><span class="eyebrow">// 03  All publications</span></div>
          <div class="section-body">
            <h2>Peer-reviewed publications</h2>
            {chip_bar}
            <input type="text" id="searchBox" onkeyup="filterPublications()" placeholder="Search publications…" class="pubs-search" />
            <button id="toggleAllBtn" onclick="toggleAll()" class="btn btn-outline" style="margin-bottom:18px">Expand All</button>
            <div id="publicationsList">{''.join(year_blocks)}</div>
          </div>
        </div>
      </section>
    </main>
    <footer class="site-footer">
      <div class="container site-footer-inner">
        <span>&copy; {datetime.now(timezone.utc).year} Bobby Zhao Sheng Lo.</span>
        <span class="site-footer-meta">All rights reserved.</span>
      </div>
    </footer>
    <button id="toTopBtn" title="Go to top" aria-label="Scroll to top">↑</button>
    <script src="script.js"></script>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate publications.html and friends.")
    parser.add_argument("--max-new", type=int, default=None,
                        help="Cap how many uncached papers to enrich this run (default: unlimited).")
    parser.add_argument("--skip-enrich", action="store_true",
                        help="Render from existing cache only; do not call PubMed/Gemini.")
    args = parser.parse_args()

    author = fetch_author()
    works = fetch_works()
    if not works:
        print("Error: no works fetched; aborting render to avoid wiping pages.")
        return 1

    cache = enrich.load_cache(CACHE_PATH)
    if not args.skip_enrich:
        before = sum(1 for v in cache.values() if v.get("summary"))
        enrich.enrich(works, cache, max_new=args.max_new)
        after = sum(1 for v in cache.values() if v.get("summary"))
        print(f"Enrichment: {after - before} new summaries; {after} total cached.")
        enrich.save_cache(CACHE_PATH, cache)

    OUTPUT_HTML.write_text(render_html(author, works, cache), encoding="utf-8")
    print(f"Wrote {OUTPUT_HTML}.")

    OUTPUT_RSS.write_text(render_rss(works, cache), encoding="utf-8")
    print(f"Wrote {OUTPUT_RSS}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests; verify pass**

Run: `python -m pytest tests/ -v`
Expected: all tests pass (20 enrich + 7 topics + 5 generate_publications = 32 passed).

- [ ] **Step 5: Smoke-render locally with `--skip-enrich`**

Run: `python generate_publications.py --skip-enrich`
Expected: writes `publications.html` and `publications.xml` from current cache (which will be empty on first run — no summaries shown, but the page renders).
Open `publications.html` in a browser; confirm titles, search box, chip bar all render. Chip bar will be empty (only "All") until cache has entries.

- [ ] **Step 6: Commit**

```
git add generate_publications.py tests/test_generate_publications.py
git commit -m "feat(publications): summary blurb, topic chips, RSS, --max-new CLI"
```

---

## Task 9: Add RSS feed test coverage

The renderer in Task 8 includes `render_rss`. Add a quick test so future changes don't break feed validity.

**Files:**
- Modify: `tests/test_generate_publications.py`

- [ ] **Step 1: Append failing test**

```python
import xml.etree.ElementTree as ET


class TestRenderRss:
    def test_produces_valid_rss_with_summary(self):
        works = [{
            "id": "https://openalex.org/W1",
            "title": "Real-time AI for UC",
            "doi": "https://doi.org/10.1053/x",
            "publication_date": "2024-03-12",
        }]
        cache = {"https://openalex.org/W1": {"summary": "AI in UC."}}
        xml_str = gp.render_rss(works, cache)
        root = ET.fromstring(xml_str)
        assert root.tag == "rss"
        items = root.findall(".//item")
        assert len(items) == 1
        assert items[0].find("title").text == "Real-time AI for UC"
        assert items[0].find("description").text == "AI in UC."

    def test_empty_works_still_valid(self):
        xml_str = gp.render_rss([], {})
        root = ET.fromstring(xml_str)
        assert root.find(".//item") is None
```

- [ ] **Step 2: Run test; verify pass (rss already implemented in Task 8)**

Run: `python -m pytest tests/test_generate_publications.py::TestRenderRss -v`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```
git add tests/test_generate_publications.py
git commit -m "test(publications): cover RSS feed structure"
```

---

## Task 10: Update `script.js` — chip toggle + summary-aware search

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Replace the `filterPublications` function (lines 11–37)**

In `script.js`, replace the existing block:

```javascript
// Search functionality
function filterPublications() {
    const input = document.getElementById("searchBox");
    const filter = input.value.toLowerCase();
    const sections = document.getElementsByClassName("collapsible-section");

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        // Get all li elements within the current collapsible section.
        const liItems = section.getElementsByTagName("li");
        let sectionHasMatch = false;

        // Loop through each publication (li) in the section.
        for (let j = 0; j < liItems.length; j++) {
            const text = liItems[j].textContent || liItems[j].innerText;
            if (text.toLowerCase().includes(filter)) {
                liItems[j].style.display = "";
                sectionHasMatch = true;
            } else {
                liItems[j].style.display = "none";
            }
        }

        // Hide the entire collapsible section if no publications match.
        section.style.display = sectionHasMatch ? "" : "none";
    }
}
```

With:

```javascript
// Active topic filter (null = "All")
let activeTopic = null;

function rowMatches(row, query) {
    const haystack = row.dataset.search || (row.textContent || "").toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (activeTopic) {
        const topics = (row.dataset.topics || "").split(/\s+/).filter(Boolean);
        if (!topics.includes(activeTopic)) return false;
    }
    return true;
}

function filterPublications() {
    const input = document.getElementById("searchBox");
    const query = input ? input.value.toLowerCase().trim() : "";
    const sections = document.getElementsByClassName("collapsible-section");
    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const rows = section.querySelectorAll("li.pub-row");
        let sectionHasMatch = false;
        rows.forEach(row => {
            const show = rowMatches(row, query);
            row.style.display = show ? "" : "none";
            if (show) sectionHasMatch = true;
        });
        section.style.display = sectionHasMatch ? "" : "none";
    }
}

// Topic chips: clicking sets activeTopic and re-runs filter.
document.addEventListener("click", function(e) {
    const chip = e.target.closest(".topic-chip");
    if (!chip) return;
    const topic = chip.dataset.topic;
    activeTopic = topic === "all" ? null : topic;
    document.querySelectorAll(".topic-chip").forEach(c => {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
    });
    filterPublications();
});
```

- [ ] **Step 2: Smoke-test in browser**

Open `publications.html` (regenerated in Task 8). In the search box, type a word. Click chips. Verify rows hide/show.
(Real verification happens after Task 8 produces a cache with entries.)

- [ ] **Step 3: Commit**

```
git add script.js
git commit -m "feat(script): topic chip handler and summary-aware search"
```

---

## Task 11: CSS for summary blurb + topic chips

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Append to `style.css`**

```css
/* Publication summary blurb (machine-generated lay summary) */
.pub-summary {
    margin: 6px 0 0;
    color: var(--ink-soft, #5a514c);
    font-size: 0.93rem;
    line-height: 1.45;
    max-width: 62ch;
}

/* Topic filter chips */
.topic-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 18px;
}
.topic-chip {
    border: 1px solid var(--ink, #1A1614);
    background: transparent;
    color: var(--ink, #1A1614);
    padding: 6px 14px;
    border-radius: 999px;
    font: inherit;
    font-size: 0.86rem;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
}
.topic-chip:hover {
    background: rgba(26, 22, 20, 0.06);
}
.topic-chip[aria-pressed="true"] {
    background: var(--accent, #C4302B);
    color: #FBFAF7;
    border-color: var(--accent, #C4302B);
}
```

- [ ] **Step 2: Reload `publications.html` and visually confirm**

Search blurbs are muted; chips have pill shape and red active state.

- [ ] **Step 3: Commit**

```
git add style.css
git commit -m "style: publication summary blurb + topic chip pills"
```

---

## Task 12: Add sentinel comments around research + outreach sections in `index.html`

This is a prep edit — no behaviour change. Adds anchors that `generate_index.py` will write between.

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Wrap the research stack**

In `index.html`, locate the `<div class="research-stack">` block (currently lines 449–475). Wrap the four `<article>` cards inside it with sentinel comments. Replace:

```html
          <div class="research-stack">
            <article class="research-card" data-research-idx="0">
```

With:

```html
          <div class="research-stack">
            <!-- RESEARCH-START — auto-managed by generate_index.py. Edit data/research_projects.yaml instead. -->
            <article class="research-card" data-research-idx="0">
```

And replace the closing `</article>` of the fourth card and the line after, currently:

```html
                AI-assisted diagnostics</p>
            </article>
          </div>
```

With:

```html
                AI-assisted diagnostics</p>
            </article>
            <!-- RESEARCH-END -->
          </div>
```

- [ ] **Step 2: Wrap the outreach blocks**

Locate the `<h2>Speaking, service &amp; outreach</h2>` (currently line 507). Immediately after it, add:

```html
          <h2>Speaking, service &amp; outreach</h2>

          <!-- OUTREACH-START — auto-managed by generate_index.py. Edit data/activity.yaml instead. -->
```

And before the closing `</div>` of `class="section-body"` for the speaking section (currently line 553, just before `</div></div></section>` of `#speaking`), add:

```html
          <!-- OUTREACH-END -->
        </div>
      </div>
    </section>
```

- [ ] **Step 3: Verify in browser**

Open `index.html`. The page should look identical — sentinel comments are HTML comments, invisible to users.

- [ ] **Step 4: Commit**

```
git add index.html
git commit -m "chore(index): add sentinel comments for auto-managed regions"
```

---

## Task 13: Seed `data/research_projects.yaml` and `data/activity.yaml`

**Files:**
- Create: `data/research_projects.yaml`
- Create: `data/activity.yaml`

- [ ] **Step 1: Create `data/research_projects.yaml`**

These map to the four cards currently in `index.html`. DOIs / OpenAlex IDs are intentionally blank — fill in once you know which paper each card represents. Until filled, the `fallback_description` renders.

```yaml
# Major Research Projects — rendered into index.html between
# <!-- RESEARCH-START --> and <!-- RESEARCH-END --> by generate_index.py.
# If `openalex_id` (preferred) or `doi` resolves to a cache entry with a summary,
# that summary replaces fallback_description.

- id: enact
  tag: "Endoscopy AI"
  title: "ENACT"
  openalex_id: ""
  doi: ""
  fallback_description: >-
    Endoscopic Add-on System for Ulcerative Colitis patients. Real-time CNN
    inference on live endoscopy video to augment clinician scoring.

- id: presager
  tag: "Computer Vision"
  title: "Presager Project"
  openalex_id: ""
  doi: ""
  fallback_description: >-
    Application of computer science for disease classification and prediction
    in IBD using deep learning.

- id: dib
  tag: "Biobank"
  title: "Danish IBD Biobank (DIB)"
  openalex_id: ""
  doi: ""
  fallback_description: >-
    National biobanking initiative investigating biological treatment
    outcomes in Inflammatory Bowel Disease.

- id: ius-predict
  tag: "Ultrasound Clinical Trial"
  title: "IUS-Predict Study"
  openalex_id: ""
  doi: ""
  fallback_description: >-
    Multicenter prospective study evaluating early intestinal ultrasound (IUS)
    in Ulcerative Colitis. Building a centralized multi-omics biobank and
    imaging repository for future computational and AI-assisted diagnostics.
```

- [ ] **Step 2: Create `data/activity.yaml`**

Mirrors the current outreach section. Free-text `body` blocks support the existing peer-review / supervision / media paragraphs; structured `items` support the talk and advisory lists.

```yaml
# Outreach content — rendered into index.html between
# <!-- OUTREACH-START --> and <!-- OUTREACH-END --> by generate_index.py.
# Each top-level entry is a block. Either `items` (list) or `body` (paragraph) — not both.

- title: "Invited talks"
  type: talks
  items:
    - { date: "2025", title: "AI i klinisk gastroenterologi — lær at gennemskue forskningen og teknologien bag" }
    - { date: "2025", title: "AI in Medicine: Hype, Harm, and How to Get It Right — webinar" }
    - { date: "2025", title: "JnJ Winter Conference" }
    - { date: "2024", title: "Dansk Selskab for Ambulant Kirurgi & Gastroenterologi · Årsmøde" }
    - { date: "2023", title: "European Conference of Young Gastroenterologists" }
    - { date: "2023", title: "Basic Treatment of the Patient with Ulcerative Colitis" }
    - { date: "2022", title: "IBDeas AI Symposium" }
    - { date: "2021", title: "AI in Inflammatory Bowel Disease" }
  aux: "Also: oral presenter / chair at Digestive Disease Week, UEGW, and the ECCO Conference."

- title: "Advisory boards"
  type: boards
  items:
    - { date: "2025 →", title: "Takeda Pharma — ongoing" }
    - { date: "2022",   title: "Tillotts Pharma AB" }

- title: "Peer review"
  type: text
  body: >-
    Frequent reviewer for <strong>American Journal of Gastroenterology</strong>,
    <strong>Journal of Crohn and Colitis</strong>, <strong>Gastroenterology</strong>,
    and <strong>GUT</strong>.

- title: "Supervision & mentorship"
  type: text
  body: >-
    Supervisor / co-supervisor for several bachelor and master students in
    Medicine and Data Science. Co-supervisor of 2 PhD students in Medicine
    and Data Science.

- title: "Media"
  type: text
  body: >-
    Contributions to BestPractice, Journal of Crohn and Colitis,
    Medicinsk Tidsskrift, Nyheder fra Hvidovre Hospital, CCF Magasinet.
```

- [ ] **Step 3: Validate YAML parses**

Run: `python -c "import yaml; yaml.safe_load(open('data/research_projects.yaml', encoding='utf-8')); yaml.safe_load(open('data/activity.yaml', encoding='utf-8')); print('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```
git add data/research_projects.yaml data/activity.yaml
git commit -m "data: seed research_projects.yaml and activity.yaml from current HTML"
```

---

## Task 14: Write `generate_index.py` — render between sentinels (TDD)

**Files:**
- Create: `generate_index.py`
- Create: `tests/test_generate_index.py`

- [ ] **Step 1: Write the failing test `tests/test_generate_index.py`**

```python
"""Tests for generate_index.py."""
import generate_index as gi


SAMPLE_PROJECTS = [
    {"id": "p1", "tag": "Endoscopy AI", "title": "ENACT",
     "openalex_id": "https://openalex.org/W1", "doi": "",
     "fallback_description": "Fallback text."},
    {"id": "p2", "tag": "Biobank", "title": "DIB",
     "openalex_id": "", "doi": "",
     "fallback_description": "Bio fallback."},
]
SAMPLE_CACHE = {
    "https://openalex.org/W1": {"summary": "Live CNN overlay on UC colonoscopy.", "mesh_terms": [], "openalex_concepts": []}
}
SAMPLE_ACTIVITY = [
    {"title": "Invited talks", "type": "talks",
     "items": [{"date": "2025", "title": "Talk one"}],
     "aux": "Also chair at X."},
    {"title": "Media", "type": "text", "body": "<strong>Quoted</strong> in places."},
]


class TestRenderProjects:
    def test_uses_cached_summary_when_available(self):
        html = gi.render_projects(SAMPLE_PROJECTS, SAMPLE_CACHE)
        assert "Live CNN overlay on UC colonoscopy." in html
        assert "Fallback text." not in html  # cached summary takes precedence
        assert "Bio fallback." in html       # no cache entry → fallback

    def test_emits_research_card_structure(self):
        html = gi.render_projects(SAMPLE_PROJECTS, SAMPLE_CACHE)
        assert html.count('class="research-card"') == 2
        assert 'data-research-idx="0"' in html
        assert 'data-research-idx="1"' in html


class TestRenderOutreach:
    def test_renders_list_block(self):
        html = gi.render_outreach(SAMPLE_ACTIVITY)
        assert "Invited talks" in html
        assert "Talk one" in html
        assert "2025" in html
        assert "Also chair at X." in html

    def test_renders_text_block_with_safe_html(self):
        html = gi.render_outreach(SAMPLE_ACTIVITY)
        assert "<strong>Quoted</strong>" in html  # body is trusted HTML


class TestInjectBetweenSentinels:
    def test_replaces_between_markers(self):
        original = "before<!-- X-START -->old content<!-- X-END -->after"
        result = gi.inject_between(original, "X-START", "X-END", "NEW")
        assert result == "before<!-- X-START -->NEW<!-- X-END -->after"

    def test_raises_when_markers_missing(self):
        import pytest
        with pytest.raises(ValueError, match="X-START"):
            gi.inject_between("no markers here", "X-START", "X-END", "NEW")
```

- [ ] **Step 2: Run tests; verify failure**

Run: `python -m pytest tests/test_generate_index.py -v`
Expected: `ModuleNotFoundError: No module named 'generate_index'`.

- [ ] **Step 3: Create `generate_index.py`**

```python
"""Render data/research_projects.yaml + data/activity.yaml into index.html.

Edits only the regions between <!-- RESEARCH-START -->/<!-- RESEARCH-END -->
and <!-- OUTREACH-START -->/<!-- OUTREACH-END --> sentinels. Manual content
outside the sentinels is preserved.
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml

import enrich

INDEX_PATH = Path("index.html")
PROJECTS_PATH = Path("data/research_projects.yaml")
ACTIVITY_PATH = Path("data/activity.yaml")
CACHE_PATH = Path("data/abstract_cache.json")


def render_projects(projects: List[Dict[str, Any]], cache: Dict[str, Dict[str, Any]]) -> str:
    cards: List[str] = []
    for i, proj in enumerate(projects):
        key = proj.get("openalex_id") or proj.get("doi") or ""
        entry = cache.get(key) or {}
        summary = entry.get("summary") or proj.get("fallback_description", "")
        cards.append(
            f'<article class="research-card" data-research-idx="{i}">'
            f'<span class="research-tag">{html.escape(proj.get("tag", ""))}</span>'
            f'<h3>{html.escape(proj.get("title", ""))}</h3>'
            f'<p>{html.escape(summary)}</p>'
            f'</article>'
        )
    return "\n            ".join([""] + cards) + "\n            "


def render_outreach(activity: List[Dict[str, Any]]) -> str:
    blocks: List[str] = []
    for block in activity:
        title = html.escape(block.get("title", ""))
        btype = block.get("type", "text")
        if btype in ("talks", "boards"):
            items = block.get("items") or []
            lis = "".join(
                f'<li><span class="tl-date">{html.escape(str(it.get("date","")))}</span> '
                f'{html.escape(str(it.get("title","")))}</li>'
                for it in items
            )
            aux = block.get("aux")
            aux_html = f'<p class="sso-aux">{html.escape(aux)}</p>' if aux else ""
            blocks.append(
                f'<div class="sso-block"><h3 class="sso-title">{title}</h3>'
                f'<ul class="sso-list">{lis}</ul>{aux_html}</div>'
            )
        else:
            # type: text — body is trusted HTML (allows <strong>, <em>)
            body = block.get("body", "")
            blocks.append(
                f'<div class="sso-block"><h3 class="sso-title">{title}</h3>'
                f'<p class="sso-text">{body}</p></div>'
            )
    return "\n          ".join([""] + blocks) + "\n          "


def inject_between(text: str, start_marker: str, end_marker: str, new_content: str) -> str:
    """Replace the content between two HTML-comment markers."""
    pattern = re.compile(
        r"(<!--\s*" + re.escape(start_marker) + r"[^>]*-->)(.*?)(<!--\s*" + re.escape(end_marker) + r"\s*-->)",
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        raise ValueError(f"Sentinels {start_marker}/{end_marker} not found in source.")
    return text[: match.start(2)] + new_content + text[match.end(2):]


def main() -> int:
    if not INDEX_PATH.exists():
        print(f"Error: {INDEX_PATH} not found.")
        return 1
    projects = yaml.safe_load(PROJECTS_PATH.read_text(encoding="utf-8")) or []
    activity = yaml.safe_load(ACTIVITY_PATH.read_text(encoding="utf-8")) or []
    cache = enrich.load_cache(CACHE_PATH)

    src = INDEX_PATH.read_text(encoding="utf-8")
    src = inject_between(src, "RESEARCH-START", "RESEARCH-END", render_projects(projects, cache))
    src = inject_between(src, "OUTREACH-START", "OUTREACH-END", render_outreach(activity))
    INDEX_PATH.write_text(src, encoding="utf-8")
    print(f"Wrote {INDEX_PATH} ({len(projects)} projects, {len(activity)} outreach blocks).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run tests; verify pass**

Run: `python -m pytest tests/test_generate_index.py -v`
Expected: 6 passed.

- [ ] **Step 5: Run the generator against the real index.html**

Run: `python generate_index.py`
Expected output: `Wrote index.html (4 projects, 5 outreach blocks).`

Open `index.html` in a browser. Confirm:
- The 4 research cards render with their original (fallback) text.
- The outreach section still shows talks, advisory boards, peer review, supervision, media.
- The hero, About, Currently, Experience, Education, Expertise, Contact sections are byte-for-byte unchanged.

- [ ] **Step 6: Commit**

```
git add generate_index.py tests/test_generate_index.py
git commit -m "feat(index): generate research + outreach from YAML between sentinels"
```

---

## Task 15: Update GitHub Action workflow

**Files:**
- Modify: `.github/workflows/update-publications.yml`

- [ ] **Step 1: Read the current workflow**

Run: `type .github\workflows\update-publications.yml` (PowerShell) or open it in an editor. Note its current structure.

- [ ] **Step 2: Replace its content with**

```yaml
name: Update site content

on:
  schedule:
    - cron: '0 0 * * 0'   # weekly, Sunday 00:00 UTC
  workflow_dispatch:
    inputs:
      max_new:
        description: "Cap how many new papers to enrich this run (blank = unlimited)"
        required: false
        default: ""

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Check out
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run tests
        run: python -m pytest tests/ -q

      - name: Generate publications + cache
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: |
          if [ -n "${{ inputs.max_new }}" ]; then
            python generate_publications.py --max-new ${{ inputs.max_new }}
          else
            python generate_publications.py
          fi

      - name: Render index.html research + outreach
        run: python generate_index.py

      - name: Commit changes
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "Automated update: publications + cache + index"
          file_pattern: "publications.html publications.xml index.html data/abstract_cache.json"
```

- [ ] **Step 3: Add the secret in GitHub**

In the repository on GitHub:
1. Settings → Secrets and variables → Actions → New repository secret
2. Name: `GEMINI_API_KEY`
3. Value: the same key used in Apps Script (from Google AI Studio)

- [ ] **Step 4: Commit**

```
git add .github/workflows/update-publications.yml
git commit -m "ci: run enrichment + index generator weekly, commit cache"
```

- [ ] **Step 5: Manually trigger the workflow**

Push the branch, go to Actions tab in GitHub, find "Update site content", click Run workflow, optionally set max_new=5 for the first run. Watch logs. Expected: tests pass, enrichment runs, commit lands.

---

## Task 16: Update `EDITING.md`

**Files:**
- Modify: `EDITING.md`

- [ ] **Step 1: Append a new section to `EDITING.md`**

Add to the end of the file:

```markdown
---

## 11. Editing research projects (YAML-driven)

The four "Major Research Projects" cards on the home page are auto-generated from `data/research_projects.yaml`.

To change a card:

1. Open `data/research_projects.yaml`.
2. Edit the entry. To link a card to a published paper so its description auto-updates from the Gemini summary, set `openalex_id` to the full OpenAlex work URL (e.g. `https://openalex.org/W4392104410`) or `doi` to the DOI string.
3. Run: `python generate_index.py`
4. Open `index.html` in a browser to verify.
5. `git add data/research_projects.yaml index.html` and commit.

When `openalex_id` (or `doi`) resolves to a cached summary, that summary is used and `fallback_description` is ignored.

## 12. Editing talks, advisory boards, peer review, supervision, media

These live in `data/activity.yaml`. Blocks are typed:

- `type: talks` and `type: boards` → list with `date` and `title`, optional `aux` paragraph.
- `type: text` → free `body` field, supports `<strong>` and `<em>`.

After editing:

```
python generate_index.py
git add data/activity.yaml index.html
git commit -m "content: update activity"
```

## 13. Stale or wrong summary on a paper?

Delete the affected entry from `data/abstract_cache.json` and re-run:

```
python generate_publications.py --max-new 1
```

The next weekly Action will also pick it up. Edit the cache directly if you want to hand-write a summary for one paper — `enrich.py` only retries when `summary` is empty/null, so a manual edit sticks.

## 14. Staged backfill of summaries

First time, or after a model change, summaries can be processed a batch at a time:

```
python generate_publications.py --max-new 10
```

Re-run until you see `Enrichment: 0 new summaries`. Commit the cache file when you're happy with quality.

> **Deprecated:** Recipes that asked you to hand-edit the "Major Research Projects" or "Speaking, Service & Outreach" sections directly in `index.html` no longer apply. Edit the YAML files instead.
```

- [ ] **Step 2: Commit**

```
git add EDITING.md
git commit -m "docs: add YAML-driven editing recipes and deprecate HTML hand-edits"
```

---

## Final integration test

After all tasks, run the full pipeline locally to validate end-to-end.

- [ ] **Step 1: Set the API key**

PowerShell: `$env:GEMINI_API_KEY = "your-key-here"`
(Bash: `export GEMINI_API_KEY=your-key-here`)

- [ ] **Step 2: Stage backfill**

Run: `python generate_publications.py --max-new 5`
Expected: cache file gets 5 entries, each with `summary`, `pmid` (where DOI resolves), `mesh_terms` (where PubMed has them).

- [ ] **Step 3: Render home page**

Run: `python generate_index.py`
Expected: research cards still show fallback (unless you set `openalex_id`/`doi` for one).

- [ ] **Step 4: Idempotency check**

Run: `python generate_publications.py`
Expected: `Enrichment: 0 new summaries` for the 5 already-cached entries, but the remaining uncached papers get processed.

- [ ] **Step 5: Browser smoke**

Run: `python -m http.server 8000` and open `http://localhost:8000/publications.html`. Verify:
- Summaries render under titles
- Chip bar shows present topics
- Search includes summary text (search for a word only in a summary, not in title)
- `publications.xml` is reachable and valid RSS

- [ ] **Step 6: Commit cache and push**

```
git add data/abstract_cache.json publications.html publications.xml index.html
git commit -m "content: backfill enrichment cache (initial run)"
git push
```
