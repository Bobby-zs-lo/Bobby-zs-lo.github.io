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
