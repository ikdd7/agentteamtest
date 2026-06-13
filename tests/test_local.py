"""multiagent.local 의 로컬(LLM 미사용) 에이전트 단위 테스트."""

from __future__ import annotations

from pathlib import Path

from multiagent import local


# --- analyst ---------------------------------------------------------------

def test_analyst_counts_and_todos(tmp_path: Path) -> None:
    (tmp_path / "a.py").write_text("x = 1\n# TODO: 정리\n", encoding="utf-8")
    (tmp_path / "b.md").write_text("# 문서\n내용\n", encoding="utf-8")
    out = local.analyst(str(tmp_path))
    assert "파일 수: 2" in out
    assert ".py" in out and ".md" in out
    assert "TODO/FIXME/XXX/HACK: 1건" in out
    assert "a.py:2" in out  # TODO 위치


def test_analyst_skips_pycache(tmp_path: Path) -> None:
    (tmp_path / "keep.py").write_text("x = 1\n", encoding="utf-8")
    cache = tmp_path / "__pycache__"
    cache.mkdir()
    (cache / "junk.pyc").write_text("ignore\n", encoding="utf-8")
    out = local.analyst(str(tmp_path))
    assert "파일 수: 1" in out


def test_analyst_missing_path() -> None:
    assert "경로 없음" in local.analyst("/nope/does/not/exist")


# --- reviewer (내장 규칙) ---------------------------------------------------

def test_builtin_review_flags_issues(tmp_path: Path) -> None:
    f = tmp_path / "bad.py"
    f.write_text(
        "def g(x=[]):\n"      # 가변 기본 인자 (높음)
        "    try:\n"
        "        pass\n"
        "    except:\n"        # bare except (높음)
        "        pass\n"
        "    if x == None:\n"  # None 비교 (중간)
        "        return\n",
        encoding="utf-8",
    )
    out = local._builtin_review([f])
    assert "bare except" in out
    assert "가변 기본 인자" in out
    assert "None 비교" in out
    assert "[높음]" in out and "[중간]" in out


def test_builtin_review_clean(tmp_path: Path) -> None:
    f = tmp_path / "ok.py"
    f.write_text("def g(x: int) -> int:\n    return x + 1\n", encoding="utf-8")
    assert "발견된 이슈 없음" in local._builtin_review([f])


def test_builtin_review_ignores_comment_lines(tmp_path: Path) -> None:
    f = tmp_path / "c.py"
    # 주석 안의 'except:' 는 잡지 않아야 한다.
    f.write_text("# except: 이건 주석\nx = 1\n", encoding="utf-8")
    assert "발견된 이슈 없음" in local._builtin_review([f])


def test_reviewer_no_py_files(tmp_path: Path) -> None:
    (tmp_path / "readme.md").write_text("hi\n", encoding="utf-8")
    assert "점검할 .py 파일이 없습니다" in local.reviewer(str(tmp_path))


# --- tester ----------------------------------------------------------------

def test_tester_no_tests(tmp_path: Path) -> None:
    (tmp_path / "mod.py").write_text("x = 1\n", encoding="utf-8")
    out = local.tester(str(tmp_path))
    assert "발견된 테스트 파일: 0개" in out


def test_tester_detects_test_files(tmp_path: Path) -> None:
    (tmp_path / "test_sample.py").write_text(
        "def test_ok():\n    assert True\n", encoding="utf-8"
    )
    out = local.tester(str(tmp_path))
    assert "발견된 테스트 파일: 1개" in out


# --- planner ---------------------------------------------------------------

def test_planner_template() -> None:
    out = local.planner("URL 단축 서비스")
    assert "URL 단축 서비스" in out
    assert "1. [ ]" in out
    assert "핵심 설계 결정" in out


def test_planner_empty() -> None:
    assert "작업 미입력" in local.planner("   ")


# --- implementer -----------------------------------------------------------

def test_implementer_creates_scaffold(tmp_path: Path) -> None:
    target = tmp_path / "pkg" / "new_mod.py"
    out = local.implementer(str(target))
    assert "스캐폴드 생성" in out
    assert target.exists()
    body = target.read_text(encoding="utf-8")
    assert "new_mod 모듈" in body
    assert "def main()" in body


def test_implementer_no_overwrite(tmp_path: Path) -> None:
    target = tmp_path / "exists.py"
    target.write_text("original\n", encoding="utf-8")
    out = local.implementer(str(target))
    assert "이미 존재" in out
    assert target.read_text(encoding="utf-8") == "original\n"


def test_implementer_rejects_non_py(tmp_path: Path) -> None:
    out = local.implementer(str(tmp_path / "thing.txt"))
    assert ".py 모듈 스캐폴드만" in out


# --- CLI 디스패치 ----------------------------------------------------------

def test_main_unknown_command(capsys) -> None:
    rc = local.main(["frobnicate"])
    assert rc == 2
    assert "알 수 없는 명령" in capsys.readouterr().out


def test_main_planner_requires_arg(capsys) -> None:
    rc = local.main(["planner"])
    assert rc == 2
    assert "인자가 필요합니다" in capsys.readouterr().out


def test_main_analyst_runs(tmp_path: Path, capsys) -> None:
    (tmp_path / "a.py").write_text("x = 1\n", encoding="utf-8")
    rc = local.main(["analyst", str(tmp_path)])
    assert rc == 0
    assert "코드베이스 분석" in capsys.readouterr().out
