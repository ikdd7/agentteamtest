"""LLM을 쓰지 않는 로컬 도구 기반 에이전트 팀.

각 전문 에이전트는 Claude 호출 대신 결정론적인 로컬 도구로 실제 작업을
수행한다. API 키 없이 바로 동작한다.

사용법:
    python -m multiagent.local analyst <경로>
    python -m multiagent.local reviewer <경로>
    python -m multiagent.local tester <경로>
    python -m multiagent.local planner "<작업 설명>"
    python -m multiagent.local implementer <새_파일_경로.py>
    python -m multiagent.local all <경로>      # analyst+reviewer+tester 종합
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

# 코드베이스를 훑을 때 건너뛸 디렉터리.
SKIP_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules", ".mypy_cache"}


def _iter_files(root: Path):
    """root 아래의 파일을 SKIP_DIRS를 제외하고 순회한다."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            yield Path(dirpath) / name


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# analyst — 파일/언어 통계, 라인 수, TODO 스캔
# ---------------------------------------------------------------------------

def analyst(target: str) -> str:
    root = Path(target)
    if not root.exists():
        return f"[analyst] 경로 없음: {target}"

    files = [f for f in _iter_files(root)] if root.is_dir() else [root]
    by_ext: Counter[str] = Counter()
    lines_by_ext: Counter[str] = Counter()
    total_lines = 0
    todos: list[str] = []
    sizes: list[tuple[int, Path]] = []

    todo_re = re.compile(r"\b(TODO|FIXME|XXX|HACK)\b")
    for f in files:
        ext = f.suffix or "(없음)"
        by_ext[ext] += 1
        try:
            text = _read(f)
        except OSError:
            continue
        n = text.count("\n") + 1
        lines_by_ext[ext] += n
        total_lines += n
        sizes.append((n, f))
        for i, line in enumerate(text.splitlines(), 1):
            if todo_re.search(line):
                todos.append(f"  {f}:{i}: {line.strip()[:80]}")

    out = ["[analyst] 코드베이스 분석", "=" * 40]
    out.append(f"파일 수: {len(files)}  /  총 라인: {total_lines}")
    out.append("\n언어(확장자)별 분포:")
    for ext, cnt in by_ext.most_common():
        out.append(f"  {ext:12} {cnt:4}개  {lines_by_ext[ext]:6} 라인")
    out.append("\n가장 큰 파일 Top 5:")
    for n, f in sorted(sizes, reverse=True)[:5]:
        out.append(f"  {n:6} 라인  {f}")
    out.append(f"\nTODO/FIXME/XXX/HACK: {len(todos)}건")
    out.extend(todos[:20])
    return "\n".join(out)


# ---------------------------------------------------------------------------
# reviewer — ruff가 있으면 사용, 없으면 내장 규칙으로 정적 점검
# ---------------------------------------------------------------------------

# (정규식, 심각도, 설명)
_BUILTIN_RULES = [
    (re.compile(r"except\s*:"), "높음", "bare except — 구체적 예외를 지정하세요"),
    (re.compile(r"def\s+\w+\([^)]*=\s*(\[\]|\{\})"), "높음", "가변 기본 인자"),
    (re.compile(r"[!=]=\s*None"), "중간", "None 비교는 'is'/'is not'를 쓰세요"),
    (re.compile(r"\bprint\("), "낮음", "print 문 (디버그 잔재일 수 있음)"),
]


def _builtin_review(py_files: list[Path]) -> str:
    findings: list[tuple[str, str]] = []  # (심각도, 메시지)
    for f in py_files:
        try:
            text = _read(f)
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if line.lstrip().startswith("#"):
                continue
            if len(line) > 100:
                findings.append(("낮음", f"{f}:{i}: 라인 길이 {len(line)} > 100"))
            for rx, sev, desc in _BUILTIN_RULES:
                if rx.search(line):
                    findings.append((sev, f"{f}:{i}: {desc}"))

    order = {"높음": 0, "중간": 1, "낮음": 2}
    findings.sort(key=lambda x: order[x[0]])
    out = ["[reviewer] 내장 정적 점검 (ruff 미설치)", "=" * 40]
    if not findings:
        out.append("발견된 이슈 없음.")
    else:
        out.append(f"총 {len(findings)}건:")
        out += [f"  [{sev}] {msg}" for sev, msg in findings[:60]]
    return "\n".join(out)


def reviewer(target: str) -> str:
    root = Path(target)
    if not root.exists():
        return f"[reviewer] 경로 없음: {target}"
    py_files = (
        [root] if root.is_file() and root.suffix == ".py"
        else [f for f in _iter_files(root) if f.suffix == ".py"]
    )
    if not py_files:
        return "[reviewer] 점검할 .py 파일이 없습니다."

    # ruff가 있으면 우선 사용.
    try:
        proc = subprocess.run(
            ["ruff", "check", str(root)],
            capture_output=True, text=True, timeout=120,
        )
        body = (proc.stdout + proc.stderr).strip() or "발견된 이슈 없음."
        return "[reviewer] ruff check\n" + "=" * 40 + "\n" + body
    except (FileNotFoundError, subprocess.SubprocessError):
        return _builtin_review(py_files)


# ---------------------------------------------------------------------------
# tester — pytest가 있고 테스트가 있으면 실행, 없으면 안내
# ---------------------------------------------------------------------------

def tester(target: str) -> str:
    root = Path(target)
    if not root.exists():
        return f"[tester] 경로 없음: {target}"
    test_files = [
        f for f in _iter_files(root)
        if f.suffix == ".py" and (f.name.startswith("test_") or f.name.endswith("_test.py"))
    ]
    out = ["[tester] 테스트 실행", "=" * 40]
    out.append(f"발견된 테스트 파일: {len(test_files)}개")
    if not test_files:
        out.append("테스트 파일이 없습니다. test_*.py 형태로 작성하세요.")
        return "\n".join(out)
    try:
        proc = subprocess.run(
            ["pytest", "-q", str(root)],
            capture_output=True, text=True, timeout=300,
        )
        out.append((proc.stdout + proc.stderr).strip())
    except FileNotFoundError:
        out.append("pytest 미설치: `pip install pytest` 후 다시 실행하세요.")
    except subprocess.SubprocessError as e:
        out.append(f"pytest 실행 오류: {e}")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# planner — 작업 설명을 표준 개발 체크리스트로 변환 (결정론적 템플릿)
# ---------------------------------------------------------------------------

def planner(task: str) -> str:
    task = task.strip() or "(작업 미입력)"
    steps = [
        "요구사항·제약 정리 및 모호한 부분 가정 명시",
        "데이터 모델 / 인터페이스 설계",
        "핵심 로직 구현",
        "엣지 케이스·예외 처리",
        "테스트 작성 (정상/경계/실패 경로)",
        "코드 리뷰 및 정리",
    ]
    out = [f"[planner] 작업 계획: {task}", "=" * 40]
    out += [f"  {i}. [ ] {s}" for i, s in enumerate(steps, 1)]
    out.append("\n핵심 설계 결정(채워 넣기):")
    out += ["  - 결정: ___  / 근거: ___  / 대안: ___" for _ in range(2)]
    return "\n".join(out)


# ---------------------------------------------------------------------------
# implementer — 새 모듈 스캐폴드 생성
# ---------------------------------------------------------------------------

_PY_SCAFFOLD = '''"""{name} 모듈."""

from __future__ import annotations


def main() -> None:
    raise NotImplementedError


if __name__ == "__main__":
    main()
'''


def implementer(target: str) -> str:
    path = Path(target)
    if path.exists():
        return f"[implementer] 이미 존재합니다: {target} (덮어쓰지 않음)"
    if path.suffix != ".py":
        return "[implementer] 현재는 .py 모듈 스캐폴드만 지원합니다."
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_PY_SCAFFOLD.format(name=path.stem), encoding="utf-8")
    return f"[implementer] 스캐폴드 생성: {target}"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

# 경로를 인자로 받는 분석형 에이전트.
_PATH_AGENTS = {"analyst": analyst, "reviewer": reviewer, "tester": tester}
# 자유 문자열/대상 경로를 받는 에이전트.
_ARG_AGENTS = {"planner": planner, "implementer": implementer}


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if not argv:
        print(__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]
    arg = " ".join(rest) if rest else "."

    if cmd == "all":
        for fn in _PATH_AGENTS.values():
            print(fn(arg))
            print()
        return 0
    if cmd in _PATH_AGENTS:
        print(_PATH_AGENTS[cmd](arg))
        return 0
    if cmd in _ARG_AGENTS:
        if not rest:
            print(f"[{cmd}] 인자가 필요합니다.")
            return 2
        print(_ARG_AGENTS[cmd](arg))
        return 0

    print(f"알 수 없는 명령: {cmd}")
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
