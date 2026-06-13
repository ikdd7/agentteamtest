"""CLI 진입점.

사용법:
    python -m multiagent "결제 모듈을 설계하고 구현한 뒤 리뷰해줘"
    echo "이 코드 분석해줘: ..." | python -m multiagent

ANTHROPIC_API_KEY 환경변수가 필요하다.
"""

from __future__ import annotations

import sys
from typing import Any

from .orchestrator import Orchestrator


def _print_event(kind: str, info: dict[str, Any]) -> None:
    """진행 상황을 stderr로 출력해 결과 출력과 섞이지 않게 한다."""
    if kind == "delegate_start":
        print(f"  → [{info['agent']}] 위임: {info['task'][:80]}", file=sys.stderr)
    elif kind == "delegate_done":
        print(f"  ← [{info['agent']}] 완료", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if argv:
        task = " ".join(argv)
    elif not sys.stdin.isatty():
        task = sys.stdin.read().strip()
    else:
        print('사용법: python -m multiagent "작업 설명"', file=sys.stderr)
        return 2

    if not task:
        print("작업 내용이 비어 있습니다.", file=sys.stderr)
        return 2

    print("팀이 작업을 처리하는 중...\n", file=sys.stderr)
    orchestrator = Orchestrator(on_event=_print_event)
    answer = orchestrator.run(task)
    print("\n" + "=" * 60 + "\n최종 결과\n" + "=" * 60, file=sys.stderr)
    print(answer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
