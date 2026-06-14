"""검증 리포트 — 리더보드(마크다운/CSV) + 핵심 전제 합격 판정.

14일 검증의 합격 기준: 측정된 사이트의 다수가 도달률 < 70% 이면
"에이전트 결제가 자주 깨진다"는 핵심 전제가 성립.
"""

from __future__ import annotations

import csv
import io

from .funnel import REASONS
from .scoring import SiteScore, step_label

# 전제 합격 기준.
PREMISE_THRESHOLD = 70  # 도달률(%)
PREMISE_RATIO = 0.5  # 이 비율 이상이 임계 미만이면 전제 성립


def premise_verdict(scores: list[SiteScore]) -> tuple[bool, str]:
    """핵심 전제(에이전트 결제가 자주 깨짐) 성립 여부."""
    measured = [s for s in scores if s.measured_runs]
    if not measured:
        return False, "측정된 사이트 없음(전부 차단) — 측정 방법 보강 필요."
    low = [s for s in measured if s.reachability < PREMISE_THRESHOLD]
    ratio = len(low) / len(measured)
    ok = ratio >= PREMISE_RATIO
    msg = (
        f"측정 {len(measured)}곳 중 도달률 {PREMISE_THRESHOLD}% 미만 {len(low)}곳"
        f" ({ratio:.0%}). 전제 {'성립 ✅' if ok else '미성립 ❌'}"
        f" (기준: {PREMISE_RATIO:.0%} 이상)."
    )
    return ok, msg


def to_markdown(scores: list[SiteScore], *, demo: bool) -> str:
    out: list[str] = []
    title = "# Agent Checkout Index — 검증 리더보드"
    if demo:
        title += "  *(DEMO: mock 데이터 — 실측 아님)*"
    out.append(title)
    out.append("")

    ok, msg = premise_verdict(scores)
    out.append(f"**핵심 전제 판정:** {msg}")
    out.append("")
    out.append("| # | 사이트 | 도달률 | 완주율 | 차단율 | 가장 흔한 실패 지점 |")
    out.append("|---|--------|:-----:|:-----:|:-----:|------|")
    for i, s in enumerate(scores, 1):
        brk = s.common_break
        if not s.measured_runs:
            brk_txt = "차단(측정 불가)"
        elif brk:
            brk_txt = f"{step_label(brk[0])} — {REASONS.get(brk[1], brk[1])}"
        else:
            brk_txt = "완주"
        out.append(
            f"| {i} | {s.site} | {s.reachability}% | {s.completion_rate}% "
            f"| {s.blocked_rate}% | {brk_txt} |"
        )
    out.append("")
    out.append(
        "> 도달률=결제 폼까지 퍼널 통과율(차단 주행 제외 중앙값) · "
        "완주율=결제 폼 도달 주행 비율 · 차단율=봇 차단으로 측정 불가 비율."
    )
    out.append("> **결제는 실행하지 않음(결제 폼 도달까지만 측정).**")
    return "\n".join(out)


def to_csv(scores: list[SiteScore]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["site", "reachability", "completion_rate", "blocked_rate", "break_step", "break_reason"])
    for s in scores:
        brk = s.common_break or ("", "")
        w.writerow([s.site, s.reachability, s.completion_rate, s.blocked_rate, brk[0], brk[1]])
    return buf.getvalue()
