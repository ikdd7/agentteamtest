"""Peer-to-peer 멀티에이전트 — 에이전트끼리 @멘션으로 직접 대화한다.

스크린샷의 팀처럼 team-lead 와 전문 에이전트들이 서로 메시지를 주고받는다.
각 에이전트는 자기 대화 히스토리를 가지며, 응답에 `@이름`을 적으면 그 팀원의
받은편지함으로 메시지가 라우팅된다. (구독 `claude` CLI 백엔드, API 키 미사용)

상태 없는 `claude -p` 위에 액터 모델을 얹는다:
- 메시지 큐 = (받는이, 보낸이, 내용)
- 활성화된 에이전트는 자기 히스토리 + 새 메시지를 보고 응답한다.
- 응답 속 @멘션을 파싱해 해당 팀원에게 새 메시지를 큐에 넣는다.
- 멘션이 없으면 team-lead 에게 보고가 올라간다.
- team-lead 가 'FINAL:' 로 시작하는 줄을 내면 종료(또는 호출 예산 소진 시).

사용법:
    python -m multiagent.p2p --agents product,implementer,reviewer "할 일 앱 만들기"
    python -m multiagent.p2p --max-calls 8 --model sonnet "..."
"""

from __future__ import annotations

import re
import sys
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field

from .agents import TEAM
from .cli_team import DEFAULT_CLI_MODEL, _run_claude

LEAD = "team-lead"

# @이름 멘션 추출용.
_MENTION_RE = re.compile(r"@([a-zA-Z][a-zA-Z\-]*)")


def _lead_system(peers: list[str]) -> str:
    return (
        f"당신은 @{LEAD} 입니다. 사용자의 작업을 팀원에게 분배하고, 팀원들의 "
        "산출물을 모아 최종 결과를 만드는 팀 리드입니다.\n"
        f"팀원: {', '.join('@' + p for p in peers)}.\n"
        "- 처음에는 작업을 쪼개 알맞은 팀원을 @멘션으로 호출해 지시하세요.\n"
        "- 팀원의 보고를 받으면 검토하고, 필요하면 추가로 @멘션해 보완을 요청하세요.\n"
        "- 모든 산출물이 충분하면 마지막에 'FINAL:' 로 시작하는 줄에 사용자에게 "
        "줄 최종 결과를 작성하세요(그때만 FINAL 사용).\n"
        "- 간결하게 쓰세요."
    )


def _agent_system(name: str, peers: list[str]) -> str:
    others = [p for p in peers if p != name] + [LEAD]
    return (
        f"{TEAM[name].system}\n\n"
        f"[협업 프로토콜] 당신은 @{name} 입니다. 팀원과 메시지로 협업합니다.\n"
        f"- 대화 가능한 팀원: {', '.join('@' + p for p in others)}.\n"
        "- 다른 팀원에게 말하려면 메시지에 @<이름>을 적으세요.\n"
        "- 받은 메시지에 자기 직군 관점으로 답하고, 필요하면 팀원에게 질문/위임하세요.\n"
        "- 보고할 대상이 없으면 @team-lead 에게 결과를 보고하세요.\n"
        "- 간결하게, 자기 직군 범위에 집중하세요."
    )


@dataclass
class Message:
    to: str
    frm: str
    content: str


@dataclass
class P2PTeam:
    """@멘션으로 협업하는 peer-to-peer 에이전트 팀."""

    agents: list[str]
    model: str = DEFAULT_CLI_MODEL
    max_calls: int = 10
    # backend(system, prompt) -> str. 기본은 구독 claude CLI.
    backend: Callable[[str, str], str] | None = None
    on_event: Callable[[str, dict], None] | None = None
    _history: dict[str, list[str]] = field(default_factory=dict)

    def _call(self, system: str, prompt: str) -> str:
        if self.backend is not None:
            return self.backend(system, prompt)
        return _run_claude(system, prompt, self.model)

    def _emit(self, kind: str, info: dict) -> None:
        if callable(self.on_event):
            self.on_event(kind, info)

    def _system_for(self, name: str) -> str:
        return _lead_system(self.agents) if name == LEAD else _agent_system(name, self.agents)

    def _route(self, response: str, sender: str) -> list[str]:
        """응답 속 @멘션을 팀 내 유효한 수신자 목록으로 변환한다."""
        valid = set(self.agents) | {LEAD}
        targets: list[str] = []
        for m in _MENTION_RE.findall(response):
            if m in valid and m != sender and m not in targets:
                targets.append(m)
        return targets

    def run(self, task: str) -> str:
        roster = [a for a in self.agents if a in TEAM]
        if not roster:
            return "[실패] 유효한 직군이 없습니다. --agents 로 지정하세요."
        self.agents = roster
        self._history = {name: [] for name in [*roster, LEAD]}

        queue: deque[Message] = deque([Message(to=LEAD, frm="user", content=task)])
        budget = self.max_calls
        final = ""

        while queue and budget > 0:
            msg = queue.popleft()
            if msg.to not in self._history:
                continue
            budget -= 1
            self._emit("activate", {"to": msg.to, "frm": msg.frm, "budget": budget})

            hist = self._history[msg.to]
            convo = "\n".join(hist[-6:])  # 최근 맥락만 유지
            prompt = (
                (f"## 지금까지의 내 작업 맥락\n{convo}\n\n" if convo else "")
                + f"## @{msg.frm} 가 당신에게 보낸 메시지\n{msg.content}\n\n"
                "위 메시지에 응답하세요."
            )
            response = self._call(self._system_for(msg.to), prompt)
            hist.append(f"[받음 from @{msg.frm}] {msg.content}")
            hist.append(f"[내 응답] {response}")
            self._emit("respond", {"frm": msg.to, "text": response})

            # team-lead 의 FINAL 종료.
            if msg.to == LEAD:
                fmatch = re.search(r"FINAL:\s*(.*)", response, re.DOTALL)
                if fmatch:
                    final = fmatch.group(1).strip()
                    self._emit("final", {})
                    break

            # @멘션 라우팅.
            targets = self._route(response, sender=msg.to)
            if targets:
                for t in targets:
                    queue.append(Message(to=t, frm=msg.to, content=response))
            elif msg.to != LEAD:
                # 멘션이 없으면 리드에게 보고가 올라간다.
                queue.append(Message(to=LEAD, frm=msg.to, content=response))

        if final:
            return final
        # 예산 소진 등으로 FINAL 없이 끝났으면 리드의 마지막 발화를 반환.
        lead_hist = self._history.get(LEAD, [])
        return lead_hist[-1].replace("[내 응답] ", "") if lead_hist else "[종료] 산출물 없음."


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    model = DEFAULT_CLI_MODEL
    agents = ["product", "implementer", "reviewer"]
    max_calls = 10
    rest: list[str] = []

    i = 0
    while i < len(argv):
        if argv[i] == "--model" and i + 1 < len(argv):
            model, i = argv[i + 1], i + 2
        elif argv[i] == "--agents" and i + 1 < len(argv):
            agents, i = [a.strip() for a in argv[i + 1].split(",")], i + 2
        elif argv[i] == "--max-calls" and i + 1 < len(argv):
            max_calls, i = int(argv[i + 1]), i + 2
        else:
            rest.append(argv[i])
            i += 1

    task = " ".join(rest).strip()
    if not task:
        print(__doc__)
        return 2

    def log(kind: str, info: dict) -> None:
        if kind == "activate":
            print(f"  @{info['frm']} → @{info['to']}  (남은 호출 {info['budget']})",
                  file=sys.stderr)
        elif kind == "final":
            print("  team-lead: FINAL 종합", file=sys.stderr)

    print(f"peer-to-peer 팀 가동 (구독 CLI, API 미사용) — 팀원: {', '.join(agents)}\n",
          file=sys.stderr)
    team = P2PTeam(agents=agents, model=model, max_calls=max_calls, on_event=log)
    print(team.run(task))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
