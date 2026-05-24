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
