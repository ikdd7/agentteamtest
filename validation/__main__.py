"""검증 하니스 CLI.

사용법:
    python -m validation                      # mock 데모(샘플 사이트, 네트워크 0)
    python -m validation --out report.md      # 리더보드를 파일로 저장(+ .csv)
    python -m validation --driver playwright --sites my_sites.json   # 실측(본인 PC)
    python -m validation --sites my_sites.json                       # mock + 내 사이트

sites.json 형식: [{"name": "...", "url": "https://...", "query": "검색어"}, ...]
실측(playwright)은 동의/약관 확인 사이트에 한해, 결제 폼 도달까지만 수행됩니다.
"""

from __future__ import annotations

import json
import sys

from .driver import get_driver
from .report import to_csv, to_markdown
from .runner import run_validation
from .sites import SAMPLE_SITES


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    driver_name = "mock"
    sites_path: str | None = None
    out_path: str | None = None
    html_path: str | None = None

    i = 0
    while i < len(argv):
        if argv[i] == "--driver" and i + 1 < len(argv):
            driver_name, i = argv[i + 1], i + 2
        elif argv[i] == "--sites" and i + 1 < len(argv):
            sites_path, i = argv[i + 1], i + 2
        elif argv[i] == "--out" and i + 1 < len(argv):
            out_path, i = argv[i + 1], i + 2
        elif argv[i] == "--html" and i + 1 < len(argv):
            html_path, i = argv[i + 1], i + 2
        elif argv[i] in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            print(f"알 수 없는 인자: {argv[i]}", file=sys.stderr)
            return 2

    if sites_path:
        with open(sites_path, encoding="utf-8") as f:
            sites = json.load(f)
    else:
        sites = SAMPLE_SITES

    demo = driver_name == "mock"
    if demo:
        print("※ mock 데모입니다 — 실측 아님. 실제 측정은 --driver playwright (본인 PC).",
              file=sys.stderr)

    def log(kind: str, info: dict) -> None:
        if kind == "run_done":
            print(f"  {info['site']:24} [{info['agent']:20}] "
                  f"{info['outcome']:14} {info['reach']}%", file=sys.stderr)

    print(f"검증 주행 시작 (driver={driver_name}, 사이트 {len(sites)}곳)...\n", file=sys.stderr)
    scores = run_validation(sites, get_driver(driver_name), on_event=log)

    md = to_markdown(scores, demo=demo)
    print("\n" + md)

    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(md + "\n")
        csv_path = out_path.rsplit(".", 1)[0] + ".csv"
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(to_csv(scores))
        print(f"\n저장: {out_path}, {csv_path}", file=sys.stderr)

    if html_path:
        from .leaderboard import to_html
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(to_html(scores, demo=demo))
        print(f"리더보드 HTML 저장: {html_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
