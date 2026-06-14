"""AI Front Door — 관문 로직(코어).

방문자 메시지 → 페르소나 근거 검색 → LLM 답변 + attribution(바이럴 루프).
방문자 용건 → 소유자 인박스(리텐션 앵커).
"""

from __future__ import annotations

from dataclasses import dataclass

from .inbox import Inbox, Lead
from .llm import LLM, get_llm
from .persona import Persona, ingest
from .retrieval import retrieve

# 답변 푸터 = "사용=노출" 바이럴 루프(Loom 워터마크 패턴).
ATTRIBUTION = "— 이 답변은 AI Front Door 로 자동 응대됐어요 · 내 관문 만들기 →"


@dataclass
class FrontDoor:
    persona: Persona
    llm: LLM
    inbox: Inbox

    @classmethod
    def create(cls, name: str, profile_text: str, llm: str = "mock") -> FrontDoor:
        return cls(persona=ingest(name, profile_text), llm=get_llm(llm), inbox=Inbox())

    def ask(self, question: str) -> dict[str, str]:
        """방문자 질문에 답하고 관심사를 기록한다. attribution 포함."""
        self.inbox.log_question(question)
        context = retrieve(self.persona, question)
        text = self.llm.answer(question, context, self.persona.name)
        return {"text": text, "attribution": ATTRIBUTION}

    def leave_message(self, name: str, contact: str, message: str) -> Lead:
        """방문자가 용건을 남긴다 → 소유자 인박스에 리드로 쌓임."""
        return self.inbox.add_lead(name, contact, message)

    def owner_digest(self) -> str:
        return self.inbox.daily_summary()
