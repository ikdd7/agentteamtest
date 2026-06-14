"""검증 하니스의 드라이버 — 사이트를 실제로 주행하는 부분.

두 가지 백엔드:
- MockDriver: 네트워크 없이 시나리오대로 결과를 만든다. 로직/리포트 검증·CI·데모용.
- PlaywrightDriver: 실제 헤드리스 브라우저로 주행한다. 본인 PC에서 사용.
  **결제 폼 도달까지만 하고 결제는 절대 제출하지 않는다.**

드라이버는 퍼널을 순서대로 시도하고, 첫 비-PASS 단계에서 멈춘 StepResult 목록을 반환한다.
"""

from __future__ import annotations

from typing import Protocol

from .funnel import BLOCKED, FAIL, FUNNEL_KEYS, PASS, StepResult


class SiteConfig(Protocol):
    name: str
    url: str


class Driver(Protocol):
    def run(self, site: object, agent: str) -> list[StepResult]:
        """사이트를 주행하고 단계별 결과를 반환한다."""
        ...


# ---------------------------------------------------------------------------
# MockDriver — 네트워크 없는 결정론적 백엔드
# ---------------------------------------------------------------------------


class MockDriver:
    """site dict 의 'mock' 필드(시나리오)에 따라 결과를 만든다.

    mock 예시:
        {"stop": "add_to_cart", "status": "fail", "reason": "element_not_found"}
        {"stop": "load", "status": "blocked", "reason": "blocked_bot"}
        None  -> 완주(결제 폼 도달)
    """

    def run(self, site: dict, agent: str) -> list[StepResult]:
        mock = site.get("mock")
        steps: list[StepResult] = []
        stop_key = mock.get("stop") if mock else None
        for key in FUNNEL_KEYS:
            if mock and key == stop_key:
                status = mock.get("status", FAIL)
                reason = mock.get("reason", "other")
                steps.append(StepResult(step=key, status=status, reason=reason))
                break
            steps.append(StepResult(step=key, status=PASS))
        return steps


# ---------------------------------------------------------------------------
# PlaywrightDriver — 실제 주행(본인 PC). playwright 미설치 시 친절히 안내.
# ---------------------------------------------------------------------------

# 봇 차단을 시사하는 흔한 신호(소문자 비교).
_BLOCK_SIGNS = (
    "captcha",
    "cloudflare",
    "are you a human",
    "access denied",
    "verify you are",
    "datadome",
    "px-captcha",
    "잠시 후 다시",
    "비정상적인",
)


class PlaywrightDriver:
    """실제 헤드리스 브라우저로 체크아웃 퍼널을 주행한다(v0 휴리스틱).

    완벽한 일반화는 동의 기반 사이트별 플레이북이 필요하다(설계 노트 참고).
    이 v0 은 검증 실험용 best-effort 이며, 결제 폼 도달까지만 측정한다.
    """

    def __init__(self, headless: bool = True, timeout_ms: int = 20000) -> None:
        self.headless = headless
        self.timeout_ms = timeout_ms

    def run(self, site: dict, agent: str) -> list[StepResult]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise RuntimeError(
                "playwright 미설치. 본인 PC에서: pip install playwright && playwright install chromium"
            ) from None

        steps: list[StepResult] = []

        def block_or(text: str) -> str | None:
            low = text.lower()
            return "blocked_bot" if any(s in low for s in _BLOCK_SIGNS) else None

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            page = browser.new_page(user_agent=agent or None)
            page.set_default_timeout(self.timeout_ms)
            try:
                # 1) load
                page.goto(site["url"], wait_until="domcontentloaded")
                if (r := block_or(page.content())):
                    steps.append(StepResult("load", BLOCKED, r))
                    return steps
                steps.append(StepResult("load", PASS))

                # 2) find_product — 검색창 휴리스틱
                q = site.get("query", "test")
                box = page.query_selector(
                    "input[type=search], input[name*=q], input[placeholder*=검색], input[aria-label*=earch]"
                )
                if not box:
                    steps.append(StepResult("find_product", FAIL, "element_not_found"))
                    return steps
                box.fill(q)
                box.press("Enter")
                page.wait_for_load_state("domcontentloaded")
                steps.append(StepResult("find_product", PASS))

                # 3~6) 이후 단계는 사이트별 플레이북이 필요 → v0 은 미구현으로 정직히 표기.
                # (동의 기반 머천트 온보딩에서 add_to_cart→payment 셀렉터를 주입한다.)
                steps.append(
                    StepResult("add_to_cart", FAIL, "element_not_found")
                )
                return steps
            except Exception as e:  # noqa: BLE001 — 마지막 단계 사유로 환원
                last = FUNNEL_KEYS[len(steps)] if len(steps) < len(FUNNEL_KEYS) else "other"
                reason = "timeout" if "imeout" in str(e) else "js_error"
                steps.append(StepResult(last, FAIL, reason))
                return steps
            finally:
                browser.close()


def get_driver(name: str) -> Driver:
    if name == "mock":
        return MockDriver()
    if name == "playwright":
        return PlaywrightDriver()
    raise ValueError(f"알 수 없는 드라이버: {name} (mock | playwright)")
