"""Agent Checkout Index — 14일 검증 하니스.

"에이전트가 쇼핑몰 체크아웃을 어디까지 통과하나"를 단계별로 측정해, 빌드 전에
핵심 전제("에이전트 결제가 자주 깨진다")를 데이터로 확인하고 첫 리더보드를 만든다.

법적 안전 원칙: 결제 폼 도달까지만 측정(결제 미실행), 차단/실패 분리,
실측은 동의 사이트 한정.
"""

from .funnel import SiteRun, StepResult
from .runner import run_validation
from .scoring import SiteScore, score_sites

__all__ = ["SiteRun", "StepResult", "SiteScore", "score_sites", "run_validation"]
