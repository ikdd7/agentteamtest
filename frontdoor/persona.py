"""AI Front Door — 페르소나(소유자를 학습한 지식) 모델.

이력서/소개/글 텍스트를 받아 청크로 쪼개 보관한다. 방문자 질문이 오면
retrieval 이 관련 청크를 뽑고 llm 이 그걸 근거로 답한다(환각 억제).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Persona:
    """소유자를 학습한 지식 묶음."""

    name: str
    source_text: str
    chunks: list[str] = field(default_factory=list)


def ingest(name: str, text: str) -> Persona:
    """텍스트를 문단/문장 단위 청크로 쪼개 Persona 를 만든다."""
    # 빈 줄 기준 문단 분할 → 너무 길면 문장 단위로 추가 분할.
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    for p in paras:
        if len(p) <= 300:
            chunks.append(p)
        else:
            for sent in re.split(r"(?<=[.!?。])\s+", p):
                if sent.strip():
                    chunks.append(sent.strip())
    return Persona(name=name, source_text=text, chunks=chunks)
