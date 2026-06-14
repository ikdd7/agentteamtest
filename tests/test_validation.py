"""검증 하니스 단위 테스트 (mock 드라이버, 네트워크 없음)."""

from __future__ import annotations

from validation import run_validation, score_sites
from validation.driver import MockDriver, get_driver
from validation.funnel import BLOCKED, FAIL, PASS, SiteRun, StepResult
from validation.report import premise_verdict, to_csv, to_markdown
from validation.scoring import SiteScore


def _steps(*specs: tuple[str, str, str]) -> list[StepResult]:
    return [StepResult(step=k, status=s, reason=r) for k, s, r in specs]


# --- funnel / SiteRun ------------------------------------------------------

def test_reached_payment_full_funnel() -> None:
    steps = MockDriver().run({"name": "x", "url": "u", "mock": None}, "a")
    run = SiteRun(site="x", agent="a", steps=steps)
    assert run.outcome == "reached_payment"
    assert run.reachability == 100
    assert run.terminal is None


def test_failed_midway() -> None:
    run = SiteRun("x", "a", _steps(
        ("load", PASS, "ok"), ("find_product", PASS, "ok"),
        ("add_to_cart", FAIL, "element_not_found")))
    assert run.outcome == "failed"
    assert run.terminal.step == "add_to_cart"
    assert run.reachability == 33  # 2/6


def test_blocked_at_load() -> None:
    run = SiteRun("x", "a", _steps(("load", BLOCKED, "blocked_bot")))
    assert run.outcome == "blocked"
    assert run.reachability == 0


# --- scoring (multi-agent aggregate) --------------------------------------

def test_site_score_median_and_blocked_separation() -> None:
    runs = [
        SiteRun("x", "a1", _steps(("load", PASS, "ok"), ("find_product", PASS, "ok"),
                                  ("add_to_cart", FAIL, "element_not_found"))),  # 33
        SiteRun("x", "a2", _steps(("load", PASS, "ok"), ("find_product", PASS, "ok"),
                                  ("add_to_cart", PASS, "ok"), ("open_cart", FAIL, "js_error"))),  # 50
        SiteRun("x", "a3", _steps(("load", BLOCKED, "blocked_bot"))),  # blocked
    ]
    [score] = score_sites(runs)
    assert score.blocked_rate == 33  # 1/3
    # 차단 제외 측정 2건의 도달률 중앙값 = (33,50) -> 41 or 42
    assert 40 <= score.reachability <= 42
    assert score.completion_rate == 0
    assert score.common_break == ("add_to_cart", "element_not_found")  # 가장 흔함


def test_all_blocked_site() -> None:
    runs = [SiteRun("x", "a", _steps(("load", BLOCKED, "blocked_bot")))]
    [score] = score_sites(runs)
    assert score.blocked_rate == 100
    assert score.reachability == 0
    assert score.measured_runs == []


def test_score_sites_sorted_desc() -> None:
    runs = [
        SiteRun("low", "a", _steps(("load", FAIL, "timeout"))),  # 0
        SiteRun("high", "a", MockDriver().run({"name": "h", "url": "u", "mock": None}, "a")),  # 100
    ]
    scores = score_sites(runs)
    assert [s.site for s in scores] == ["high", "low"]


# --- report ----------------------------------------------------------------

def test_premise_verdict_holds() -> None:
    # 측정 4곳 중 3곳이 70% 미만 -> 성립
    scores = [
        SiteScore("a", [SiteRun("a", "x", _steps(("load", FAIL, "timeout")))]),
        SiteScore("b", [SiteRun("b", "x", _steps(("load", PASS, "ok"), ("find_product", FAIL, "js_error")))]),
        SiteScore("c", [SiteRun("c", "x", _steps(("load", PASS, "ok"), ("find_product", FAIL, "js_error")))]),
        SiteScore("d", [SiteRun("d", "x", MockDriver().run({"name": "d", "url": "u", "mock": None}, "x"))]),
    ]
    ok, msg = premise_verdict(scores)
    assert ok is True
    assert "성립" in msg


def test_markdown_separates_blocked_from_complete() -> None:
    scores = score_sites([
        SiteRun("blocked-site", "a", _steps(("load", BLOCKED, "blocked_bot"))),
        SiteRun("good-site", "a", MockDriver().run({"name": "g", "url": "u", "mock": None}, "a")),
    ])
    md = to_markdown(scores, demo=True)
    assert "차단(측정 불가)" in md   # 차단 사이트는 '완주'가 아님
    assert "DEMO" in md


def test_csv_has_header_and_rows() -> None:
    scores = score_sites([SiteRun("x", "a", _steps(("load", FAIL, "timeout")))])
    csv_text = to_csv(scores)
    assert csv_text.splitlines()[0].startswith("site,reachability")
    assert "x" in csv_text


# --- driver / runner / CLI -------------------------------------------------

def test_mock_driver_stop_scenario() -> None:
    steps = MockDriver().run(
        {"name": "x", "url": "u", "mock": {"stop": "add_to_cart", "status": "fail", "reason": "element_not_found"}}, "a")
    assert [s.step for s in steps] == ["load", "find_product", "add_to_cart"]
    assert steps[-1].status == FAIL


def test_get_driver_unknown() -> None:
    import pytest
    with pytest.raises(ValueError):
        get_driver("nope")


def test_run_validation_multi_agent() -> None:
    sites = [{"name": "x", "url": "u", "mock": None}]
    scores = run_validation(sites, MockDriver(), agents=["a1", "a2"])
    assert len(scores) == 1
    assert len(scores[0].runs) == 2  # 2 에이전트
    assert scores[0].reachability == 100


# --- leaderboard HTML ------------------------------------------------------

# --- CheckoutEngine (가짜 Page, 브라우저 없음) + 플레이북 ------------------

_BLOCK_INDEX = {  # blocked() 호출 순서 → 단계
    "find_product": 1, "add_to_cart": 2, "open_cart": 3,
    "enter_checkout": 4, "reach_payment_form": 5,
}


class FakePage:
    """CheckoutEngine 을 브라우저 없이 검증하는 스크립트형 Page."""

    def __init__(self, *, load_blocked=False, block_before=None, fail_at=None, payment=True):
        self.load_blocked = load_blocked
        self.block_before = block_before
        self.fail_at = fail_at
        self.payment = payment
        self._blk_calls = 0

    def load(self, url):
        return "blocked" if self.load_blocked else "ok"

    def blocked(self):
        self._blk_calls += 1
        return bool(self.block_before) and self._blk_calls == _BLOCK_INDEX[self.block_before]

    def find_product(self, query):
        return self.fail_at != "find_product"

    def add_to_cart(self):
        return self.fail_at != "add_to_cart"

    def open_cart(self):
        return self.fail_at != "open_cart"

    def enter_checkout(self):
        return self.fail_at != "enter_checkout"

    def payment_form_present(self):
        return self.payment


def _engine_run(page):
    from validation.driver import CheckoutEngine
    return SiteRun("x", "a", CheckoutEngine().run(page, {"url": "u", "query": "q"}))


def test_engine_reaches_payment() -> None:
    run = _engine_run(FakePage())
    assert run.outcome == "reached_payment"
    assert run.reachability == 100


def test_engine_blocked_at_load() -> None:
    run = _engine_run(FakePage(load_blocked=True))
    assert run.outcome == "blocked"
    assert run.steps[0].step == "load"


def test_engine_fail_at_add_to_cart() -> None:
    run = _engine_run(FakePage(fail_at="add_to_cart"))
    assert run.outcome == "failed"
    assert run.terminal.step == "add_to_cart"
    assert run.terminal.reason == "element_not_found"


def test_engine_blocked_before_checkout() -> None:
    run = _engine_run(FakePage(block_before="enter_checkout"))
    assert run.outcome == "blocked"
    assert run.terminal.step == "enter_checkout"


def test_engine_no_payment_form() -> None:
    run = _engine_run(FakePage(payment=False))
    assert run.outcome == "failed"
    assert run.terminal.step == "reach_payment_form"


def test_detect_platform() -> None:
    from validation.playbooks import detect_platform
    assert detect_platform("<script src='cdn.shopify.com/x'>") == "shopify"
    assert detect_platform("<body class='woocommerce'>") == "woocommerce"
    assert detect_platform("<html>plain</html>") == "generic"


def test_is_blocked() -> None:
    from validation.playbooks import is_blocked
    assert is_blocked("Please complete the CAPTCHA") is True
    assert is_blocked("normal shop page") is False


def test_selectors_for_fallback_and_dedup() -> None:
    from validation.playbooks import selectors_for
    sels = selectors_for("shopify", "search")
    assert sels[0] == 'input[name="q"]'              # 플랫폼 우선
    assert 'input[type="search"]' in sels            # generic 폴백 포함
    assert len(sels) == len(set(sels))               # 중복 없음


# --- merchant diagnostic ---------------------------------------------------

def test_estimate_monthly_loss() -> None:
    from validation.diagnostic import MerchantInputs, estimate_monthly_loss
    # 모든 주행이 체크아웃 진입에서 실패 -> 도달 0 -> 손실 = sessions*1*cr*aov
    score = score_sites([
        SiteRun("x", "a", _steps(("load", PASS, "ok"), ("find_product", PASS, "ok"),
                                 ("add_to_cart", FAIL, "element_not_found")))])[0]
    loss = estimate_monthly_loss(score, MerchantInputs(10_000, 70.0, 0.02))
    assert round(loss) == 14_000  # 10000 * 1.0 * 0.02 * 70


def test_diagnostic_markdown_has_hook_and_fix() -> None:
    from validation.diagnostic import to_markdown as diag
    score = score_sites([
        SiteRun("shop", "ChatGPT", _steps(
            ("load", PASS, "ok"), ("find_product", PASS, "ok"),
            ("add_to_cart", PASS, "ok"), ("open_cart", PASS, "ok"),
            ("enter_checkout", FAIL, "login_required")))])[0]
    md = diag(score, index_reachabilities=[80, 50], demo=True)
    assert "에이전트 결제 진단" in md
    assert "월 추정 손실" in md          # 영업 후크
    assert "게스트 체크아웃" in md        # login_required 수정 가이드
    assert "체크아웃 진입" in md          # 깨진 단계
    assert "❌" in md                    # 퍼널 분해


def test_diagnostic_blocked_site() -> None:
    from validation.diagnostic import to_markdown as diag
    score = score_sites([SiteRun("b", "a", _steps(("load", BLOCKED, "blocked_bot")))])[0]
    md = diag(score)
    assert "봇 차단으로 측정 불가" in md


def test_leaderboard_html_self_contained() -> None:
    from validation.leaderboard import to_html
    scores = score_sites([
        SiteRun("good", "a", MockDriver().run({"name": "g", "url": "u", "mock": None}, "a")),
        SiteRun("blocked", "a", _steps(("load", BLOCKED, "blocked_bot"))),
    ])
    page = to_html(scores, demo=True, generated_at="2026-06-14 00:00 UTC")
    assert page.startswith("<!doctype html>")
    assert "Agent-Readiness Leaderboard" in page
    assert "<style>" in page and "http" not in page.split("<body>")[0].replace("lang", "")  # 외부 의존 없음
    assert "차단(측정 불가)" in page  # 차단 분리 표기
    assert "결제는 실행하지 않습니다" in page  # 법적 안전 고지
    assert "DEMO" in page
