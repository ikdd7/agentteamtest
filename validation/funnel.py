"""Agent Checkout Index — 검증 하니스의 퍼널/결과 모델.

에이전트가 쇼핑몰 체크아웃을 어디까지 통과하는지 단계별로 측정한다.
**법적 안전 원칙: 마지막 단계는 '결제 폼 도달'이며, 결제는 절대 실행하지 않는다(dry-run).**
또한 "봇 차단(blocked)"과 "체크아웃 실패(failed)"를 분리해 기록한다 —
측정 불가(우리가 못 들어간 것)와 실제 결함을 혼동하지 않기 위함.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# 표준 체크아웃 퍼널. (키, 사람이 읽는 설명) 순서가 곧 측정 순서.
# 마지막 단계는 결제 폼 '도달'까지 — 결제 제출 단계는 의도적으로 없음.
FUNNEL: list[tuple[str, str]] = [
    ("load", "사이트 로드"),
    ("find_product", "상품 탐색"),
    ("add_to_cart", "장바구니 담기"),
    ("open_cart", "장바구니 열기"),
    ("enter_checkout", "체크아웃 진입"),
    ("reach_payment_form", "결제 폼 도달(여기서 중단 — 결제 미실행)"),
]
FUNNEL_KEYS = [k for k, _ in FUNNEL]

# 단계 상태.
PASS = "pass"
FAIL = "fail"
BLOCKED = "blocked"  # 캡차/Cloudflare/DataDome 등 봇 차단 — '실패'와 구분

# 실패/차단 사유 분류.
REASONS = {
    "ok": "정상",
    "blocked_bot": "봇 차단(캡차/Cloudflare/DataDome 등)",
    "login_required": "로그인 강제",
    "otp_2fa": "OTP/2FA 요구",
    "element_not_found": "요소를 못 찾음(셀렉터/플로우 불일치)",
    "js_error": "JS 렌더링/스크립트 오류",
    "timeout": "시간 초과",
    "other": "기타",
}


@dataclass
class StepResult:
    """단일 퍼널 단계의 측정 결과."""

    step: str
    status: str  # PASS | FAIL | BLOCKED
    reason: str = "ok"  # REASONS 의 키
    evidence: str | None = None  # 스크린샷/DOM 스냅샷 경로(실측 시)


@dataclass
class SiteRun:
    """한 사이트 × 한 에이전트의 1회 주행 결과."""

    site: str
    agent: str
    steps: list[StepResult] = field(default_factory=list)

    @property
    def furthest_index(self) -> int:
        """PASS 한 마지막 단계의 인덱스(-1 = 첫 단계도 통과 못함)."""
        idx = -1
        for i, s in enumerate(self.steps):
            if s.status == PASS:
                idx = i
            else:
                break
        return idx

    @property
    def terminal(self) -> StepResult | None:
        """주행을 멈춘 비-PASS 단계(완주 시 None)."""
        for s in self.steps:
            if s.status != PASS:
                return s
        return None

    @property
    def outcome(self) -> str:
        """reached_payment | blocked | failed."""
        t = self.terminal
        if t is None:
            return "reached_payment"
        return "blocked" if t.status == BLOCKED else "failed"

    @property
    def reachability(self) -> int:
        """퍼널 도달률 0~100 (통과 단계 수 / 전체)."""
        return round((self.furthest_index + 1) / len(FUNNEL) * 100)
