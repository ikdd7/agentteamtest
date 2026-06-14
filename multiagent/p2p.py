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
        "보고를 모아 최종 결과를 만드는 팀 리드입니다.\n"
        f"팀원: {', '.join('@' + p for p in peers)}.\n"
        "- 산출물을 직접 작성하지 마세요. 그건 팀원의 일입니다. 당신은 분배와 "
        "통합만 합니다.\n"
        "- 첫 응답에서는 절대 FINAL 을 쓰지 말고, 작업을 나눠 담당 팀원들을 "
        "@멘션해 한 번에 지시하세요(각 팀원에게 구체적 하위작업).\n"
        "- 팀원의 보고를 받으면 검토하고, 필요하면 추가로 @멘션해 보완을 요청하세요.\n"
        "- 아직 보고하지 않은 팀원이 있으면 FINAL 을 쓰지 마세요. 모든 담당 팀원의 "
        "보고가 모였을 때만 마지막에 'FINAL:' 줄로 통합 결과를 작성하세요.\n"
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
        reports: dict[str, str] = {}  # 직군 -> 최신 산출물
        budget = self.max_calls

        # 마지막 1회는 리드 종합에 예약한다.
        while queue and budget > 1:
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

            if msg.to == LEAD:
                # 리드는 산출물을 직접 쓰지 못한다. 응답에서 담당자를 뽑아
                # 위임하고, 지목이 없으면 전 직군에 강제 팬아웃한다.
                spec = [t for t in self._route(response, LEAD) if t in roster]
                if not spec:
                    spec = list(roster)
                for t in spec:
                    queue.append(Message(to=t, frm=LEAD, content=task))
                continue

            # 전문 에이전트: 산출물을 보고로 기록하고, @멘션한 동료에게 전달.
            reports[msg.to] = response
            for t in self._route(response, sender=msg.to):
                if t in roster:
                    queue.append(Message(to=t, frm=msg.to, content=response))

        if not reports:
            return "[종료] 산출물 없음."

        # 리드 종합 (보고를 통합해 최종 결과 작성).
        self._emit("synth_start", {"count": len(reports)})
        digest = "\n\n".join(f"### [{n}]\n{t}" for n, t in reports.items())
        synth_system = (
            f"당신은 @{LEAD} 입니다. 팀원들의 보고를 하나의 문서로 통합합니다. "
            "각 직군의 실제 산출물(PRD·플로우·색상값·코드·슬로건 등)은 요약하지 "
            "말고 본문을 보존해 직군별 섹션으로 정리하고, 맨 끝에만 한두 줄의 통합 "
            "코멘트를 답니다."
        )
        final = self._call(
            synth_system,
            f"## 원 작업\n{task}\n\n## 각 직군 보고\n{digest}\n\n"
            "위 보고를 직군별 섹션으로 보존해 하나의 통합 문서로 작성하세요. "
            "코드·색상값·플로우 단계 등 산출물 본문을 누락하지 마세요.",
        )
        self._emit("synth_done", {})
        return final


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
        elif kind == "respond":
            snippet = " ".join(info["text"].split())[:140]
            print(f"      [{info['frm']}] {snippet}…", file=sys.stderr)
        elif kind == "synth_start":
            print(f"  team-lead: 종합 ({info['count']}개 보고)", file=sys.stderr)

    print(f"peer-to-peer 팀 가동 (구독 CLI, API 미사용) — 팀원: {', '.join(agents)}\n",
          file=sys.stderr)
    team = P2PTeam(agents=agents, model=model, max_calls=max_calls, on_event=log)
    print(team.run(task))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
