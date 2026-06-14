"""API 키 없이 구독(Claude Max/Pro)으로 도는 멀티에이전트 팀.

Anthropic SDK 대신 로컬에 설치된 `claude` CLI 를 `-p`(비대화) 모드로 호출한다.
인증은 CLI 에 로그인된 구독 계정을 그대로 사용하므로 ANTHROPIC_API_KEY 가
필요 없다.

흐름(코디네이터 → 위임 → 종합):
  1. 코디네이터가 작업을 보고 어느 직군에 무엇을 맡길지 JSON 으로 계획한다.
  2. 각 전문 에이전트를 `claude -p --append-system-prompt <페르소나>` 로 실행한다.
     (독립 작업은 스레드로 병렬 실행)
  3. 코디네이터가 결과를 종합해 최종 답변을 만든다.

사용법:
    python -m multiagent.cli_team "할 일 앱을 전 직군이 협업해 기획·구현해줘"
    python -m multiagent.cli_team --agents product,ux,marketer "랜딩페이지 만들기"
    python -m multiagent.cli_team --model opus "..."
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from .agents import TEAM

# 구독 플랜에서 보편적으로 쓸 수 있는 모델을 기본값으로 둔다(스크린샷의 Max=Sonnet).
DEFAULT_CLI_MODEL = "sonnet"


def _build_cmd(system: str, prompt: str, model: str) -> list[str]:
    """claude CLI 호출 커맨드를 구성한다(테스트 용이하도록 분리)."""
    return [
        "claude",
        "-p",
        "--model",
        model,
        "--append-system-prompt",
        system,
        prompt,
    ]


def _run_claude(system: str, prompt: str, model: str, timeout: int = 600) -> str:
    """claude -p 를 한 번 호출하고 텍스트 결과를 반환한다."""
    try:
        proc = subprocess.run(
            _build_cmd(system, prompt, model),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        return "[오류] claude CLI 를 찾을 수 없습니다. 설치 후 로그인하세요."
    except subprocess.TimeoutExpired:
        return "[오류] 시간 초과"
    out = proc.stdout.strip()
    return out or proc.stderr.strip() or "[빈 응답]"


def _extract_json_array(text: str) -> list[dict] | None:
    """텍스트에서 첫 번째 JSON 배열을 추출해 파싱한다."""
    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, list) else None


# 코디네이터(팀 리드) 페르소나.
_COORDINATOR_SYSTEM = (
    "당신은 전사 에이전트 팀의 팀 리드입니다. 사용자의 작업을 직접 수행하지 말고, "
    "어느 직군에게 무엇을 맡길지 계획만 세웁니다.\n\n"
    "사용 가능한 직군:\n"
    + "\n".join(f"- {a.name}: {a.description}" for a in TEAM.values())
)

_PLAN_INSTRUCTION = (
    "위 작업을 수행할 팀을 구성하세요. 적합한 직군만 고르고, 각자에게 줄 구체적인 "
    "하위 작업을 정합니다.\n"
    'JSON 배열로만 출력하세요(설명 금지): [{"agent": "직군이름", "task": "하위작업"}]'
)


@dataclass
class CLITeam:
    """`claude` CLI 를 백엔드로 쓰는 구독 기반 멀티에이전트 팀."""

    model: str = DEFAULT_CLI_MODEL
    max_parallel: int = 4
    on_event: object = None  # Callable[[str, dict], None] | None

    def _emit(self, kind: str, info: dict) -> None:
        if callable(self.on_event):
            self.on_event(kind, info)

    def plan(self, task: str) -> list[dict]:
        """코디네이터에게 팀 구성 계획을 받아 (agent, task) 목록으로 반환한다."""
        self._emit("plan_start", {"task": task})
        raw = _run_claude(
            _COORDINATOR_SYSTEM,
            f"## 작업\n{task}\n\n{_PLAN_INSTRUCTION}",
            self.model,
        )
        plan = _extract_json_array(raw) or []
        # 알 수 없는 직군은 거른다.
        plan = [p for p in plan if isinstance(p, dict) and p.get("agent") in TEAM]
        self._emit("plan_done", {"plan": plan})
        return plan

    def run_specialist(self, agent_name: str, task: str) -> str:
        """전문 에이전트 한 명을 claude -p 로 실행한다."""
        agent = TEAM[agent_name]
        self._emit("agent_start", {"agent": agent_name, "task": task})
        result = _run_claude(agent.system, task, self.model)
        self._emit("agent_done", {"agent": agent_name})
        return result

    def run(self, task: str, agents: list[str] | None = None) -> str:
        """작업을 받아 팀을 가동하고 최종 종합 답변을 반환한다.

        agents 를 주면 그 직군에게 동일 작업을 위임하고, 없으면 코디네이터가
        팀을 구성한다.
        """
        if agents:
            plan = [{"agent": a, "task": task} for a in agents if a in TEAM]
        else:
            plan = self.plan(task)

        if not plan:
            return "[팀 구성 실패] 적합한 직군을 찾지 못했습니다. --agents 로 직접 지정하세요."

        # 전문 에이전트 병렬 실행.
        results: list[tuple[str, str]] = []
        with ThreadPoolExecutor(max_workers=self.max_parallel) as pool:
            futures = {
                pool.submit(self.run_specialist, p["agent"], p["task"]): p["agent"]
                for p in plan
            }
            for fut in futures:
                results.append((futures[fut], fut.result()))

        # 코디네이터 종합.
        self._emit("synth_start", {"count": len(results)})
        digest = "\n\n".join(f"### [{name}]\n{out}" for name, out in results)
        final = _run_claude(
            _COORDINATOR_SYSTEM,
            f"## 원 작업\n{task}\n\n## 각 직군 산출물\n{digest}\n\n"
            "위 산출물을 통합해 사용자에게 줄 최종 결과를 작성하세요.",
            self.model,
        )
        self._emit("synth_done", {})
        return final


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    model = DEFAULT_CLI_MODEL
    agents: list[str] | None = None

    # 아주 단순한 인자 파싱.
    rest: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--model" and i + 1 < len(argv):
            model, i = argv[i + 1], i + 2
        elif argv[i] == "--agents" and i + 1 < len(argv):
            agents, i = [a.strip() for a in argv[i + 1].split(",")], i + 2
        else:
            rest.append(argv[i])
            i += 1

    task = " ".join(rest).strip()
    if not task:
        print(__doc__)
        return 2

    def log(kind: str, info: dict) -> None:
        if kind == "plan_done":
            picks = ", ".join(p["agent"] for p in info["plan"]) or "(없음)"
            print(f"  팀 구성: {picks}", file=sys.stderr)
        elif kind == "agent_start":
            print(f"  → [{info['agent']}] 작업 중...", file=sys.stderr)
        elif kind == "synth_start":
            print(f"  종합 중 ({info['count']}개 산출물)...", file=sys.stderr)

    print("구독 기반 팀 가동 중 (claude CLI, API 미사용)...\n", file=sys.stderr)
    team = CLITeam(model=model, on_event=log)
    print(team.run(task, agents=agents))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
