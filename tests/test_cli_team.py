"""cli_team 의 순수 헬퍼 단위 테스트 (claude CLI 를 실제로 호출하지 않음)."""

from __future__ import annotations

from multiagent import cli_team


def test_build_cmd_shape() -> None:
    cmd = cli_team._build_cmd("SYS", "PROMPT", "sonnet")
    assert cmd[0] == "claude"
    assert "-p" in cmd
    assert cmd[cmd.index("--model") + 1] == "sonnet"
    assert cmd[cmd.index("--append-system-prompt") + 1] == "SYS"
    assert cmd[-1] == "PROMPT"  # 프롬프트는 마지막 위치 인자


def test_extract_json_array_ok() -> None:
    text = '설명...\n[{"agent": "product", "task": "PRD"}]\n끝'
    data = cli_team._extract_json_array(text)
    assert data == [{"agent": "product", "task": "PRD"}]


def test_extract_json_array_none() -> None:
    assert cli_team._extract_json_array("JSON 없음") is None
    assert cli_team._extract_json_array("[깨진 json") is None


def test_run_with_explicit_agents_skips_plan(monkeypatch) -> None:
    # claude 호출을 가짜로 대체해 오케스트레이션만 검증.
    calls: list[tuple[str, str]] = []

    def fake_run(system, prompt, model, timeout=600):
        calls.append((system[:8], prompt[:20]))
        return f"결과:{prompt[:10]}"

    monkeypatch.setattr(cli_team, "_run_claude", fake_run)
    team = cli_team.CLITeam()
    out = team.run("랜딩 만들기", agents=["product", "marketer"])
    # product + marketer 2회 + 종합 1회 = 3회 호출
    assert len(calls) == 3
    assert "통합" in out or "결과" in out


def test_run_unknown_agents_returns_message(monkeypatch) -> None:
    monkeypatch.setattr(cli_team, "_run_claude", lambda *a, **k: "x")
    team = cli_team.CLITeam()
    out = team.run("작업", agents=["nope"])
    assert "팀 구성 실패" in out
