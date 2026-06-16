"""부조(호구지수) 코어 — judge(판정) + record(데이터 누적)를 묶는다."""

from __future__ import annotations

from dataclasses import dataclass

from .index import Verdict
from .index import judge as _judge
from .store import Store

# 공유 카드 푸터 = 바이럴 루프(사용=노출).
ATTRIBUTION = "내 호구지수 판정받기 → 부조"


@dataclass
class Boojo:
    store: Store

    @classmethod
    def create(cls, path: str = "boojo_data.json") -> Boojo:
        return cls(store=Store(path))

    def judge(
        self, event: str, relation: str, intimacy: int, meal: str, attended: str, amount: int
    ) -> Verdict:
        """현재까지 누적된 또래 데이터로 호구지수를 판정(저장하지 않음)."""
        real = self.store.amounts(event, relation, intimacy, meal, attended)
        return _judge(event, relation, intimacy, meal, attended, amount, real)

    def record(
        self, event: str, relation: str, intimacy: int, meal: str, attended: str, amount: int
    ) -> int:
        """익명 금액을 코호트에 누적 → 표본 수 반환(데이터 해자가 두꺼워짐)."""
        return self.store.add(event, relation, intimacy, meal, attended, amount)

    def total(self) -> int:
        return self.store.total()
