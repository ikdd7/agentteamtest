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
  // UI 상태 기본값 보강 (예전 저장본 호환)
  state.ui = state.ui || {};
  if (!state.ui.status) state.ui.status = "all";
  if (!state.ui.group) state.ui.group = "date";
  if (!state.ui.tab) state.ui.tab = "home";
  if (!state.ui.calView) state.ui.calView = "month";
  if (!state.ui.calCursor) state.ui.calCursor = todayKey();
  if (!Array.isArray(state.favQuotes)) state.favQuotes = []; // ♥ 즐겨찾기 명언
  if (!Array.isArray(state.myQuotes)) state.myQuotes = [];   // ✍️ 나만의 명언
  if (state.myPledge === undefined) state.myPledge = null;   // 💗 나의 다짐 {t, date}

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
  // 주의: 너무 짧은 표현("끝", "끝나")은 "끝내기/끝나고" 같은 추가 문장을 완료로 오인시킨다
  const COMPLETE_MARKERS = ["완료", "끝냈", "끝났", "다했", "다 했", "처리했", "처리 했", "마쳤", "했어", "했음", "done"];
  const RESCHEDULE_MARKERS = ["미뤄", "미루", "미뤘", "옮겨", "옮기", "연기해", "연기", "바꿔", "변경해", "수정해", "수정"];
  const DELETE_MARKERS = ["삭제", "지워", "지우", "없애", "빼줘", "빼 줘", "취소해", "취소"];
  const QUERY_MARKERS = ["알려줘", "알려 줘", "읽어줘", "읽어 줘", "보여줘", "보여 줘", "들려줘", "뭐야", "뭐 있", "뭐있", "뭐 남", "확인해", "확인 해"];
  // 상담(비서) — 부하를 분석해 제안하고, 확인을 받아 실행한다
  const CONSULT_MARKERS = ["정리해", "조정해", "너무 많", "너무많", "빡빡", "여유가 없", "여유 없", "뭐부터", "뭐 부터", "먼저 할", "요약", "어때"];
  const ADD_TAILS = ["해야 해", "해야해", "해야 돼", "해야돼", "해야지", "해야됨", "할 거야", "할거야", "할거", "할게", "할래", "하기로", "하기", "할 일", "할일", "예정", "등록해줘", "등록해", "추가해줘", "추가해", "추가", "넣어줘", "넣어", "줘", "끝내기", "끝내야 해", "끝내야", "마치기"];
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
    // 오전/오후 없이 말한 1~6시는 낮 시간(오후)으로 해석 — "3시 미팅"은 보통 15시다
    if (!ampm && hour >= 1 && hour <= 6) hour += 12;
    return `${hour < 12 ? "오전" : "오후"} ${((hour + 11) % 12) + 1}시${min ? " " + min + "분" : ""}`;
  }

  // 시각 토큰 하나 매칭 (숫자/한글) — requireKkaji면 "까지"가 붙은 것만
  function matchTimeToken(str, requireKkaji) {
    const K = requireKkaji ? "\\s*까지" : "(?:\\s*까지)?";
    const num = str.match(new RegExp("(오전|오후|아침|점심|저녁|밤|새벽)?\\s*(\\d{1,2})\\s*시\\s*(반|(\\d{1,2})\\s*분)?" + K));
    if (num) {
      const min = num[3] === "반" ? 30 : (num[4] ? Number(num[4]) : 0);
      return { label: buildTimeLabel(Number(num[2]), num[1], min), m: num[0], explicit: !!num[1] };
    }
    const ko = str.match(new RegExp("(오전|오후|아침|점심|저녁|밤|새벽)?\\s*" + KO_HOUR_RE + "\\s*시\\s*(반)?" + K));
    if (ko) {
      return { label: buildTimeLabel(KO_HOUR[ko[2]], ko[1], ko[3] === "반" ? 30 : 0), m: ko[0], explicit: !!ko[1] };
    }
    return null;
  }

  // 시간 표현 추출 → 표시용 문자열 (+ "X시부터 Y시까지" 범위)
  function extractTime(text) {
    let t = text;
    let time = null;
    let timeEnd = null;

    // 시각 뒤에 붙는 조사들 (에/엔/에는/쯤/경/께/정도/부터)
    const JOSA = "(?:에는|엔|에|쯤|경|께|정도|부터)?";
    // 1) 숫자 시각: (오전) 3시 (반|30분) (조사)
    const hm = t.match(new RegExp("(오전|오후|아침|점심|저녁|밤|새벽)?\\s*(\\d{1,2})\\s*시\\s*(반|(\\d{1,2})\\s*분)?\\s*" + JOSA));
    // 2) 한글 시각: (저녁) 여섯 시 (반) (조사)
    const km = t.match(new RegExp("(오전|오후|아침|점심|저녁|밤|새벽)?\\s*" + KO_HOUR_RE + "\\s*시\\s*(반)?\\s*" + JOSA));

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

    // 종료 시각: "부터"가 있었으면 다음 시각을, 아니면 "까지"가 붙은 시각만 종료로 본다
    if (time) {
      const hadRange = /부터/.test(text);
      const end = matchTimeToken(t, !hadRange);
      if (end) {
        timeEnd = end.label;
        // 오전/오후를 안 붙인 종료가 시작보다 이르면 같은 쪽(오후)으로 해석
        // 예) "저녁 6시 반부터 7시 반까지" → 종료는 오후 7시 30분
        if (!end.explicit) {
          const s = timeLabelToHHMM(time), e2 = timeLabelToHHMM(timeEnd);
          if (s && e2 && e2 <= s) {
            let [h, mi] = e2.split(":").map(Number);
            if (h < 12) {
              h += 12;
              timeEnd = `${h < 12 ? "오전" : "오후"} ${((h + 11) % 12) + 1}시${mi ? ` ${mi}분` : ""}`;
            }
          }
        }
        t = t.replace(end.m, " ");
      }
      t = t.replace(/부터/g, " "); // 잔여 정리
    }
    return { time, timeEnd, rest: t };
  }

  // "오후 1시 30분 ~ 3시" 표기 (종료가 같은 오전/오후면 접두 생략)
  function timeRangeText(t) {
    if (!t.time) return null;
    if (!t.timeEnd) return t.time;
    let end = t.timeEnd;
    const pre = t.time.split(" ")[0];
    if (end.startsWith(pre + " ")) end = end.slice(pre.length + 1);
    return `${t.time} ~ ${end}`;
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
    // 시간/날짜를 떼어낸 뒤 맨 앞에 홀로 남은 조사 정리 ("에 밥 먹기" → "밥 먹기")
    t = t.replace(/^(?:에는|에서|에게|엔|에|의|을|를)\s+/g, "").trim();
    t = t.replace(/(^|\s)(부터|까지)(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
    t = t.replace(/[.,!?·~]+$/g, "").trim();
    return t;
  }

  function hasAny(text, arr) {
    // 공백을 전부 지우고 비교하면 "…까지 워크숍"이 "지워"로 오인되는 식의
    // 단어 경계 침범이 생긴다 — 마커 내부 공백만 유연하게 매칭한다
    return arr.some((m) => new RegExp(m.replace(/\s+/g, "\\s*")).test(text));
  }

  // 발화 → 의도 분류
  function classify(text) {
    const t = text.trim();
    if (!t) return { intent: "empty" };
    if (GOAL_PREFIX.some((p) => t.replace(/\s+/g, "").startsWith(p.replace(/\s+/g, "")))) {
      return { intent: "goal_add" };
    }
    if (hasAny(t, DELETE_MARKERS)) return { intent: "delete" };
    if (hasAny(t, RESCHEDULE_MARKERS)) return { intent: "reschedule" };
    if (hasAny(t, CONSULT_MARKERS)) return { intent: "consult" };
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
      // 조사 제거는 3글자 이상일 때만 — "요가", "치과" 같은 단어의 끝 글자를 지우면 안 된다
      .map((w) => (w.length >= 3 ? w.replace(/[은는이가을를에서로으로와과의도만]$/g, "") : w))
      .filter((w) => w.length >= 2);
  }

  // ----------------------------------------------------------------------
  // 명령 실행
  // ----------------------------------------------------------------------
  // 비서가 제안하고 확인을 기다리는 상태 (한 번에 하나)
  let pendingAction = null;
  const CONFIRM_RE = /^(응|어|그래|좋아|좋지|네|예|웅|오케이|ok|okay|그렇게 해\s*줘?|해\s*줘|옮겨\s*줘?)[.!~ ]*$/i;
  const CANCEL_RE = /^(아니|아냐|아니요|아니야|싫어|취소|놔둬|놔 둬|그대로 둬?|괜찮아)[.!~ ]*$/;

  function handleUtterance(text) {
    const t = text.trim();
    // 비서가 던진 질문/제안에 대한 답변부터 처리
    if (pendingAction) {
      // 1) "몇 시로 할까요?" 에 대한 답
      if (pendingAction.kind === "ask-time") {
        const p = pendingAction;
        if (CANCEL_RE.test(t)) { pendingAction = null; return { type: "ok", msg: "👌 알겠어요, 등록하지 않을게요.", speak: "알겠어요." }; }
        const dd = extractDate(t);
        const tm = extractTime(dd.rest);
        const leftover = cleanTaskText(extractPlace(tm.rest).rest);
        // 시간만 답했을 때만 초안에 채운다 ("오늘 9시에 회의"처럼 내용이 있으면 새 명령)
        if (tm.time && !leftover) {
          pendingAction = null;
          return commitAdd({ ...p.draft, date: dd.key || p.draft.date, time: tm.time, timeEnd: tm.timeEnd });
        }
        if (!tm.time && t.length <= 10 && /없|몰라|모르|나중|미정|안\s*정|패스|스킵|아무\s*때/.test(t)) { pendingAction = null; return commitAdd({ ...p.draft, time: null }); }
        pendingAction = null; // 시간 답이 아니면 새 명령으로 처리
      }
      // 2) "무엇을 하실 건가요?" 에 대한 답
      else if (pendingAction.kind === "ask-text") {
        const p = pendingAction;
        if (CANCEL_RE.test(t)) { pendingAction = null; return { type: "ok", msg: "👌 알겠어요, 등록하지 않을게요.", speak: "알겠어요." }; }
        const body = cleanTaskText(extractTime(extractDate(t).rest).rest);
        pendingAction = null;
        if (body) return commitAdd({ ...p.draft, text: body });
        return { type: "warn", msg: "🤔 무슨 일인지 잘 못 알아들었어요. 처음부터 다시 말해 주세요." };
      }
      // 3) 정리 제안(옮기기)에 대한 응/아니
      else {
        if (CONFIRM_RE.test(t)) return applyPending();
        if (CANCEL_RE.test(t)) {
          pendingAction = null;
          return { type: "ok", msg: "👌 알겠어요, 그대로 둘게요.", speak: "알겠어요, 그대로 둘게요." };
        }
        pendingAction = null; // 다른 말을 하면 제안은 조용히 접는다
      }
    }
    const { intent } = classify(t);
    if (intent === "empty") return { type: "warn", msg: "잘 못 들었어요. 다시 말해 주세요." };
    if (intent === "goal_add") return doGoalAdd(t);
    if (intent === "delete") return doDelete(t);
    if (intent === "reschedule") return doReschedule(t);
    if (intent === "consult") return doConsult(t);
    if (intent === "query") return doQuery(t);
    if (intent === "complete") return doComplete(t);
    return doAdd(t);
  }

  function applyPending() {
    const p = pendingAction;
    pendingAction = null;
    if (p.kind === "move") {
      for (const id of p.ids) {
        const t = state.todos.find((x) => x.id === id);
        if (t) t.date = p.target;
      }
      save();
      const remain = state.todos.filter((t) => t.date === p.from && !t.done).length;
      return {
        type: "ok",
        msg: `⏭ ${p.ids.length}개를 ${spokenDate(p.target)}(으)로 옮겼어요. ${spokenDate(p.from)}은 이제 ${remain}개예요.`,
        speak: `${p.ids.length}개를 ${spokenDate(p.target)}로 옮겼어요. ${spokenDate(p.from)}은 이제 ${remain}개예요.`,
      };
    }
    return { type: "warn", msg: "적용할 제안이 없어요." };
  }

  // "오늘 너무 많아 정리해줘" / "뭐부터 하지" / "이번 주 요약"
  function doConsult(text) {
    // 1) 뭐부터 할지 추천
    if (/뭐\s*부터|먼저\s*할/.test(text)) {
      const items = state.todos
        .filter((t) => t.date === todayKey() && !t.done)
        .sort((a, b) => (timeLabelToHHMM(a.time) || "99") < (timeLabelToHHMM(b.time) || "99") ? -1 : 1);
      if (!items.length) return { type: "ok", msg: "오늘은 남은 할 일이 없어요 ✨", speak: "오늘은 남은 할 일이 없어요." };
      const first = items[0];
      const rest = items.slice(1, 3).map((t) => t.text).join(", ");
      const msg = `지금은 "${first.text}"${first.time ? ` (${first.time})` : ""}부터 시작하는 게 좋겠어요.${rest ? ` 그다음은 ${rest}.` : ""}`;
      return { type: "ok", msg: "💡 " + msg, speak: msg };
    }
    // 2) 주간 요약
    if (/주.*(요약|어때)|요약.*주|이번\s*주/.test(text)) {
      const parts = [];
      for (let i = 0; i < 7; i++) {
        const k = dateKey(addDays(new Date(), i));
        const n = state.todos.filter((t) => t.date === k && !t.done).length;
        if (n) parts.push(`${spokenDate(k)} ${n}개`);
      }
      if (!parts.length) return { type: "ok", msg: "📋 앞으로 일주일은 비어 있어요.", speak: "앞으로 일주일은 할 일이 없어요. 여유롭네요." };
      const msg = `앞으로 일주일: ${parts.join(", ")} 남았어요.`;
      return { type: "ok", msg: "📋 " + msg, speak: msg };
    }
    // 3) 과부하 상담 → 옮기기 제안
    const d = extractDate(text);
    const fromKey = d.key || todayKey();
    const items = state.todos.filter((t) => t.date === fromKey && !t.done);
    if (items.length <= 2) {
      const msg = `${spokenDate(fromKey)}은 ${items.length ? `${items.length}개뿐이라` : "할 일이 없어서"} 여유 있어요. 그대로 가도 좋겠어요.`;
      return { type: "ok", msg: "💡 " + msg, speak: msg };
    }
    // 시간 약속 없는 것부터, 나중에 추가한 것부터 옮길 후보로 (최소 1개, 3개는 남긴다)
    const moveCount = Math.max(1, items.length - 3);
    const candidates = [...items]
      .sort((a, b) => ((a.time ? 1 : 0) - (b.time ? 1 : 0)) || b.createdAt - a.createdAt)
      .slice(0, moveCount);
    // 다음 3일 중 가장 한가한 날로
    let target = null, min = Infinity;
    for (let i = 1; i <= 3; i++) {
      const k = dateKey(addDays(keyToDate(fromKey), i));
      const n = state.todos.filter((t) => t.date === k && !t.done).length;
      if (n < min) { min = n; target = k; }
    }
    pendingAction = { kind: "move", ids: candidates.map((t) => t.id), target, from: fromKey };
    const names = candidates.map((t) => `"${t.text}"`).join(", ");
    const msg = `${spokenDate(fromKey)} 할 일이 ${items.length}개예요. 시간 약속이 없는 ${names}를 ${spokenDate(target)}(현재 ${min}개)로 옮길까요?`;
    return {
      type: "ok",
      msg: `🤝 ${msg} — "응"이라고 답하면 옮겨드려요`,
      speak: msg + " 응이라고 답하면 옮겨드려요.",
    };
  }

  // 장소는 선택 사항 — "강남역에서 저녁 약속"처럼 말하면 뽑아둔다
  function extractPlace(text) {
    const m = text.match(/([가-힣A-Za-z0-9]{2,})에서(?=\s|$)/);
    if (m) return { place: m[1], rest: text.replace(m[0], " ") };
    return { place: null, rest: text };
  }

  function commitAdd(draft) {
    const cat = inferCategory(draft.text);
    const todo = {
      id: uid(), text: draft.text, date: draft.date, time: draft.time || null,
      timeEnd: draft.timeEnd || null,
      place: draft.place || null,
      category: cat.name, icon: cat.icon, done: false, createdAt: Date.now(),
    };
    state.todos.push(todo);
    save();
    const bits = [`"${todo.text}"`, spokenDate(todo.date)];
    if (todo.time) bits.push(timeRangeText(todo));
    if (todo.place) bits.push(`📍${todo.place}`);
    if (todo.category !== "기타") bits.push(`${todo.icon} ${todo.category}`);
    return {
      type: "ok",
      msg: `✓ 추가됨  ${bits.join(" · ")}`,
      speak: `${spokenDate(todo.date)}${todo.time ? " " + todo.time : ""}에 ${todo.text} 추가했어요.`,
    };
  }

  function doAdd(text) {
    const parts = splitTasks(text);

    // 한 건이면 비서처럼 빠진 정보를 되묻는다
    if (parts.length === 1) {
      const d = extractDate(parts[0]);
      const tm = extractTime(d.rest);
      const pl = extractPlace(tm.rest);
      const body = cleanTaskText(pl.rest);
      const dateK = d.key || todayKey();
      if (!body) {
        pendingAction = { kind: "ask-text", draft: { date: dateK, time: tm.time || null, timeEnd: tm.timeEnd || null, place: pl.place } };
        return {
          type: "ok",
          msg: `🤔 ${spokenDate(dateK)}${tm.time ? ` ${tm.time}` : ""}에 무엇을 하실 건가요?`,
          speak: "무엇을 하실 건가요?",
        };
      }
      if (!tm.time) {
        pendingAction = { kind: "ask-time", draft: { text: body, date: dateK, place: pl.place } };
        return {
          type: "ok",
          msg: `⏰ ${spokenDate(dateK)} "${body}", 몇 시로 할까요?  예) "오후 3시" · 시간이 없으면 "시간 없어"`,
          speak: `${body}, 몇 시로 할까요? 시간이 없으면 없다고 말해 주세요.`,
        };
      }
      return commitAdd({ text: body, date: dateK, time: tm.time, timeEnd: tm.timeEnd, place: pl.place });
    }

    // 여러 건("그리고")이면 되묻지 않고 한 번에 등록한다
    const added = [];
    let lastDate = null;
    for (const part of parts) {
      const d = extractDate(part);
      const tm = extractTime(d.rest);
      const pl = extractPlace(tm.rest);
      const body = cleanTaskText(pl.rest);
      if (!body) continue;
      const cat = inferCategory(part);
      const dateK = d.key || lastDate || todayKey();
      lastDate = dateK;
      const todo = {
        id: uid(), text: body, date: dateK, time: tm.time || null, timeEnd: tm.timeEnd || null, place: pl.place || null,
        category: cat.name, icon: cat.icon, done: false, createdAt: Date.now(),
      };
      state.todos.push(todo);
      added.push(todo);
    }
    if (!added.length) return { type: "warn", msg: "할 일 내용을 알아듣지 못했어요." };
    save();
    const lines = added.map((a) => {
      const bits = [`"${a.text}"`, spokenDate(a.date)];
      if (a.time) bits.push(timeRangeText(a));
      if (a.place) bits.push(`📍${a.place}`);
      if (a.category !== "기타") bits.push(`${a.icon} ${a.category}`);
      return bits.join(" · ");
    });
    const names = added.map((a) => a.text).join(", ");
    const whenSet = [...new Set(added.map((a) => spokenDate(a.date)))].join(", ");
    return {
      type: "ok",
      msg: `✓ 추가됨  ${lines.join("  /  ")}`,
      speak: `${whenSet} 할 일에 ${names} 추가했어요.`,
    };
  }

  // 발화 토큰과 가장 잘 맞는 할 일 찾기 (완료/미루기/삭제/수정 공용)
  // 같은 점수면 오늘 → 지난 → 미래 순으로 우선한다
  function datePriority(t) {
    if (!t.date) return 3;
    if (t.date === todayKey()) return 0;
    return t.date < todayKey() ? 1 : 2;
  }
  function matchTodo(tokens, pool) {
    const ordered = [...pool].sort((a, b) => datePriority(a) - datePriority(b) || (a.date || "9").localeCompare(b.date || "9"));
    let best = null, bestScore = 0;
    for (const t of ordered) {
      const tt = contentTokens(t.text);
      let score = 0;
      for (const tok of tokens) {
        if (tt.some((x) => x.includes(tok) || tok.includes(x))) score += 1;
      }
      if (tokens.includes(t.category)) score += 0.5;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return bestScore > 0 ? best : null;
  }
  // 날짜를 언급했으면 그 날짜부터 찾고, 없으면 전체에서 찾는다
  function findTarget(text, pool) {
    const d = extractDate(text);
    const tokens = contentTokens(d.rest);
    let best = null;
    if (d.key) best = matchTodo(tokens, pool.filter((t) => t.date === d.key));
    if (!best) best = matchTodo(tokens, pool);
    return { best, tokens, dateKeyMentioned: d.key, rest: d.rest };
  }

  function doComplete(text) {
    const open = state.todos.filter((t) => !t.done);
    if (!open.length) return { type: "warn", msg: "완료할 할 일이 없어요." };
    const { best } = findTarget(text, open);
    if (!best) {
      return { type: "warn", msg: `"${cleanTaskText(text)}"와(과) 맞는 할 일을 못 찾았어요.` };
    }
    best.done = true;
    best.completedAt = Date.now();
    save();
    // 오늘이 아닌 할 일을 완료했다면 어떤 날짜의 것인지 분명히 알려준다
    const when = best.date && best.date !== todayKey() ? ` (${spokenDate(best.date)})` : "";
    return { type: "ok", msg: `✅ 완료: ${best.text}${when}`, speak: `${best.text} 완료 처리했어요. 잘하셨어요!` };
  }

  // "운동 삭제해줘", "약속 취소해줘" — 완료가 아니라 없애고 싶을 때
  function doDelete(text) {
    if (!state.todos.length) return { type: "warn", msg: "삭제할 할 일이 없어요." };
    let rest = text;
    for (const m of [...DELETE_MARKERS].sort((a, b) => b.length - a.length)) {
      rest = rest.split(m).join(" ");
    }
    const { best } = findTarget(rest, state.todos);
    if (!best) {
      return { type: "warn", msg: `"${cleanTaskText(rest)}"와(과) 맞는 할 일을 못 찾았어요.` };
    }
    state.todos = state.todos.filter((t) => t.id !== best.id);
    save();
    return {
      type: "ok",
      msg: `🗑 삭제: "${best.text}" (${spokenDate(best.date)})`,
      speak: `${best.text} 삭제했어요.`,
    };
  }

  // "운동을 요가로 바꿔줘" — 내용 수정
  function doRename(text) {
    const open = state.todos.filter((t) => !t.done);
    if (!open.length) return { type: "warn", msg: "수정할 할 일이 없어요." };
    let m = text.match(/(.+?)(?:을|를)\s*(.+?)(?:으로|로)\s*(?:바꿔|변경|수정)/);
    if (!m) m = text.match(/(.+?)\s+(\S+?)(?:으로|로)\s*(?:바꿔|변경|수정)/);
    if (!m) return { type: "warn", msg: `「운동을 요가로 바꿔줘」처럼 말해 주세요.` };
    const best = matchTodo(contentTokens(m[1]), open);
    if (!best) {
      return { type: "warn", msg: `"${cleanTaskText(m[1])}"와(과) 맞는 할 일을 못 찾았어요.` };
    }
    const oldText = best.text;
    const newText = cleanTaskText(m[2]);
    if (!newText) return { type: "warn", msg: "무엇으로 바꿀지 못 알아들었어요." };
    best.text = newText;
    const cat = inferCategory(newText);
    best.category = cat.name;
    best.icon = cat.icon;
    save();
    return { type: "ok", msg: `✏️ 수정: "${oldText}" → "${newText}"`, speak: `${oldText}를 ${newText}로 바꿨어요.` };
  }

  // "운동 내일로 미뤄줘" / "CPR교육 한시반으로 수정" — 날짜·시간을 뽑고 나머지로 할 일을 찾아 옮긴다
  // 날짜도 시간도 없이 "바꿔/수정"이면 내용 수정으로 처리
  function doReschedule(text) {
    const d = extractDate(text);
    const tm = extractTime(d.rest);
    if (!d.key && !tm.time && /(바꿔|변경|수정)/.test(text)) return doRename(text);
    const open = state.todos.filter((t) => !t.done);
    if (!open.length) return { type: "warn", msg: "옮길 할 일이 없어요." };
    let rest = tm.rest;
    for (const m of [...RESCHEDULE_MARKERS].sort((a, b) => b.length - a.length)) {
      rest = rest.split(m).join(" ");
    }
    rest = rest.replace(/(으로|로)\s/g, " ").replace(/(으로|로)$/g, " ");
    const best = matchTodo(contentTokens(rest), open);
    if (!best) {
      return { type: "warn", msg: `"${cleanTaskText(rest)}"와(과) 맞는 할 일을 못 찾았어요.` };
    }
    // 날짜/시간 중 말한 것만 바꾼다. 둘 다 없으면(그냥 "미뤄줘") 내일로
    if (!d.key && !tm.time) {
      best.date = dateKey(addDays(new Date(), 1));
    } else {
      if (d.key) best.date = d.key;
      if (tm.time) { best.time = tm.time; best.timeEnd = tm.timeEnd || null; }
    }
    save();
    const parts = [];
    if (d.key) parts.push(spokenDate(d.key));
    if (tm.time) parts.push(tm.time);
    const when = parts.join(" ") || spokenDate(best.date);
    return {
      type: "ok",
      msg: `⏭ "${best.text}" → ${when}(으)로 옮겼어요`,
      speak: `${best.text}, ${when}로 옮겼어요.`,
    };
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
    renderCalendar();
  }

  function renderGoals() {
    const list = $("#goalList");
    list.innerHTML = "";
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
    boardEmpty.hidden = true;
    renderDayPager(visibleTodos());
    // 필터는 거를 것이 생겼을 때만 보여준다
    const filters = document.querySelector("#filtersRow");
    if (filters) filters.hidden = state.todos.length === 0;
  }

  // 첫 사용 예시 — 빈 상태 안에서만 안내한다 (안내 메시지는 화면에 하나만)
  const SUGGESTS = ["오늘 오후 세시에 운동하기", "내일 아침 여섯시에 일어나기", "목표 추가 매일 책 10분 읽기"];

  // ----------------------------------------------------------------------
  // 데이 페이저 — ‹ › 로 하루씩 넘겨보는 홈 보드 (모바일은 스와이프)
  // ----------------------------------------------------------------------
  let homeDay = todayKey(); // 세션 동안만 유지, 열 때는 항상 오늘
  let dayDir = 0;           // 넘김 방향 (슬라이드 애니메이션용)

  function shiftDay(n) {
    dayDir = n;
    homeDay = dateKey(addDays(keyToDate(homeDay), n));
    renderBoard();
  }
  function goToday() { dayDir = 0; homeDay = todayKey(); renderBoard(); }

  function renderDayPager(todos) {
    const key = homeDay;
    const d = keyToDate(key);
    const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);

    const el = document.createElement("section");
    el.className = "hero" + (dayDir > 0 ? " slide-next" : dayDir < 0 ? " slide-prev" : "");
    dayDir = 0;
    el.innerHTML = `
      <div class="day-head">
        <button class="day-nav" aria-label="이전 날">‹</button>
        <div class="day-center">
          <h2 class="day-title"></h2>
          <span class="day-sub"></span>
        </div>
        <button class="day-nav" aria-label="다음 날">›</button>
      </div>
      <div class="day-meta"></div>`;

    const title = diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === 2 ? "모레" : diff === -1 ? "어제" : `${d.getMonth() + 1}월 ${d.getDate()}일`;
    const titleEl = el.querySelector(".day-title");
    titleEl.textContent = title;
    titleEl.classList.add(diff === 0 ? "today" : diff < 0 ? "past" : "future");
    el.querySelector(".day-sub").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
    const navs = el.querySelectorAll(".day-nav");
    navs[0].onclick = () => shiftDay(-1);
    navs[1].onclick = () => shiftDay(1);

    // 메타 줄: 진행률 · 오늘로 복귀 · 지난 미완료 알림
    const meta = el.querySelector(".day-meta");
    const allDay = state.todos.filter((t) => t.date === key);
    if (allDay.length) {
      const p = document.createElement("span");
      p.className = "hero-progress";
      p.textContent = `${allDay.filter((t) => t.done).length}/${allDay.length} 완료`;
      meta.appendChild(p);
    }
    if (diff !== 0) {
      const b = document.createElement("button");
      b.className = "today-btn";
      b.textContent = "오늘로";
      b.onclick = goToday;
      meta.appendChild(b);
    } else {
      const overdue = state.todos.filter((t) => !t.done && t.date && t.date < todayKey());
      if (overdue.length) {
        const b = document.createElement("button");
        b.className = "overdue-pill";
        b.textContent = `지난 미완료 ${overdue.length}개 보기`;
        b.onclick = () => { homeDay = overdue.map((t) => t.date).sort().pop(); dayDir = -1; renderBoard(); };
        meta.appendChild(b);
      }
    }
    if (!meta.children.length) meta.remove();

    // 그날의 목록 — 아워 그리드는 비어 있어도 항상 보여준다 (빈 칸 눌러 추가)
    const items = todos.filter((t) => t.date === key);
    if (!items.length && diff === 0 && !state.todos.length) {
      // 완전 첫 사용 안내
      const chips = document.createElement("div");
      chips.className = "suggest-chips";
      SUGGESTS.forEach((s) => {
        const b = document.createElement("button");
        b.className = "suggest-chip";
        b.textContent = s;
        b.onclick = () => process(s);
        chips.appendChild(b);
      });
      el.appendChild(chips);
    } else if (!items.length && allDay.length) {
      const empty = document.createElement("p");
      empty.className = "hero-empty";
      empty.textContent = "이 날 몫은 다 끝냈어요. 멋져요 ✨";
      el.appendChild(empty);
    }
    el.appendChild(timelineEl(items, key));
    board.appendChild(el);

    // 날짜 미정 항목(예전 데이터)은 아래에 별도 표시
    const none = todos.filter((t) => !t.date);
    if (none.length) {
      const sec = makeGroup("날짜 미정", `${none.filter((t) => !t.done).length}개 남음`, "");
      none.sort((a, b) => (a.done - b.done) || a.createdAt - b.createdAt);
      none.forEach((t) => sec.list.appendChild(todoEl(t)));
      board.appendChild(sec.el);
    }
  }

  // 구글 캘린더식 아워 그리드 — 매 시간을 나열하고 할 일을 해당 칸에 배치
  function hourLabel(h) { return `${h < 12 ? "오전" : "오후"} ${((h + 11) % 12) + 1}시`; }
  function dayWord(key) {
    const diff = Math.round((startOfDay(keyToDate(key)) - startOfDay(new Date())) / 86400000);
    if (diff === 0) return "오늘";
    if (diff === 1) return "내일";
    if (diff === 2) return "모레";
    const d = keyToDate(key);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }

  function timelineEl(items, key) {
    const wrap = document.createElement("div");
    wrap.className = "timeline";

    // 시간 미정 — 종일 일정처럼 맨 위에
    const untimed = items
      .filter((t) => !timeLabelToHHMM(t.time))
      .sort((a, b) => (a.done - b.done) || a.createdAt - b.createdAt);
    if (untimed.length) {
      const lb = document.createElement("div");
      lb.className = "tl-label";
      lb.textContent = "시간 미정";
      wrap.appendChild(lb);
      const ul = document.createElement("ul");
      ul.className = "todo-list";
      untimed.forEach((t) => ul.appendChild(todoEl(t)));
      wrap.appendChild(ul);
    }

    // 시간별 묶기
    const byHour = {};
    items.filter((t) => timeLabelToHHMM(t.time)).forEach((t) => {
      const h = Number(timeLabelToHHMM(t.time).split(":")[0]);
      (byHour[h] = byHour[h] || []).push(t);
    });
    // 기본 오전 6시~오후 10시. 일정이 있거나(오늘은) 현재 시각이 벗어나면 범위 자동 확장
    const isToday = key === todayKey();
    const now = new Date();
    let start = 6, end = 22;
    Object.keys(byHour).map(Number).forEach((h) => { if (h < start) start = h; if (h > end) end = h; });
    if (isToday) {
      if (now.getHours() < start) start = now.getHours();
      if (now.getHours() > end) end = now.getHours();
    }

    for (let h = start; h <= end; h++) {
      const row = document.createElement("div");
      row.className = "hg-row";
      const timeCol = document.createElement("div");
      timeCol.className = "hg-time";
      timeCol.textContent = hourLabel(h);
      const slot = document.createElement("div");
      slot.className = "hg-slot";
      const tasks = (byHour[h] || []).sort((a, b) => timeLabelToHHMM(a.time).localeCompare(timeLabelToHHMM(b.time)) || a.createdAt - b.createdAt);
      if (tasks.length) slot.classList.add("has");
      // 30분 단위: 정시(:00~:29)와 반(:30~:59) 두 칸으로 나눈다
      const firstHalf = tasks.filter((t) => Number(timeLabelToHHMM(t.time).split(":")[1]) < 30);
      const secondHalf = tasks.filter((t) => Number(timeLabelToHHMM(t.time).split(":")[1]) >= 30);
      [firstHalf, secondHalf].forEach((half, idx) => {
        const halfEl = document.createElement("div");
        halfEl.className = "hg-half" + (idx === 1 ? " h30" : "");
        if (half.length) {
          const ul = document.createElement("ul");
          ul.className = "todo-list";
          half.forEach((t) => ul.appendChild(todoEl(t)));
          halfEl.appendChild(ul);
        } else {
          // 빈 반 칸을 누르면 그 시각으로 바로 추가
          halfEl.classList.add("empty");
          halfEl.title = "눌러서 이 시간에 추가";
          halfEl.onclick = () => {
            const inp = $("#manualInput");
            inp.value = `${dayWord(key)} ${hourLabel(h)}${idx === 1 ? " 반" : ""}에 `;
            inp.focus();
          };
        }
        slot.appendChild(halfEl);
      });
      // 현재 시각 표시선 (오늘 + 해당 시간대)
      if (isToday && now.getHours() === h) {
        const line = document.createElement("div");
        line.className = "hg-now";
        line.style.top = `${Math.round((now.getMinutes() / 60) * 100)}%`;
        row.appendChild(line);
      }
      row.appendChild(timeCol);
      row.appendChild(slot);
      wrap.appendChild(row);
    }
    return wrap;
  }

  // 모바일 스와이프로 하루씩 넘기기
  let swipeX = null;
  board.addEventListener("touchstart", (e) => { swipeX = e.touches[0].clientX; }, { passive: true });
  board.addEventListener("touchend", (e) => {
    if (swipeX === null) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 60) shiftDay(dx < 0 ? 1 : -1);
  }, { passive: true });

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

  // "오후 2시 30분" ↔ "14:30" 변환. 말 시간(아침/저녁 등)은 대략적인 시각으로
  const WORD_TIME = { "새벽": "05:00", "아침": "07:00", "오전": "10:00", "점심": "12:00", "오후": "15:00", "저녁": "19:00", "밤": "21:00" };
  function timeLabelToHHMM(label) {
    if (!label) return "";
    const m = label.match(/(오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/);
    if (!m) return WORD_TIME[label.trim()] || "";
    let h = Number(m[2]);
    const min = m[3] ? Number(m[3]) : 0;
    if (m[1] === "오후" && h < 12) h += 12;
    if (m[1] === "오전" && h === 12) h = 0;
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }
  function hhmmToLabel(v) {
    const [h, min] = v.split(":").map(Number);
    return `${h < 12 ? "오전" : "오후"} ${((h + 11) % 12) + 1}시${min ? ` ${min}분` : ""}`;
  }

  const ALL_CATEGORIES = [...CATEGORIES, { name: "기타", icon: "📌" }];

  // 카테고리 칩 — 누르면 그 자리에서 선택 목록으로 바뀐다
  function categoryChip(t) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip chip-btn";
    c.title = "눌러서 카테고리 변경";
    c.textContent = t.category; // 칸에는 이름만 딱
    c.onclick = (e) => {
      e.stopPropagation();
      const sel = document.createElement("select");
      sel.className = "chip-edit";
      ALL_CATEGORIES.forEach((cat) => {
        const o = document.createElement("option");
        o.value = cat.name;
        o.textContent = `${cat.icon} ${cat.name}`;
        if (cat.name === t.category) o.selected = true;
        sel.appendChild(o);
      });
      c.replaceWith(sel);
      sel.focus();
      sel.onchange = () => {
        const cat = ALL_CATEGORIES.find((x) => x.name === sel.value);
        t.category = cat.name;
        t.icon = cat.icon;
        sel.onblur = null;
        save(); render();
      };
      sel.onblur = () => render(); // 선택 없이 벗어나면 원상 복구
    };
    return c;
  }

  // 시간 칩 — 누르면 시작~종료를 함께 설정. 시간이 없으면 "+ 시간" 칩
  function timeChip(t) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip chip-btn" + (t.time ? " time" : " ghost");
    c.title = t.time ? "눌러서 시간 변경 (시작~종료)" : "시간 추가";
    c.textContent = t.time ? `⏰ ${timeRangeText(t)}` : "+ 시간";
    c.onclick = (e) => {
      e.stopPropagation();
      const wrap = document.createElement("span");
      wrap.className = "chip-range";
      wrap.onclick = (ev) => ev.stopPropagation();
      const s = document.createElement("input");
      s.type = "time"; s.className = "chip-edit";
      s.value = timeLabelToHHMM(t.time) || "09:00";
      const tilde = document.createElement("span");
      tilde.className = "chip-tilde"; tilde.textContent = "~";
      const en = document.createElement("input");
      en.type = "time"; en.className = "chip-edit";
      en.value = timeLabelToHHMM(t.timeEnd) || "";
      en.title = "종료 시각 (비우면 없음)";
      const ok = document.createElement("button");
      ok.type = "button"; ok.className = "chip-ok"; ok.textContent = "✓"; ok.title = "저장";
      ok.onclick = (ev) => {
        ev.stopPropagation();
        t.time = s.value ? hhmmToLabel(s.value) : null;
        t.timeEnd = t.time && en.value ? hhmmToLabel(en.value) : null;
        save(); render();
      };
      wrap.append(s, tilde, en, ok);
      c.replaceWith(wrap);
      s.focus();
    };
    return c;
  }

  function todoEl(t, opts) {
    opts = opts || {};
    const li = document.createElement("li");
    li.dataset.cat = t.category; // 카테고리별 색상용
    li.className = "todo" + (t.done ? " done" : "");
    li.innerHTML = `
      <button class="check" title="완료 토글">✓</button>
      <div class="t-main">
        <div class="t-text"></div>
        <div class="t-sub"></div>
      </div>
      <button class="t-del" title="삭제">🗑</button>`;
    const textEl = li.querySelector(".t-text");
    textEl.textContent = t.text;
    li.title = "눌러서 상세·메모";
    // 블록을 누르면 상세/메모 팝업 (버튼·칩·입력은 각자 동작)
    li.onclick = (e) => {
      if (e.target.closest("button, select, input, .chip-btn")) return;
      openTaskModal(t);
    };

    const sub = li.querySelector(".t-sub");
    sub.appendChild(categoryChip(t));
    if (!opts.hideTime) sub.appendChild(timeChip(t)); // 타임라인에선 왼쪽 시간축이 대신한다
    if (t.place) {
      const pc = document.createElement("span");
      pc.className = "chip";
      pc.textContent = `📍 ${t.place}`;
      sub.appendChild(pc);
    }
    if (t.memo) {
      const mc = document.createElement("span");
      mc.className = "chip memo";
      mc.textContent = "📝 메모";
      sub.appendChild(mc);
    }

    li.querySelector(".check").onclick = (e) => {
      e.stopPropagation();
      t.done = !t.done;
      t.completedAt = t.done ? Date.now() : null;
      save(); render();
    };
    li.querySelector(".t-del").onclick = (e) => {
      e.stopPropagation();
      state.todos = state.todos.filter((x) => x.id !== t.id);
      save(); render();
    };
    return li;
  }

  // ----------------------------------------------------------------------
  // 일정 상세·메모 팝업
  // ----------------------------------------------------------------------
  let modalTaskId = null;
  function openTaskModal(t) {
    modalTaskId = t.id;
    $("#taskTitle").value = t.text;
    $("#taskMemo").value = t.memo || "";
    const meta = [spokenDate(t.date), timeRangeText(t), t.place && `📍${t.place}`, `${t.icon} ${t.category}`].filter(Boolean).join(" · ");
    $("#taskMeta").textContent = meta;
    $("#taskModal").hidden = false;
    $("#taskMemo").focus();
  }
  function closeTaskModal() { $("#taskModal").hidden = true; modalTaskId = null; }
  function saveTaskModal() {
    const t = state.todos.find((x) => x.id === modalTaskId);
    if (t) {
      const v = $("#taskTitle").value.trim();
      if (v && v !== t.text) {
        t.text = v;
        const cat = inferCategory(v);
        t.category = cat.name;
        t.icon = cat.icon;
      }
      t.memo = $("#taskMemo").value.trim() || null;
      save(); render();
    }
    closeTaskModal();
  }

  // ----------------------------------------------------------------------
  // 달력 (연 / 월 / 주 / 일)
  // ----------------------------------------------------------------------
  function calCursorDate() { return keyToDate(state.ui.calCursor); }
  function setCursor(d) { state.ui.calCursor = dateKey(d); save(); }
  function todosOn(key) { return state.todos.filter((t) => t.date === key); }
  function dayStat(key) {
    const items = todosOn(key);
    const done = items.filter((t) => t.done).length;
    return { total: items.length, done, pending: items.length - done };
  }
  function isTodayKey(key) { return key === todayKey(); }

  function renderCalendar() {
    const tab = document.querySelector("#calendarTab");
    if (!tab) return;
    document.querySelectorAll("#calViews button").forEach((b) => b.classList.toggle("active", b.dataset.v === state.ui.calView));
    const body = document.querySelector("#calBody");
    const detail = document.querySelector("#calDetail");
    body.innerHTML = ""; detail.innerHTML = "";
    const v = state.ui.calView;
    if (v === "year") renderYearView(body);
    else if (v === "week") renderWeekView(body);
    else if (v === "day") renderDayView(body);
    else renderMonthView(body, detail);
  }

  function setPeriod(label) { document.querySelector("#calPeriod").textContent = label; }

  // 선택된 날짜의 할 일 목록 카드
  function dayDetailCard(key) {
    const card = document.createElement("div");
    card.className = "detail-card";
    const head = document.createElement("div");
    head.className = "detail-head" + (isTodayKey(key) ? " today" : "");
    head.textContent = humanDate(key);
    card.appendChild(head);
    const items = todosOn(key).sort((a, b) => (a.done - b.done) || (a.time || "").localeCompare(b.time || "") || a.createdAt - b.createdAt);
    if (!items.length) {
      const e = document.createElement("div"); e.className = "cal-empty"; e.textContent = "이 날은 할 일이 없어요 🍃";
      card.appendChild(e);
    } else {
      const ul = document.createElement("ul"); ul.className = "todo-list";
      items.forEach((t) => ul.appendChild(todoEl(t)));
      card.appendChild(ul);
    }
    return card;
  }

  // --- 월간 ---
  function renderMonthView(body, detail) {
    const cur = calCursorDate();
    const y = cur.getFullYear(), m = cur.getMonth();
    setPeriod(`${y}년 ${m + 1}월`);

    const grid = document.createElement("div"); grid.className = "cal-grid";
    ["일", "월", "화", "수", "목", "금", "토"].forEach((d, i) => {
      const h = document.createElement("div");
      h.className = "cal-dow" + (i === 0 ? " sun" : i === 6 ? " sat" : "");
      h.textContent = d; grid.appendChild(h);
    });

    const first = new Date(y, m, 1);
    const startBlanks = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < startBlanks; i++) { const c = document.createElement("div"); c.className = "cal-cell empty"; grid.appendChild(c); }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const key = dateKey(d);
      const st = dayStat(key);
      const dow = d.getDay();
      const cell = document.createElement("div");
      cell.className = "cal-cell" + (dow === 0 ? " sun" : dow === 6 ? " sat" : "") +
        (isTodayKey(key) ? " today" : "") + (key === state.ui.calCursor ? " selected" : "");
      const dn = document.createElement("div"); dn.className = "d"; dn.textContent = day; cell.appendChild(dn);
      const dots = document.createElement("div"); dots.className = "cal-dots";
      const total = st.pending + Math.min(st.done, 4);
      if (st.total > 4) {
        const cnt = document.createElement("span"); cnt.className = "cal-count"; cnt.textContent = st.total; dots.appendChild(cnt);
      } else {
        for (let i = 0; i < st.pending; i++) { const o = document.createElement("span"); o.className = "dot pending"; dots.appendChild(o); }
        for (let i = 0; i < st.done; i++) { const o = document.createElement("span"); o.className = "dot done"; dots.appendChild(o); }
      }
      cell.appendChild(dots);
      cell.onclick = () => { setCursor(d); renderCalendar(); };
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    detail.appendChild(dayDetailCard(state.ui.calCursor));
  }

  // --- 주간 ---
  function renderWeekView(body) {
    const cur = calCursorDate();
    const sunday = addDays(cur, -cur.getDay());
    const sat = addDays(sunday, 6);
    setPeriod(`${sunday.getMonth() + 1}.${sunday.getDate()} ~ ${sat.getMonth() + 1}.${sat.getDate()}`);

    const wrap = document.createElement("div"); wrap.className = "cal-week";
    for (let i = 0; i < 7; i++) {
      const d = addDays(sunday, i);
      const key = dateKey(d);
      const st = dayStat(key);
      const block = document.createElement("div");
      block.className = "week-day" + (isTodayKey(key) ? " today" : "");
      const head = document.createElement("div"); head.className = "week-day-head";
      const title = document.createElement("span");
      title.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})${isTodayKey(key) ? " · 오늘" : ""}`;
      const cnt = document.createElement("span"); cnt.className = "wd-count";
      cnt.textContent = st.total ? `${st.pending}개 남음 · 총 ${st.total}` : "없음";
      head.appendChild(title); head.appendChild(cnt); block.appendChild(head);
      const items = todosOn(key).sort((a, b) => (a.done - b.done) || (a.time || "").localeCompare(b.time || "") || a.createdAt - b.createdAt);
      if (items.length) {
        const ul = document.createElement("ul"); ul.className = "todo-list";
        items.forEach((t) => ul.appendChild(todoEl(t)));
        block.appendChild(ul);
      }
      wrap.appendChild(block);
    }
    body.appendChild(wrap);
  }

  // --- 일간 ---
  function renderDayView(body) {
    const key = state.ui.calCursor;
    const d = keyToDate(key);
    setPeriod(`${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`);
    body.appendChild(dayDetailCard(key));
  }

  // --- 연간 ---
  function renderYearView(body) {
    const cur = calCursorDate();
    const y = cur.getFullYear();
    setPeriod(`${y}년`);
    const wrap = document.createElement("div"); wrap.className = "cal-year";
    for (let m = 0; m < 12; m++) {
      const mini = document.createElement("div"); mini.className = "mini";
      const h = document.createElement("h4"); h.textContent = `${m + 1}월`; mini.appendChild(h);
      const g = document.createElement("div"); g.className = "mini-grid";
      const startBlanks = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      for (let i = 0; i < startBlanks; i++) { const c = document.createElement("div"); c.className = "mini-cell"; g.appendChild(c); }
      for (let day = 1; day <= daysInMonth; day++) {
        const key = dateKey(new Date(y, m, day));
        const st = dayStat(key);
        const c = document.createElement("div");
        let cls = "mini-cell";
        if (st.pending > 0) cls += " has-pending";
        else if (st.done > 0) cls += " has-done";
        if (isTodayKey(key)) cls += " today";
        c.className = cls; c.textContent = day;
        g.appendChild(c);
      }
      mini.appendChild(g);
      mini.onclick = () => { setCursor(new Date(y, m, 1)); state.ui.calView = "month"; save(); renderCalendar(); };
      wrap.appendChild(mini);
    }
    body.appendChild(wrap);
  }

  function calNav(dir) {
    const d = calCursorDate();
    const v = state.ui.calView;
    if (v === "year") d.setFullYear(d.getFullYear() + dir);
    else if (v === "month") d.setMonth(d.getMonth() + dir);
    else if (v === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCursor(d); renderCalendar();
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
  const micLabel = $("#micLabel");
  const liveBox = $("#liveBox");
  const liveText = $("#liveText");

  function initRecognition() {
    if (!SR) {
      micHint.textContent = "이 브라우저는 음성 인식을 지원하지 않아요. 위 입력칸을 사용하세요.";
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
      if (micLabel) micLabel.textContent = "듣는 중…";
      micHint.textContent = "";
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
      if (micLabel) micLabel.textContent = "말하기";
      liveBox.hidden = true;
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
  // 챗봇 말풍선 — 내 말(파랑)과 비서의 답(흰색)을 대화로 보여준다
  const chatLog = $("#chatLog");
  let chatHideTimer = null;

  function hideChat() {
    clearTimeout(chatHideTimer);
    if (chatLog) { chatLog.hidden = true; chatLog.innerHTML = ""; }
  }
  // 대화가 끝나면 8초 뒤 접는다. 되묻는 중이면 끝날 때까지 기다렸다가 접는다.
  function armChatHide() {
    clearTimeout(chatHideTimer);
    chatHideTimer = setTimeout(() => {
      if (pendingAction) armChatHide();
      else hideChat();
    }, 8000);
  }

  function appendBubble(role, text, warn) {
    if (!chatLog) return;
    // 닫기 버튼(✕)은 항상 첫 요소로 유지
    if (!chatLog.querySelector(".chat-close")) {
      const x = document.createElement("button");
      x.className = "chat-close";
      x.textContent = "✕";
      x.title = "대화 닫기";
      x.onclick = () => { pendingAction = null; hideChat(); };
      chatLog.appendChild(x);
    }
    const d = document.createElement("div");
    d.className = "bubble " + role + (warn ? " warn" : "");
    d.textContent = text;
    chatLog.appendChild(d);
    // 말풍선은 최근 6개까지만 (닫기 버튼 제외)
    while (chatLog.querySelectorAll(".bubble").length > 6) chatLog.querySelector(".bubble").remove();
    chatLog.hidden = false;
    chatLog.scrollTop = chatLog.scrollHeight;
    armChatHide();
  }

  function process(text) {
    appendBubble("user", text);
    const res = handleUtterance(text);
    appendBubble("bot", res.msg, res.type !== "ok");
    if (res.speak) speak(res.speak);
    render();
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

  // 명언 카드 — 열 때마다 랜덤(나만의 명언 포함), 탭하면 다음, ♥로 즐겨찾기
  const quoteCard = $("#quoteCard");
  let quoteIdx = -1;
  let curQuote = null;
  function quotePool() { return (window.QUOTES || []).concat(state.myQuotes || []); }
  function isFav(q) { return q && state.favQuotes.some((f) => f.t === q.t); }
  function syncFavBtn() {
    const b = $("#quoteFav");
    if (!b) return;
    b.textContent = isFav(curQuote) ? "♥" : "♡";
    b.classList.toggle("on", isFav(curQuote));
  }
  function showQuote(animate) {
    const list = quotePool();
    if (!quoteCard || !list.length) return;
    let i;
    do { i = Math.floor(Math.random() * list.length); } while (list.length > 1 && i === quoteIdx);
    quoteIdx = i;
    curQuote = list[i];
    const apply = () => {
      $("#quoteText").textContent = curQuote.t;
      $("#quoteAuthor").textContent = "— " + curQuote.a;
      quoteCard.classList.remove("q-fade");
      syncFavBtn();
    };
    if (animate) { quoteCard.classList.add("q-fade"); setTimeout(apply, 180); }
    else apply();
  }
  if (quoteCard) quoteCard.onclick = () => showQuote(true);
  const quoteFavBtn = $("#quoteFav");
  if (quoteFavBtn) quoteFavBtn.onclick = (e) => {
    e.stopPropagation();
    if (!curQuote) return;
    if (isFav(curQuote)) state.favQuotes = state.favQuotes.filter((f) => f.t !== curQuote.t);
    else state.favQuotes.push({ t: curQuote.t, a: curQuote.a });
    save(); syncFavBtn();
    toast(isFav(curQuote) ? "♥ 즐겨찾기에 담았어요" : "즐겨찾기에서 뺐어요");
  };
  showQuote(false);

  // 💗 나의 다짐 — 명언 아래 분홍 카드로 항상 표시
  function renderPledge() {
    const card = $("#pledgeCard");
    if (!card) return;
    if (state.myPledge && state.myPledge.t) {
      $("#pledgeCardText").textContent = state.myPledge.t;
      const d = keyToDate(state.myPledge.date);
      $("#pledgeCardDate").textContent = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
      card.hidden = false;
    } else {
      card.hidden = true;
    }
  }
  renderPledge();
  $("#pledgeSave").onclick = () => {
    const v = $("#pledgeInput").value.trim();
    state.myPledge = v ? { t: v, date: todayKey() } : null;
    save(); renderPledge();
    toast(v ? "💗 다짐을 새겼어요" : "다짐을 지웠어요");
  };

  // ⚙ 명언 설정: 즐겨찾기 목록 + 나만의 명언 관리
  function renderQuoteModal() {
    $("#pledgeInput").value = state.myPledge ? state.myPledge.t : "";
    const favList = $("#favQuoteList");
    favList.innerHTML = "";
    if (!state.favQuotes.length) {
      favList.innerHTML = `<p class="muted small">명언 카드의 ♥를 누르면 여기에 모여요.</p>`;
    } else {
      state.favQuotes.forEach((q) => {
        const li = document.createElement("li");
        li.className = "qm-item";
        li.innerHTML = `<div class="qm-body"><p class="qm-t"></p><p class="qm-a"></p></div><button class="qm-del" title="빼기">✕</button>`;
        li.querySelector(".qm-t").textContent = `“${q.t}”`;
        li.querySelector(".qm-a").textContent = "— " + q.a;
        li.querySelector(".qm-del").onclick = () => { state.favQuotes = state.favQuotes.filter((f) => f.t !== q.t); save(); renderQuoteModal(); syncFavBtn(); };
        favList.appendChild(li);
      });
    }
    const myList = $("#myQuoteList");
    myList.innerHTML = "";
    state.myQuotes.forEach((q) => {
      const li = document.createElement("li");
      li.className = "qm-item";
      li.innerHTML = `<div class="qm-body"><p class="qm-t"></p><p class="qm-a"></p></div><button class="qm-del" title="삭제">✕</button>`;
      li.querySelector(".qm-t").textContent = `“${q.t}”`;
      li.querySelector(".qm-a").textContent = "— " + q.a;
      li.querySelector(".qm-del").onclick = () => { state.myQuotes = state.myQuotes.filter((f) => f.t !== q.t); save(); renderQuoteModal(); };
      myList.appendChild(li);
    });
  }
  $("#quoteSettingBtn").onclick = () => { renderQuoteModal(); $("#quoteModal").hidden = false; };
  $("#quoteModalClose").onclick = () => ($("#quoteModal").hidden = true);
  $("#quoteModal").addEventListener("click", (e) => { if (e.target.id === "quoteModal") e.currentTarget.hidden = true; });
  $("#myQuoteAdd").onclick = () => {
    const t = $("#myQuoteText").value.trim();
    if (!t) return;
    const a = $("#myQuoteAuthor").value.trim() || "나";
    state.myQuotes.push({ t, a });
    save();
    $("#myQuoteText").value = ""; $("#myQuoteAuthor").value = "";
    renderQuoteModal();
    toast("✍️ 나만의 명언을 담았어요. 카드에도 섞여 나와요!");
  };

  // 일정 상세·메모 팝업 바인딩
  $("#taskClose").onclick = closeTaskModal;
  $("#taskSave").onclick = saveTaskModal;
  $("#taskModal").addEventListener("click", (e) => { if (e.target.id === "taskModal") closeTaskModal(); });

  // 필터
  $("#statusFilter").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.ui.status = b.dataset.f;
    [...e.currentTarget.children].forEach((c) => c.classList.toggle("active", c === b));
    save(); renderBoard();
  });
  // 탭 전환
  function switchTab(tab) {
    state.ui.tab = tab; save();
    $("#homeTab").hidden = tab !== "home";
    $("#calendarTab").hidden = tab !== "calendar";
    document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "calendar") renderCalendar();
  }
  $("#tabbar").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    switchTab(b.dataset.tab);
  });

  // 달력 보기 전환 / 네비게이션
  $("#calViews").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.ui.calView = b.dataset.v; save(); renderCalendar();
  });
  $("#calPrev").onclick = () => calNav(-1);
  $("#calNext").onclick = () => calNav(1);
  $("#calToday").onclick = () => { setCursor(new Date()); renderCalendar(); };

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

  // 음성 목록 미리 로딩 (일부 브라우저)
  if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => {};

  // ----------------------------------------------------------------------
  // 시작
  // ----------------------------------------------------------------------
  initRecognition();
  syncTts();
  switchTab(state.ui.tab);
  render();

  // 디버그/테스트용 노출
  window.__voiceTodo = { handleUtterance, classify, extractDate, extractTime, cleanTaskText, inferCategory, doReschedule, state };
})();
