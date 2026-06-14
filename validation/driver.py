"""검증 하니스의 드라이버 — 사이트를 주행하는 부분.

- MockDriver: 네트워크 없는 결정론적 백엔드(데모/CI).
- CheckoutEngine: 퍼널 진행·차단/실패 판정·결제폼 중단 로직. Page 프로토콜 위에서
  동작하므로 브라우저 없이 가짜 Page 로 단위 테스트가 된다.
- PlaywrightPage / PlaywrightDriver: 실제 헤드리스 브라우저 + 플랫폼 플레이북.
  **결제 폼 도달까지만(탐지) — 카드 입력·결제 제출은 코드에 없다.**
"""

from __future__ import annotations

from typing import Protocol

from .funnel import BLOCKED, FAIL, FUNNEL_KEYS, PASS, StepResult
from .playbooks import detect_platform, is_blocked, selectors_for


class Driver(Protocol):
    def run(self, site: dict, agent: str) -> list[StepResult]:
        ...


# ---------------------------------------------------------------------------
# MockDriver — 네트워크 없는 결정론적 백엔드
# ---------------------------------------------------------------------------


class MockDriver:
    """site['mock'] 시나리오대로 결과를 만든다.

    mock 예: {"stop": "add_to_cart", "status": "fail", "reason": "element_not_found"}
            {"stop": "load", "status": "blocked", "reason": "blocked_bot"}
            None -> 완주(결제 폼 도달)
    """

    def run(self, site: dict, agent: str) -> list[StepResult]:
        mock = site.get("mock")
        steps: list[StepResult] = []
        stop_key = mock.get("stop") if mock else None
        for key in FUNNEL_KEYS:
            if mock and key == stop_key:
                steps.append(StepResult(key, mock.get("status", FAIL),
                                        mock.get("reason", "other")))
                break
            steps.append(StepResult(key, PASS))
        return steps


# ---------------------------------------------------------------------------
# CheckoutEngine — 퍼널 오케스트레이션(Page 프로토콜 위, 테스트 가능)
# ---------------------------------------------------------------------------


class Page(Protocol):
    """체크아웃 주행에 필요한 고수준 동작. 실측/가짜 구현이 공유한다."""

    def load(self, url: str) -> str: ...        # "ok" | "blocked"
    def blocked(self) -> bool: ...
    def find_product(self, query: str) -> bool: ...
    def add_to_cart(self) -> bool: ...
    def open_cart(self) -> bool: ...
    def enter_checkout(self) -> bool: ...
    def payment_form_present(self) -> bool: ...  # 탐지만 — 결제 미실행


class CheckoutEngine:
    """Page 를 받아 퍼널을 순서대로 주행하고 단계별 결과를 만든다."""

    def run(self, page: Page, site: dict) -> list[StepResult]:
        steps: list[StepResult] = []

        if page.load(site["url"]) == "blocked":
            return [StepResult("load", BLOCKED, "blocked_bot")]
        steps.append(StepResult("load", PASS))

        actions: list[tuple[str, object]] = [
            ("find_product", lambda: page.find_product(site.get("query", "test"))),
            ("add_to_cart", page.add_to_cart),
            ("open_cart", page.open_cart),
            ("enter_checkout", page.enter_checkout),
        ]
        for key, fn in actions:
            if page.blocked():
                steps.append(StepResult(key, BLOCKED, "blocked_bot"))
                return steps
            try:
                ok = fn()  # type: ignore[operator]
            except Exception:  # noqa: BLE001 — 주행 실패는 사유로 환원
                steps.append(StepResult(key, FAIL, "js_error"))
                return steps
            if not ok:
                steps.append(StepResult(key, FAIL, "element_not_found"))
                return steps
            steps.append(StepResult(key, PASS))

        # 결제 폼 — 존재만 확인하고 중단(결제 미실행).
        if page.blocked():
            steps.append(StepResult("reach_payment_form", BLOCKED, "blocked_bot"))
        elif page.payment_form_present():
            steps.append(StepResult("reach_payment_form", PASS))
        else:
            steps.append(StepResult("reach_payment_form", FAIL, "element_not_found"))
        return steps


# ---------------------------------------------------------------------------
# PlaywrightPage / PlaywrightDriver — 실측(본인 PC)
# ---------------------------------------------------------------------------


class PlaywrightPage:
    """실제 Playwright page 를 Page 프로토콜로 감싼다(플랫폼 플레이북 사용)."""

    def __init__(self, page: object) -> None:
        self.page = page
        self.platform = "generic"

    def _first(self, step: str):  # -> Locator | None
        for sel in selectors_for(self.platform, step):
            loc = self.page.locator(sel)  # type: ignore[attr-defined]
            try:
                if loc.count() > 0:
                    return loc.first
            except Exception:  # noqa: BLE001 — 잘못된 셀렉터는 건너뜀
                continue
        return None

    def load(self, url: str) -> str:
        self.page.goto(url, wait_until="domcontentloaded")  # type: ignore[attr-defined]
        html = self.page.content()  # type: ignore[attr-defined]
        self.platform = detect_platform(html)
        return "blocked" if is_blocked(html) else "ok"

    def blocked(self) -> bool:
        return is_blocked(self.page.content())  # type: ignore[attr-defined]

    def find_product(self, query: str) -> bool:
        # 검색창이 있으면 검색하고, 없으면(목록형 사이트) 바로 상품 링크를 시도한다.
        box = self._first("search")
        if box is not None:
            box.fill(query)
            box.press("Enter")
            self.page.wait_for_load_state("domcontentloaded")  # type: ignore[attr-defined]
        link = self._first("product_link")
        if link is None:
            return False
        link.click()
        self.page.wait_for_load_state("domcontentloaded")  # type: ignore[attr-defined]
        return True

    def add_to_cart(self) -> bool:
        btn = self._first("add_to_cart")
        if btn is None:
            return False
        btn.click()
        return True

    def open_cart(self) -> bool:
        link = self._first("cart")
        if link is not None:
            link.click()
        else:
            from urllib.parse import urljoin
            self.page.goto(urljoin(self.page.url, "/cart"),  # type: ignore[attr-defined]
                           wait_until="domcontentloaded")
        self.page.wait_for_load_state("domcontentloaded")  # type: ignore[attr-defined]
        return self._first("cart_page") is not None

    def enter_checkout(self) -> bool:
        btn = self._first("checkout")
        if btn is None:
            return False
        btn.click()
        self.page.wait_for_load_state("domcontentloaded")  # type: ignore[attr-defined]
        return True

    def payment_form_present(self) -> bool:
        # 결제 폼이 떴는지 '탐지'만 한다 — 입력/제출 없음.
        return self._first("payment_field") is not None


class PlaywrightDriver:
    """실제 헤드리스 브라우저로 체크아웃 퍼널을 주행한다(결제 폼 도달까지만)."""

    def __init__(self, headless: bool = True, timeout_ms: int = 20000) -> None:
        self.headless = headless
        self.timeout_ms = timeout_ms
        self.engine = CheckoutEngine()

    def run(self, site: dict, agent: str) -> list[StepResult]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise RuntimeError(
                "playwright 미설치. 본인 PC에서: "
                "pip install playwright && playwright install chromium"
            ) from None

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            page = browser.new_page(user_agent=agent or None)
            page.set_default_timeout(self.timeout_ms)
            try:
                return self.engine.run(PlaywrightPage(page), site)
            finally:
                browser.close()


def get_driver(name: str) -> Driver:
    if name == "mock":
        return MockDriver()
    if name == "playwright":
        return PlaywrightDriver()
    raise ValueError(f"알 수 없는 드라이버: {name} (mock | playwright)")
