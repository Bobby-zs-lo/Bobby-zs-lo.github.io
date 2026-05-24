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
