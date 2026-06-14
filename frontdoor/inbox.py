"""소유자 인박스 — 방문자가 남긴 용건(리드)을 쌓는다.

리텐션 앵커: 챗 신기함이 아니라 "누가 무엇을 물었나 / 새 리드"가 매일 쌓여
소유자가 돌아올 이유가 된다.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field


@dataclass
class Lead:
    """방문자가 남긴 용건."""

    name: str
    contact: str
    message: str
    at: str = field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)
        .strftime("%Y-%m-%d %H:%M")
    )


@dataclass
class Inbox:
    leads: list[Lead] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)  # 방문자 질문 로그(관심사 파악)

    def add_lead(self, name: str, contact: str, message: str) -> Lead:
        lead = Lead(name=name, contact=contact, message=message)
        self.leads.append(lead)
        return lead

    def log_question(self, q: str) -> None:
        self.questions.append(q)

    def daily_summary(self) -> str:
        lines = [f"오늘의 관문 요약 — 리드 {len(self.leads)}건 · 질문 {len(self.questions)}건"]
        for ld in self.leads[-5:]:
            lines.append(f"  • [{ld.at}] {ld.name} ({ld.contact}): {ld.message[:60]}")
        if self.questions:
            lines.append("  방문자 관심사(최근): " + " / ".join(self.questions[-5:]))
        return "\n".join(lines)
