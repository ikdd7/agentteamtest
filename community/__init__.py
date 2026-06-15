"""독립 커뮤니티 '빈 시장' 점수화 스케줄러.

LLM을 사용하지 않는 **결정론적** 점수 엔진이다. 리서치로 확정한 후보별
세부지표(0~10)를 데이터로 보관하고, 10개 지표 × 가중치를 합산해 100점 만점
리더보드를 만든다. GitHub Actions 크론이 주기적으로 `python -m community`를
돌려 리더보드를 갱신하고, 실행 시각별 총점을 history.csv에 누적한다.

네트워크/LLM 호출이 전혀 없으므로 실행마다 비용이 0이며 재현 가능하다.
"""

from __future__ import annotations

from .metrics import METRICS, total_weight
from .scoring import CandidateScore, rank

__all__ = ["METRICS", "total_weight", "CandidateScore", "rank"]
