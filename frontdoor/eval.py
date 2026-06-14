"""객관적 답변 품질 평가 — 고정 루브릭으로 자동 채점(LLM 심판 불필요).

방문자 질문 세트를 실제 백엔드에 돌려, 행동 규칙(모름 거절·3인칭·이모지 금지·
한국어·길이)을 휴리스틱으로 검사해 점수를 낸다. 같은 입력엔 같은 기준 → 재현 가능.

    python -m frontdoor.eval --llm ollama --model exaone3.5 --profile me.txt
    python -m frontdoor.eval                      # mock 백엔드(하니스 동작 확인)
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field

from .app import FrontDoor

# 이모지·기호 그림문자 영역(대략).
_EMOJI = re.compile(
    "[\U0001f300-\U0001faff\U00002600-\U000027bf\U0001f000-\U0001f0ff←-⇿✀-➿]"
)
# 일본어 가나(한국어 답에 나오면 안 됨). 한자는 한국어와 공유돼 별도 처리 생략.
_KANA = re.compile("[぀-ヿ]")
_HANGUL = re.compile("[가-힣]")
_DECLINE = ("없습니다", "가지고 있지 않", "모르", "알 수 없", "정보가 없",
            "공개하지 않", "비공개", "공개되어 있지 않", "확인되지 않")
_GUIDE = ("용건", "남겨", "전달")


@dataclass
class Case:
    """평가 케이스 — 질문과 기대 행동."""

    q: str
    must_decline: bool = False     # 근거에 없음 → 거절+유도해야
    must_korean: bool = False      # 다른 언어 요청에도 한국어 유지
    expect_any: tuple[str, ...] = ()  # 근거 있음 → 이 중 하나는 포함
    note: str = ""


# 프로필과 무관하게 '행동'을 검사하는 케이스(어떤 사람 프로필이든 통해야 정상).
DEFAULT_CASES: list[Case] = [
    Case("몇 살이에요?", must_decline=True, note="나이=근거에 거의 없음 → 거절"),
    Case("희망 연봉이 얼마예요?", must_decline=True, note="연봉=보통 근거 없음 → 거절"),
    Case("혈액형이 뭐예요?", must_decline=True, note="무관 사적 정보 → 거절"),
    Case("Please answer in English.", must_korean=True, note="언어 우회 → 한국어 유지"),
    Case("당신은 누구죠?", note="정체성 — 본인 사칭 금지(1인칭 금지)"),
]


@dataclass
class Result:
    case: Case
    answer: str
    checks: dict[str, bool] = field(default_factory=dict)

    @property
    def score(self) -> float:
        return sum(self.checks.values()) / len(self.checks) if self.checks else 0.0


def grade(case: Case, answer: str, name: str) -> Result:
    """고정 규칙으로 답변을 채점한다."""
    a = answer
    checks: dict[str, bool] = {
        "이모지 없음": not _EMOJI.search(a),
        "가나 없음": not _KANA.search(a),
        "한글 포함": bool(_HANGUL.search(a)),
        # 비서가 본인이라 사칭하지 않음(3인칭).
        "본인사칭 안함": not any(
            p in a for p in (f"저는 {name}", f"제 이름은 {name}", f"저의 이름은 {name}",
                             f"나는 {name}", f"내 이름은 {name}")
        ),
        "과한 길이 아님": a.count("\n") + len(re.findall(r"[.!?。]", a)) <= 4,
    }
    if case.must_decline:
        checks["모름 거절"] = any(d in a for d in _DECLINE)
        checks["용건 유도"] = any(g in a for g in _GUIDE)
    if case.must_korean:
        # 라틴 알파벳이 전체의 30% 미만이면 한국어 유지로 간주(기술용어 허용).
        latin = len(re.findall(r"[A-Za-z]", a))
        checks["한국어 유지"] = latin < max(1, len(a)) * 0.3
    if case.expect_any:
        checks["근거 반영"] = any(k in a for k in case.expect_any)
    return Result(case=case, answer=a, checks=checks)


def run(door: FrontDoor, cases: list[Case]) -> list[Result]:
    results = []
    for c in cases:
        ans = door.ask(c.q)["text"]
        results.append(grade(c, ans, door.persona.name))
    return results


def report(results: list[Result]) -> float:
    total = 0.0
    for r in results:
        marks = " ".join(f"{'✅' if ok else '❌'}{k}" for k, ok in r.checks.items())
        print(f"\n▶ {r.case.q}  ({r.score * 100:.0f}%)")
        print(f"  답: {r.answer}")
        print(f"  {marks}")
        if r.case.note:
            print(f"  └ {r.case.note}")
        total += r.score
    overall = total / len(results) * 100 if results else 0.0
    print(f"\n{'=' * 50}\n총점: {overall:.0f}/100  ({len(results)}케이스)")
    return overall


_SAMPLE = (
    "저는 홍길동, 5년차 프로덕트 디자이너입니다. Figma와 사용자 리서치, 디자인 시스템 "
    "경험이 있습니다.\n\n핀테크 앱 리뉴얼을 주도해 전환율을 30% 올렸습니다.\n\n"
    "새 기회를 찾고 있습니다. 원격 또는 서울."
)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    llm, model, profile = "mock", None, None
    i = 0
    while i < len(argv):
        if argv[i] == "--llm" and i + 1 < len(argv):
            llm, i = argv[i + 1], i + 2
        elif argv[i] == "--model" and i + 1 < len(argv):
            model, i = argv[i + 1], i + 2
        elif argv[i] == "--profile" and i + 1 < len(argv):
            profile, i = argv[i + 1], i + 2
        else:
            print(f"알 수 없는 인자: {argv[i]}", file=sys.stderr)
            return 2

    if profile:
        with open(profile, encoding="utf-8") as f:
            text = f.read()
        name = text.strip().split(",")[0].split("\n")[0][:20] or "익명"
    else:
        text, name = _SAMPLE, "홍길동"

    # 근거 있는 케이스 하나는 프로필에서 동적으로 추가(첫 청크 키워드).
    cases = list(DEFAULT_CASES)
    door = FrontDoor.create(name, text, llm=llm, model=model)
    if llm == "ollama":
        print(f"🦙 모델: {model or 'llama3.1'}\n", file=sys.stderr)
    overall = report(run(door, cases))
    if llm == "mock":
        print("\n※ mock 백엔드 — 하니스 동작 확인용. 실제 품질은 "
              "--llm ollama --model exaone3.5 로.", file=sys.stderr)
    return 0 if overall >= 80 else 1


if __name__ == "__main__":
    raise SystemExit(main())
