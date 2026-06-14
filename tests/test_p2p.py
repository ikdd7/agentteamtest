"""p2p 메시지 라우팅/종료 로직 테스트 (claude CLI 미호출, 가짜 백엔드)."""

from __future__ import annotations

from multiagent import p2p
from multiagent.p2p import P2PTeam


def test_mention_routing_and_final() -> None:
    state = {"lead": 0}

    def fake(system: str, prompt: str) -> str:
        if "@team-lead 입니다" in system:
            state["lead"] += 1
            if state["lead"] == 1:
                return "@implementer 구현 부탁해"
            return "FINAL: 완성된 결과물"
        if "@implementer 입니다" in system:
            return "구현 완료했습니다. 보고합니다."  # 멘션 없음 → 리드로 보고
        return "..."

    team = P2PTeam(agents=["implementer"], backend=fake, max_calls=10)
    out = team.run("간단한 함수 구현")
    assert out == "완성된 결과물"
    assert state["lead"] == 2  # 분배 1회 + FINAL 1회


def test_route_filters_self_and_unknown() -> None:
    team = P2PTeam(agents=["product", "reviewer"], backend=lambda s, p: "")
    team.agents = ["product", "reviewer"]
    targets = team._route("@reviewer 봐줘 @nobody @product", sender="product")
    assert targets == ["reviewer"]  # 자기 자신(product)·미등록(nobody) 제외


def test_budget_exhaustion_returns_lead_last() -> None:
    # 리드가 계속 @product 만 호출해 핑퐁 → 예산 소진.
    def fake(system: str, prompt: str) -> str:
        if "@team-lead 입니다" in system:
            return "@product 더 해줘"
        return "@team-lead 진행 보고"

    team = P2PTeam(agents=["product"], backend=fake, max_calls=3)
    out = team.run("작업")
    assert out  # FINAL 없이도 무언가 반환
    assert "[종료]" not in out  # 리드 발화가 있으므로 종료 메시지는 아님


def test_invalid_agents() -> None:
    team = P2PTeam(agents=["nope"], backend=lambda s, p: "x")
    assert "유효한 직군이 없습니다" in team.run("작업")


def test_main_no_task(capsys) -> None:
    rc = p2p.main(["--agents", "product"])
    assert rc == 2
