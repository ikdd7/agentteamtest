"""리더보드 출력 — 마크다운 / CSV / history 누적.

history 는 스케줄 실행마다 (실행시각, 후보별 총점) 한 행을 덧붙여, 점수
데이터를 갱신했을 때 랭킹이 시간에 따라 어떻게 변하는지 추적할 수 있게 한다.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from .metrics import METRICS
from .scoring import CandidateScore

MEDALS = {1: "🥇", 2: "🥈", 3: "🥉"}


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def to_markdown(ranked: list[CandidateScore], *, stamp: str | None = None) -> str:
    stamp = stamp or utc_stamp()
    lines = [
        "# 독립 커뮤니티 빈 시장 — 자동 점수 리더보드",
        "",
        f"> 갱신: {stamp} · LLM 미사용(결정론적) · 가중치 합 100점 만점",
        "",
        "## 랭킹",
        "",
        "| 순위 | 후보 | 유형 | 총점 |",
        "|---|---|---|:--:|",
    ]
    for i, c in enumerate(ranked, 1):
        medal = MEDALS.get(i, str(i))
        lines.append(f"| {medal} | {c.name} | {c.type} | **{c.total}** |")

    lines += ["", "## 세부 점수 (0~10)", "",
              "| 후보 | " + " | ".join(f"{m.label}({m.weight})" for m in METRICS)
              + " | 총점 |",
              "|---" * (len(METRICS) + 2) + "|"]
    for c in ranked:
        row = " | ".join(str(c.scores[m.key]) for m in METRICS)
        lines.append(f"| {c.name} | {row} | **{c.total}** |")

    lines += ["", "## 판단 근거", ""]
    for c in ranked:
        src = " · ".join(c.sources)
        lines.append(f"- **{c.name}** ({c.total}점): {c.note}")
        if src:
            lines.append(f"  - 근거: {src}")
    lines.append("")
    return "\n".join(lines)


def to_csv(ranked: list[CandidateScore]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["rank", "key", "name", "type",
                *[m.key for m in METRICS], "total"])
    for i, c in enumerate(ranked, 1):
        w.writerow([i, c.key, c.name, c.type,
                    *[c.scores[m.key] for m in METRICS], c.total])
    return buf.getvalue()


def append_history(path: str, ranked: list[CandidateScore],
                   *, stamp: str | None = None) -> None:
    """실행 스냅샷 한 행을 history CSV에 덧붙인다(없으면 헤더 생성)."""
    import os

    stamp = stamp or utc_stamp()
    keys = [c.key for c in sorted(ranked, key=lambda c: c.key)]
    exists = os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if not exists:
            w.writerow(["timestamp", *keys])
        by_key = {c.key: c.total for c in ranked}
        w.writerow([stamp, *[by_key[k] for k in keys]])
