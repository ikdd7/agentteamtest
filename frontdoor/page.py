"""방문자가 보는 관문 페이지(공유 링크) — 자체완결 HTML.

검증 실험(#2)용 목업이자, 실서비스 프런트의 정적 골격. 샘플 Q&A 를 보여주고,
"용건 남기기" 폼과 "내 관문 만들기" CTA(바이럴 루프)를 포함한다.
"""

from __future__ import annotations

import html

from .app import ATTRIBUTION
from .persona import Persona


def render(persona: Persona, sample_qa: list[tuple[str, str]]) -> str:
    name = html.escape(persona.name)
    bubbles = []
    for q, a in sample_qa:
        bubbles.append(f'<div class="q">{html.escape(q)}</div>')
        bubbles.append(f'<div class="a">{html.escape(a)}'
                       f'<div class="attr">{html.escape(ATTRIBUTION)}</div></div>')
    convo = "\n".join(bubbles)
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} · AI Front Door</title>
<style>
  body {{ margin:0; background:#0f1115; color:#e8e6e3;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Pretendard,sans-serif; }}
  .wrap {{ max-width:560px; margin:0 auto; padding:40px 18px 80px; }}
  h1 {{ font-size:22px; margin:0 0 2px; }}
  .sub {{ color:#9b968e; font-size:13px; margin:0 0 22px; }}
  .q {{ background:#1b1f27; border-radius:14px 14px 14px 4px; padding:10px 13px;
    margin:14px 0 6px; max-width:80%; font-size:14px; }}
  .a {{ background:#2a2320; border-radius:14px 14px 4px 14px; padding:11px 13px;
    margin:0 0 6px auto; max-width:88%; font-size:14px; }}
  .attr {{ color:#c9a06a; font-size:11px; margin-top:8px; }}
  .form {{ background:#1b1f27; border:1px solid #2a2f3a; border-radius:12px;
    padding:14px; margin-top:24px; }}
  .form input, .form textarea {{ width:100%; box-sizing:border-box; margin:6px 0;
    background:#0f1115; border:1px solid #2a2f3a; border-radius:8px; color:#e8e6e3;
    padding:9px; font-size:14px; }}
  .btn {{ background:#c9a06a; color:#1a1410; border:0; border-radius:8px;
    padding:10px 14px; font-weight:700; cursor:pointer; width:100%; }}
  .cta {{ text-align:center; margin-top:22px; }}
  .cta a {{ color:#c9a06a; font-weight:700; text-decoration:none; }}
  footer {{ color:#6f6a62; font-size:11px; margin-top:18px; text-align:center; }}
</style></head>
<body><div class="wrap">
  <h1>{name}</h1>
  <p class="sub">무엇이든 물어보세요 — {name}을 학습한 AI가 24시간 답합니다.</p>
  {convo}
  <div class="form">
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">용건 남기기</div>
    <input placeholder="이름">
    <input placeholder="이메일 / 연락처">
    <textarea placeholder="메시지 (채용 제안 · 협업 · 문의)" rows="3"></textarea>
    <button class="btn">{name}에게 전송</button>
  </div>
  <div class="cta"><a href="#">⚡ 나도 내 AI 관문 만들기 →</a></div>
  <footer>AI Front Door — 결제·개인정보는 안전하게 처리됩니다.</footer>
</div></body></html>
"""
