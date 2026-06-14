"""AI Front Door — '나에게 연락하려면 반드시 거치는 AI 관문' MVP 코어.

방문자: 페르소나 학습 AI와 대화 → 답변 + attribution(바이럴) / 용건 남기기.
소유자: 리드·질문이 인박스에 쌓임(리텐션 앵커).
"""

from .app import FrontDoor
from .inbox import Inbox, Lead
from .persona import Persona, ingest

__all__ = ["FrontDoor", "Persona", "ingest", "Inbox", "Lead"]
