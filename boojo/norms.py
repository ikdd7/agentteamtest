"""부조 적정 금액 베이스라인(공개 통념 기준).

데이터 0에서도 판정이 작동하게 하는 '시드'. 실데이터가 쌓이면 index.py 가 이 위에
실제 분포를 얹어 보정한다. 모든 금액 단위: 원(KRW).
"""

from __future__ import annotations

# 경조사 종류 → 금액 배율(결혼 기준 1.0)
EVENTS: dict[str, float] = {
    "결혼": 1.0,
    "장례": 1.0,        # 부의금
    "돌잔치": 0.6,
    "환갑·칠순": 0.8,
    "개업·집들이": 0.6,
}

# 관계 → (결혼·참석·일반홀·친밀도3 기준) 기본액(원)
RELATIONS: dict[str, int] = {
    "직장 동료": 50_000,
    "직장 상사·부하": 50_000,
    "지인·동창": 50_000,
    "친구": 100_000,
    "친한 친구": 200_000,
    "사촌·친척": 100_000,
    "가까운 친척": 300_000,
    "가족": 500_000,
}

MEALS = ("일반홀", "호텔·고급")
ATTEND = ("참석", "미참석", "식권만")

_ATTEND_FACTOR = {"참석": 1.0, "미참석": 0.6, "식권만": 0.8}


def baseline(event: str, relation: str, intimacy: int, meal: str, attended: str) -> int:
    """입력 조건의 '모델 적정액'(원). 친밀도 1~5, 만원 단위 반올림."""
    base = RELATIONS.get(relation, 50_000)
    ev = EVENTS.get(event, 1.0)
    intim = 0.6 + 0.2 * (max(1, min(5, intimacy)) - 1)  # 1→0.6 … 5→1.4
    att = _ATTEND_FACTOR.get(attended, 1.0)
    amount = base * ev * intim * att
    if attended != "미참석" and meal == "호텔·고급":
        amount += 50_000
    return int(round(amount / 10_000) * 10_000)
