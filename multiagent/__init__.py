"""개발/분석 멀티에이전트 팀.

코디네이터 에이전트가 작업을 분석하고, 전문 에이전트(기획·설계, 구현,
코드 리뷰, 테스트, 분석)에게 delegate 도구로 위임한 뒤 결과를 종합한다.
"""

from .agents import TEAM, Agent
from .orchestrator import Orchestrator

__all__ = ["TEAM", "Agent", "Orchestrator"]
