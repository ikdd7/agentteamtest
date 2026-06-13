"""개발/분석 멀티에이전트 팀.

두 가지 백엔드를 제공한다.
- Orchestrator: 코디네이터가 delegate 도구로 전문 에이전트에 위임하는
  LLM(Claude API) 기반 팀. `anthropic` 패키지가 필요하다.
- multiagent.local: LLM을 쓰지 않는 로컬 도구 기반 팀. stdlib만 필요하다.

로컬 모드를 anthropic 없이도 쓸 수 있도록, anthropic에 의존하는
Orchestrator 는 실제로 접근할 때 지연 임포트한다.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .agents import TEAM, Agent  # anthropic 비의존 — 즉시 임포트 안전

if TYPE_CHECKING:  # 타입 체커용; 런타임 임포트는 하지 않는다
    from .orchestrator import Orchestrator

__all__ = ["TEAM", "Agent", "Orchestrator"]


def __getattr__(name: str):
    """Orchestrator 는 접근 시점에 지연 임포트(anthropic 필요)."""
    if name == "Orchestrator":
        from .orchestrator import Orchestrator

        return Orchestrator
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
