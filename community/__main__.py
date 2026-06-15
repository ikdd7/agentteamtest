"""커뮤니티 빈 시장 점수 스케줄러 CLI (LLM 미사용).

사용법:
    python -m community                          # 리더보드를 stdout에 출력
    python -m community --out FILE.md            # 마크다운 저장(+ .csv 동시 저장)
    python -m community --history FILE.csv       # 실행 스냅샷을 history에 누적
    python -m community --json                   # JSON으로 출력(랭킹+총점)
    python -m community --scores my.json         # 외부 점수표로 덮어쓰기
    python -m community --top N                  # 상위 N개만

GitHub Actions 크론이 `--out`과 `--history`를 함께 줘서 주기적으로 리더보드를
갱신하고 시계열을 누적한다. 네트워크/LLM 호출이 없으므로 실행마다 비용 0.
"""

from __future__ import annotations

import json
import sys

from .candidates import CANDIDATES
from .report import append_history, to_csv, to_markdown, utc_stamp
from .scoring import rank


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    out_path: str | None = None
    history_path: str | None = None
    scores_path: str | None = None
    as_json = False
    top: int | None = None

    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--out" and i + 1 < len(argv):
            out_path, i = argv[i + 1], i + 2
        elif a == "--history" and i + 1 < len(argv):
            history_path, i = argv[i + 1], i + 2
        elif a == "--scores" and i + 1 < len(argv):
            scores_path, i = argv[i + 1], i + 2
        elif a == "--top" and i + 1 < len(argv):
            top, i = int(argv[i + 1]), i + 2
        elif a == "--json":
            as_json, i = True, i + 1
        elif a in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            print(f"알 수 없는 인자: {a}", file=sys.stderr)
            return 2

    candidates = CANDIDATES
    if scores_path:
        with open(scores_path, encoding="utf-8") as f:
            candidates = json.load(f)

    ranked = rank(candidates)
    if top is not None:
        ranked = ranked[:top]

    stamp = utc_stamp()

    if as_json:
        payload = {
            "updated": stamp,
            "ranking": [
                {"rank": idx, "key": c.key, "name": c.name,
                 "type": c.type, "total": c.total, "scores": c.scores}
                for idx, c in enumerate(ranked, 1)
            ],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    md = to_markdown(ranked, stamp=stamp)

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(md + "\n")
        csv_path = out_path.rsplit(".", 1)[0] + ".csv"
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(to_csv(ranked))
        print(f"저장: {out_path}, {csv_path}", file=sys.stderr)
    else:
        print(md)

    if history_path:
        append_history(history_path, ranked, stamp=stamp)
        print(f"history 누적: {history_path}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
