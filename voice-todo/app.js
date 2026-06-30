/* =========================================================================
 * 말로 하는 투두 (Voice To-Do)
 * 브라우저만으로 동작 — 음성 인식(Web Speech API) + 한국어 명령 파서 + localStorage
 * ========================================================================= */
(() => {
  "use strict";

  // ----------------------------------------------------------------------
  // 상태 / 저장
  // ----------------------------------------------------------------------
  const STORE_KEY = "voice-todo.v1";
  const state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { todos: [], goals: [], settings: { tts: true }, ui: { status: "all", group: "date" } };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ----------------------------------------------------------------------
  // 날짜 유틸
  // ----------------------------------------------------------------------
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function todayKey() { return dateKey(new Date()); }
  function dateKey(d) {
    const x = startOfDay(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  function keyToDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function humanDate(key) {
    if (!key) return "날짜 미정";
    const d = keyToDate(key);
    const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
    if (diff === 0) return `오늘 · ${base}`;
    if (diff === 1) return `내일 · ${base}`;
    if (diff === 2) return `모레 · ${base}`;
    if (diff === -1) return `어제 · ${base}`;
    if (diff < 0) return `지난 · ${base}`;
    return base;
  }
  function spokenDate(key) {
    if (!key) return "날짜 미정";
    const d = keyToDate(key);
    const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    if (diff === 0) return "오늘";
    if (diff === 1) return "내일";
    if (diff === 2) return "모레";
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  // ----------------------------------------------------------------------
  // 카테고리(행동) 추론
  // ----------------------------------------------------------------------
  const CATEGORIES = [
    { name: "운동", icon: "🏃", kw: ["운동", "헬스", "러닝", "조깅", "달리기", "요가", "산책", "스트레칭", "필라테스", "수영", "등산"] },
    { name: "업무", icon: "💼", kw: ["회의", "미팅", "보고", "업무", "메일", "이메일", "프로젝트", "발표", "보고서", "기획", "마감", "출근", "거래처", "결재", "회사"] },
    { name: "공부", icon: "📚", kw: ["공부", "학습", "강의", "시험", "숙제", "과제", "독서", "책", "복습", "예습", "인강", "스터디", "자격증", "토익", "영어"] },
    { name: "쇼핑", icon: "🛒", kw: ["장보기", "장 보기", "쇼핑", "구매", "주문", "마트", "사기", "사야", "택배", "결제"] },
    { name: "집안일", icon: "🧹", kw: ["청소", "빨래", "설거지", "정리", "집안일", "분리수거", "요리", "밥", "쓰레기"] },
    { name: "약속", icon: "🤝", kw: ["약속", "만나", "만남", "모임", "식사", "점심약속", "저녁약속", "데이트", "생일"] },
    { name: "건강", icon: "🩺", kw: ["병원", "약", "건강", "검진", "치과", "진료", "예약", "한의원", "운동처방"] },
    { name: "금융", icon: "💳", kw: ["은행", "세금", "공과금", "납부", "카드", "이체", "송금", "보험", "월세", "관리비"] },
    { name: "연락", icon: "📞", kw: ["전화", "연락", "문자", "카톡", "통화", "안부"] },
  ];
  function inferCategory(text) {
    const t = text.replace(/\s+/g, "");
    for (const c of CATEGORIES) {
      if (c.kw.some((k) => t.includes(k.replace(/\s+/g, "")))) return c;
    }
    return { name: "기타", icon: "📌", kw: [] };
  }

  // ----------------------------------------------------------------------
  // 한국어 명령 파서
  // ----------------------------------------------------------------------
  const COMPLETE_MARKERS = ["완료", "끝냈", "끝났", "끝나", "다했", "다 했", "처리했", "처리 했", "마쳤", "마침", "했어", "했음", "끝", "done"];
  const QUERY_MARKERS = ["알려줘", "알려 줘", "읽어줘", "읽어 줘", "보여줘", "보여 줘", "들려줘", "뭐야", "뭐 있", "뭐있", "뭐 남", "확인해", "확인 해", "어때", "정리해줘"];
  const ADD_TAILS = ["해야 해", "해야해", "해야 돼", "해야돼", "해야지", "해야됨", "할 거야", "할거야", "할거", "할게", "할래", "하기로", "하기", "할 일", "할일", "예정", "등록해줘", "등록해", "추가해줘", "추가해", "추가", "넣어줘", "넣어", "줘"];
  const GOAL_PREFIX = ["목표 추가", "목표추가", "목표 등록", "목표등록", "목표로", "목표는", "목표"];

  // 날짜 표현 → 기준일로부터 오프셋(일) 혹은 절대 날짜키
  function extractDate(text) {
    let t = text;
    let key = null;
    const consumed = [];

    // 요일 (다음/이번 주 수식어와 함께) — 상대 표현보다 먼저 처리
    const wm = t.match(/(일요일|월요일|화요일|수요일|목요일|금요일|토요일|일욜|월욜|화욜|수욜|목욜|금욜|토욜)/);
    if (wm) {
      const map = { "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };
      const target = map[wm[0][0]];
      const now = new Date();
      const isNext = /(다음\s*주|담주|다음주)/.test(t);
      const isThis = /(이번\s*주|이번주)/.test(t);
      let date;
      if (isNext || isThis) {
        // 월요일 시작 기준 주 계산
        const monIdx = (now.getDay() + 6) % 7;            // 오늘이 그 주의 며칠째(월=0)
        const weekMonday = addDays(now, -monIdx + (isNext ? 7 : 0));
        const tIdx = (target + 6) % 7;                    // 목표 요일(월=0)
        date = addDays(weekMonday, tIdx);
      } else {
        let diff = (target - now.getDay() + 7) % 7;
        if (diff === 0) diff = 7;                          // 같은 요일이면 다음 주 해당 요일
        date = addDays(now, diff);
      }
      key = dateKey(date);
      consumed.push(wm[0]);
      t = t.replace(wm[0], " ").replace(/(다음\s*주|담주|다음주|이번\s*주|이번주)/g, " ");
    }

    if (!key) {
      const rel = [
        { re: /(모레|내일모레)/, off: 2 },
        { re: /(글피)/, off: 3 },
        { re: /(내일|낼)/, off: 1 },
        { re: /(오늘)/, off: 0 },
        { re: /(어제)/, off: -1 },
        { re: /(다음\s*주|담주|다음주)/, off: 7 },
        { re: /(이번\s*주|이번주)/, off: 0 },
      ];
      for (const r of rel) {
        const m = t.match(r.re);
        if (m) { key = dateKey(addDays(new Date(), r.off)); consumed.push(m[0]); t = t.replace(r.re, " "); break; }
      }
    }

    // 절대 날짜: N월 N일  또는  N일
    if (!key) {
      const md = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
      if (md) {
        const now = new Date();
        let y = now.getFullYear();
        const mo = Number(md[1]) - 1, da = Number(md[2]);
        let d = new Date(y, mo, da);
        if (startOfDay(d) < startOfDay(now)) d = new Date(y + 1, mo, da); // 이미 지났으면 내년
        key = dateKey(d);
        consumed.push(md[0]);
        t = t.replace(md[0], " ");
      } else {
        const dd = t.match(/(\d{1,2})\s*일(?!\s*간)/);
        if (dd) {
          const now = new Date();
          const da = Number(dd[1]);
          let d = new Date(now.getFullYear(), now.getMonth(), da);
          if (startOfDay(d) < startOfDay(now)) d = new Date(now.getFullYear(), now.getMonth() + 1, da);
          key = dateKey(d);
          consumed.push(dd[0]);
          t = t.replace(dd[0], " ");
        }
      }
    }

    // "~까지"는 마감 표현 — 날짜만 살리고 표현 정리
    t = t.replace(/까지/g, " ");
    return { key, rest: t, consumed };
  }

  // 한글 숫자 → 시(時) 값
  const KO_HOUR = { "열두": 12, "열한": 11, "열": 10, "아홉": 9, "여덟": 8, "일곱": 7, "여섯": 6, "다섯": 5, "네": 4, "세": 3, "두": 2, "한": 1 };
  const KO_HOUR_RE = "(열두|열한|열|아홉|여덟|일곱|여섯|다섯|네|세|두|한)";

  function buildTimeLabel(hour, ampm, min) {
    if ((ampm === "오후" || ampm === "저녁" || ampm === "밤") && hour < 12) hour += 12;
    if ((ampm === "오전" || ampm === "아침" || ampm === "새벽") && hour === 12) hour = 0;
    return `${hour < 12 ? "오전" : "오후"} ${((hour + 11) % 12) + 1}시${min ? " " + min + "분" : ""}`;
  }

  // 시간 표현 추출 → 표시용 문자열
  function extractTime(text) {
    let t = text;
    let time = null;

    // 1) 숫자 시각: (오전) 3시 (반|30분) (에)
    const hm = t.match(/(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?\s*(에)?/);
    // 2) 한글 시각: (저녁) 여섯 시 (반) (에)
    const km = t.match(new RegExp("(오전|오후|아침|점심|저녁|밤|새벽)?\\s*" + KO_HOUR_RE + "\\s*시\\s*(반)?\\s*(에)?"));

    if (hm) {
      let min = hm[3] === "반" ? 30 : (hm[4] ? Number(hm[4]) : 0);
      time = buildTimeLabel(Number(hm[2]), hm[1], min);
      t = t.replace(hm[0], " ");
    } else if (km) {
      let min = km[3] === "반" ? 30 : 0;
      time = buildTimeLabel(KO_HOUR[km[2]], km[1], min);
      t = t.replace(km[0], " ");
    } else {
      const word = t.match(/(아침|점심|저녁|오전|오후|밤|새벽|정오|자정)/);
      if (word) { time = word[0]; t = t.replace(word[0], " "); }
    }
    return { time, rest: t };
  }

  function stripTails(text) {
    let t = " " + text + " ";
    // 어미/명령 보조어 제거 (긴 것부터)
    const tails = [...ADD_TAILS, ...COMPLETE_MARKERS, ...QUERY_MARKERS].sort((a, b) => b.length - a.length);
    for (const tail of tails) {
      const re = new RegExp(tail.replace(/\s+/g, "\\s*") + "(?=\\s|$)", "g");
      t = t.replace(re, " ");
    }
    return t.replace(/\s+/g, " ").trim();
  }

  function cleanTaskText(raw) {
    let t = stripTails(raw);
    t = t.replace(/[.,!?·~]+$/g, "").trim();
    return t;
  }

  function hasAny(text, arr) {
    const t = text.replace(/\s+/g, "");
    return arr.some((m) => t.includes(m.replace(/\s+/g, "")));
  }

  // 발화 → 의도 분류
  function classify(text) {
    const t = text.trim();
    if (!t) return { intent: "empty" };
    if (GOAL_PREFIX.some((p) => t.replace(/\s+/g, "").startsWith(p.replace(/\s+/g, "")))) {
      return { intent: "goal_add" };
    }
    if (hasAny(t, QUERY_MARKERS)) return { intent: "query" };
    if (hasAny(t, COMPLETE_MARKERS)) return { intent: "complete" };
    return { intent: "add" };
  }

  function splitTasks(text) {
    return text
      .split(/그리고나서|그리고|그담에|그 다음|그다음|,|、|\s또\s/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // 내용어 토큰 (완료 매칭용)
  function contentTokens(text) {
    return cleanTaskText(text)
      .split(/\s+/)
      .map((w) => w.replace(/[은는이가을를에서로으로와과의도만]$/g, ""))
      .filter((w) => w.length >= 2);
  }

  // ----------------------------------------------------------------------
  // 명령 실행
  // ----------------------------------------------------------------------
  function handleUtterance(text) {
    const { intent } = classify(text);
    if (intent === "empty") return { type: "warn", msg: "잘 못 들었어요. 다시 말해 주세요." };
    if (intent === "goal_add") return doGoalAdd(text);
    if (intent === "query") return doQuery(text);
    if (intent === "complete") return doComplete(text);
    return doAdd(text);
  }

  function doAdd(text) {
    const parts = splitTasks(text);
    const added = [];
    let lastDate = null;
    for (const part of parts) {
      const d = extractDate(part);
      const tm = extractTime(d.rest);
      const body = cleanTaskText(tm.rest);
      if (!body) continue;
      const cat = inferCategory(part);
      const dateK = d.key || lastDate; // 앞 절의 날짜 이어받기
      lastDate = dateK;
      const todo = {
        id: uid(), text: body, date: dateK, time: tm.time || null,
        category: cat.name, icon: cat.icon, done: false, createdAt: Date.now(),
      };
      state.todos.push(todo);
      added.push(todo);
    }
    if (!added.length) return { type: "warn", msg: "할 일 내용을 알아듣지 못했어요." };
    save();
    const names = added.map((a) => a.text).join(", ");
    const whenSet = [...new Set(added.map((a) => spokenDate(a.date)))].join(", ");
    return {
      type: "ok",
      msg: `📝 ${added.length}개 추가: ${names} (${whenSet})`,
      speak: `${whenSet} 할 일에 ${names} 추가했어요.`,
    };
  }

  function doComplete(text) {
    const tokens = contentTokens(text);
    const open = state.todos.filter((t) => !t.done);
    if (!open.length) return { type: "warn", msg: "완료할 할 일이 없어요." };

    let best = null, bestScore = 0;
    for (const t of open) {
      const tt = contentTokens(t.text);
      let score = 0;
      for (const tok of tokens) {
        if (tt.some((x) => x.includes(tok) || tok.includes(x))) score += 1;
      }
      // 카테고리명 직접 언급도 가산
      if (tokens.includes(t.category)) score += 0.5;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best || bestScore === 0) {
      return { type: "warn", msg: `"${cleanTaskText(text)}"와(과) 맞는 할 일을 못 찾았어요.` };
    }
    best.done = true;
    best.completedAt = Date.now();
    save();
    return { type: "ok", msg: `✅ 완료: ${best.text}`, speak: `${best.text} 완료 처리했어요. 잘하셨어요!` };
  }

  function doQuery(text) {
    // 목표 조회
    if (text.includes("목표")) {
      if (!state.goals.length) return { type: "ok", msg: "🌱 등록된 목표가 없어요.", speak: "아직 등록된 목표가 없어요." };
      const list = state.goals.map((g) => g.text).join(", ");
      return { type: "ok", msg: `🌱 목표: ${list}`, speak: `당신의 목표는 ${list} 입니다. 오늘도 한 걸음.` };
    }
    // 날짜 결정 (없으면 오늘)
    const d = extractDate(text);
    const key = d.key || todayKey();
    const when = spokenDate(key);
    const items = state.todos.filter((t) => t.date === key && !t.done);
    if (!items.length) {
      return { type: "ok", msg: `🔎 ${when}: 할 일이 없어요.`, speak: `${when}은 할 일이 없어요. 여유를 즐기세요.` };
    }
    const names = items.map((t) => (t.time ? `${t.time} ${t.text}` : t.text)).join(", ");
    return {
      type: "ok",
      msg: `🔎 ${when} 할 일 ${items.length}개: ${names}`,
      speak: `${when} 할 일은 ${items.length}개입니다. ${names}.`,
    };
  }

  function doGoalAdd(text) {
    let body = text;
    for (const p of GOAL_PREFIX.sort((a, b) => b.length - a.length)) {
      const re = new RegExp("^\\s*" + p.replace(/\s+/g, "\\s*"));
      if (re.test(body.replace(/\s+/g, (m) => m))) { body = body.replace(re, ""); break; }
    }
    body = cleanTaskText(body);
    if (!body) return { type: "warn", msg: "목표 내용을 못 알아들었어요." };
    state.goals.push({ id: uid(), text: body, createdAt: Date.now() });
    save();
    return { type: "ok", msg: `🌱 목표 추가: ${body}`, speak: `목표에 ${body} 추가했어요.` };
  }

  // ----------------------------------------------------------------------
  // 렌더링
  // ----------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const board = $("#board");
  const boardEmpty = $("#boardEmpty");

  function render() {
    renderGoals();
    renderBoard();
  }

  function renderGoals() {
    const list = $("#goalList");
    list.innerHTML = "";
    $("#goalEmpty").hidden = state.goals.length > 0;
    for (const g of state.goals) {
      const li = document.createElement("li");
      li.className = "goal-item";
      li.innerHTML = `<span class="goal-star">★</span><span class="g-text"></span><button class="g-del" title="삭제">✕</button>`;
      li.querySelector(".g-text").textContent = g.text;
      li.querySelector(".g-del").onclick = () => { state.goals = state.goals.filter((x) => x.id !== g.id); save(); renderGoals(); };
      list.appendChild(li);
    }
  }

  function visibleTodos() {
    const s = state.ui.status;
    return state.todos.filter((t) => s === "all" ? true : s === "done" ? t.done : !t.done);
  }

  function renderBoard() {
    board.innerHTML = "";
    const todos = visibleTodos();
    if (!todos.length) { boardEmpty.hidden = false; return; }
    boardEmpty.hidden = true;

    if (state.ui.group === "date") renderByDate(todos);
    else renderByCategory(todos);
  }

  function groupHeadClass(key) {
    if (!key) return "";
    const diff = Math.round((startOfDay(keyToDate(key)) - startOfDay(new Date())) / 86400000);
    if (diff === 0) return "today";
    if (diff < 0) return "overdue";
    return "";
  }

  function renderByDate(todos) {
    const groups = {};
    for (const t of todos) {
      const k = t.date || "none";
      (groups[k] = groups[k] || []).push(t);
    }
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === "none") return 1;
      if (b === "none") return -1;
      return a < b ? -1 : 1;
    });
    for (const k of keys) {
      const items = groups[k];
      const openCount = items.filter((t) => !t.done).length;
      const sec = makeGroup(
        k === "none" ? "날짜 미정" : humanDate(k),
        `${openCount}개 남음 · 총 ${items.length}`,
        groupHeadClass(k === "none" ? null : k)
      );
      // 시간 → 생성순 정렬
      items.sort((a, b) => (a.done - b.done) || a.createdAt - b.createdAt);
      items.forEach((t) => sec.list.appendChild(todoEl(t)));
      board.appendChild(sec.el);
    }
  }

  function renderByCategory(todos) {
    const groups = {};
    for (const t of todos) (groups[t.category] = groups[t.category] || []).push(t);
    const order = [...CATEGORIES.map((c) => c.name), "기타"];
    const keys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const k of keys) {
      const items = groups[k];
      const icon = (items[0] && items[0].icon) || "📌";
      const openCount = items.filter((t) => !t.done).length;
      const sec = makeGroup(`${icon} ${k}`, `${openCount}개 남음 · 총 ${items.length}`, "");
      items.sort((a, b) => (a.done - b.done) || (a.date || "9").localeCompare(b.date || "9") || a.createdAt - b.createdAt);
      items.forEach((t) => sec.list.appendChild(todoEl(t)));
      board.appendChild(sec.el);
    }
  }

  function makeGroup(title, meta, cls) {
    const el = document.createElement("section");
    el.className = "group";
    el.innerHTML = `
      <div class="group-head ${cls}">
        <span class="g-title"></span><span class="g-meta"></span>
      </div>
      <ul class="todo-list"></ul>`;
    el.querySelector(".g-title").textContent = title;
    el.querySelector(".g-meta").textContent = meta;
    return { el, list: el.querySelector(".todo-list") };
  }

  function todoEl(t) {
    const li = document.createElement("li");
    li.className = "todo" + (t.done ? " done" : "");
    li.innerHTML = `
      <button class="check" title="완료 토글">✓</button>
      <div class="t-main">
        <div class="t-text"></div>
        <div class="t-sub"></div>
      </div>
      <button class="t-del" title="삭제">🗑</button>`;
    li.querySelector(".t-text").textContent = t.text;

    const sub = li.querySelector(".t-sub");
    if (state.ui.group === "category" && t.date) {
      const c = document.createElement("span"); c.className = "chip"; c.textContent = spokenDate(t.date); sub.appendChild(c);
    }
    if (state.ui.group === "date") {
      const c = document.createElement("span"); c.className = "chip"; c.textContent = `${t.icon} ${t.category}`; sub.appendChild(c);
    }
    if (t.time) {
      const c = document.createElement("span"); c.className = "chip time"; c.textContent = `⏰ ${t.time}`; sub.appendChild(c);
    }

    li.querySelector(".check").onclick = () => {
      t.done = !t.done;
      t.completedAt = t.done ? Date.now() : null;
      save(); renderBoard();
    };
    li.querySelector(".t-del").onclick = () => {
      state.todos = state.todos.filter((x) => x.id !== t.id);
      save(); renderBoard();
    };
    return li;
  }

  // ----------------------------------------------------------------------
  // 음성 출력 (TTS)
  // ----------------------------------------------------------------------
  function speak(text) {
    if (!state.settings.tts || !text) return;
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 1.02;
      u.pitch = 1.0;
      const ko = window.speechSynthesis.getVoices().find((v) => /ko/i.test(v.lang));
      if (ko) u.voice = ko;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  // ----------------------------------------------------------------------
  // 음성 입력 (STT)
  // ----------------------------------------------------------------------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recog = null;
  let listening = false;

  const micBtn = $("#micBtn");
  const micHint = $("#micHint");
  const liveBox = $("#liveBox");
  const liveText = $("#liveText");

  function initRecognition() {
    if (!SR) {
      micHint.textContent = "이 브라우저는 음성 인식을 지원하지 않아요. 아래에 직접 입력하세요.";
      micBtn.style.opacity = 0.5;
      return;
    }
    recog = new SR();
    recog.lang = "ko-KR";
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      listening = true;
      micBtn.classList.add("listening");
      micHint.textContent = "듣고 있어요… 말씀하세요";
      liveBox.hidden = false;
      liveText.textContent = "";
    };
    recog.onerror = (e) => {
      micHint.textContent = e.error === "not-allowed"
        ? "마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요."
        : "음성 인식 오류: " + e.error;
    };
    recog.onend = () => {
      listening = false;
      micBtn.classList.remove("listening");
      liveBox.hidden = true;
      if (micHint.textContent.startsWith("듣고")) micHint.textContent = "버튼을 누르고 말해보세요";
    };
    recog.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      liveText.textContent = final || interim;
      if (final.trim()) process(final.trim());
    };
  }

  function toggleMic() {
    if (!recog) return;
    if (listening) { recog.stop(); return; }
    try { recog.start(); } catch (_) {}
  }

  // ----------------------------------------------------------------------
  // 입력 처리 (음성/수동 공통)
  // ----------------------------------------------------------------------
  const lastResult = $("#lastResult");

  function process(text) {
    const res = handleUtterance(text);
    showResult(res);
    if (res.speak) speak(res.speak);
    render();
  }

  function showResult(res) {
    lastResult.hidden = false;
    lastResult.className = "last-result" + (res.type === "warn" ? " warn" : res.type === "err" ? " err" : "");
    lastResult.textContent = res.msg;
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 2200);
  }

  // ----------------------------------------------------------------------
  // 이벤트 바인딩
  // ----------------------------------------------------------------------
  micBtn.onclick = toggleMic;

  $("#manualAddBtn").onclick = submitManual;
  $("#manualInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submitManual(); });
  function submitManual() {
    const inp = $("#manualInput");
    const v = inp.value.trim();
    if (!v) return;
    process(v);
    inp.value = "";
  }

  // 목표 버튼
  $("#addGoalBtn").onclick = () => {
    const v = prompt("작은 목표를 적어주세요 (예: 매일 10분 책 읽기)");
    if (v && v.trim()) { state.goals.push({ id: uid(), text: v.trim(), createdAt: Date.now() }); save(); renderGoals(); }
  };

  // 필터
  $("#statusFilter").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.ui.status = b.dataset.f;
    [...e.currentTarget.children].forEach((c) => c.classList.toggle("active", c === b));
    save(); renderBoard();
  });
  $("#groupMode").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.ui.group = b.dataset.g;
    [...e.currentTarget.children].forEach((c) => c.classList.toggle("active", c === b));
    save(); renderBoard();
  });

  // TTS 토글
  const ttsToggle = $("#ttsToggle");
  function syncTts() {
    ttsToggle.setAttribute("aria-pressed", String(!!state.settings.tts));
    ttsToggle.textContent = state.settings.tts ? "🔊" : "🔇";
  }
  ttsToggle.onclick = () => { state.settings.tts = !state.settings.tts; save(); syncTts(); toast(state.settings.tts ? "음성 읽어주기 켜짐" : "음성 읽어주기 꺼짐"); };

  // 도움말
  $("#helpBtn").onclick = () => ($("#helpModal").hidden = false);
  $("#helpClose").onclick = () => ($("#helpModal").hidden = true);
  $("#helpModal").addEventListener("click", (e) => { if (e.target.id === "helpModal") e.currentTarget.hidden = true; });

  // 내보내기 / 완료 정리
  $("#exportBtn").onclick = (e) => {
    e.preventDefault();
    const blob = new Blob([JSON.stringify({ todos: state.todos, goals: state.goals }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `voice-todo-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#clearDoneBtn").onclick = (e) => {
    e.preventDefault();
    const n = state.todos.filter((t) => t.done).length;
    if (!n) { toast("완료된 항목이 없어요."); return; }
    if (confirm(`완료된 ${n}개 항목을 삭제할까요?`)) {
      state.todos = state.todos.filter((t) => !t.done);
      save(); renderBoard(); toast("완료 항목을 정리했어요.");
    }
  };

  // 초기 필터 UI 상태 반영
  document.querySelectorAll("#statusFilter button").forEach((b) => b.classList.toggle("active", b.dataset.f === state.ui.status));
  document.querySelectorAll("#groupMode button").forEach((b) => b.classList.toggle("active", b.dataset.g === state.ui.group));

  // 음성 목록 미리 로딩 (일부 브라우저)
  if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => {};

  // ----------------------------------------------------------------------
  // 시작
  // ----------------------------------------------------------------------
  initRecognition();
  syncTts();
  render();

  // 디버그/테스트용 노출
  window.__voiceTodo = { handleUtterance, classify, extractDate, extractTime, cleanTaskText, inferCategory, state };
})();
