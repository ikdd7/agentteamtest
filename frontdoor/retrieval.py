"""관련 근거 선택 — 방문자 질문에 줄 페르소나 청크를 고른다.

프로필(이력서/소개)은 보통 짧으므로, 청크가 적으면 **통째로** 근거로 넘긴다
(키워드 검색이 한국어 합성어를 놓치는 문제를 회피). 길 때만 키워드 상위 k.
"""

from __future__ import annotations

import re

from .persona import Persona

_WORD = re.compile(r"[0-9A-Za-z가-힣]+")
SMALL = 12  # 이 이하 청크면 프로필 전체를 근거로 제공


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in _WORD.findall(text) if len(t) > 1}


def retrieve(persona: Persona, query: str, k: int = 4) -> list[str]:
    """질문에 줄 근거 청크. 짧은 프로필은 전체, 길면 키워드 상위 k."""
    if len(persona.chunks) <= SMALL:
        return persona.chunks
    q = _tokens(query)
    if not q:
        return persona.chunks[:k]
    scored = [(len(q & _tokens(c)), c) for c in persona.chunks]
    hits = [c for s, c in sorted(scored, key=lambda x: x[0], reverse=True) if s > 0]
    return hits[:k] or persona.chunks[:k]  # 못 찾아도 앞부분은 제공
