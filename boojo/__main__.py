"""부조(호구지수) 실행 엔트리.

    python -m boojo                 # 로컬 서버(http://127.0.0.1:8000)
    python -m boojo --port 9000     # 포트 지정
    python -m boojo --demo          # 서버 없이 샘플 판정 출력
"""

from __future__ import annotations

import sys

from .app import Boojo
from .server import serve


def _demo() -> int:
    b = Boojo.create(":memory_demo.json")
    cases = [
        ("결혼", "직장 동료", 2, "일반홀", "참석", 150_000),
        ("결혼", "친구", 4, "일반홀", "참석", 100_000),
        ("결혼", "친한 친구", 5, "호텔·고급", "참석", 100_000),
        ("장례", "직장 동료", 2, "일반홀", "미참석", 50_000),
    ]
    for event, rel, intim, meal, att, amt in cases:
        v = b.judge(event, rel, intim, meal, att, amt)
        print(f"[{event}/{rel}/친밀{intim}/{att}] {amt:,}원 → "
              f"{v.emoji} {v.label} (호구지수 {v.score}) · 적정 {v.fair_low:,}~{v.fair_high:,}원")
        print(f"   \"{v.drip}\"")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if "--demo" in argv:
        return _demo()
    port = 8000
    if "--port" in argv:
        port = int(argv[argv.index("--port") + 1])
    serve(port=port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
