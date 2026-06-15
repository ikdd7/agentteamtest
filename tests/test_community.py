"""community 점수 엔진 테스트 — 결정론적이므로 네트워크 없이 검증."""

from __future__ import annotations

import pytest

from community.candidates import CANDIDATES
from community.metrics import METRIC_KEYS, total_weight
from community.report import to_csv, to_markdown
from community.scoring import from_dict, rank


def test_weights_sum_to_100():
    assert total_weight() == 100


def test_all_candidates_score_in_range():
    for c in CANDIDATES:
        cs = from_dict(c)
        assert 0 <= cs.total <= 100
        assert len(cs.scores) == len(METRIC_KEYS)


@pytest.mark.parametrize(
    "key,expected",
    [
        ("divorced_parent", 79.1),
        ("pregnancy_loss", 75.1),
        ("menopause", 73.6),
        ("caregiver", 72.6),
        ("petloss", 71.2),
        ("elective_medical", 66.3),
        ("running", 65.5),
        ("coffee", 62.8),
        ("houseplant", 56.1),
    ],
)
def test_known_totals(key, expected):
    cs = next(from_dict(c) for c in CANDIDATES if c["key"] == key)
    assert cs.total == expected


def test_ranking_is_sorted_desc():
    ranked = rank(CANDIDATES)
    totals = [c.total for c in ranked]
    assert totals == sorted(totals, reverse=True)
    assert ranked[0].key == "divorced_parent"


def test_invalid_score_rejected():
    bad = {"key": "x", "name": "x", "scores": [11] + [0] * (len(METRIC_KEYS) - 1)}
    with pytest.raises(ValueError):
        from_dict(bad)


def test_missing_metric_rejected():
    bad = {"key": "x", "name": "x", "scores": [0] * (len(METRIC_KEYS) - 1)}
    with pytest.raises(ValueError):
        from_dict(bad)


def test_markdown_and_csv_render():
    ranked = rank(CANDIDATES)
    md = to_markdown(ranked, stamp="2026-06-15 00:00:00 UTC")
    assert "리더보드" in md and "양육 돌싱" in md
    csv_text = to_csv(ranked)
    assert "rank,key,name" in csv_text.splitlines()[0]
