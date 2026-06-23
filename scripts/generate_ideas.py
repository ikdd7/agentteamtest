#!/usr/bin/env python3
"""욕구이론 × 특정 상황·니즈 사업 아이디어를 10개씩 생성해 누적 기록 파일에 append한다.

GitHub Actions에서 30분마다 실행된다. Claude API(claude-opus-4-8)를 호출해
이전 배치와 중복되지 않는 새 아이디어 10개를 만들고 docs/business-ideas-loop.md에 덧붙인다.
"""

import datetime
import os
import pathlib
import re
import sys

import anthropic

DOC_PATH = pathlib.Path(__file__).resolve().parent.parent / "docs" / "business-ideas-loop.md"
MODEL = "claude-opus-4-8"

SYSTEM_PROMPT = """\
너는 한국 시장을 잘 아는 사업 아이디어 발굴 전문가다.
사람의 '욕구이론'(매슬로 욕구단계, 머레이의 심리발생적 욕구, 앨더퍼 ERG,
맥클리랜드 성취동기, 자기결정이론, 허즈버그 2요인 등)에 나오는 구체적인 욕구를,
한국 사람들의 '특정한 상황·특정한 니즈'와 결합해 사업 아이디어를 도출한다.

톤: '거지맵', '차바조', '대다모(탈모)'처럼 공감되고 위트 있는 한국 인터넷식 네이밍.
각 아이디어는 반드시 아래 마크다운 형식을 그대로 따른다(번호는 1~10):

**{번호}. {임팩트 있는 서비스명} — "{한 줄 캐치프레이즈}"**
- 욕구: {욕구이론의 구체 욕구 1~2개}
- 상황: {또렷하게 정의된 타깃과 상황}
- 아이디어: {해결 메커니즘을 2~3문장으로}

규칙:
- 정확히 10개를 생성한다.
- 이전 배치에서 이미 나온 서비스명/콘셉트와 중복되지 않게 새로운 욕구·상황 조합을 쓴다.
- 머리말·맺음말 없이 1번부터 10번 아이디어 블록만 출력한다.
"""


def existing_idea_titles(text: str) -> list[str]:
    """이미 기록된 아이디어의 굵은 제목 줄을 모은다(중복 방지용)."""
    return re.findall(r"^\*\*\d+\..*\*\*$", text, flags=re.MULTILINE)


def next_batch_number(text: str) -> int:
    nums = [int(n) for n in re.findall(r"^##\s*(\d+)\s*차 배치", text, flags=re.MULTILINE)]
    return (max(nums) + 1) if nums else 1


def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY가 설정되지 않았습니다.", file=sys.stderr)
        return 1

    text = DOC_PATH.read_text(encoding="utf-8") if DOC_PATH.exists() else ""
    batch_no = next_batch_number(text)
    prior = existing_idea_titles(text)
    prior_block = "\n".join(prior) if prior else "(아직 없음)"

    user_msg = (
        f"지금까지 나온 아이디어 제목 목록(중복 금지):\n{prior_block}\n\n"
        f"위와 겹치지 않는 새로운 사업 아이디어 10개를 형식에 맞춰 생성해줘."
    )

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    ideas = "".join(b.text for b in response.content if b.type == "text").strip()
    if not ideas:
        print("모델이 빈 응답을 반환했습니다.", file=sys.stderr)
        return 1

    today = datetime.date.today().isoformat()
    section = f"\n\n## {batch_no}차 배치 — {today}\n\n{ideas}\n"

    with DOC_PATH.open("a", encoding="utf-8") as f:
        f.write(section)

    print(f"{batch_no}차 배치 10개를 추가했습니다 ({today}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
