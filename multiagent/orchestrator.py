"""코디네이터 기반 멀티에이전트 오케스트레이션.

코디네이터 에이전트는 `delegate` 도구를 통해 전문 에이전트에게 하위 작업을
위임한다. 하네스(이 모듈)가 도구 호출을 받아 해당 전문 에이전트를 별도의
Claude 호출로 실행하고, 결과를 코디네이터에게 돌려준다. 코디네이터는 더 위임할
일이 없으면 최종 종합 답변을 내놓는다.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import anthropic

from .agents import DEFAULT_MODEL, TEAM, Agent

# 코디네이터 시스템 프롬프트. 위임 전략을 안내한다.
COORDINATOR_SYSTEM = (
    "당신은 개발/분석 에이전트 팀의 코디네이터입니다. 사용자의 작업을 직접 "
    "수행하지 말고, 적절한 전문 에이전트에게 `delegate` 도구로 위임하세요.\n"
    "\n"
    "팀 구성:\n"
    + "\n".join(f"- {a.name}: {a.description}" for a in TEAM.values())
    + "\n\n"
    "지침:\n"
    "- 작업을 하위 작업으로 나눠 가장 알맞은 에이전트에게 위임합니다.\n"
    "- 독립적인 하위 작업은 한 번에 여러 개 위임해 병렬로 처리할 수 있습니다.\n"
    "- 한 에이전트의 결과가 다음 위임의 입력이 되면 순서대로 위임합니다.\n"
    "- 모든 위임이 끝나면 결과를 종합해 사용자에게 최종 답변을 작성합니다.\n"
    "- 사소한 단순 질문은 위임 없이 직접 답해도 됩니다."
)

DELEGATE_TOOL = {
    "name": "delegate",
    "description": (
        "전문 에이전트에게 하위 작업을 위임하고 결과를 받습니다. 독립적인 "
        "작업이면 여러 번 호출해 병렬 위임할 수 있습니다."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "agent": {
                "type": "string",
                "enum": list(TEAM.keys()),
                "description": "위임 대상 전문 에이전트 이름",
            },
            "task": {
                "type": "string",
                "description": "해당 에이전트가 수행할 구체적인 하위 작업 설명",
            },
            "context": {
                "type": "string",
                "description": "이전 에이전트 결과 등 필요한 배경 정보(선택)",
            },
        },
        "required": ["agent", "task"],
    },
}


class Orchestrator:
    """전문 에이전트 팀을 지휘하는 코디네이터."""

    def __init__(
        self,
        client: anthropic.Anthropic | None = None,
        model: str = DEFAULT_MODEL,
        max_rounds: int = 12,
        on_event: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> None:
        self.client = client or anthropic.Anthropic()
        self.model = model
        self.max_rounds = max_rounds
        # (이벤트종류, 상세) 콜백 — CLI에서 진행 상황을 출력하는 데 쓴다.
        self.on_event = on_event or (lambda kind, info: None)

    def run_specialist(self, agent: Agent, task: str, context: str = "") -> str:
        """전문 에이전트 한 명을 단발 Claude 호출로 실행한다."""
        self.on_event("delegate_start", {"agent": agent.name, "task": task})
        prompt = task if not context else f"## 배경\n{context}\n\n## 작업\n{task}"
        with self.client.messages.stream(
            model=agent.model,
            max_tokens=8000,
            system=agent.system,
            thinking={"type": "adaptive"},
            output_config={"effort": agent.effort},
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            message = stream.get_final_message()
        result = "".join(b.text for b in message.content if b.type == "text")
        self.on_event("delegate_done", {"agent": agent.name, "result": result})
        return result

    def run(self, task: str) -> str:
        """사용자 작업을 받아 팀을 지휘하고 최종 답변을 반환한다."""
        messages: list[dict[str, Any]] = [{"role": "user", "content": task}]

        for _ in range(self.max_rounds):
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8000,
                system=COORDINATOR_SYSTEM,
                thinking={"type": "adaptive"},
                output_config={"effort": "high"},
                tools=[DELEGATE_TOOL],
                messages=messages,
            )

            if response.stop_reason != "tool_use":
                # 위임이 끝났다 — 코디네이터의 최종 종합 답변.
                return "".join(
                    b.text for b in response.content if b.type == "text"
                )

            messages.append({"role": "assistant", "content": response.content})

            # 이번 턴의 모든 위임을 실행해 결과를 모은다(병렬 위임 지원).
            tool_results = []
            for block in response.content:
                if block.type != "tool_use" or block.name != "delegate":
                    continue
                args = block.input
                agent = TEAM.get(args["agent"])
                if agent is None:
                    result = f"오류: 알 수 없는 에이전트 '{args['agent']}'"
                else:
                    result = self.run_specialist(
                        agent, args["task"], args.get("context", "")
                    )
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    }
                )
            messages.append({"role": "user", "content": tool_results})

        return (
            "최대 위임 횟수에 도달해 종료했습니다. max_rounds를 늘리거나 "
            "작업을 더 작게 나눠 다시 시도하세요."
        )
