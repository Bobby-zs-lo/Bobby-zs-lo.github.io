"""Tests for the publications renderer's data-attribute output."""
import xml.etree.ElementTree as ET

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
        assert "real-time ai for uc" in html.lower()

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
        assert 'data-topic="Microbiome"' not in html
        assert 'data-topic="all"' in html

    def test_renders_empty_chip_bar_when_no_topics(self):
        html = gp.render_chip_bar({})
        assert 'data-topic="all"' in html


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
