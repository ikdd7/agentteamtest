/* 백꾸 스튜디오 — 가방 꾸미기 프로토타입
 * 외부 의존성 없는 순수 바닐라 JS. 브라우저에서 index.html 열면 바로 동작.
 */

// ---- 데이터: 가방 & 아이템 카탈로그 ----
const BAGS = [
  { id: "tote", emoji: "👜", label: "토트백" },
  { id: "back", emoji: "🎒", label: "백팩" },
  { id: "pouch", emoji: "👝", label: "파우치" },
  { id: "brief", emoji: "💼", label: "서류백" },
];

const CHARMS = [
  { emoji: "🧸", name: "곰돌이 인형 키링", price: 12000 },
  { emoji: "🐰", name: "토끼 키링", price: 9000 },
  { emoji: "🎀", name: "리본 참", price: 5000 },
  { emoji: "⭐", name: "별 참", price: 3000 },
  { emoji: "💖", name: "하트 키링", price: 4000 },
  { emoji: "🌸", name: "벚꽃 스티커", price: 2000 },
  { emoji: "🍓", name: "딸기 참", price: 3500 },
  { emoji: "🦋", name: "나비 참", price: 4500 },
  { emoji: "🐻", name: "베어 참", price: 6000 },
  { emoji: "👾", name: "픽셀 키링", price: 7000 },
  { emoji: "🌈", name: "무지개 참", price: 3000 },
  { emoji: "🔑", name: "열쇠 참", price: 2500 },
  { emoji: "🧿", name: "아이 참", price: 3500 },
  { emoji: "🍒", name: "체리 참", price: 3000 },
  { emoji: "☁️", name: "구름 참", price: 2000 },
  { emoji: "🪩", name: "디스코볼", price: 5500 },
];

// ---- 상태 ----
let placed = [];          // {id, emoji, name, price, x, y, size, rot, el}
let selectedId = null;
let nextId = 1;
let currentBag = BAGS[0];
let bagImage = null;      // 업로드된 이미지 dataURL (있으면 emoji 대신 사용)

// ---- DOM 참조 ----
const stage = document.getElementById("stage");
const bagLayer = document.getElementById("bag-layer");
const charmLayer = document.getElementById("charm-layer");
const emptyTip = document.getElementById("empty-tip");
const toolDock = document.getElementById("tool-dock");
const toolLabel = document.getElementById("tool-label");
const ctlSize = document.getElementById("ctl-size");
const ctlRot = document.getElementById("ctl-rot");
const cartList = document.getElementById("cart-list");
const cartTotal = document.getElementById("cart-total");

// ---- 초기 렌더: 가방 선택지 ----
const bagPicker = document.getElementById("bag-picker");
BAGS.forEach((bag, i) => {
  const b = document.createElement("button");
  b.className = "bag-opt" + (i === 0 ? " active" : "");
  b.textContent = bag.emoji;
  b.title = bag.label;
  b.type = "button";
  b.addEventListener("click", () => selectBag(bag, b));
  bagPicker.appendChild(b);
});

function selectBag(bag, btnEl) {
  currentBag = bag;
  bagImage = null;
  bagLayer.style.backgroundImage = "";
  bagLayer.textContent = bag.emoji;
  document.querySelectorAll(".bag-opt").forEach((x) => x.classList.remove("active"));
  btnEl.classList.add("active");
}

// 가방 사진 업로드
document.getElementById("bag-upload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    bagImage = ev.target.result;
    bagLayer.textContent = "";
    bagLayer.style.backgroundImage = `url(${bagImage})`;
    document.querySelectorAll(".bag-opt").forEach((x) => x.classList.remove("active"));
  };
  reader.readAsDataURL(file);
});

// ---- 초기 렌더: 아이템 팔레트 ----
const charmGrid = document.getElementById("charm-grid");
CHARMS.forEach((charm) => {
  const b = document.createElement("button");
  b.className = "charm-btn";
  b.type = "button";
  b.innerHTML = `${charm.emoji}<span class="price-tag">${(charm.price / 1000)}천</span>`;
  b.title = `${charm.name} · ${formatWon(charm.price)}`;
  b.addEventListener("click", () => addCharm(charm));
  charmGrid.appendChild(b);
});

// ---- 아이템 추가 ----
function addCharm(charm, x = 0.5, y = 0.45) {
  const item = {
    id: nextId++,
    emoji: charm.emoji,
    name: charm.name,
    price: charm.price,
    x, y,
    size: 48,
    rot: rand(-15, 15),
  };
  // 겹치지 않게 살짝 흩뿌리기
  item.x = clamp(x + rand(-0.12, 0.12), 0.1, 0.9);
  item.y = clamp(y + rand(-0.12, 0.12), 0.1, 0.9);
  placed.push(item);
  renderCharm(item);
  selectCharm(item.id);
  updateCart();
  emptyTip.style.display = "none";
}

function renderCharm(item) {
  const el = document.createElement("div");
  el.className = "charm";
  el.textContent = item.emoji;
  item.el = el;
  applyTransform(item);
  charmLayer.appendChild(el);
  makeDraggable(item);
  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    selectCharm(item.id);
  });
}

function applyTransform(item) {
  const r = stage.getBoundingClientRect();
  item.el.style.left = item.x * r.width + "px";
  item.el.style.top = item.y * r.height + "px";
  item.el.style.fontSize = item.size + "px";
  item.el.style.transform = `translate(-50%, -50%) rotate(${item.rot}deg)`;
}

// ---- 드래그 이동 ----
function makeDraggable(item) {
  let dragging = false;
  item.el.addEventListener("pointerdown", (e) => {
    dragging = true;
    item.el.setPointerCapture(e.pointerId);
    item.el.style.cursor = "grabbing";
  });
  item.el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const r = stage.getBoundingClientRect();
    item.x = clamp((e.clientX - r.left) / r.width, 0.03, 0.97);
    item.y = clamp((e.clientY - r.top) / r.height, 0.03, 0.97);
    applyTransform(item);
  });
  const stop = () => { dragging = false; item.el.style.cursor = "grab"; };
  item.el.addEventListener("pointerup", stop);
  item.el.addEventListener("pointercancel", stop);
}

// ---- 선택 / 조작 ----
function selectCharm(id) {
  selectedId = id;
  placed.forEach((p) => p.el.classList.toggle("selected", p.id === id));
  const item = placed.find((p) => p.id === id);
  if (!item) return;
  toolDock.hidden = false;
  toolLabel.textContent = item.name;
  ctlSize.value = item.size;
  ctlRot.value = item.rot;
}

stage.addEventListener("pointerdown", () => {
  selectedId = null;
  placed.forEach((p) => p.el.classList.remove("selected"));
  toolDock.hidden = true;
});

ctlSize.addEventListener("input", () => {
  const item = placed.find((p) => p.id === selectedId);
  if (!item) return;
  item.size = +ctlSize.value;
  applyTransform(item);
});
ctlRot.addEventListener("input", () => {
  const item = placed.find((p) => p.id === selectedId);
  if (!item) return;
  item.rot = +ctlRot.value;
  applyTransform(item);
});
document.getElementById("ctl-front").addEventListener("click", () => {
  const item = placed.find((p) => p.id === selectedId);
  if (!item) return;
  charmLayer.appendChild(item.el); // 맨 뒤 = DOM상 마지막 = 맨 앞
  placed = placed.filter((p) => p.id !== item.id).concat(item);
});
document.getElementById("ctl-del").addEventListener("click", () => {
  const item = placed.find((p) => p.id === selectedId);
  if (!item) return;
  item.el.remove();
  placed = placed.filter((p) => p.id !== item.id);
  selectedId = null;
  toolDock.hidden = true;
  updateCart();
  if (placed.length === 0) emptyTip.style.display = "";
});

// ---- 장바구니 ----
function updateCart() {
  cartList.innerHTML = "";
  if (placed.length === 0) {
    cartList.innerHTML = `<li class="cart-empty">아직 담긴 아이템이 없어요</li>`;
    cartTotal.textContent = "0원";
    return;
  }
  // 같은 아이템 수량 묶기
  const groups = {};
  placed.forEach((p) => {
    if (!groups[p.name]) groups[p.name] = { ...p, qty: 0 };
    groups[p.name].qty++;
  });
  let total = 0;
  Object.values(groups).forEach((g) => {
    total += g.price * g.qty;
    const li = document.createElement("li");
    li.className = "cart-item";
    li.innerHTML =
      `<span class="ci-emoji">${g.emoji}</span>` +
      `<span class="ci-name">${g.name} ×${g.qty}</span>` +
      `<span class="ci-price">${formatWon(g.price * g.qty)}</span>`;
    cartList.appendChild(li);
  });
  cartTotal.textContent = formatWon(total);
}

document.getElementById("btn-buy").addEventListener("click", () => {
  if (placed.length === 0) return alert("먼저 가방을 꾸며주세요! ✨");
  const total = placed.reduce((s, p) => s + p.price, 0);
  alert(`🛍️ 데모 주문\n아이템 ${placed.length}개\n결제 예정 금액: ${formatWon(total)}\n\n(프로토타입이라 실제 결제는 없어요)`);
});

// ---- 초기화 ----
document.getElementById("btn-reset").addEventListener("click", () => {
  if (placed.length && !confirm("꾸민 내용을 모두 지울까요?")) return;
  placed.forEach((p) => p.el.remove());
  placed = [];
  selectedId = null;
  toolDock.hidden = true;
  emptyTip.style.display = "";
  updateCart();
});

// ---- 이미지로 저장 (PNG 다운로드) ----
document.getElementById("btn-save").addEventListener("click", () => {
  const r = stage.getBoundingClientRect();
  const scale = 2;
  const canvas = document.getElementById("export-canvas");
  canvas.width = r.width * scale;
  canvas.height = r.height * scale;
  const ctx = canvas.getContext("2d");

  // 배경
  const grad = ctx.createRadialGradient(
    canvas.width / 2, canvas.height * 0.38, 10,
    canvas.width / 2, canvas.height * 0.38, canvas.width
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.7, "#fde9f4");
  grad.addColorStop(1, "#f6e4ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawCharms = () => {
    placed.forEach((p) => {
      ctx.save();
      ctx.translate(p.x * canvas.width, p.y * canvas.height);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.font = `${p.size * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    });
    triggerDownload(canvas);
  };

  if (bagImage) {
    const img = new Image();
    img.onload = () => {
      // cover 방식으로 배경 채우기
      const ar = img.width / img.height;
      const car = canvas.width / canvas.height;
      let dw, dh;
      if (ar > car) { dh = canvas.height; dw = dh * ar; }
      else { dw = canvas.width; dh = dw / ar; }
      ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      drawCharms();
    };
    img.src = bagImage;
  } else {
    ctx.font = `${230 * scale}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(currentBag.emoji, canvas.width / 2, canvas.height / 2);
    drawCharms();
  }
});

function triggerDownload(canvas) {
  const link = document.createElement("a");
  link.download = `내백꾸_${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ---- 창 크기 변경 시 위치 재계산 ----
window.addEventListener("resize", () => placed.forEach(applyTransform));

// ---- 유틸 ----
function formatWon(n) { return n.toLocaleString("ko-KR") + "원"; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }

// 초기 상태
updateCart();
