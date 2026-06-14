"""간단한 키워드 검색 — 방문자 질문에 관련된 페르소나 청크를 뽑는다.

MVP 단계라 임베딩 없이 키워드 겹침으로 충분하다. 실서비스에선 임베딩 RAG 로
교체하되 인터페이스(retrieve)는 유지.
"""

from __future__ import annotations

import re

from .persona import Persona

_WORD = re.compile(r"[0-9A-Za-z가-힣]+")


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in _WORD.findall(text) if len(t) > 1}


def retrieve(persona: Persona, query: str, k: int = 3) -> list[str]:
    """질문과 키워드가 가장 많이 겹치는 청크 k개를 반환한다."""
    q = _tokens(query)
    if not q:
        return persona.chunks[:k]
    scored = [(len(q & _tokens(c)), c) for c in persona.chunks]
    scored = [(s, c) for s, c in scored if s > 0]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:k]]
