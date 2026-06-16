"""부조(호구지수) — 경조사 적정 금액 판정 + 익명 또래 데이터 누적 네트워크.

핵심 루프: 판정기(바이럴 훅) → 사람들이 판정받으려 입력한 익명 금액이 코호트별로
쌓여 "한국 부조 실데이터" 해자가 된다(부조판 Levels.fyi).

외부 의존성 없음(파이썬 표준 라이브러리만). `python -m boojo` 로 로컬 서버 실행.
"""

from __future__ import annotations

from .app import Boojo

__all__ = ["Boojo"]
