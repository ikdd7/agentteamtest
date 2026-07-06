// 빈자리 레이더 프런트엔드 — 서버 API를 폴링해 화면과 알림을 갱신한다.
const state = {
  category: "전체",
  area: "전체",
  q: "",
  watchOnly: false,
  openOnly: false,
  seenAlertKeys: new Set(),
  notify: false,
  firstAlertLoad: true,
};

const CATS = ["전체", "수영", "테니스", "유아체능", "문화강좌"];
const REFRESH_MS = 5000;

const $ = (id) => document.getElementById(id);

function buildCatChips() {
  const row = $("catChips");
  row.innerHTML = "";
  CATS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c === state.category ? " active" : "");
    b.textContent = c;
    b.onclick = () => { state.category = c; buildCatChips(); loadFacilities(); };
    row.appendChild(b);
  });
}

function statusPill(s) {
  const label = { open: "접수중", full: "예약마감", closed: "접수종료", info: "안내" }[s] || s;
  return `<span class="pill ${s}">${label}</span>`;
}

async function toggleWatch(id, on) {
  if (on) {
    await fetch("/api/watches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } else {
    await fetch("/api/watches/" + encodeURIComponent(id), { method: "DELETE" });
  }
  loadFacilities();
}

async function loadFacilities() {
  const p = new URLSearchParams({
    category: state.category, area: state.area, q: state.q,
    watch: state.watchOnly ? "1" : "0",
  });
  let data;
  try {
    data = await (await fetch("/api/facilities?" + p)).json();
  } catch { return; }

  // 모드 & 폴링 정보
  const live = data.mode === "live";
  const badge = $("modeBadge");
  badge.textContent = live ? "실시간" : "데모";
  badge.className = "badge" + (live ? " live" : "");
  $("pollInfo").textContent = `${data.last_poll || "-"} 기준 · ${data.interval}초 주기`;
  $("statOpen").textContent = data.open_now;
  $("statTotal").textContent = data.total;

  // 지역 셀렉트 채우기 (최초 1회성 유지)
  const areaSel = $("areaSel");
  if (areaSel.dataset.filled !== "1" && data.areas) {
    data.areas.forEach((a) => {
      const o = document.createElement("option"); o.value = a; o.textContent = a;
      areaSel.appendChild(o);
    });
    areaSel.dataset.filled = "1";
  }

  let facs = data.facilities;
  if (state.openOnly) facs = facs.filter((f) => f.status === "open");
  $("listCount").textContent = `${facs.length}건`;

  const list = $("list");
  if (!facs.length) {
    list.innerHTML = `<div class="empty">조건에 맞는 강습·시설이 없습니다.</div>`;
    return;
  }
  list.innerHTML = "";
  facs.forEach((f) => {
    const card = document.createElement("div");
    card.className = "card" + (f.status === "open" ? " open" : "");
    card.innerHTML = `
      <div class="body">
        <p class="name">${escapeHtml(f.name)}</p>
        <div class="meta">
          <span>📍 ${escapeHtml(f.place)}</span>
          <span>${escapeHtml(f.area)}</span>
          <span>${escapeHtml(f.category)}</span>
          ${f.payType ? `<span>${escapeHtml(f.payType)}</span>` : ""}
          ${f.target ? `<span>· ${escapeHtml(f.target)}</span>` : ""}
        </div>
      </div>
      <div class="side">
        ${statusPill(f.status)}
        <button class="star ${f.watched ? "on" : ""}" title="관심 등록">${f.watched ? "★" : "☆"}</button>
        <a class="gotoBtn" href="${escapeAttr(f.url)}" target="_blank" rel="noopener">예약</a>
      </div>`;
    card.querySelector(".star").onclick = () => toggleWatch(f.id, !f.watched);
    list.appendChild(card);
  });
  $("statWatch").textContent = facs.filter((f) => f.watched).length ||
    ($("statWatch").textContent);
}

async function loadAlerts() {
  let data;
  try { data = await (await fetch("/api/alerts")).json(); } catch { return; }
  $("statWatch").textContent = data.watch_count;
  const box = $("alerts");
  $("alertCount").textContent = data.alerts.length ? `${data.alerts.length}건` : "";
  if (!data.alerts.length) {
    box.innerHTML = `<div class="empty">아직 취소표가 없습니다.<br>잠시 기다리면 여기에 뜹니다.</div>`;
  } else {
    box.innerHTML = "";
    data.alerts.forEach((a) => {
      const el = document.createElement("div");
      el.className = "alert" + (a.watched ? " watched" : "");
      el.innerHTML = `
        <div class="aname">${a.watched ? "★ " : ""}${escapeHtml(a.name)}</div>
        <div class="ameta">📍 ${escapeHtml(a.place)} · ${escapeHtml(a.area)} · ${a.at.slice(11)}</div>
        <a href="${escapeAttr(a.url)}" target="_blank" rel="noopener">예약 페이지 열기 →</a>`;
      box.appendChild(el);
    });
  }

  // 새 알림 → 브라우저 알림 (관심 항목 우선, 최초 로드는 조용히)
  data.alerts.forEach((a) => {
    const key = a.id + "@" + a.at;
    if (state.seenAlertKeys.has(key)) return;
    state.seenAlertKeys.add(key);
    if (state.firstAlertLoad) return;
    if (state.notify && a.watched) {
      new Notification("🚨 취소표 발생 (관심)", {
        body: `${a.name}\n${a.place} · ${a.area}`,
      });
    }
  });
  state.firstAlertLoad = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "&#39;"); }

// 이벤트 배선
$("areaSel").onchange = (e) => { state.area = e.target.value; loadFacilities(); };
$("searchInp").oninput = (e) => { state.q = e.target.value; loadFacilities(); };
$("watchOnly").onchange = (e) => { state.watchOnly = e.target.checked; loadFacilities(); };
$("openOnly").onchange = (e) => { state.openOnly = e.target.checked; loadFacilities(); };
$("notifBtn").onclick = async () => {
  if (!("Notification" in window)) { alert("이 브라우저는 알림을 지원하지 않습니다."); return; }
  const perm = await Notification.requestPermission();
  state.notify = perm === "granted";
  const btn = $("notifBtn");
  btn.classList.toggle("on", state.notify);
  btn.textContent = state.notify ? "🔔 알림 켜짐" : "🔔 알림 꺼짐";
};

// 시작
buildCatChips();
loadFacilities();
loadAlerts();
setInterval(loadFacilities, REFRESH_MS);
setInterval(loadAlerts, REFRESH_MS);
