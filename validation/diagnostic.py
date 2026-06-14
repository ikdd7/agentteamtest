"""머천트 진단 리포트 — 유료 SaaS 의 핵심 산출물.

단일 쇼핑몰에 대해: 에이전트 결제가 어느 단계에서·왜 깨지는지(에이전트별),
업종 벤치마크 대비 위치, **에이전트 전환 손실 $추정**(영업 후크), 그리고
실패 사유별 구체적 수정 가이드를 제공한다.

손실 추정의 모든 입력은 가정값이며 보고서에 명시한다(과대약속 금지).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from .funnel import FUNNEL, PASS, REASONS
from .scoring import SiteScore, step_label

# 실패 사유 → 구체적 수정 가이드(머천트가 바로 행동할 수 있게).
FIX_GUIDE: dict[str, str] = {
    "blocked_bot": "봇 차단(Cloudflare/DataDome 등)이 정상 에이전트까지 막습니다. "
    "Verified-agent 허용목록 또는 에이전트 트래픽 예외 토큰을 검토하세요.",
    "login_required": "체크아웃 전 강제 로그인이 게스트 에이전트 결제를 막습니다. "
    "게스트 체크아웃 경로를 열어두세요.",
    "otp_2fa": "결제 단계의 OTP/2FA가 에이전트를 차단합니다. 신뢰 디바이스·대체 인증 "
    "경로를 제공하세요.",
    "element_not_found": "버튼/입력 요소에 명확한 라벨·role·접근성 속성이 없어 에이전트가 "
    "찾지 못합니다. 시맨틱 마크업과 ARIA 라벨을 보강하세요.",
    "js_error": "무거운 클라이언트 JS 렌더링이 에이전트 파싱을 실패시킵니다. SSR 또는 "
    "점진적 향상(progressive enhancement)을 검토하세요.",
    "timeout": "페이지/결제 응답 지연으로 에이전트가 시간 초과됩니다. 핵심 경로 성능을 "
    "최적화하세요.",
    "other": "원인 분류 불가 — 증거(스크린샷/DOM)를 확인해 수동 진단하세요.",
}


@dataclass
class MerchantInputs:
    """손실 추정용 머천트 입력(전부 가정값 — 머천트가 교체)."""

    monthly_agent_sessions: int = 10_000  # 월 에이전트 결제 시도 세션
    aov: float = 70.0  # 평균 주문금액($)
    assumed_cr: float = 0.02  # 결제 폼 도달 시 가정 전환율


def _success_rate_all(score: SiteScore) -> float:
    """모든 주행(차단 포함) 중 결제 폼 도달 비율 0~1 (머천트 관점 손실 기준)."""
    if not score.runs:
        return 0.0
    reached = sum(1 for r in score.runs if r.outcome == "reached_payment")
    return reached / len(score.runs)


def estimate_monthly_loss(score: SiteScore, inputs: MerchantInputs) -> float:
    """월 에이전트 전환 손실 추정($). 차단도 손실로 본다."""
    lost_share = 1.0 - _success_rate_all(score)
    lost_orders = inputs.monthly_agent_sessions * lost_share * inputs.assumed_cr
    return lost_orders * inputs.aov


def _grade(reach: int) -> str:
    if reach >= 80:
        return "A (양호)"
    if reach >= 50:
        return "C (개선 필요)"
    return "F (심각)"


def to_markdown(
    score: SiteScore,
    inputs: MerchantInputs | None = None,
    *,
    index_reachabilities: list[int] | None = None,
    demo: bool = False,
) -> str:
    inputs = inputs or MerchantInputs()
    out: list[str] = []
    title = f"# 에이전트 결제 진단 — {score.site}"
    if demo:
        title += "  *(DEMO: mock)*"
    out.append(title)
    out.append("")
    out.append(f"**등급: {_grade(score.reachability)}**  ·  "
               f"도달률 {score.reachability}% · 완주율 {score.completion_rate}% · "
               f"차단율 {score.blocked_rate}%")
    out.append("")

    # 벤치마크.
    if index_reachabilities:
        med = round(statistics.median(index_reachabilities))
        rel = "상위" if score.reachability >= med else "하위"
        out.append(f"**벤치마크:** 인덱스 중앙값 {med}% 대비 {rel} "
                   f"({score.reachability - med:+d}%p).")
        out.append("")

    # 손실 추정(영업 후크).
    loss = estimate_monthly_loss(score, inputs)
    out.append("## 에이전트 전환 손실 추정")
    out.append(f"- 가정: 월 에이전트 세션 {inputs.monthly_agent_sessions:,} · "
               f"AOV ${inputs.aov:,.0f} · 도달 시 전환율 {inputs.assumed_cr:.1%}")
    out.append(f"- **월 추정 손실: ${loss:,.0f}** "
               f"(에이전트 세션 중 결제 폼 미도달분 × 가정 전환율 × AOV)")
    out.append("> 입력값은 가정이며 머천트 실데이터로 교체해야 합니다.")
    out.append("")

    # 에이전트별 퍼널 분해.
    out.append("## 단계별 퍼널 (에이전트별)")
    header = "| 에이전트 | " + " | ".join(label for _, label in FUNNEL) + " |"
    sep = "|" + "---|" * (len(FUNNEL) + 1)
    out.append(header)
    out.append(sep)
    for run in score.runs:
        cells = []
        passed = {s.step for s in run.steps if s.status == PASS}
        terminal = run.terminal
        for key, _ in FUNNEL:
            if key in passed:
                cells.append("✅")
            elif terminal and terminal.step == key:
                mark = "🚫" if run.outcome == "blocked" else "❌"
                cells.append(mark)
            else:
                cells.append("·")
        out.append(f"| {run.agent} | " + " | ".join(cells) + " |")
    out.append("> ✅ 통과 · ❌ 실패 · 🚫 봇 차단 · · 미도달")
    out.append("")

    # 핵심 깨짐 + 수정 가이드.
    brk = score.common_break
    out.append("## 진단 & 수정 가이드")
    if not score.measured_runs:
        out.append("- **봇 차단으로 측정 불가** — " + FIX_GUIDE["blocked_bot"])
    elif brk is None:
        out.append("- 모든 에이전트가 결제 폼까지 도달. 큰 결함 없음. "
                   "completion(실완주)은 동의 기반 샌드박스 측정 권장.")
    else:
        step, reason = brk
        out.append(f"- **가장 흔한 깨짐: {step_label(step)} 단계 — "
                   f"{REASONS.get(reason, reason)}**")
        out.append(f"- 수정: {FIX_GUIDE.get(reason, FIX_GUIDE['other'])}")
    out.append("")
    out.append("> 측정은 결제 폼 도달까지만 수행(결제 미실행). 여러 에이전트 프로파일 집계.")
    return "\n".join(out)
