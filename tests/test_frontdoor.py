"""AI Front Door MVP 코어 테스트 (mock LLM, 키·네트워크 없음)."""

from __future__ import annotations

from frontdoor import FrontDoor, ingest
from frontdoor.app import ATTRIBUTION
from frontdoor.inbox import Inbox
from frontdoor.llm import MockLLM, get_llm
from frontdoor.page import render
from frontdoor.retrieval import retrieve

_PROFILE = """\
저는 박개발입니다. 결제 시스템과 정산 파이프라인을 설계했습니다.

원격 근무를 선호하며 새 기회를 찾고 있습니다.
"""


# --- persona / retrieval ---------------------------------------------------

def test_ingest_chunks() -> None:
    p = ingest("박개발", _PROFILE)
    assert p.name == "박개발"
    assert len(p.chunks) == 2  # 두 문단


def test_retrieve_keyword_match() -> None:
    p = ingest("박개발", _PROFILE)
    hits = retrieve(p, "결제 시스템 경험 있나요?")
    assert hits and "결제" in hits[0]


def test_retrieve_small_profile_returns_all() -> None:
    # 짧은 프로필은 키워드와 무관하게 전체를 근거로 넘긴다(한국어 합성어 회피).
    p = ingest("박개발", _PROFILE)
    assert retrieve(p, "좋아하는 음식은?") == p.chunks


def test_retrieve_large_profile_uses_keywords() -> None:
    big = "\n\n".join(f"문단{i}: 토픽{i} 관련 내용입니다." for i in range(20))
    p = ingest("박개발", big)
    hits = retrieve(p, "토픽7 알려줘")
    assert any("토픽7" in c for c in hits)
    assert hits  # 못 찾아도 앞부분 제공 → 빈 적 없음


# --- llm -------------------------------------------------------------------

def test_mock_llm_grounded() -> None:
    out = MockLLM().answer("결제?", ["결제 시스템을 설계했습니다."], "박개발")
    assert "결제 시스템" in out


def test_mock_llm_no_context_fallback() -> None:
    out = MockLLM().answer("취미?", [], "박개발")
    assert "메시지를 남겨" in out  # 소유자에게 남기도록 안내


def test_get_llm_unknown() -> None:
    import pytest
    with pytest.raises(ValueError):
        get_llm("nope")


def test_ollama_backend_builds_messages() -> None:
    # 로컬 Ollama 백엔드 — 네트워크 없이 메시지 구성만 검증.
    from frontdoor.llm import OllamaLLM
    o = get_llm("ollama")
    assert isinstance(o, OllamaLLM)
    msgs = o._messages("결제?", ["결제 시스템 설계함"], "박개발")
    assert msgs[0]["role"] == "system" and "박개발" in msgs[0]["content"]
    assert "결제 시스템 설계함" in msgs[1]["content"]


def test_ollama_answer_via_mocked_post(monkeypatch) -> None:
    # _post 만 가짜로 — answer 파싱 로직 검증(실제 Ollama 불필요).
    from frontdoor.llm import OllamaLLM
    o = OllamaLLM()
    monkeypatch.setattr(o, "_post", lambda payload: {"message": {"content": "  답변입니다  "}})
    assert o.answer("q", ["c"], "박개발") == "답변입니다"


# --- front door (core loop) ------------------------------------------------

def test_ask_grounded_with_attribution() -> None:
    door = FrontDoor.create("박개발", _PROFILE, llm="mock")
    r = door.ask("결제 시스템 해봤어요?")
    assert "결제" in r["text"]
    assert r["attribution"] == ATTRIBUTION
    assert door.inbox.questions == ["결제 시스템 해봤어요?"]  # 관심사 기록


def test_leave_message_fills_inbox() -> None:
    door = FrontDoor.create("박개발", _PROFILE, llm="mock")
    door.leave_message("채용담당", "hr@co.com", "면접 보실래요?")
    assert len(door.inbox.leads) == 1
    digest = door.owner_digest()
    assert "리드 1건" in digest
    assert "채용담당" in digest


# --- visitor page ----------------------------------------------------------

def test_render_page_has_loop_and_form() -> None:
    p = ingest("박개발", _PROFILE)
    html = render(p, [("결제?", "결제 시스템 설계함")])
    assert html.startswith("<!doctype html>")
    assert "내 AI 관문 만들기" in html     # 바이럴 CTA
    assert "용건 남기기" in html            # 리드 폼
    assert "박개발" in html
    assert "http" not in html.split("<body>")[0].replace("lang", "")  # 외부 의존 없음


# --- inbox -----------------------------------------------------------------

def test_inbox_summary_empty() -> None:
    assert "리드 0건" in Inbox().daily_summary()
