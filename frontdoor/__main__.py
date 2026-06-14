"""AI Front Door 데모 CLI.

사용법:
    python -m frontdoor                       # mock 데모(키 0) — 샘플 페르소나로 대화+인박스
    python -m frontdoor --profile me.txt      # 내 프로필 텍스트로
    python -m frontdoor --llm ollama          # 로컬 모델(Ollama, API 키 없음) ← 권장
    python -m frontdoor --llm ollama --model gemma2:2b --check  # 설치 점검만(트레이스백 없이)
    python -m frontdoor --llm anthropic       # 클라우드 Claude(키 필요)
    python -m frontdoor --html door.html      # 방문자 관문 페이지(공유 링크 목업) 저장
"""

from __future__ import annotations

import sys

from .app import FrontDoor

_SAMPLE = """\
저는 김코딩, 5년차 백엔드 개발자입니다. Python·Go·Kubernetes 경험이 많습니다.

핀테크 스타트업에서 결제 시스템을 설계했고, 일 200만 건 트랜잭션을 처리하는
정산 파이프라인을 1인 주도로 만들었습니다.

지금은 새 기회를 찾고 있습니다. 원격 또는 서울. 백엔드/플랫폼 역할 선호.
연락은 이 관문에 용건을 남겨 주세요.
"""

_QUESTIONS = [
    "결제 시스템 경험이 있나요?",
    "어떤 언어를 쓰나요?",
    "취미가 뭔가요?",  # 근거 없음 → 모른다고 답해야 정상
]


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    profile_path = None
    llm = "mock"
    model = None
    html_path = None
    chat = False
    check = False
    i = 0
    while i < len(argv):
        if argv[i] == "--profile" and i + 1 < len(argv):
            profile_path, i = argv[i + 1], i + 2
        elif argv[i] == "--llm" and i + 1 < len(argv):
            llm, i = argv[i + 1], i + 2
        elif argv[i] == "--model" and i + 1 < len(argv):
            model, i = argv[i + 1], i + 2
        elif argv[i] == "--html" and i + 1 < len(argv):
            html_path, i = argv[i + 1], i + 2
        elif argv[i] == "--chat":
            chat, i = True, i + 1
        elif argv[i] == "--check":
            check, i = True, i + 1
        elif argv[i] in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            print(f"알 수 없는 인자: {argv[i]}", file=sys.stderr)
            return 2

    if check:
        from .llm import OllamaLLM
        print(OllamaLLM(model=model or "llama3.1").check())
        return 0

    if profile_path:
        with open(profile_path, encoding="utf-8") as f:
            text = f.read()
        name = text.strip().split(",")[0].split("\n")[0][:20] or "익명"
    else:
        text, name = _SAMPLE, "김코딩"

    door = FrontDoor.create(name, text, llm=llm, model=model)
    if llm == "mock":
        print("※ mock LLM 데모(키 0). 실제 답변은 --llm ollama (로컬, 키 0).\n",
              file=sys.stderr)
    elif llm == "ollama":
        used = model or "llama3.1"
        print(f"🦙 Ollama 모델: {used}", file=sys.stderr)
        if used.startswith("gemma2:2b"):
            print("   ⚠️ 2B는 지시를 잘 못 따릅니다. 권장: --model exaone3.5",
                  file=sys.stderr)
        print(file=sys.stderr)

    sample_qa: list[tuple[str, str]] = []
    if chat:
        print("내 프로필에 대해 질문해 보세요. 빈 줄/quit 으로 종료.\n", file=sys.stderr)
        while True:
            try:
                q = input("방문자> ").strip()
            except EOFError:
                break
            if not q or q.lower() in ("quit", "exit", "q"):
                break
            r = door.ask(q)
            print(f"{name} AI> {r['text']}")
            print(f"          {r['attribution']}\n")
            sample_qa.append((q, r["text"]))
    else:
        for q in _QUESTIONS:
            r = door.ask(q)
            print(f"방문자> {q}")
            print(f"{name} AI> {r['text']}")
            print(f"          {r['attribution']}\n")
            sample_qa.append((q, r["text"]))
        door.leave_message("이채용", "recruiter@corp.com",
                           "백엔드 시니어 포지션 제안드립니다. 면접 가능하신가요?")

    print("=" * 50)
    print(door.owner_digest())

    if html_path:
        from .page import render
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(render(door.persona, sample_qa))
        print(f"\n관문 페이지 저장: {html_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
