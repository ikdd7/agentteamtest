"""후보별 가중 총점 집계 — 결정론적, LLM/네트워크 없음.

총점 = Σ (지표점수 / 10 × 가중치).  가중치 합이 100이므로 0~100점.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .metrics import MAX_SCORE, METRIC_BY_KEY, METRIC_KEYS, METRICS


@dataclass
class CandidateScore:
    """한 후보의 세부점수 + 가중 총점."""

    key: str
    name: str
    type: str
    scores: dict[str, int]
    note: str = ""
    sources: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        missing = set(METRIC_KEYS) - set(self.scores)
        if missing:
            raise ValueError(f"{self.key}: 누락된 지표 {sorted(missing)}")
        for k, v in self.scores.items():
            if k not in METRIC_BY_KEY:
                raise ValueError(f"{self.key}: 알 수 없는 지표 '{k}'")
            if not 0 <= v <= MAX_SCORE:
                raise ValueError(f"{self.key}.{k}={v} 는 0~{MAX_SCORE} 범위를 벗어남")

    @property
    def total(self) -> float:
        """가중 총점(0~100), 소수 첫째 자리 반올림."""
        raw = sum(self.scores[m.key] * m.weight for m in METRICS) / MAX_SCORE
        return round(raw, 1)


def from_dict(d: dict) -> CandidateScore:
    """candidates.py 형식(scores=리스트) → CandidateScore."""
    scores = d["scores"]
    if isinstance(scores, list):
        if len(scores) != len(METRIC_KEYS):
            raise ValueError(
                f"{d.get('key')}: 점수 개수 {len(scores)} != 지표 {len(METRIC_KEYS)}"
            )
        scores = dict(zip(METRIC_KEYS, scores))
    return CandidateScore(
        key=d["key"],
        name=d["name"],
        type=d.get("type", ""),
        scores=scores,
        note=d.get("note", ""),
        sources=list(d.get("sources", [])),
    )


def rank(candidates: list[dict]) -> list[CandidateScore]:
    """총점 내림차순으로 정렬된 CandidateScore 리스트."""
    scored = [from_dict(c) for c in candidates]
    scored.sort(key=lambda c: c.total, reverse=True)
    return scored
