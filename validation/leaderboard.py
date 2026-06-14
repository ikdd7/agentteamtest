"""공개 "Agent-Readiness 리더보드" — 공유 가능한 단독 HTML 산출물.

Phase 1 의 PR·인바운드 엔진. 검증 점수(SiteScore)를 데이터저널리즘 룩의
자체완결 HTML 한 페이지로 만든다(외부 JS/CSS 의존 없음).

법적 안전: 결제 폼 도달까지만 측정했음을 명시하고, 차단/실패를 분리해 보여준다.
"""

from __future__ import annotations

import datetime
import html

from .funnel import REASONS
from .report import premise_verdict
from .scoring import SiteScore, step_label

# 도달률 색상 임계(신뢰감 있는 신호등).
_GREEN = "#1f8a4c"
_AMBER = "#b8860b"
_RED = "#b23b3b"
_MUTED = "#8a8577"


def _bar_color(reach: int) -> str:
    if reach >= 80:
        return _GREEN
    if reach >= 50:
        return _AMBER
    return _RED


def _row(i: int, s: SiteScore) -> str:
    name = html.escape(s.site)
    if not s.measured_runs:
        brk = '<span class="muted">차단(측정 불가)</span>'
        reach_cell = '<span class="muted">—</span>'
        bar = ""
    else:
        b = s.common_break
        brk = (
            f"{html.escape(step_label(b[0]))} · {html.escape(REASONS.get(b[1], b[1]))}"
            if b else '<span class="ok">완주</span>'
        )
        reach_cell = f"{s.reachability}%"
        bar = (
            f'<div class="bar"><span style="width:{s.reachability}%;'
            f'background:{_bar_color(s.reachability)}"></span></div>'
        )
    return (
        f"<tr><td class='rank'>{i}</td><td class='site'>{name}</td>"
        f"<td class='num'>{reach_cell}{bar}</td>"
        f"<td class='num'>{s.completion_rate}%</td>"
        f"<td class='num blocked'>{s.blocked_rate}%</td>"
        f"<td class='brk'>{brk}</td></tr>"
    )


def to_html(
    scores: list[SiteScore],
    *,
    demo: bool = False,
    generated_at: str | None = None,
) -> str:
    ts = generated_at or datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%d %H:%M UTC"
    )
    _, verdict = premise_verdict(scores)
    rows = "\n".join(_row(i, s) for i, s in enumerate(scores, 1))
    demo_banner = (
        '<div class="demo">DEMO — mock 데이터입니다. 실측 아님.</div>' if demo else ""
    )
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent-Readiness Leaderboard</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ margin:0; background:#faf8f3; color:#1c1a17;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Pretendard,sans-serif; }}
  .wrap {{ max-width:860px; margin:0 auto; padding:40px 20px 80px; }}
  h1 {{ font-size:28px; margin:0 0 4px; letter-spacing:-.02em; }}
  .sub {{ color:{_MUTED}; margin:0 0 24px; font-size:14px; }}
  .verdict {{ background:#fff; border:1px solid #eae3d9; border-radius:10px;
    padding:14px 16px; margin:0 0 20px; font-size:14px; }}
  .demo {{ background:#fff3cd; border:1px solid #e6cf7a; color:#7a5b00;
    padding:8px 12px; border-radius:8px; margin:0 0 16px; font-size:13px; font-weight:600; }}
  table {{ width:100%; border-collapse:collapse; background:#fff;
    border:1px solid #eae3d9; border-radius:10px; overflow:hidden; }}
  th,td {{ padding:10px 12px; text-align:left; border-bottom:1px solid #f0ebe2; font-size:14px; }}
  th {{ background:#f4f0e9; font-weight:600; color:#5b554b; font-size:12px;
    text-transform:uppercase; letter-spacing:.04em; }}
  td.num {{ font-variant-numeric:tabular-nums; white-space:nowrap; }}
  td.rank {{ color:{_MUTED}; width:28px; }}
  td.site {{ font-weight:600; }}
  td.blocked {{ color:{_MUTED}; }}
  td.brk {{ color:#5b554b; }}
  .ok {{ color:{_GREEN}; font-weight:600; }}
  .muted {{ color:{_MUTED}; }}
  .bar {{ height:4px; background:#f0ebe2; border-radius:2px; margin-top:5px; }}
  .bar span {{ display:block; height:100%; border-radius:2px; }}
  footer {{ color:{_MUTED}; font-size:12px; margin-top:18px; line-height:1.6; }}
</style></head>
<body><div class="wrap">
  <h1>Agent-Readiness Leaderboard</h1>
  <p class="sub">AI 쇼핑 에이전트가 각 쇼핑몰 체크아웃을 어디까지 통과하나 · {html.escape(ts)}</p>
  {demo_banner}
  <div class="verdict"><b>핵심 전제 판정:</b> {html.escape(verdict)}</div>
  <table>
    <thead><tr><th></th><th>사이트</th><th>도달률</th><th>완주율</th>
    <th>차단율</th><th>가장 흔한 실패 지점</th></tr></thead>
    <tbody>
{rows}
    </tbody>
  </table>
  <footer>
    도달률 = 결제 폼까지 퍼널 통과율(차단 주행 제외 중앙값) ·
    완주율 = 결제 폼 도달 비율 · 차단율 = 봇 차단으로 측정 불가 비율.<br>
    측정은 여러 에이전트 프로파일로 수행되며, <b>결제는 실행하지 않습니다(결제 폼 도달까지만).</b>
    방법론 공개 예정.
  </footer>
</div></body></html>
"""
