"""Tests for enrich.py."""
from unittest.mock import MagicMock, patch

import pytest
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


class TestQuotaHandling:
    DAY_429 = (
        "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'q', "
        "'status': 'RESOURCE_EXHAUSTED', 'details': [{'@type': 'help', "
        "'links': []}, {'@type': 'type.googleapis.com/google.rpc.QuotaFailure', "
        "'violations': [{'quotaMetric': 'm', 'quotaId': "
        "'GenerateRequestsPerDayPerProjectPerModel-FreeTier', "
        "'quotaValue': '20'}]}, {'@type': "
        "'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '40s'}]}}"
    )
    MINUTE_429 = (
        "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'q', "
        "'status': 'RESOURCE_EXHAUSTED', 'details': [{'@type': "
        "'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{"
        "'quotaMetric': 'm', 'quotaId': "
        "'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', "
        "'quotaValue': '5'}]}, {'@type': "
        "'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '7s'}]}}"
    )

    def test_classify_day_quota(self):
        assert enrich._classify_429(self.DAY_429) == "day"

    def test_classify_minute_quota(self):
        assert enrich._classify_429(self.MINUTE_429) == "minute"

    def test_classify_unknown(self):
        assert enrich._classify_429("some other 429 error") is None

    def test_extract_retry_delay(self):
        assert enrich._retry_delay_seconds(self.DAY_429) == 40
        assert enrich._retry_delay_seconds(self.MINUTE_429) == 7
        assert enrich._retry_delay_seconds("no delay here") is None

    @patch("enrich.genai")
    def test_per_day_429_raises_DailyQuotaExhausted(self, mock_genai):
        mock_genai.Client.side_effect = RuntimeError(self.DAY_429)
        with pytest.raises(enrich.DailyQuotaExhausted):
            enrich.summarise_with_gemini("abstract", _retries_left=0)

    @patch("enrich.genai")
    def test_per_minute_429_retries_after_sleep(self, mock_genai, monkeypatch):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        # First call raises minute-quota 429; second call succeeds.
        mock_client_ok = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Retried summary."
        mock_client_ok.models.generate_content.return_value = mock_response
        mock_genai.Client.side_effect = [
            RuntimeError(self.MINUTE_429),
            mock_client_ok,
        ]
        assert enrich.summarise_with_gemini("abstract") == "Retried summary."

    @patch("enrich.genai")
    def test_per_minute_429_gives_up_after_retries(self, mock_genai, monkeypatch):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        mock_genai.Client.side_effect = RuntimeError(self.MINUTE_429)
        assert enrich.summarise_with_gemini("abstract", _retries_left=0) is None


class TestVerifySummary:
    @patch("enrich.genai")
    def test_returns_none_when_ok(self, mock_genai):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "OK"
        mock_client.models.generate_content.return_value = mock_response
        mock_genai.Client.return_value = mock_client

        assert enrich.verify_summary("abstract", "existing summary") is None

    @patch("enrich.genai")
    def test_returns_corrected_summary(self, mock_genai):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Corrected one-sentence summary."
        mock_client.models.generate_content.return_value = mock_response
        mock_genai.Client.return_value = mock_client

        assert enrich.verify_summary("abstract", "wrong summary") == "Corrected one-sentence summary."

    def test_returns_none_when_missing_inputs(self):
        assert enrich.verify_summary(None, "s") is None
        assert enrich.verify_summary("a", None) is None
        assert enrich.verify_summary("", "") is None

    @patch("enrich.genai")
    def test_raises_DailyQuotaExhausted(self, mock_genai):
        mock_genai.Client.side_effect = RuntimeError(TestQuotaHandling.DAY_429)
        with pytest.raises(enrich.DailyQuotaExhausted):
            enrich.verify_summary("abstract", "summary", _retries_left=0)


class TestCacheIO:
    def test_load_returns_empty_dict_when_missing(self, tmp_path):
        path = tmp_path / "missing.json"
        assert enrich.load_cache(path) == {}

    def test_save_then_load_roundtrip(self, tmp_path):
        path = tmp_path / "cache.json"
        data = {"https://openalex.org/W1": {"summary": "X", "pmid": "1"}}
        enrich.save_cache(path, data)
        assert enrich.load_cache(path) == data

    def test_save_sorts_keys_for_deterministic_diffs(self, tmp_path):
        path = tmp_path / "cache.json"
        enrich.save_cache(path, {"b": 1, "a": 2})
        text = path.read_text(encoding="utf-8")
        assert text.index('"a"') < text.index('"b"')


class TestEnrich:
    @patch("enrich.summarise_with_gemini", return_value="A lay summary.")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": ["UC"], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value="38449034")
    def test_enriches_one_new_work(self, m_pmid, m_pubmed, m_summary,
                                    openalex_work, tmp_path, monkeypatch):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        cache = {}
        result = enrich.enrich([openalex_work], cache)
        wid = openalex_work["id"]
        assert wid in result
        assert result[wid]["pmid"] == "38449034"
        assert result[wid]["mesh_terms"] == ["UC"]
        assert result[wid]["summary"] == "A lay summary."
        assert result[wid]["summary_model"] == "gemini-3.5-flash"
        assert "summary_generated_at" in result[wid]
        assert "last_verified_at" in result[wid]
        assert result[wid]["openalex_concepts"] == ["Gastroenterology", "Machine learning"]

    @patch("enrich.verify_summary", return_value=None)
    @patch("enrich.summarise_with_gemini")
    def test_recent_summary_skipped_by_default(self, m_summary, m_verify, openalex_work, monkeypatch):
        """Summary verified less than 30 days ago — neither summarise nor verify called."""
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        from datetime import datetime, timezone, timedelta
        recent_iso = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        wid = openalex_work["id"]
        cache = {wid: {"summary": "Already done.", "abstract": "a",
                       "last_verified_at": recent_iso}}
        enrich.enrich([openalex_work], cache)
        m_summary.assert_not_called()
        m_verify.assert_not_called()

    @patch("enrich.verify_summary", return_value="Corrected.")
    @patch("enrich.summarise_with_gemini")
    def test_stale_summary_gets_verified(self, m_summary, m_verify, openalex_work, monkeypatch):
        """Summary verified more than 30 days ago — verify called, correction applied."""
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        from datetime import datetime, timezone, timedelta
        old_iso = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        wid = openalex_work["id"]
        cache = {wid: {"summary": "Old summary.", "abstract": "a",
                       "last_verified_at": old_iso}}
        result = enrich.enrich([openalex_work], cache)
        m_verify.assert_called_once()
        assert result[wid]["summary"] == "Corrected."
        assert result[wid]["last_verified_at"] != old_iso

    @patch("enrich.summarise_with_gemini", return_value="Now done.")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": [], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value=None)
    def test_retries_when_cached_summary_is_none(
        self, m_pmid, m_pubmed, m_summary, openalex_work, monkeypatch
    ):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        wid = openalex_work["id"]
        cache = {wid: {"summary": None, "abstract": "old"}}
        result = enrich.enrich([openalex_work], cache)
        m_summary.assert_called_once()
        assert result[wid]["summary"] == "Now done."

    @patch("enrich.summarise_with_gemini", return_value="S")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": [], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value=None)
    def test_max_new_caps_enrichment(self, m_pmid, m_pubmed, m_summary,
                                      openalex_work, monkeypatch):
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        works = [
            {**openalex_work, "id": f"https://openalex.org/W{i}"} for i in range(5)
        ]
        result = enrich.enrich(works, {}, max_new=2)
        summarised = [k for k, v in result.items() if v.get("summary")]
        assert len(summarised) == 2

    @patch("enrich.summarise_with_gemini", return_value="S")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": [], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value=None)
    def test_priority_new_before_verify(self, m_pmid, m_pubmed, m_summary,
                                         openalex_work, monkeypatch):
        """A new (uncached) paper is processed before a stale verification candidate."""
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        from datetime import datetime, timezone, timedelta
        old_iso = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        old_paper = {**openalex_work, "id": "https://openalex.org/W_OLD"}
        new_paper = {**openalex_work, "id": "https://openalex.org/W_NEW"}
        cache = {old_paper["id"]: {"summary": "old", "abstract": "a",
                                    "last_verified_at": old_iso}}
        with patch("enrich.verify_summary", return_value=None) as m_verify:
            enrich.enrich([old_paper, new_paper], cache, max_new=1)
            # Only the new paper was processed
            m_summary.assert_called_once()
            m_verify.assert_not_called()
            assert new_paper["id"] in cache and cache[new_paper["id"]].get("summary") == "S"

    @patch("enrich.summarise_with_gemini")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": [], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value=None)
    def test_daily_quota_exit_clean_and_save(self, m_pmid, m_pubmed, m_summary,
                                              openalex_work, tmp_path, monkeypatch):
        """When DailyQuotaExhausted is raised, enrich exits cleanly and saves cache."""
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        m_summary.side_effect = [
            "First done.",
            enrich.DailyQuotaExhausted("daily cap"),
        ]
        works = [
            {**openalex_work, "id": f"https://openalex.org/W{i}"} for i in range(3)
        ]
        cache_path = tmp_path / "cache.json"
        result = enrich.enrich(works, {}, cache_path=cache_path, max_new=10)
        # First paper got summary; second triggered exit
        assert sum(1 for v in result.values() if v.get("summary")) == 1
        # Cache file exists with at least one entry persisted
        assert cache_path.exists()
        import json
        on_disk = json.loads(cache_path.read_text(encoding="utf-8"))
        assert any(v.get("summary") for v in on_disk.values())

    @patch("enrich.summarise_with_gemini", return_value="S")
    @patch("enrich.fetch_pubmed", return_value={"mesh_terms": [], "abstract": None})
    @patch("enrich.doi_to_pmid", return_value=None)
    def test_incremental_save_after_each_op(self, m_pmid, m_pubmed, m_summary,
                                              openalex_work, tmp_path, monkeypatch):
        """cache_path is written after every successful op."""
        monkeypatch.setattr(enrich.time, "sleep", lambda *_: None)
        cache_path = tmp_path / "cache.json"
        works = [{**openalex_work, "id": f"https://openalex.org/W{i}"} for i in range(2)]
        enrich.enrich(works, {}, cache_path=cache_path)
        import json
        on_disk = json.loads(cache_path.read_text(encoding="utf-8"))
        assert len(on_disk) == 2
