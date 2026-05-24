"""Tests for enrich.py."""
from unittest.mock import MagicMock, patch

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


class TestSummariseWithGemini:
    @patch("enrich.genai")
    def test_returns_stripped_summary(self, mock_genai):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "  Tested an AI tool on UC endoscopy; matched experts in 92% of cases.  "
        mock_client.models.generate_content.return_value = mock_response
        mock_genai.Client.return_value = mock_client

        result = enrich.summarise_with_gemini("BACKGROUND: ...")
        assert result == "Tested an AI tool on UC endoscopy; matched experts in 92% of cases."
        mock_genai.Client.assert_called_once_with(api_key="test-key-not-real")
        call_kwargs = mock_client.models.generate_content.call_args.kwargs
        assert call_kwargs["model"] == "gemini-3.5-flash"
        assert "BACKGROUND: ..." in call_kwargs["contents"]

    @patch("enrich.genai")
    def test_returns_none_on_api_error(self, mock_genai):
        mock_genai.Client.side_effect = RuntimeError("API down")
        assert enrich.summarise_with_gemini("anything") is None

    def test_returns_none_for_empty_abstract(self):
        assert enrich.summarise_with_gemini(None) is None
        assert enrich.summarise_with_gemini("") is None
