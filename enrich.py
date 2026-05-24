"""Enrichment pipeline: OpenAlex abstracts, PubMed metadata, Gemini summaries."""
from __future__ import annotations

import json
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from google import genai


class DailyQuotaExhausted(Exception):
    """Raised when the per-day Gemini free-tier quota is hit.

    Callers should save state and exit cleanly; quota resets at ~midnight PT.
    """


def _classify_429(message: str) -> Optional[str]:
    """Return 'day' or 'minute' for known Gemini quota errors, else None."""
    if "GenerateRequestsPerDayPerProjectPerModel" in message:
        return "day"
    if "GenerateRequestsPerMinutePerProjectPerModel" in message:
        return "minute"
    return None


def _retry_delay_seconds(message: str) -> Optional[int]:
    """Extract the integer retryDelay (seconds) from a Gemini error message."""
    m = re.search(r"['\"]retryDelay['\"]\s*:\s*['\"](\d+)s['\"]", message)
    return int(m.group(1)) if m else None

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
VERIFY_PROMPT = (
    "Below is an abstract and an existing one-sentence summary. Check whether the "
    "summary accurately reflects the abstract's findings and contains no invented "
    "details. If it is accurate, respond with exactly: OK. If it is inaccurate or "
    "misleading, respond with a corrected one-sentence summary of at most 30 words, "
    "plain English, lay reader. No other text.\n\n"
    "Abstract:\n{abstract}\n\nExisting summary:\n{summary}"
)


def summarise_with_gemini(abstract: Optional[str], _retries_left: int = 2) -> Optional[str]:
    """Call Gemini to produce a <=30-word lay summary.

    Returns None on non-quota failure. On per-day quota exhaustion raises
    DailyQuotaExhausted so the caller can stop and exit cleanly. On per-minute
    quota hits, sleeps the API's retryDelay and retries up to _retries_left times.
    """
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
        msg = str(e)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            kind = _classify_429(msg)
            if kind == "day":
                raise DailyQuotaExhausted(msg) from e
            if kind == "minute" and _retries_left > 0:
                delay = (_retry_delay_seconds(msg) or 30) + 2
                print(f"Per-minute quota hit; sleeping {delay}s then retrying.")
                time.sleep(delay)
                return summarise_with_gemini(abstract, _retries_left - 1)
        print(f"Warning: Gemini summarisation failed: {e}")
        return None


def verify_summary(abstract: Optional[str], summary: Optional[str],
                   _retries_left: int = 2) -> Optional[str]:
    """Ask Gemini to fact-check an existing summary against the abstract.

    Returns:
        None    — the summary is accurate (or call failed non-quota); no change
        str     — a corrected summary that should replace the existing one
    Raises:
        DailyQuotaExhausted — caller should stop and exit cleanly
    """
    if not abstract or not summary:
        return None
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=VERIFY_PROMPT.format(abstract=abstract, summary=summary),
        )
        text = (response.text or "").strip()
        if not text or text.upper().startswith("OK"):
            return None
        return text
    except Exception as e:
        msg = str(e)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            kind = _classify_429(msg)
            if kind == "day":
                raise DailyQuotaExhausted(msg) from e
            if kind == "minute" and _retries_left > 0:
                delay = (_retry_delay_seconds(msg) or 30) + 2
                print(f"Per-minute quota hit (verify); sleeping {delay}s then retrying.")
                time.sleep(delay)
                return verify_summary(abstract, summary, _retries_left - 1)
        print(f"Warning: Gemini verification failed: {e}")
        return None


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


def _verify_age_days(entry: Dict[str, Any], now: Optional[datetime] = None) -> float:
    """Days since this entry's summary was last verified (or generated, as a fallback).

    Returns infinity if no timestamp is present, so untracked entries sort to the
    front of the verification queue.
    """
    now = now or datetime.now(timezone.utc)
    ts = entry.get("last_verified_at") or entry.get("summary_generated_at")
    if not ts:
        return float("inf")
    try:
        return (now - datetime.fromisoformat(ts)).total_seconds() / 86400.0
    except ValueError:
        return float("inf")


def _enrich_one(
    wid: str,
    work: Dict[str, Any],
    entry: Optional[Dict[str, Any]],
    cache: Dict[str, Dict[str, Any]],
    pubmed_delay: float,
) -> bool:
    """New-or-retry path: fetch metadata + abstract + Gemini summary.

    Mutates cache[wid]. Returns True if a Gemini call was made (caller saves).
    """
    doi = _strip_doi(work.get("doi"))
    existing = entry or {}
    abstract = existing.get("abstract") or reconstruct_abstract(work.get("abstract_inverted_index"))
    abstract_source = existing.get("abstract_source") or ("openalex" if abstract else None)

    pmid = existing.get("pmid") or doi_to_pmid(doi)
    time.sleep(pubmed_delay)
    if pmid and not existing.get("mesh_terms"):
        pm = fetch_pubmed(pmid)
        mesh_terms = pm["mesh_terms"]
        if not abstract and pm["abstract"]:
            abstract = pm["abstract"]
            abstract_source = "pubmed"
    else:
        mesh_terms = existing.get("mesh_terms") or []

    called_gemini = bool(abstract)
    summary = summarise_with_gemini(abstract) if abstract else None
    now_iso = datetime.now(timezone.utc).isoformat()
    cache[wid] = {
        "doi": doi,
        "pmid": pmid,
        "abstract": abstract,
        "abstract_source": abstract_source,
        "mesh_terms": mesh_terms,
        "openalex_concepts": [c["display_name"] for c in (work.get("concepts") or [])],
        "summary": summary,
        "summary_model": GEMINI_MODEL if summary else existing.get("summary_model"),
        "summary_generated_at": now_iso if summary else existing.get("summary_generated_at"),
        "last_verified_at": now_iso if summary else existing.get("last_verified_at"),
    }
    label = "ok" if summary else ("no-abstract" if not abstract else "no-summary")
    print(f"Enriched {wid}: {label}, pmid={pmid or '-'}")
    return called_gemini


def _verify_one(wid: str, entry: Dict[str, Any]) -> bool:
    """Verification path: ask Gemini whether the cached summary still matches the abstract.

    Mutates cache entry in place. Returns True (always — verification is a Gemini call).
    """
    abstract = entry.get("abstract")
    summary = entry.get("summary")
    corrected = verify_summary(abstract, summary)
    now_iso = datetime.now(timezone.utc).isoformat()
    if corrected:
        entry["summary"] = corrected
        entry["summary_model"] = GEMINI_MODEL
        entry["summary_generated_at"] = now_iso
        print(f"Verified {wid}: CORRECTED")
    else:
        print(f"Verified {wid}: OK")
    entry["last_verified_at"] = now_iso
    return True


def enrich(
    works: List[Dict[str, Any]],
    cache: Dict[str, Dict[str, Any]],
    cache_path: Optional[Path] = None,
    max_new: Optional[int] = None,
    pubmed_delay: float = 0.4,
    gemini_delay: float = 1.0,
    min_verify_interval_days: float = 30.0,
    skip_verify: bool = False,
) -> Dict[str, Dict[str, Any]]:
    """Iterative enrichment + verification.

    Priority within a single run:
      1. Papers with no cache entry — full enrichment.
      2. Cached papers with no summary but with an abstract — retry summary.
      3. Cached papers whose summary is older than min_verify_interval_days
         (by last_verified_at) — fact-check, oldest first.

    Saves the cache to `cache_path` after each successful Gemini operation so a
    crash or quota-stop never loses more than the in-flight item. Exits cleanly
    on DailyQuotaExhausted; resumes from where it left off on the next run.

    `max_new` caps the total number of Gemini-using operations this run (new +
    retry + verify all count as one each).
    """
    works_by_id = {w["id"]: w for w in works if w.get("id")}
    now = datetime.now(timezone.utc)

    new_ids = [wid for wid in works_by_id if wid not in cache]
    retry_ids = [
        wid for wid in works_by_id
        if wid in cache and not cache[wid].get("summary") and cache[wid].get("abstract")
    ]
    verify_ids: List[str] = []
    if not skip_verify:
        verify_ids = sorted(
            (wid for wid in works_by_id
             if wid in cache
             and cache[wid].get("summary")
             and _verify_age_days(cache[wid], now) >= min_verify_interval_days),
            key=lambda w: cache[w].get("last_verified_at") or cache[w].get("summary_generated_at") or "",
        )

    queue = list(new_ids) + list(retry_ids) + list(verify_ids)
    print(f"enrich: queue = {len(new_ids)} new + {len(retry_ids)} retry + {len(verify_ids)} verify")
    ops_done = 0

    try:
        for wid in queue:
            if max_new is not None and ops_done >= max_new:
                print(f"enrich: --max-new {max_new} reached, stopping.")
                break
            work = works_by_id[wid]
            entry = cache.get(wid)

            if entry and entry.get("summary"):
                called_gemini = _verify_one(wid, entry)
            else:
                called_gemini = _enrich_one(wid, work, entry, cache, pubmed_delay)

            if called_gemini:
                ops_done += 1
                time.sleep(gemini_delay)
                if cache_path:
                    save_cache(cache_path, cache)
    except DailyQuotaExhausted:
        print("enrich: daily quota exhausted; cache saved, exiting cleanly.")
        if cache_path:
            save_cache(cache_path, cache)

    return cache
