"""Tests for enrich.py."""
import responses

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
