"""Tests for generate_index.py."""
from datetime import date

import pytest

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
    "https://openalex.org/W1": {
        "summary": "Live CNN overlay on UC colonoscopy.",
        "mesh_terms": [], "openalex_concepts": []
    }
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
        assert "Fallback text." not in html
        assert "Bio fallback." in html

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
        assert "<strong>Quoted</strong>" in html


class TestInjectBetweenSentinels:
    def test_replaces_between_markers(self):
        original = "before<!-- X-START -->old content<!-- X-END -->after"
        result = gi.inject_between(original, "X-START", "X-END", "NEW")
        assert result == "before<!-- X-START -->NEW<!-- X-END -->after"

    def test_replaces_between_markers_with_message(self):
        original = "a<!-- X-START - hello -->old<!-- X-END -->b"
        result = gi.inject_between(original, "X-START", "X-END", "NEW")
        assert "NEW" in result
        assert "old" not in result
        assert "X-START - hello" in result

    def test_raises_when_markers_missing(self):
        with pytest.raises(ValueError, match="X-START"):
            gi.inject_between("no markers here", "X-START", "X-END", "NEW")


class TestPublishScheduled:
    SCHEDULED = '<li hidden data-publish-from="2026-11-01">TR</li>'

    def test_reveals_element_on_its_date(self):
        result = gi.publish_scheduled(self.SCHEDULED, date(2026, 11, 1))
        assert result == "<li>TR</li>"

    def test_reveals_element_after_its_date(self):
        result = gi.publish_scheduled(self.SCHEDULED, date(2026, 11, 5))
        assert result == "<li>TR</li>"

    def test_keeps_element_hidden_before_its_date(self):
        result = gi.publish_scheduled(self.SCHEDULED, date(2026, 10, 31))
        assert result == self.SCHEDULED

    def test_handles_any_attribute_order(self):
        src = '<li data-publish-from="2026-11-01" class="row" hidden>TR</li>'
        result = gi.publish_scheduled(src, date(2026, 11, 1))
        assert result == '<li class="row">TR</li>'

    def test_leaves_hidden_inside_attribute_values_alone(self):
        src = '<li class="a hidden b" hidden data-publish-from="2026-11-01">TR</li>'
        result = gi.publish_scheduled(src, date(2026, 11, 1))
        assert result == '<li class="a hidden b">TR</li>'

    def test_ignores_hidden_elements_without_a_date(self):
        src = '<div hidden>x</div>'
        assert gi.publish_scheduled(src, date(2026, 11, 1)) == src
