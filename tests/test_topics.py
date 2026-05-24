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
