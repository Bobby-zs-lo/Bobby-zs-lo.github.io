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
