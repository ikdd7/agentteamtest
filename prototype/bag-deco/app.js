/* 백꾸 스튜디오 — 가방 꾸미기 프로토타입
 * 외부 의존성 없는 순수 바닐라 JS.
 * 키링/가방을 "실제 사진"으로 렌더(loremflickr 핫링크 + 사진 업로드).
 * 사진 로드 실패 시 이모지로 자동 폴백 → 항상 깨지지 않음.
 */

// ---- 데이터: 가방 (벡터 일러스트 + 이모지 폴백) ----
const BAGS = [
  { id: "tote", emoji: "👜", label: "토트백", img: "assets/bag-tote.svg" },
  { id: "back", emoji: "🎒", label: "백팩", img: "assets/bag-backpack.svg" },
  { id: "pouch", emoji: "👝", label: "파우치", img: "assets/bag-pouch.svg" },
];

// ---- 데이터: 키링/참 (벡터 일러스트 + 이모지 폴백) ----
const CHARMS = [
  { name: "곰돌이 키링", price: 12000, emoji: "🧸", img: "assets/bear.svg" },
  { name: "토끼 키링", price: 9000, emoji: "🐰", img: "assets/bunny.svg" },
  { name: "리본 참", price: 5000, emoji: "🎀", img: "assets/ribbon.svg" },
  { name: "별 키링", price: 3000, emoji: "⭐", img: "assets/star.svg" },
  { name: "하트 키링", price: 4000, emoji: "💖", img: "assets/heart.svg" },
  { name: "꽃 참", price: 2000, emoji: "🌸", img: "assets/flower.svg" },
  { name: "딸기 참", price: 3500, emoji: "🍓", img: "assets/strawberry.svg" },
  { name: "나비 참", price: 4500, emoji: "🦋", img: "assets/butterfly.svg" },
  { name: "체리 참", price: 3000, emoji: "🍒", img: "assets/cherry.svg" },
  { name: "무지개 참", price: 3000, emoji: "🌈", img: "assets/rainbow.svg" },
];

// ---- 상태 ----
let placed = [];          // {id, name, price, emoji, src, el, imgEl, x, y, size, rot}
let selectedId = null;
let nextId = 1;
let currentBag = BAGS[0];
let bagImageEl = null;    // 가방 export용 로드된 Image (없으면 이모지)
let bagFit = "contain";   // 일러스트는 contain, 업로드 사진은 cover

// ---- DOM ----
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

// ---- 가방 선택지 렌더 ----
const bagPicker = document.getElementById("bag-picker");
BAGS.forEach((bag, i) => {
  const b = document.createElement("button");
  b.className = "bag-opt" + (i === 0 ? " active" : "");
  b.title = bag.label;
  b.type = "button";
  if (bag.img) {
    const im = document.createElement("img");
    im.src = bag.img;
    im.alt = bag.label;
    im.onerror = () => { b.innerHTML = ""; b.textContent = bag.emoji; };
    b.appendChild(im);
  } else {
    b.textContent = bag.emoji;
  }
  b.addEventListener("click", () => selectBag(bag, b));
  bagPicker.appendChild(b);
});

function selectBag(bag, btnEl) {
  currentBag = bag;
  document.querySelectorAll(".bag-opt").forEach((x) => x.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  applyBag(bag.img || null, bag.emoji);
}

// 가방을 화면+export에 반영. url 있으면 그림/사진, 실패 시 이모지 폴백.
function applyBag(url, emoji, fit = "contain") {
  bagFit = fit;
  if (!url) {
    bagImageEl = null;
    bagLayer.style.backgroundImage = "";
    bagLayer.textContent = emoji;
    return;
  }
  const img = new Image();
  img.onload = () => {
    bagImageEl = img;
    bagLayer.textContent = "";
    bagLayer.style.backgroundSize = fit;
    bagLayer.style.backgroundImage = `url("${url}")`;
  };
  img.onerror = () => {           // 실패 → 이모지로
    bagImageEl = null;
    bagLayer.style.backgroundImage = "";
    bagLayer.textContent = emoji;
  };
  img.src = url;
}

// 가방 사진 업로드 (업로드 이미지는 same-origin → 저장도 안전)
document.getElementById("bag-upload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentBag = { id: "upload", emoji: "👜", img: ev.target.result };
    document.querySelectorAll(".bag-opt").forEach((x) => x.classList.remove("active"));
    applyBag(ev.target.result, "👜", "cover");
  };
  reader.readAsDataURL(file);
});

// ---- 키링 팔레트 렌더 ----
const charmGrid = document.getElementById("charm-grid");
function addPaletteButton(charm, prepend) {
  const b = document.createElement("button");
  b.className = "charm-btn";
  b.type = "button";
  b.title = `${charm.name} · ${formatWon(charm.price)}`;
  if (charm.img) {
    const im = document.createElement("img");
    im.src = charm.img;
    im.alt = charm.name;
    im.onerror = () => { b.innerHTML = ""; b.textContent = charm.emoji; addPriceTag(b, charm); };
    b.appendChild(im);
  } else {
    b.textContent = charm.emoji;
  }
  addPriceTag(b, charm);
  b.addEventListener("click", () => addCharm(charm));
  if (prepend && charmGrid.firstChild) charmGrid.insertBefore(b, charmGrid.firstChild);
  else charmGrid.appendChild(b);
}
function addPriceTag(b, charm) {
  const tag = document.createElement("span");
  tag.className = "price-tag";
  tag.textContent = charm.price >= 1000 ? charm.price / 1000 + "천" : charm.price;
  b.appendChild(tag);
}
CHARMS.forEach((c) => addPaletteButton(c, false));

// 키링 사진 업로드 → 팔레트에 추가하고 바로 캔버스에 올림
document.getElementById("charm-upload").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const charm = { name: "내 키링", price: 0, emoji: "📷", img: ev.target.result };
    addPaletteButton(charm, true);
    addCharm(charm);
  };
  reader.readAsDataURL(file);
});

// ---- 아이템 추가 ----
function addCharm(charm, x = 0.5, y = 0.45) {
  const item = {
    id: nextId++,
    name: charm.name,
    price: charm.price,
    emoji: charm.emoji,
    src: charm.img || null,
    size: 70,
    rot: rand(-12, 12),
    x: clamp(x + rand(-0.12, 0.12), 0.1, 0.9),
    y: clamp(y + rand(-0.12, 0.12), 0.1, 0.9),
  };
  placed.push(item);
  renderCharm(item);
  selectCharm(item.id);
  updateCart();
  emptyTip.style.display = "none";
}

function renderCharm(item) {
  const el = document.createElement("div");
  el.className = "charm";
  if (item.src) {
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = item.name;
    img.onerror = () => {          // 사진 실패 → 이모지로 폴백
      item.src = null;
      item.imgEl = null;
      el.innerHTML = "";
      el.textContent = item.emoji;
    };
    el.appendChild(img);
    item.imgEl = img;
  } else {
    el.textContent = item.emoji;
  }
  item.el = el;
  applyTransform(item);
  charmLayer.appendChild(el);
  makeDraggable(item);
  el.addEventListener("pointerdown", (e) => { e.stopPropagation(); selectCharm(item.id); });
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
  charmLayer.appendChild(item.el);
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
    const thumb = g.src
      ? `<img class="ci-emoji" src="${g.src}" alt="" style="width:24px;height:24px;object-fit:contain;">`
      : `<span class="ci-emoji">${g.emoji}</span>`;
    li.innerHTML =
      thumb +
      `<span class="ci-name">${g.name} ×${g.qty}</span>` +
      `<span class="ci-price">${g.price ? formatWon(g.price * g.qty) : "내 사진"}</span>`;
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

// ---- 이미지로 저장 (PNG) ----
document.getElementById("btn-save").addEventListener("click", () => {
  const r = stage.getBoundingClientRect();
  const scale = 2;
  const canvas = document.getElementById("export-canvas");
  canvas.width = r.width * scale;
  canvas.height = r.height * scale;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(
    canvas.width / 2, canvas.height * 0.38, 10,
    canvas.width / 2, canvas.height * 0.38, canvas.width
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.7, "#fde9f4");
  grad.addColorStop(1, "#f6e4ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 가방
  if (bagImageEl && bagImageEl.complete && bagImageEl.naturalWidth) {
    if (bagFit === "cover") drawCover(ctx, bagImageEl, canvas.width, canvas.height);
    else drawContain(ctx, bagImageEl, canvas.width, canvas.height);
  } else {
    ctx.font = `${230 * scale}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(currentBag.emoji, canvas.width / 2, canvas.height / 2);
  }

  // 키링들
  placed.forEach((p) => {
    ctx.save();
    ctx.translate(p.x * canvas.width, p.y * canvas.height);
    ctx.rotate((p.rot * Math.PI) / 180);
    const useImg = p.src && p.imgEl && p.imgEl.complete && p.imgEl.naturalWidth;
    if (useImg) {
      const s = p.size * scale;
      const ar = p.imgEl.naturalWidth / p.imgEl.naturalHeight;
      let dw = s, dh = s;
      if (ar > 1) dh = s / ar; else dw = s * ar;   // 비율 유지
      ctx.drawImage(p.imgEl, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.font = `${p.size * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.emoji, 0, 0);
    }
    ctx.restore();
  });

  // 저장 (외부 사진이 섞이면 보안상 막힐 수 있음 → 안내)
  try {
    const link = document.createElement("a");
    link.download = `내백꾸_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    alert(
      "외부에서 불러온 사진이 포함되어 브라우저 보안상 저장이 제한됐어요. 😢\n" +
      "‘내 키링 사진 올리기 / 내 가방 사진 올리기’로 올린 사진만으로 꾸미면 저장이 됩니다."
    );
  }
});

function drawCover(ctx, img, W, H) {
  const ar = img.naturalWidth / img.naturalHeight;
  const car = W / H;
  let dw, dh;
  if (ar > car) { dh = H; dw = dh * ar; } else { dw = W; dh = dw / ar; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}
function drawContain(ctx, img, W, H) {
  const ar = img.naturalWidth / img.naturalHeight;
  const car = W / H;
  let dw, dh;
  if (ar > car) { dw = W * 0.86; dh = dw / ar; } else { dh = H * 0.86; dw = dh * ar; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// ---- 기타 ----
window.addEventListener("resize", () => placed.forEach(applyTransform));
function formatWon(n) { return n.toLocaleString("ko-KR") + "원"; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }

// 초기 가방(사진) 적용 + 빈 장바구니
applyBag(currentBag.img, currentBag.emoji);
updateCart();
