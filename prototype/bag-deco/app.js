/* 백꾸핀 — 백꾸 덕후들의 핀터레스트 (MVP)
 * 홈 = 백꾸 피드(디스커버리). 핀 상세 → 쓰인 아이템 사러가기(아웃바운드) / 따라꾸미기 / 저장.
 * '나도 꾸미기' = 에디터. 외부 의존성 없는 순수 바닐라 JS.
 */

// ===== 데이터 =====
const BAGS = [
  { id: "tote", emoji: "👜", label: "토트백", img: "assets/bag-tote.svg" },
  { id: "back", emoji: "🎒", label: "백팩", img: "assets/bag-backpack.svg" },
  { id: "pouch", emoji: "👝", label: "파우치", img: "assets/bag-pouch.svg" },
];

const CHARMS = [
  { name: "곰돌이 인형 키링", price: 12000, priceMax: 19000, emoji: "🧸", img: "assets/bear.svg",
    brand: "마뗑킴 스타일", material: "퍼/아크릴", tags: ["인형", "베스트"],
    desc: "복슬복슬 곰돌이 인형 키링. 가방 한쪽에 큼직하게 달면 포인트가 확 살아요." },
  { name: "토끼 인형 키링", price: 9000, priceMax: 16000, emoji: "🐰", img: "assets/bunny.svg",
    brand: "마리떼 무드", material: "벨보아", tags: ["인형", "파스텔"],
    desc: "말랑한 토끼 인형 참. 연한 톤이라 어떤 색 가방과도 잘 어울립니다." },
  { name: "리본 참", price: 5000, priceMax: 9000, emoji: "🎀", img: "assets/ribbon.svg",
    brand: "코퀘트", material: "새틴 리본", tags: ["코퀘트", "러블리"],
    desc: "요즘 대세 리본 참. 핸들에 묶으면 단정하면서도 사랑스러운 무드." },
  { name: "별 키링", price: 3000, priceMax: 7000, emoji: "⭐", img: "assets/star.svg",
    brand: "데일리참", material: "아크릴", tags: ["베이직"],
    desc: "어디에나 무난한 별 참. 작은 포인트로 하나씩 더하기 좋아요." },
  { name: "하트 키링", price: 4000, priceMax: 8000, emoji: "💖", img: "assets/heart.svg",
    brand: "Y2K 무드", material: "에폭시", tags: ["Y2K", "글로시"],
    desc: "반짝이는 하트 키링. 키치한 Y2K 백꾸의 단골 아이템." },
  { name: "꽃 참", price: 2000, priceMax: 6000, emoji: "🌸", img: "assets/flower.svg",
    brand: "블룸", material: "아크릴", tags: ["봄", "데일리"],
    desc: "은은한 플라워 참. 여러 개 흩뿌리면 화사한 느낌이 납니다." },
  { name: "딸기 참", price: 3500, priceMax: 7000, emoji: "🍓", img: "assets/strawberry.svg",
    brand: "프룻클럽", material: "에폭시", tags: ["프루티", "키치"],
    desc: "달콤한 딸기 참. 과일 참끼리 모아 달면 톡톡 튀는 백꾸 완성." },
  { name: "나비 참", price: 4500, priceMax: 9000, emoji: "🦋", img: "assets/butterfly.svg",
    brand: "에어리", material: "메탈/아크릴", tags: ["시어", "트렌드"],
    desc: "살랑이는 나비 참. 시스루 윙이 고급스러운 포인트를 줍니다." },
  { name: "체리 참", price: 3000, priceMax: 6500, emoji: "🍒", img: "assets/cherry.svg",
    brand: "프룻클럽", material: "에폭시", tags: ["프루티", "레드"],
    desc: "쨍한 체리 참. 한 알만 달아도 시선을 끄는 강한 포인트." },
  { name: "무지개 참", price: 3000, priceMax: 7000, emoji: "🌈", img: "assets/rainbow.svg",
    brand: "큐트랩", material: "아크릴", tags: ["레인보우", "키즈"],
    desc: "알록달록 무지개 참. 발랄하고 캐주얼한 가방에 잘 어울려요." },
];
const metaByName = {};
CHARMS.forEach((c) => { metaByName[c.name] = c; });

// 백꾸 핀(피드) — 다른 사람들이 꾸민 백꾸
let LOOKS = [
  { id: 1, author: "민지 🐰", likes: 248, saves: 120, bag: "tote", tags: ["인형", "러블리"], items: [
    { name: "곰돌이 인형 키링", x: 0.62, y: 0.36, size: 112, rot: -8 },
    { name: "리본 참", x: 0.40, y: 0.30, size: 72, rot: 10 },
    { name: "하트 키링", x: 0.50, y: 0.56, size: 60, rot: 0 } ] },
  { id: 2, author: "하루", likes: 173, saves: 89, bag: "back", tags: ["인형", "파스텔"], items: [
    { name: "토끼 인형 키링", x: 0.50, y: 0.40, size: 110, rot: 4 },
    { name: "별 키링", x: 0.66, y: 0.30, size: 58, rot: 12 },
    { name: "꽃 참", x: 0.36, y: 0.50, size: 60, rot: -6 } ] },
  { id: 3, author: "soyeon", likes: 421, saves: 210, bag: "pouch", tags: ["코퀘트", "프루티"], items: [
    { name: "리본 참", x: 0.50, y: 0.42, size: 92, rot: 0 },
    { name: "체리 참", x: 0.66, y: 0.55, size: 60, rot: 8 },
    { name: "딸기 참", x: 0.35, y: 0.55, size: 58, rot: -10 } ] },
  { id: 4, author: "코코 🤎", likes: 96, saves: 47, bag: "tote", tags: ["트렌드", "키치"], items: [
    { name: "나비 참", x: 0.45, y: 0.32, size: 82, rot: -10 },
    { name: "나비 참", x: 0.60, y: 0.46, size: 60, rot: 15 },
    { name: "무지개 참", x: 0.40, y: 0.60, size: 70, rot: 0 } ] },
  { id: 5, author: "지우 ✨", likes: 312, saves: 156, bag: "back", tags: ["인형", "Y2K"], items: [
    { name: "곰돌이 인형 키링", x: 0.50, y: 0.38, size: 100, rot: 0 },
    { name: "별 키링", x: 0.35, y: 0.34, size: 50, rot: -12 },
    { name: "별 키링", x: 0.66, y: 0.34, size: 50, rot: 12 },
    { name: "하트 키링", x: 0.50, y: 0.60, size: 60, rot: 0 } ] },
  { id: 6, author: "rin", likes: 154, saves: 73, bag: "pouch", tags: ["코퀘트", "파스텔"], items: [
    { name: "꽃 참", x: 0.42, y: 0.40, size: 72, rot: -8 },
    { name: "꽃 참", x: 0.58, y: 0.46, size: 60, rot: 8 },
    { name: "리본 참", x: 0.50, y: 0.60, size: 60, rot: 0 } ] },
  { id: 7, author: "유나 🤍", likes: 205, saves: 98, bag: "tote", tags: ["Y2K", "러블리"], items: [
    { name: "하트 키링", x: 0.46, y: 0.34, size: 78, rot: -6 },
    { name: "하트 키링", x: 0.62, y: 0.44, size: 58, rot: 10 },
    { name: "하트 키링", x: 0.40, y: 0.58, size: 50, rot: -4 } ] },
  { id: 8, author: "도윤", likes: 88, saves: 41, bag: "back", tags: ["키치", "트렌드"], items: [
    { name: "별 키링", x: 0.44, y: 0.34, size: 64, rot: -10 },
    { name: "나비 참", x: 0.60, y: 0.42, size: 76, rot: 12 },
    { name: "무지개 참", x: 0.48, y: 0.60, size: 66, rot: 0 } ] },
  { id: 9, author: "미카 🍓", likes: 167, saves: 132, bag: "pouch", tags: ["프루티", "파스텔"], items: [
    { name: "딸기 참", x: 0.42, y: 0.40, size: 70, rot: -8 },
    { name: "체리 참", x: 0.60, y: 0.46, size: 64, rot: 10 },
    { name: "꽃 참", x: 0.50, y: 0.62, size: 56, rot: 0 } ] },
];
const TAGS = ["전체", "인형", "코퀘트", "Y2K", "파스텔", "프루티", "러블리", "트렌드", "키치", "🔖 내 저장"];

// ===== 상태 =====
let placed = [];
let selectedId = null;
let nextId = 1;
let uploadCount = 0;
let currentBag = BAGS[0];
let bagImageEl = null;
let bagFit = "contain";
let activeTag = "전체";
let searchText = "";
let currentPin = null;
let outbound = 0;

// ===== DOM =====
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
const outboundStat = document.getElementById("outbound-stat");

// ===== 가방 =====
const bagPicker = document.getElementById("bag-picker");
BAGS.forEach((bag, i) => {
  const b = document.createElement("button");
  b.className = "bag-opt" + (i === 0 ? " active" : "");
  b.title = bag.label;
  b.type = "button";
  b.dataset.bagId = bag.id;
  if (bag.img) {
    const im = document.createElement("img");
    im.src = bag.img; im.alt = bag.label;
    im.onerror = () => { b.innerHTML = ""; b.textContent = bag.emoji; };
    b.appendChild(im);
  } else b.textContent = bag.emoji;
  b.addEventListener("click", () => selectBag(bag, b));
  bagPicker.appendChild(b);
});
function selectBag(bag, btnEl) {
  currentBag = bag;
  document.querySelectorAll(".bag-opt").forEach((x) => x.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  applyBag(bag.img || null, bag.emoji);
}
function selectBagById(id) {
  const bag = BAGS.find((b) => b.id === id) || BAGS[0];
  selectBag(bag, bagPicker.querySelector(`[data-bag-id="${bag.id}"]`));
}
function applyBag(url, emoji, fit = "contain") {
  bagFit = fit;
  if (!url) { bagImageEl = null; bagLayer.style.backgroundImage = ""; bagLayer.textContent = emoji; return; }
  const img = new Image();
  img.onload = () => { bagImageEl = img; bagLayer.textContent = ""; bagLayer.style.backgroundSize = fit; bagLayer.style.backgroundImage = `url("${url}")`; };
  img.onerror = () => { bagImageEl = null; bagLayer.style.backgroundImage = ""; bagLayer.textContent = emoji; };
  img.src = url;
}
document.getElementById("bag-upload").addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentBag = { id: "upload", emoji: "👜", img: ev.target.result };
    document.querySelectorAll(".bag-opt").forEach((x) => x.classList.remove("active"));
    applyBag(ev.target.result, "👜", "cover");
  };
  reader.readAsDataURL(file);
});

// ===== 키링 팔레트 =====
const charmGrid = document.getElementById("charm-grid");
function addPriceTag(b, charm) {
  const tag = document.createElement("span");
  tag.className = "price-tag";
  tag.textContent = charm.price >= 1000 ? charm.price / 1000 + "천" : (charm.price || "내");
  b.appendChild(tag);
}
function addPaletteButton(charm, prepend) {
  const b = document.createElement("button");
  b.className = "charm-btn"; b.type = "button";
  b.title = `${charm.name} · ${charm.price ? formatWon(charm.price) : "내 사진"}`;
  if (charm.img) {
    const im = document.createElement("img");
    im.src = charm.img; im.alt = charm.name;
    im.onerror = () => { b.innerHTML = ""; b.textContent = charm.emoji; addPriceTag(b, charm); };
    b.appendChild(im);
  } else b.textContent = charm.emoji;
  addPriceTag(b, charm);
  b.addEventListener("click", () => addCharm(charm));
  if (prepend && charmGrid.firstChild) charmGrid.insertBefore(b, charmGrid.firstChild);
  else charmGrid.appendChild(b);
}
CHARMS.forEach((c) => addPaletteButton(c, false));
document.getElementById("charm-upload").addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const charm = { name: "내 키링 " + (++uploadCount), price: 0, emoji: "📷", img: ev.target.result,
      brand: "내 사진", material: "직접 업로드", desc: "내가 올린 키링 사진이에요." };
    metaByName[charm.name] = charm;
    addPaletteButton(charm, true);
    addCharm(charm);
  };
  reader.readAsDataURL(file);
});

// ===== 아이템 배치 =====
function spawnCharm(charm, x, y, size, rot) {
  const item = { id: nextId++, name: charm.name, price: charm.price, emoji: charm.emoji,
    src: charm.img || null, meta: charm, size, rot, x, y };
  placed.push(item); renderCharm(item); updateCart(); emptyTip.style.display = "none";
  return item;
}
function addCharm(charm, x = 0.5, y = 0.45) {
  const item = spawnCharm(charm, clamp(x + rand(-0.12, 0.12), 0.1, 0.9), clamp(y + rand(-0.12, 0.12), 0.1, 0.9), 70, rand(-12, 12));
  selectCharm(item.id);
}
function renderCharm(item) {
  const el = document.createElement("div");
  el.className = "charm";
  if (item.src) {
    const img = document.createElement("img");
    img.src = item.src; img.alt = item.name;
    img.onerror = () => { item.src = null; item.imgEl = null; el.innerHTML = ""; el.textContent = item.emoji; };
    el.appendChild(img); item.imgEl = img;
  } else el.textContent = item.emoji;
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
function makeDraggable(item) {
  let dragging = false;
  item.el.addEventListener("pointerdown", (e) => { dragging = true; item.el.setPointerCapture(e.pointerId); item.el.style.cursor = "grabbing"; });
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
function selectCharm(id) {
  selectedId = id;
  placed.forEach((p) => p.el.classList.toggle("selected", p.id === id));
  const item = placed.find((p) => p.id === id);
  if (!item) return;
  toolDock.hidden = false; toolLabel.textContent = item.name;
  ctlSize.value = item.size; ctlRot.value = item.rot;
}
stage.addEventListener("pointerdown", () => {
  selectedId = null;
  placed.forEach((p) => p.el.classList.remove("selected"));
  toolDock.hidden = true;
});
ctlSize.addEventListener("input", () => { const i = placed.find((p) => p.id === selectedId); if (i) { i.size = +ctlSize.value; applyTransform(i); } });
ctlRot.addEventListener("input", () => { const i = placed.find((p) => p.id === selectedId); if (i) { i.rot = +ctlRot.value; applyTransform(i); } });
document.getElementById("ctl-front").addEventListener("click", () => {
  const i = placed.find((p) => p.id === selectedId); if (!i) return;
  charmLayer.appendChild(i.el); placed = placed.filter((p) => p.id !== i.id).concat(i);
});
document.getElementById("ctl-del").addEventListener("click", () => {
  const i = placed.find((p) => p.id === selectedId); if (!i) return;
  i.el.remove(); placed = placed.filter((p) => p.id !== i.id);
  selectedId = null; toolDock.hidden = true; updateCart();
  if (placed.length === 0) emptyTip.style.display = "";
});
document.getElementById("ctl-buy").addEventListener("click", () => { const i = placed.find((p) => p.id === selectedId); if (i) goShop(i.name); });
document.getElementById("ctl-info").addEventListener("click", () => { const i = placed.find((p) => p.id === selectedId); if (i) openDetail(i.meta); });

// ===== 아웃바운드 =====
const buyUrl = (name) => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent("키링 " + name)}`;
function goShop(name) {
  outbound++;
  outboundStat.textContent = `판매처 이동 ${outbound}회 · 제휴 트래픽 데모`;
  window.open(buyUrl(name), "_blank", "noopener");
}

// ===== 쇼핑 리스트(에디터) =====
function updateCart() {
  cartList.innerHTML = "";
  if (placed.length === 0) { cartList.innerHTML = `<li class="cart-empty">아직 담긴 아이템이 없어요</li>`; cartTotal.textContent = "0원"; return; }
  const groups = {};
  placed.forEach((p) => { if (!groups[p.name]) groups[p.name] = { ...p, qty: 0 }; groups[p.name].qty++; });
  let total = 0;
  Object.values(groups).forEach((g) => {
    total += g.price * g.qty;
    const li = document.createElement("li");
    li.className = "cart-item"; li.dataset.detail = g.name;
    const thumb = g.src ? `<img class="ci-emoji" src="${g.src}" alt="" style="width:26px;height:26px;object-fit:contain;">` : `<span class="ci-emoji">${g.emoji}</span>`;
    li.innerHTML = thumb +
      `<div class="ci-info"><span class="ci-name">${g.name} ×${g.qty}</span>` +
      `<span class="ci-price">${g.brand ? g.brand + " · " : ""}${g.price ? formatWon(g.price) + " 부터" : "가격대 다양"}</span></div>` +
      `<button class="ci-buy" type="button" data-buy="${g.name}">사러 가기 →</button>`;
    cartList.appendChild(li);
  });
  cartTotal.textContent = formatWon(total);
}
cartList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-buy]"); if (btn) { goShop(btn.getAttribute("data-buy")); return; }
  const row = e.target.closest("[data-detail]"); if (row) openDetail(metaByName[row.getAttribute("data-detail")]);
});
document.getElementById("btn-copy").addEventListener("click", async () => {
  if (placed.length === 0) return alert("먼저 가방을 꾸며주세요! ✨");
  const g = {}; placed.forEach((p) => { g[p.name] = (g[p.name] || 0) + 1; });
  const text = ["🎀 내 백꾸 쇼핑 리스트", ""].concat(Object.keys(g).map((n) => `· ${n} → ${buyUrl(n)}`)).join("\n");
  try { await navigator.clipboard.writeText(text); alert("쇼핑 리스트를 복사했어요! 친구에게 공유해보세요 📋"); }
  catch { prompt("아래 리스트를 복사하세요:", text); }
});

// ===== 아이템 상세 카드 =====
const dCard = document.getElementById("detail-card");
function openDetail(charm) {
  if (!charm) return;
  document.getElementById("detail-name").textContent = charm.name;
  document.getElementById("detail-brand").textContent = charm.brand || "셀렉트";
  document.getElementById("detail-price").textContent = charm.price
    ? (charm.priceMax ? `${formatWon(charm.price)} ~ ${formatWon(charm.priceMax)}` : `${formatWon(charm.price)}~`) : "가격대 다양";
  document.getElementById("detail-desc").textContent = charm.desc || "";
  const thumb = document.getElementById("detail-thumb");
  thumb.innerHTML = charm.img ? `<img src="${charm.img}" alt="${charm.name}">` : `<span>${charm.emoji || "🧷"}</span>`;
  const chips = document.getElementById("detail-chips"); chips.innerHTML = "";
  (charm.tags || []).concat(charm.material ? [charm.material] : []).forEach((t) => {
    const s = document.createElement("span"); s.className = "chip"; s.textContent = t; chips.appendChild(s);
  });
  dCard._charm = charm; dCard.hidden = false;
}
function closeDetail() { dCard.hidden = true; }
document.getElementById("detail-close").addEventListener("click", closeDetail);
dCard.addEventListener("click", (e) => { if (e.target === dCard) closeDetail(); });
document.getElementById("detail-add").addEventListener("click", () => { if (dCard._charm) { showEditor(); addCharm(dCard._charm); closeDetail(); } });
document.getElementById("detail-buy").addEventListener("click", () => { if (dCard._charm) goShop(dCard._charm.name); });

// ===== 이미지 저장(PNG) =====
document.getElementById("btn-save").addEventListener("click", () => {
  const r = stage.getBoundingClientRect();
  const scale = 2;
  const canvas = document.getElementById("export-canvas");
  canvas.width = r.width * scale; canvas.height = r.height * scale;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.38, 10, canvas.width / 2, canvas.height * 0.38, canvas.width);
  grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.7, "#fde9f4"); grad.addColorStop(1, "#f6e4ff");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (bagImageEl && bagImageEl.complete && bagImageEl.naturalWidth) {
    if (bagFit === "cover") drawCover(ctx, bagImageEl, canvas.width, canvas.height);
    else drawContain(ctx, bagImageEl, canvas.width, canvas.height);
  } else { ctx.font = `${230 * scale}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(currentBag.emoji, canvas.width / 2, canvas.height / 2); }
  placed.forEach((p) => {
    ctx.save(); ctx.translate(p.x * canvas.width, p.y * canvas.height); ctx.rotate((p.rot * Math.PI) / 180);
    const useImg = p.src && p.imgEl && p.imgEl.complete && p.imgEl.naturalWidth;
    if (useImg) { const s = p.size * scale; const ar = p.imgEl.naturalWidth / p.imgEl.naturalHeight; let dw = s, dh = s; if (ar > 1) dh = s / ar; else dw = s * ar; ctx.drawImage(p.imgEl, -dw / 2, -dh / 2, dw, dh); }
    else { ctx.font = `${p.size * scale}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.emoji, 0, 0); }
    ctx.restore();
  });
  try { const link = document.createElement("a"); link.download = `내백꾸_${Date.now()}.png`; link.href = canvas.toDataURL("image/png"); link.click(); }
  catch { alert("외부 사진이 포함되어 저장이 제한됐어요. 업로드한 사진만으로 꾸미면 저장이 됩니다."); }
});
function drawCover(ctx, img, W, H) { const ar = img.naturalWidth / img.naturalHeight, car = W / H; let dw, dh; if (ar > car) { dh = H; dw = dh * ar; } else { dw = W; dh = dw / ar; } ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }
function drawContain(ctx, img, W, H) { const ar = img.naturalWidth / img.naturalHeight, car = W / H; let dw, dh; if (ar > car) { dw = W * 0.86; dh = dw / ar; } else { dh = H * 0.86; dw = dh * ar; } ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }

// ===== 피드(홈) =====
const feedGrid = document.getElementById("feed-grid");
const feedEmpty = document.getElementById("feed-empty");
const tagbar = document.getElementById("tagbar");

TAGS.forEach((t) => {
  const chip = document.createElement("button");
  chip.className = "tag-chip" + (t === "전체" ? " active" : "");
  chip.type = "button"; chip.textContent = t; chip.dataset.tag = t;
  chip.addEventListener("click", () => {
    activeTag = t;
    document.querySelectorAll(".tag-chip").forEach((c) => c.classList.toggle("active", c.dataset.tag === t));
    renderFeed();
  });
  tagbar.appendChild(chip);
});
document.getElementById("search").addEventListener("input", (e) => { searchText = e.target.value.trim().toLowerCase(); renderFeed(); });

function lookMatches(look) {
  if (activeTag === "🔖 내 저장") { if (!look._saved) return false; }
  else if (activeTag !== "전체" && !(look.tags || []).includes(activeTag)) return false;
  if (searchText) {
    const hay = (look.author + " " + (look.tags || []).join(" ") + " " + look.items.map((i) => i.name).join(" ")).toLowerCase();
    if (!hay.includes(searchText)) return false;
  }
  return true;
}
function renderFeed() {
  feedGrid.innerHTML = "";
  const list = LOOKS.filter(lookMatches);
  feedEmpty.hidden = list.length > 0;
  list.forEach((look) => feedGrid.appendChild(buildPinCard(look)));
}
function renderLookInto(container, look) {
  container.innerHTML = "";
  const bag = BAGS.find((b) => b.id === look.bag) || BAGS[0];
  if (look.bagImg) { container.style.backgroundImage = `url("${look.bagImg}")`; container.classList.add("has-photo"); }
  else if (bag.img) { container.style.backgroundImage = `url("${bag.img}")`; container.classList.remove("has-photo"); }
  else container.innerHTML = `<span class="look-bag-emoji">${bag.emoji}</span>`;
  look.items.forEach((it) => {
    const m = metaByName[it.name]; if (!m) return;
    const c = document.createElement(m.img ? "img" : "span");
    c.className = "look-charm";
    if (m.img) c.src = m.img; else c.textContent = m.emoji;
    c.style.left = it.x * 100 + "%"; c.style.top = it.y * 100 + "%";
    c.style.width = (it.size / 460 * 100) + "%";
    c.style.transform = `translate(-50%,-50%) rotate(${it.rot || 0}deg)`;
    container.appendChild(c);
  });
}
function buildPinCard(look) {
  const card = document.createElement("article");
  card.className = "pin-card";
  const thumb = document.createElement("div");
  thumb.className = "pin-thumb";
  renderLookInto(thumb, look);
  card.appendChild(thumb);
  const foot = document.createElement("div");
  foot.className = "pin-foot";
  foot.innerHTML = `<span class="pin-au">${look.author}</span><span class="pin-likes">♡ ${look.likes}</span>`;
  card.appendChild(foot);
  card.addEventListener("click", () => openPin(look));
  return card;
}

// ===== 핀 상세 모달 =====
const pinModal = document.getElementById("pin-modal");
const pinItems = document.getElementById("pin-items");
function openPin(look) {
  currentPin = look;
  document.getElementById("pin-author").textContent = look.author;
  document.getElementById("pin-likes").textContent = look.likes;
  document.getElementById("pin-saves").textContent = look.saves;
  const saveBtn = document.getElementById("pin-save");
  saveBtn.classList.toggle("on", !!look._saved);
  const likeBtn = document.getElementById("pin-like");
  likeBtn.firstChild.textContent = look._liked ? "❤ " : "♡ ";
  likeBtn.classList.toggle("on", !!look._liked);
  renderLookInto(document.getElementById("pin-img"), look);
  pinItems.innerHTML = "";
  [...new Set(look.items.map((i) => i.name))].forEach((name) => {
    const m = metaByName[name]; if (!m) return;
    const li = document.createElement("li");
    li.className = "pin-item"; li.dataset.detail = name;
    const thumb = m.img ? `<img src="${m.img}" alt="">` : `<span>${m.emoji}</span>`;
    li.innerHTML = `<div class="pin-item-th">${thumb}</div>` +
      `<div class="pin-item-info"><span class="pin-item-name">${m.name}</span>` +
      `<span class="pin-item-sub">${m.brand || ""}${m.price ? " · " + formatWon(m.price) + " 부터" : ""}</span></div>` +
      `<button class="ci-buy" type="button" data-buy="${name}">사러 가기 →</button>`;
    pinItems.appendChild(li);
  });
  pinModal.hidden = false;
}
function closePin() { pinModal.hidden = true; }
document.getElementById("pin-close").addEventListener("click", closePin);
pinModal.addEventListener("click", (e) => { if (e.target === pinModal) closePin(); });
pinItems.addEventListener("click", (e) => {
  const buy = e.target.closest("[data-buy]"); if (buy) { goShop(buy.getAttribute("data-buy")); return; }
  const row = e.target.closest("[data-detail]"); if (row) openDetail(metaByName[row.getAttribute("data-detail")]);
});
document.getElementById("pin-like").addEventListener("click", () => {
  if (!currentPin) return;
  currentPin._liked = !currentPin._liked;
  currentPin.likes += currentPin._liked ? 1 : -1;
  const b = document.getElementById("pin-like");
  b.firstChild.textContent = currentPin._liked ? "❤ " : "♡ ";
  b.classList.toggle("on", currentPin._liked);
  document.getElementById("pin-likes").textContent = currentPin.likes;
});
document.getElementById("pin-save").addEventListener("click", () => {
  if (!currentPin) return;
  currentPin._saved = !currentPin._saved;
  currentPin.saves += currentPin._saved ? 1 : -1;
  const b = document.getElementById("pin-save");
  b.classList.toggle("on", currentPin._saved);
  document.getElementById("pin-saves").textContent = currentPin.saves;
});
document.getElementById("pin-follow").addEventListener("click", () => { if (currentPin) { closePin(); loadLook(currentPin); } });

function loadLook(look) {
  showEditor(); clearPlaced();
  if (look.bagImg) { currentBag = { id: "shared", emoji: "👜", img: look.bagImg };
    document.querySelectorAll(".bag-opt").forEach((x) => x.classList.remove("active")); applyBag(look.bagImg, "👜", "contain"); }
  else selectBagById(look.bag);
  look.items.forEach((it) => { const m = metaByName[it.name]; if (m) spawnCharm(m, it.x, it.y, it.size, it.rot || 0); });
}

// ===== 뷰 전환 =====
const viewFeed = document.getElementById("view-feed");
const viewEditor = document.getElementById("view-editor");
const feedActions = document.getElementById("feed-actions");
const editorActions = document.getElementById("editor-actions");
function showFeed() { renderFeed(); viewEditor.hidden = true; viewFeed.hidden = false; feedActions.hidden = false; editorActions.hidden = true; window.scrollTo(0, 0); }
function showEditor() { viewFeed.hidden = true; viewEditor.hidden = false; feedActions.hidden = true; editorActions.hidden = false; }
document.getElementById("brand-home").addEventListener("click", showFeed);
document.getElementById("btn-create").addEventListener("click", () => { showEditor(); });
document.getElementById("btn-home").addEventListener("click", showFeed);
document.getElementById("btn-reset").addEventListener("click", () => { if (placed.length && !confirm("꾸민 내용을 모두 지울까요?")) return; clearPlaced(); });
function clearPlaced() { placed.forEach((p) => p.el.remove()); placed = []; selectedId = null; toolDock.hidden = true; emptyTip.style.display = ""; updateCart(); }

// ===== 피드에 올리기 =====
function postLook() {
  if (placed.length === 0) { showEditor(); return alert("먼저 가방을 꾸민 뒤 올려보세요! ✨"); }
  const tagSet = [];
  placed.forEach((p) => (p.meta.tags || []).forEach((t) => { if (!tagSet.includes(t) && TAGS.includes(t)) tagSet.push(t); }));
  const look = {
    id: Date.now(), author: "나 🩷", likes: 0, saves: 0,
    bag: BAGS.find((b) => b.id === currentBag.id) ? currentBag.id : "tote",
    bagImg: currentBag.img && !BAGS.find((b) => b.id === currentBag.id) ? currentBag.img : null,
    tags: tagSet.slice(0, 3),
    items: placed.map((p) => ({ name: p.name, x: p.x, y: p.y, size: p.size, rot: p.rot })),
    _mine: true,
  };
  LOOKS.unshift(look);
  showFeed();
  alert("내 백꾸를 피드에 올렸어요! 🎉");
}
document.getElementById("btn-post").addEventListener("click", postLook);
document.getElementById("btn-post-2").addEventListener("click", postLook);

// ===== 유틸 =====
window.addEventListener("resize", () => placed.forEach(applyTransform));
function formatWon(n) { return n.toLocaleString("ko-KR") + "원"; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }

// ===== 초기화 =====
applyBag(currentBag.img, currentBag.emoji);
updateCart();
renderFeed();
