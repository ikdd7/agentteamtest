"""커뮤니티 형성 가능성 세부지표 정의.

각 지표는 0~10점으로 채점하고, `점수/10 × 가중치`로 환산해 합산한다.
가중치 총합은 100이어야 한다(= 100점 만점). '빈 시장' 발굴 의도에 맞춰
절실함과 경쟁 공백에 최고 가중(15)을 둔다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    weight: int
    desc: str


# 순서 = 리포트/CSV 컬럼 순서.
METRICS: list[Metric] = [
    Metric("pain", "절실함·지속성", 15, "고민이 얼마나 절박하고 오래 가나"),
    Metric("population", "모집단 규모", 12, "잠재 사용자 수"),
    Metric("search", "검색·관심량 신호", 10, "검색량·글 빈도·언론 노출"),
    Metric("identity", "정체성·소속 잠재력", 12, "'우리'라는 결속·은어·위계"),
    Metric("asymmetry", "정보 비대칭", 12, "전문가가 못 주는 또래 경험 가치"),
    Metric("stigma", "낙인→익명 욕구", 8, "실명·지인망에서 말 못 하는 정도"),
    Metric("whitespace", "경쟁 공백", 15, "강한 독립 커뮤니티의 부재 정도"),
    Metric("engine", "자가발전 엔진", 8, "거래·리뷰DB·인증·추모의례 등 콘텐츠 동력"),
    Metric("monetization", "수익화 잠재", 5, "광고·제휴·커머스·멤버십"),
    Metric("ops", "운영 용이성", 3, "모더레이션·법적 리스크가 낮을수록 고점"),
]

METRIC_KEYS: list[str] = [m.key for m in METRICS]
METRIC_BY_KEY: dict[str, Metric] = {m.key: m for m in METRICS}

MAX_SCORE = 10


def total_weight() -> int:
    return sum(m.weight for m in METRICS)


# 설계 불변식: 가중치 합 = 100.
assert total_weight() == 100, f"가중치 합이 100이 아님: {total_weight()}"
