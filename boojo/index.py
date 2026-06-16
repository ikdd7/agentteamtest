"""호구지수 — 또래 분포에서 내 금액의 퍼센타일 → 짠물/적정/호구 판정.

또래 분포 = 시드(모델 적정액×스프레드) + 실데이터. 실데이터가 많아질수록 시드 비중이
줄어 '평균이 실제 사람들 값으로 수렴'한다.
"""

from __future__ import annotations

from dataclasses import dataclass

from .norms import baseline

# 시드 분포: 모델 적정액 대비 배율(데이터 0에서도 분포 모양을 만든다).
_SPREAD = (0.6, 0.75, 0.85, 1.0, 1.0, 1.15, 1.3, 1.6)


def _round_man(x: float) -> int:
    return int(round(x / 10_000) * 10_000)


def cohort_key(event: str, relation: str, intimacy: int, meal: str, attended: str) -> str:
    return f"{event}|{relation}|{intimacy}|{meal}|{attended}"


def distribution(model_amount: int, real: list[int]) -> list[int]:
    """시드 + 실데이터를 합친 또래 분포(오름차순).

    실데이터가 적을 땐 시드를 여러 번 반복해 안정화하고, 많아지면 1회로 줄여
    실데이터가 분포를 지배하게 한다(평균이 실제 값으로 수렴).
    """
    n = len(real)
    reps = 3 if n < 5 else (2 if n < 15 else 1)
    seed = [_round_man(model_amount * q) for q in _SPREAD] * reps
    return sorted(seed + list(real))


def percentile(amount: int, dist: list[int]) -> float:
    """분포 내 amount 의 백분위(0~100). 동률은 절반 가중."""
    if not dist:
        return 50.0
    below = sum(1 for d in dist if d < amount)
    equal = sum(1 for d in dist if d == amount)
    return (below + 0.5 * equal) / len(dist) * 100


@dataclass
class Verdict:
    score: int          # 호구지수 0~100 (높을수록 많이 냄 = 호구)
    label: str          # 짠물 / 적정 / 통 큰 / 호구
    emoji: str
    fair_low: int       # 적정 구간 하한(원)
    fair_high: int      # 적정 구간 상한(원)
    model: int          # 모델 적정액(원)
    drip: str           # 공유용 한 줄 드립
    sample: int         # 또래 실데이터 표본 수


def judge(
    event: str, relation: str, intimacy: int, meal: str, attended: str,
    amount: int, real: list[int],
) -> Verdict:
    model = baseline(event, relation, intimacy, meal, attended)
    dist = distribution(model, real)
    p = percentile(amount, dist)
    fair_low = dist[int(0.25 * (len(dist) - 1))]
    fair_high = dist[int(0.75 * (len(dist) - 1))]
    if p < 25:
        label, emoji = "짠물", "🥶"
        drip = f"또래 하위 {round(p)}% — {relation}한테 이 금액이면 다음에 눈초리 각오..."
    elif p > 90:
        label, emoji = "호구", "🚨"
        drip = f"호구지수 {round(p)}! {relation}한테 이렇게까지? 다음 밥은 걔가 사야 수지 맞음."
    elif p > 75:
        label, emoji = "통 큰", "💸"
        drip = f"또래 상위 {round(100 - p)}% — 인심 좋단 소린 듣겠다."
    else:
        label, emoji = "적정", "✅"
        drip = "욕도 칭찬도 안 듣는 완벽한 무난함. 한국인의 정석."
    return Verdict(round(p), label, emoji, fair_low, fair_high, model, drip, len(real))
