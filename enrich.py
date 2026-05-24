"""Enrichment pipeline: OpenAlex abstracts, PubMed metadata, Gemini summaries."""
from __future__ import annotations

import os
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

import requests
from google import genai

ID_CONVERTER_URL = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
CONTACT_EMAIL = "bobby.lo@regionh.dk"
USER_AGENT = f"bobby-zs-lo.github.io enrichment ({CONTACT_EMAIL})"


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
        print(f"Warning: DOI->PMID lookup failed for {clean}: {e}")
    return None


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


GEMINI_MODEL = "gemini-3.5-flash"
SUMMARY_PROMPT = (
    "Summarise this medical research abstract in one plain-English sentence of at most "
    "30 words, aimed at an educated non-specialist. State what was tested and the main "
    "finding. Do not invent details or add caveats not present in the abstract. Output "
    "only the sentence, no preamble.\n\nAbstract:\n{abstract}"
)


def summarise_with_gemini(abstract: Optional[str]) -> Optional[str]:
    """Call Gemini to produce a <=30-word lay summary. Returns None on failure."""
    if not abstract:
        return None
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Warning: GEMINI_API_KEY not set; skipping summary.")
        return None
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=SUMMARY_PROMPT.format(abstract=abstract),
        )
        return (response.text or "").strip() or None
    except Exception as e:
        print(f"Warning: Gemini summarisation failed: {e}")
        return None
