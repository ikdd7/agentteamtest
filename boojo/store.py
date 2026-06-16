"""부조 데이터 저장소 — 코호트별 익명 금액 누적(JSON 파일, 외부 DB 불필요).

코호트 = 경조사×관계×친밀도×식대×참석. 사람들이 판정받으며 남긴 금액이 여기 쌓여
평균/분포가 점점 정밀해진다(데이터 해자).
"""

from __future__ import annotations

import json
import os
import threading

from .index import cohort_key


class Store:
    def __init__(self, path: str = "boojo_data.json") -> None:
        self.path = path
        self._lock = threading.Lock()
        self._data: dict[str, list[int]] = {}
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    self._data = json.load(f)
            except (json.JSONDecodeError, OSError):
                self._data = {}

    def amounts(self, event: str, relation: str, intimacy: int, meal: str, attended: str) -> list[int]:
        return list(self._data.get(cohort_key(event, relation, intimacy, meal, attended), []))

    def add(self, event: str, relation: str, intimacy: int, meal: str, attended: str, amount: int) -> int:
        """익명 금액 1건 추가 → 해당 코호트 표본 수 반환."""
        key = cohort_key(event, relation, intimacy, meal, attended)
        with self._lock:
            self._data.setdefault(key, []).append(int(amount))
            self._flush()
            return len(self._data[key])

    def total(self) -> int:
        return sum(len(v) for v in self._data.values())

    def _flush(self) -> None:
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self._data, f, ensure_ascii=False)
        os.replace(tmp, self.path)
