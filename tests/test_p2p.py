"""p2p 위임/라우팅/종합 로직 테스트 (claude CLI 미호출, 가짜 백엔드).

새 구조: 리드는 산출물을 직접 못 쓰고 강제로 팬아웃 → 전문가 보고 → 리드 종합.
종합 호출의 프롬프트에는 '통합' 이라는 단어가 들어가므로 그것으로 식별한다.
"""

from __future__ import annotations

from multiagent import p2p
from multiagent.p2p import P2PTeam


def test_force_fanout_when_lead_gives_no_mention() -> None:
    calls: set[str] = set()

    def fake(system: str, prompt: str) -> str:
        if "통합" in prompt:  # 리드 종합 호출
            return "통합결과"
        if "@team-lead 입니다" in system:  # 리드 위임 턴 (지목 없음)
            return "음 시작해보죠"
        if "@product 입니다" in system:
            calls.add("product")
            return "product 보고"
        if "@implementer 입니다" in system:
            calls.add("implementer")
            return "implementer 보고"
        return "..."

    team = P2PTeam(agents=["product", "implementer"], backend=fake, max_calls=10)
    out = team.run("작업")
    assert out == "통합결과"
    assert calls == {"product", "implementer"}  # 지목이 없어 전원 강제 위임


def test_lead_mention_delegates_subset() -> None:
    calls: set[str] = set()

    def fake(system: str, prompt: str) -> str:
        if "통합" in prompt:
            return "통합결과"
        if "@team-lead 입니다" in system:
            return "@product 네가 맡아"  # product 만 지목
        if "@product 입니다" in system:
            calls.add("product")
            return "product 보고"
        if "@implementer 입니다" in system:
            calls.add("implementer")
            return "impl 보고"
        return "..."

    team = P2PTeam(agents=["product", "implementer"], backend=fake, max_calls=10)
    team.run("작업")
    assert calls == {"product"}  # implementer 는 지목되지 않아 미호출


def test_peer_mention_routes_specialist_to_specialist() -> None:
    calls: set[str] = set()

    def fake(system: str, prompt: str) -> str:
        if "통합" in prompt:
            return "통합결과"
        if "@team-lead 입니다" in system:
            return "@product 시작"
        if "@product 입니다" in system:
            calls.add("product")
            return "초안입니다 @reviewer 검토 부탁"  # 동료 직접 호출
        if "@reviewer 입니다" in system:
            calls.add("reviewer")
            return "검토 완료"
        return "..."

    team = P2PTeam(agents=["product", "reviewer"], backend=fake, max_calls=10)
    team.run("작업")
    assert "reviewer" in calls  # product 가 reviewer 를 직접 호출


def test_route_filters_self_and_unknown() -> None:
    team = P2PTeam(agents=["product", "reviewer"], backend=lambda s, p: "")
    team.agents = ["product", "reviewer"]
    targets = team._route("@reviewer 봐줘 @nobody @product", sender="product")
    assert targets == ["reviewer"]  # 자기 자신(product)·미등록(nobody) 제외


def test_invalid_agents() -> None:
    team = P2PTeam(agents=["nope"], backend=lambda s, p: "x")
    assert "유효한 직군이 없습니다" in team.run("작업")


def test_main_no_task() -> None:
    assert p2p.main(["--agents", "product"]) == 2
