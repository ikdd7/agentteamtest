"""LLM 백엔드 — 방문자 질문에 페르소나 근거로 답한다.

- MockLLM: 키·네트워크 없이 검색된 청크로 결정론적 답. 데모/CI/검증용.
- AnthropicLLM: 실제 Claude 호출(본인 PC). ANTHROPIC_API_KEY 필요.
인터페이스가 같아 교체만 하면 된다.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Protocol

_SYSTEM = (
    "당신은 '{name}'의 AI 비서입니다. {name}의 관문 페이지에서 방문자(채용담당·고객 "
    "등 외부인)의 질문에 {name}을 대신해 답합니다.\n"
    "- 방문자는 {name} 본인이 아닙니다. {name}을 3인칭('{name}님은…')으로 지칭하세요.\n"
    "- 질문에 직접·정확히 답하세요. 질문과 무관한 정보를 나열하지 말고, 관련 있을 때만 "
    "강점을 한 문장 덧붙이세요.\n"
    "- 아래 근거(소유자 제공 정보)에 있는 사실만 쓰고, 없는 건 지어내지 마세요. 모르면 "
    "솔직히 말한 뒤 '용건을 남겨 주시면 {name}님께 전달하겠다'고 안내하세요.\n"
    "- 친절하고 전문적인 톤, 오직 한국어로만(다른 언어 한 글자도 금지), 보통 1~3문장.\n"
    "예시 — 방문자: '디자인 경험 있어요?' → 답: "
    "'네, {name}님은 5년차 프로덕트 디자이너로 Figma와 사용자 리서치 경험이 있습니다.'"
)


class LLM(Protocol):
    def answer(self, question: str, context: list[str], name: str) -> str: ...


class MockLLM:
    """검색된 청크를 요약 흉내로 돌려주는 결정론적 백엔드(키 불필요)."""

    def answer(self, question: str, context: list[str], name: str) -> str:
        if not context:
            return (
                f"그 부분은 제 정보에 없네요. {name}에게 직접 메시지를 남겨 주시면 "
                "전달해 드릴게요."
            )
        # 가장 관련 높은 1~2개 청크를 근거로 제시(요약 모델 대체).
        body = " ".join(context[:2])
        if len(body) > 400:
            body = body[:400] + "…"
        return f"{body}"


class OllamaLLM:
    """로컬 Ollama 백엔드 — **API 키·외부 호출 없음**(localhost). 무료·비공개·토큰비용 0.

    설치: https://ollama.com → `ollama run llama3.1` (또는 qwen2.5 등).
    """

    def __init__(self, model: str = "llama3.1", host: str = "http://localhost:11434") -> None:
        self.model = model
        self.host = host

    def _messages(self, question: str, context: list[str], name: str) -> list[dict]:
        ctx = "\n- ".join(context) or "(근거 없음)"
        return [
            {"role": "system", "content": _SYSTEM.format(name=name)},
            {"role": "user", "content": f"## 근거\n- {ctx}\n\n## 질문\n{question}"},
        ]

    def _post(self, payload: dict) -> dict:
        req = urllib.request.Request(
            f"{self.host}/api/chat",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310 — localhost
            return json.loads(r.read().decode())

    def answer(self, question: str, context: list[str], name: str) -> str:
        try:
            data = self._post({
                "model": self.model,
                "messages": self._messages(question, context, name),
                "stream": False,
                "options": {"temperature": 0.6, "num_predict": 512},
            })
        except OSError:
            raise RuntimeError(
                "Ollama 연결 실패. 설치·실행: https://ollama.com → `ollama run llama3.1`"
            ) from None
        return data.get("message", {}).get("content", "").strip()


class AnthropicLLM:
    """실제 Claude 백엔드(클라우드 API — 키 필요). API 안 쓰려면 OllamaLLM 사용."""

    def __init__(self, model: str = "claude-opus-4-8") -> None:
        self.model = model

    def answer(self, question: str, context: list[str], name: str) -> str:
        try:
            import anthropic
        except ImportError:
            raise RuntimeError("anthropic 미설치: pip install anthropic") from None
        client = anthropic.Anthropic()
        ctx = "\n- ".join(context) or "(근거 없음)"
        resp = client.messages.create(
            model=self.model,
            max_tokens=600,
            system=_SYSTEM.format(name=name),
            messages=[{"role": "user", "content": f"## 근거\n- {ctx}\n\n## 질문\n{question}"}],
        )
        return "".join(b.text for b in resp.content if b.type == "text").strip()


def get_llm(name: str = "mock", model: str | None = None) -> LLM:
    if name == "mock":
        return MockLLM()
    if name == "ollama":
        return OllamaLLM(model=model or "llama3.1")
    if name == "anthropic":
        return AnthropicLLM(model=model or "claude-opus-4-8")
    raise ValueError(f"알 수 없는 LLM: {name} (mock | ollama | anthropic)")
