"""부조(호구지수) 코어 테스트 — 외부 의존·네트워크 없음."""

from __future__ import annotations

from boojo import Boojo
from boojo.index import cohort_key, distribution, judge, percentile
from boojo.norms import baseline


# --- norms ---------------------------------------------------------------

def test_baseline_scales_with_relation_and_intimacy() -> None:
    친구 = baseline("결혼", "친구", 3, "일반홀", "참석")
    동료 = baseline("결혼", "직장 동료", 3, "일반홀", "참석")
    assert 친구 > 동료                       # 가까울수록 많이
    assert baseline("결혼", "친구", 5, "일반홀", "참석") > 친구  # 친밀도↑ → ↑


def test_baseline_hotel_and_absence() -> None:
    참석 = baseline("결혼", "친구", 3, "일반홀", "참석")
    호텔 = baseline("결혼", "친구", 3, "호텔·고급", "참석")
    미참석 = baseline("결혼", "친구", 3, "일반홀", "미참석")
    assert 호텔 > 참석 and 미참석 < 참석


# --- index ---------------------------------------------------------------

def test_percentile_basic() -> None:
    dist = [10, 20, 30, 40]
    assert percentile(5, dist) == 0.0
    assert percentile(50, dist) == 100.0
    assert 0 < percentile(25, dist) < 100


def test_distribution_real_data_dominates_as_it_grows() -> None:
    # 실데이터가 많아지면 시드 반복이 줄어 실데이터 비중이 커진다.
    small = distribution(100_000, [100_000])
    big = distribution(100_000, [200_000] * 20)
    assert len(big) - 20 < len(small)        # 큰 표본일수록 시드 비중↓


def test_judge_bands_jjanmul_normal_hogu() -> None:
    # 데이터 0(통념 기준) — 결혼/친구/친밀3/일반홀/참석 모델액 = 10만.
    args = ("결혼", "친구", 3, "일반홀", "참석")
    assert judge(*args, 30_000, []).label == "짠물"
    assert judge(*args, 100_000, []).label == "적정"
    assert judge(*args, 500_000, []).label == "호구"


def test_judge_reports_sample_count() -> None:
    v = judge("결혼", "친구", 3, "일반홀", "참석", 100_000, [90_000, 110_000])
    assert v.sample == 2
    assert v.fair_low <= v.fair_high


def test_cohort_key_is_stable() -> None:
    a = cohort_key("결혼", "친구", 3, "일반홀", "참석")
    b = cohort_key("결혼", "친구", 3, "일반홀", "참석")
    assert a == b and "친구" in a


# --- app + store (persistence) -------------------------------------------

def test_record_accumulates_and_shifts_percentile(tmp_path) -> None:
    b = Boojo.create(str(tmp_path / "d.json"))
    args = ("결혼", "친구", 3, "일반홀", "참석")
    # 또래가 전부 30만씩 냈다고 데이터를 쌓으면, 10만의 호구지수가 낮아진다.
    before = b.judge(*args, 100_000).score
    for _ in range(20):
        b.record(*args, 300_000)
    after = b.judge(*args, 100_000).score
    assert after < before
    assert b.total() == 20


def test_store_persists_across_instances(tmp_path) -> None:
    p = str(tmp_path / "d.json")
    b1 = Boojo.create(p)
    b1.record("돌잔치", "친구", 3, "일반홀", "참석", 50_000)
    b2 = Boojo.create(p)                      # 새 인스턴스가 파일에서 로드
    assert b2.total() == 1
