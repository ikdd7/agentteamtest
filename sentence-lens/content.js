// Sentence Lens — content script
// 1) 텍스트를 드래그하면 선택 영역 근처에 "분석" 버튼을 띄운다.
// 2) Alt+클릭하면 클릭 지점의 문장을 자동으로 잘라 분석한다.
// 결과는 페이지 우측의 Shadow DOM 패널에 표시한다.

(() => {
  const MAX_LEN = 1000;
  let enabled = true;
  let host = null;      // shadow host
  let shadow = null;
  let triggerBtn = null;
  let reqSeq = 0;       // 요청 세대 — 늦게 도착한 이전 응답이 패널을 덮어쓰지 않게 함

  chrome.storage.sync.get({ enabled: true }, (v) => { enabled = v.enabled; });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue;
  });

  // ---------- Shadow DOM 패널 ----------

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
    .panel {
      position: fixed; top: 16px; right: 16px; width: 380px; max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px); overflow-y: auto; z-index: 2147483647;
      background: #ffffff; color: #1a1a1a; border: 1px solid #d9d4c8;
      border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.18);
      font-size: 14px; line-height: 1.55;
    }
    .head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid #ece7db;
      position: sticky; top: 0; background: #faf8f3; border-radius: 12px 12px 0 0;
    }
    .head .title { font-weight: 700; font-size: 13px; color: #6b5d3f; letter-spacing: .04em; }
    .head button {
      border: 0; background: transparent; cursor: pointer; font-size: 16px;
      color: #8a8272; padding: 2px 6px; border-radius: 6px;
    }
    .head button:hover { background: #ece7db; }
    .body { padding: 14px 16px 18px; }
    .src { font-style: italic; color: #555; background: #f5f2ea; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; word-break: break-word; }
    .sec { margin-bottom: 16px; }
    .sec h3 { font-size: 12px; font-weight: 700; color: #a0742c; letter-spacing: .06em; margin-bottom: 6px; }
    .translation { font-size: 15px; font-weight: 600; word-break: break-word; }
    .stype { display: inline-block; margin-top: 6px; font-size: 12px; color: #6b5d3f; background: #f0ead9; padding: 2px 8px; border-radius: 999px; }
    .chunk { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px dashed #ece7db; }
    .chunk:last-child { border-bottom: 0; }
    .chunk .role { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: #fff; background: #b08d3e; border-radius: 4px; padding: 2px 6px; height: fit-content; white-space: nowrap; }
    .chunk .txt .c { font-weight: 600; word-break: break-word; }
    .chunk .txt .e { color: #666; font-size: 12.5px; }
    .gp { padding: 6px 0; }
    .gp .p { font-weight: 600; }
    .gp .e { color: #666; font-size: 12.5px; }
    .word { display: flex; gap: 8px; padding: 6px 0; align-items: baseline; flex-wrap: wrap; }
    .word .w { font-weight: 700; }
    .word .pos { font-size: 11px; color: #8a8272; }
    .word .m { color: #333; }
    .word .n { flex-basis: 100%; color: #888; font-size: 12px; }
    .notice { margin-top: 14px; padding: 8px 10px; font-size: 12px; color: #6b5d3f; background: #f5f2ea; border-radius: 8px; }
    .loading, .error { padding: 8px 0; }
    .loading { color: #6b5d3f; }
    .error { color: #b03030; word-break: break-word; }
    .spinner {
      display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px;
      border: 2px solid #d9c99a; border-top-color: #a0742c; border-radius: 50%;
      animation: sl-spin .8s linear infinite;
    }
    @keyframes sl-spin { to { transform: rotate(360deg); } }
  `;

  function ensurePanel() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement("div");
    host.id = "sentence-lens-host";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = "";
    const head = document.createElement("div");
    head.className = "head";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "SENTENCE LENS";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.addEventListener("click", hidePanel);
    head.append(title, close);
    const body = document.createElement("div");
    body.className = "body";
    panel.append(head, body);
    shadow.appendChild(panel);
    document.documentElement.appendChild(host);
  }

  function panelBody() {
    return shadow.querySelector(".body");
  }

  function hidePanel() {
    if (host) host.remove();
    host = null;
    shadow = null;
    reqSeq++; // 패널을 닫으면 진행 중이던 요청의 응답은 무시한다
  }

  function section(titleText) {
    const sec = document.createElement("div");
    sec.className = "sec";
    const h = document.createElement("h3");
    h.textContent = titleText;
    sec.appendChild(h);
    return sec;
  }

  function showLoading(sentence) {
    ensurePanel();
    const body = panelBody();
    body.textContent = "";
    const src = document.createElement("div");
    src.className = "src";
    src.textContent = sentence;
    const loading = document.createElement("div");
    loading.className = "loading";
    const spin = document.createElement("span");
    spin.className = "spinner";
    loading.append(spin, document.createTextNode("문장을 분석하는 중…"));
    body.append(src, loading);
  }

  function showError(message) {
    if (!shadow) return;
    const body = panelBody();
    const loading = body.querySelector(".loading");
    if (loading) loading.remove();
    const err = document.createElement("div");
    err.className = "error";
    err.textContent = message;
    body.appendChild(err);
  }

  function showResult(sentence, r) {
    ensurePanel();
    const body = panelBody();
    body.textContent = "";

    const src = document.createElement("div");
    src.className = "src";
    src.textContent = sentence;
    body.appendChild(src);

    // 번역
    const secT = section("해석");
    const tr = document.createElement("div");
    tr.className = "translation";
    tr.textContent = r.translation || "";
    secT.appendChild(tr);
    if (r.sentence_type) {
      const st = document.createElement("span");
      st.className = "stype";
      st.textContent = r.sentence_type;
      secT.appendChild(st);
    }
    body.appendChild(secT);

    // 문장 구조
    if (Array.isArray(r.structure) && r.structure.length) {
      const secS = section("문장 구조");
      for (const s of r.structure) {
        const row = document.createElement("div");
        row.className = "chunk";
        const role = document.createElement("span");
        role.className = "role";
        role.textContent = s.role || "";
        const txt = document.createElement("div");
        txt.className = "txt";
        const c = document.createElement("div");
        c.className = "c";
        c.textContent = s.chunk || "";
        const e = document.createElement("div");
        e.className = "e";
        e.textContent = s.explanation || "";
        txt.append(c, e);
        row.append(role, txt);
        secS.appendChild(row);
      }
      body.appendChild(secS);
    }

    // 문법 포인트
    if (Array.isArray(r.grammar_points) && r.grammar_points.length) {
      const secG = section("문법 포인트");
      for (const g of r.grammar_points) {
        const row = document.createElement("div");
        row.className = "gp";
        const p = document.createElement("div");
        p.className = "p";
        p.textContent = g.point || "";
        const e = document.createElement("div");
        e.className = "e";
        e.textContent = g.explanation || "";
        row.append(p, e);
        secG.appendChild(row);
      }
      body.appendChild(secG);
    }

    // 단어
    if (Array.isArray(r.words) && r.words.length) {
      const secW = section("단어 · 표현");
      for (const w of r.words) {
        const row = document.createElement("div");
        row.className = "word";
        const wd = document.createElement("span");
        wd.className = "w";
        wd.textContent = w.word || "";
        const pos = document.createElement("span");
        pos.className = "pos";
        pos.textContent = w.pos || "";
        const m = document.createElement("span");
        m.className = "m";
        m.textContent = w.meaning || "";
        row.append(wd, pos, m);
        if (w.note) {
          const n = document.createElement("span");
          n.className = "n";
          n.textContent = w.note;
          row.appendChild(n);
        }
        secW.appendChild(row);
      }
      body.appendChild(secW);
    }

    // 안내 문구 (예: DeepL 무료 모드)
    if (r.notice) {
      const notice = document.createElement("div");
      notice.className = "notice";
      notice.textContent = r.notice;
      body.appendChild(notice);
    }
  }

  // ---------- 분석 요청 ----------

  function analyze(sentence) {
    sentence = (sentence || "").trim().replace(/\s+/g, " ");
    if (!sentence) return;
    if (sentence.length > MAX_LEN) sentence = sentence.slice(0, MAX_LEN);

    const my = ++reqSeq;
    showLoading(sentence);
    chrome.runtime.sendMessage(
      { type: "analyze", sentence, pageContext: { title: document.title, url: location.href } },
      (res) => {
        if (my !== reqSeq) return; // 그 사이 새 요청이 시작됐거나 패널이 닫힘
        if (chrome.runtime.lastError) {
          showError("확장 프로그램과 통신하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.");
          return;
        }
        if (!res || !res.ok) {
          showError(res ? res.error : "알 수 없는 오류가 발생했습니다.");
          return;
        }
        showResult(sentence, res.result);
      }
    );
  }

  // ---------- 드래그 선택 → 분석 버튼 ----------

  function removeTriggerBtn() {
    if (triggerBtn) { triggerBtn.remove(); triggerBtn = null; }
  }

  function showTriggerBtn(x, y, text) {
    removeTriggerBtn();
    triggerBtn = document.createElement("button");
    triggerBtn.id = "sentence-lens-trigger";
    triggerBtn.textContent = "🔍 분석";
    Object.assign(triggerBtn.style, {
      position: "fixed",
      left: `${Math.min(x, window.innerWidth - 90)}px`,
      top: `${Math.min(y + 8, window.innerHeight - 40)}px`,
      zIndex: 2147483647,
      padding: "5px 10px",
      fontSize: "12px",
      fontFamily: "sans-serif",
      color: "#fff",
      background: "#a0742c",
      border: "0",
      borderRadius: "8px",
      cursor: "pointer",
      boxShadow: "0 2px 10px rgba(0,0,0,.25)"
    });
    // mousedown 에서 처리해야 mouseup 시 선택 해제로 버튼이 사라지기 전에 잡을 수 있다.
    triggerBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeTriggerBtn();
      analyze(text);
    });
    document.documentElement.appendChild(triggerBtn);
  }

  document.addEventListener("mouseup", (e) => {
    if (!enabled) return;
    if (e.target === triggerBtn) return;
    if (host && e.composedPath().includes(host)) return;
    // 선택이 확정된 다음 프레임에 확인
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length >= 2 && text.length <= MAX_LEN) {
        showTriggerBtn(e.clientX, e.clientY, text);
      } else {
        removeTriggerBtn();
      }
    }, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target !== triggerBtn) removeTriggerBtn();
  });

  // ---------- Alt+클릭 → 문장 자동 추출 ----------

  const BLOCK_TAGS = new Set(["P", "DIV", "LI", "TD", "TH", "BLOCKQUOTE", "ARTICLE", "SECTION", "H1", "H2", "H3", "H4", "H5", "H6", "DD", "DT", "FIGCAPTION", "PRE", "BODY"]);
  const SENTENCE_END = /[.!?。！？…]/;

  function blockAncestor(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (BLOCK_TAGS.has(cur.tagName)) return cur;
      cur = cur.parentElement;
    }
    return document.body;
  }

  function caretFromPoint(x, y) {
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      return p ? { node: p.offsetNode, offset: p.offset } : null;
    }
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      return r ? { node: r.startContainer, offset: r.startOffset } : null;
    }
    return null;
  }

  function sentenceAtPoint(x, y) {
    const caret = caretFromPoint(x, y);
    if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;

    const block = blockAncestor(caret.node.parentElement);
    // 블록 안의 텍스트 노드를 순서대로 이어붙여 전체 텍스트와 클릭 지점의 전역 오프셋을 구한다.
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let full = "";
    let clickOffset = -1;
    let n;
    while ((n = walker.nextNode())) {
      if (n === caret.node) clickOffset = full.length + Math.min(caret.offset, n.textContent.length);
      full += n.textContent;
    }
    if (clickOffset < 0 || !full.trim()) return null;

    // 클릭 지점 기준으로 문장 경계 확장
    let start = clickOffset;
    while (start > 0 && !SENTENCE_END.test(full[start - 1])) start--;
    let end = clickOffset;
    while (end < full.length && !SENTENCE_END.test(full[end])) end++;
    if (end < full.length) end++; // 문장부호 포함

    const sentence = full.slice(start, end).trim();
    return sentence.length >= 2 ? sentence : null;
  }

  document.addEventListener("click", (e) => {
    if (!enabled || !e.altKey) return;
    if (host && e.composedPath().includes(host)) return;
    const sentence = sentenceAtPoint(e.clientX, e.clientY);
    if (sentence) {
      e.preventDefault();
      e.stopPropagation();
      analyze(sentence);
    }
  }, true);

  // ESC 로 패널 닫기
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { hidePanel(); removeTriggerBtn(); }
  });
})();
