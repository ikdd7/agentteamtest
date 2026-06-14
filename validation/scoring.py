"""사이트별 점수 집계 — 여러 에이전트 주행을 묶어 중립 지표로 만든다.

멀티에이전트 중립성이 해자의 핵심이므로, 한 사이트를 여러 에이전트 프로파일로
주행한 결과를 집계한다. '차단(blocked)'은 통과율에서 분리해 별도 비율로 본다.
"""

from __future__ import annotations

import statistics
from collections import Counter
from dataclasses import dataclass

from .funnel import FUNNEL, SiteRun


@dataclass
class SiteScore:
    """한 사이트의 멀티에이전트 집계 점수."""

    site: str
    runs: list[SiteRun]

    @property
    def measured_runs(self) -> list[SiteRun]:
        """차단되지 않은(=실제 측정된) 주행만."""
        return [r for r in self.runs if r.outcome != "blocked"]

    @property
    def blocked_rate(self) -> int:
        """차단된 주행 비율(%) — 측정 불가의 척도."""
        if not self.runs:
            return 0
        blocked = sum(1 for r in self.runs if r.outcome == "blocked")
        return round(blocked / len(self.runs) * 100)

    @property
    def reachability(self) -> int:
        """도달률 중앙값(%) — 차단 주행 제외. 전부 차단이면 0."""
        vals = [r.reachability for r in self.measured_runs]
        return round(statistics.median(vals)) if vals else 0

    @property
    def completion_rate(self) -> int:
        """결제 폼까지 도달한 주행 비율(%) — 측정된 주행 기준."""
        m = self.measured_runs
        if not m:
            return 0
        reached = sum(1 for r in m if r.outcome == "reached_payment")
        return round(reached / len(m) * 100)

    @property
    def common_break(self) -> tuple[str, str] | None:
        """가장 흔한 (깨진 단계, 사유). 완주만 있으면 None."""
        breaks = [
            (r.terminal.step, r.terminal.reason)
            for r in self.measured_runs
            if r.terminal is not None
        ]
        if not breaks:
            return None
        return Counter(breaks).most_common(1)[0][0]


def score_sites(runs: list[SiteRun]) -> list[SiteScore]:
    """주행 목록을 사이트별 SiteScore 로 집계(도달률 내림차순)."""
    by_site: dict[str, list[SiteRun]] = {}
    for r in runs:
        by_site.setdefault(r.site, []).append(r)
    scores = [SiteScore(site=s, runs=rs) for s, rs in by_site.items()]
    scores.sort(key=lambda s: s.reachability, reverse=True)
    return scores


def step_label(key: str) -> str:
    for k, label in FUNNEL:
        if k == key:
            return label
    return key
