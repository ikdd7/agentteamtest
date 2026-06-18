/* 느좋점수 프로토타입 로직 (vanilla JS, 빌드 불필요)
 * - 화면 전환, 목업 AI, 무드 평가, 캔디 게이팅, 공유 카드 생성
 * 주의: 실제 백엔드/AI 없음. 모든 점수는 목업.
 */

// ---------- 상태 ----------
const State = {
  candy: Number(localStorage.getItem('njs_candy') || 0),
  firstPhotoUsed: localStorage.getItem('njs_first') === '1',
  uploadedDataURL: null,
  aiResult: null,          // {score, tags}
  rate: { queue: [], idx: 0, done: 0, goal: 10, selectedTags: [] },
  pendingAfterGate: false, // 평가 끝나면 자동으로 결과 주기
};
const COST = 10; // 재평가/추가 사진에 필요한 캔디

// ---------- 유틸 ----------
function $(id){ return document.getElementById(id); }
function saveState(){
  localStorage.setItem('njs_candy', State.candy);
  localStorage.setItem('njs_first', State.firstPhotoUsed ? '1' : '0');
}
function renderCandy(){ $('candyCount').textContent = State.candy; }
let toastTimer;
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}
function go(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.querySelector(`[data-screen="${name}"]`).classList.add('active');
  window.scrollTo(0,0);
}
function hash(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))>>>0; } return h; }
function pick(arr,n){ const a=[...arr].sort(()=>Math.random()-0.5); return a.slice(0,n); }

// seed 기반 그라데이션 (오프라인 이미지 대체)
const PALETTES = [
  ['#ffd9a8','#b9a8ff'], ['#8fd3c7','#ffb38a'], ['#c5b3ff','#ffc2d1'],
  ['#a8d8ff','#fff0a8'], ['#ffb3b3','#b3ffd9'], ['#d6c2ff','#ffd6a8'],
];
function gradientDataURL(seed){
  const p = PALETTES[hash(seed) % PALETTES.length];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='750'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
    <stop offset='0' stop-color='${p[0]}'/><stop offset='1' stop-color='${p[1]}'/>
    </linearGradient></defs><rect width='600' height='750' fill='url(#g)'/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function photoURL(seed){ return `https://picsum.photos/seed/${seed}/600/750`; }
function setImgWithFallback(imgEl, seed){
  imgEl.onerror = ()=>{ imgEl.onerror=null; imgEl.src = gradientDataURL(seed); };
  imgEl.src = photoURL(seed);
}

// ---------- 목업 AI ----------
function mockAI(seedStr){
  const allTags = [...MOOD_TAGS.분위기, ...MOOD_TAGS.스타일, ...MOOD_TAGS.종합];
  const base = 60 + (hash(seedStr) % 35); // 60~94
  const tags = pick(allTags, 3);
  return { score: base, tags };
}

// ---------- 업로드 ----------
$('fileInput').addEventListener('change', e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    State.uploadedDataURL = ev.target.result;
    const img = $('preview');
    img.src = State.uploadedDataURL; img.hidden = false;
    $('uploadPlaceholder').hidden = true;

    // AI 즉석 추정 (콜드스타트 방지용 맛보기)
    State.aiResult = mockAI(file.name + file.size);
    $('aiScore').textContent = State.aiResult.score;
    $('aiTags').innerHTML = State.aiResult.tags.map(t=>`<span class="chip">${t}</span>`).join('');
    $('aiPeek').hidden = false;

    // 게이팅 안내
    if(!State.firstPhotoUsed){
      $('gateHint').textContent = '첫 사진은 무료로 평가받을 수 있어요 🎁';
    }else{
      $('gateHint').textContent = `재평가는 🍬${COST} 필요 (남 사진 10개 평가하면 모여요)`;
    }
  };
  reader.readAsDataURL(file);
});

// "진짜 사람들의 평가 받기"
function requestRealRating(){
  if(!State.uploadedDataURL){ toast('사진을 먼저 올려주세요'); return; }

  if(!State.firstPhotoUsed){
    State.firstPhotoUsed = true; saveState();
    showResult();
    return;
  }
  // 두 번째부터: 캔디 필요
  if(State.candy >= COST){
    State.candy -= COST; saveState(); renderCandy();
    showResult();
  }else{
    toast(`🍬가 부족해요 (${State.candy}/${COST}). 남 사진을 평가하고 모아요!`);
    State.pendingAfterGate = true;
    startRating();
  }
}

// ---------- 평가하기 ----------
function startRating(){
  State.rate.queue = [...SAMPLE_PHOTOS].sort(()=>Math.random()-0.5);
  State.rate.idx = 0;
  State.rate.done = 0;
  $('rateGoal').textContent = State.rate.goal;
  loadRatePhoto();
  buildTagPicker();
  go('rate');
}
function loadRatePhoto(){
  const p = State.rate.queue[State.rate.idx % State.rate.queue.length];
  setImgWithFallback($('rateImg'), p.seed);
  $('rateCaption').textContent = p.caption;
  $('vibeSlider').value = 50; $('vibeVal').textContent = 50;
  State.rate.selectedTags = [];
  document.querySelectorAll('#tagPick .chip').forEach(c=>c.classList.remove('on'));
  $('rateDone').textContent = State.rate.done;
}
function buildTagPicker(){
  const allTags = [...MOOD_TAGS.분위기, ...MOOD_TAGS.스타일, ...MOOD_TAGS.종합];
  $('tagPick').innerHTML = allTags.map(t=>`<span class="chip" data-tag="${t}">${t}</span>`).join('');
  document.querySelectorAll('#tagPick .chip').forEach(c=>{
    c.onclick = ()=>{
      const t = c.dataset.tag;
      if(State.rate.selectedTags.includes(t)){
        State.rate.selectedTags = State.rate.selectedTags.filter(x=>x!==t);
        c.classList.remove('on');
      }else{
        State.rate.selectedTags.push(t); c.classList.add('on');
      }
    };
  });
}
$('vibeSlider').addEventListener('input', e=>{ $('vibeVal').textContent = e.target.value; });

function submitRating(){
  // (목업) 평가 저장은 생략. 캔디 적립.
  State.rate.done++;
  State.candy++; saveState(); renderCandy();

  if(State.rate.done >= State.rate.goal){
    toast('🍬 10개 적립 완료!');
    if(State.pendingAfterGate){
      State.pendingAfterGate = false;
      // 모은 캔디로 바로 결과 열기
      if(State.candy >= COST){ State.candy -= COST; saveState(); renderCandy(); }
      showResult();
    }else{
      go('home');
    }
    return;
  }
  State.rate.idx++;
  loadRatePhoto();
  toast('+1 🍬');
}

// ---------- 결과 ----------
function buildResult(){
  // 사람 평가가 쌓였다고 가정 → AI 추정 + 약간의 변동으로 최종 점수
  const ai = State.aiResult || mockAI('default');
  const finalScore = Math.min(99, Math.max(40, ai.score + (Math.floor(Math.random()*9)-4)));
  const allTags = [...MOOD_TAGS.분위기, ...MOOD_TAGS.스타일, ...MOOD_TAGS.종합];
  const moods = Array.from(new Set([...ai.tags, ...pick(allTags,3)])).slice(0,3);
  const coach = AI_COACH[Math.floor(Math.random()*AI_COACH.length)];
  return { finalScore, moods, coach };
}
function showResult(){
  const r = buildResult();
  State.lastResult = r;
  $('rcScore').textContent = r.finalScore;
  $('rcImg').src = State.uploadedDataURL || gradientDataURL('me');
  $('rcMoods').innerHTML = r.moods.map(t=>`<span class="chip">${t}</span>`).join('');
  $('rcCoach').textContent = '💡 ' + r.coach;
  go('result');
}

// ---------- 공유 카드 (canvas → PNG) ----------
function downloadCard(){
  const r = State.lastResult || buildResult();
  const cv = $('cardCanvas'); const ctx = cv.getContext('2d');
  const W=cv.width, H=cv.height;

  // 배경
  const bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#fff7ef'); bg.addColorStop(1,'#efe6db');
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

  // 상단 라벨
  ctx.fillStyle='#8b8077'; ctx.font='700 30px sans-serif'; ctx.textAlign='center';
  ctx.fillText('느좋점수 · NeujotScore', W/2, 90);

  // 점수 (그라데이션 텍스트)
  const sg = ctx.createLinearGradient(W/2-180,0,W/2+180,0);
  sg.addColorStop(0,'#ffb38a'); sg.addColorStop(1,'#b9a8ff');
  ctx.fillStyle=sg; ctx.font='800 180px sans-serif';
  ctx.fillText(String(r.finalScore), W/2, 290);

  const drawRest = ()=>{
    // 무드 칩
    ctx.font='700 34px sans-serif'; ctx.textAlign='center';
    const chipY = 980;
    const moods = r.moods;
    ctx.fillStyle='#6b5f53';
    ctx.fillText('내 무드  ·  ' + moods.join('  ·  '), W/2, chipY);
    // 코치
    ctx.fillStyle='#2f7d66'; ctx.font='400 28px sans-serif';
    wrapText(ctx, '💡 ' + r.coach, W/2, chipY+50, W-120, 38);
    // 저장
    const a=document.createElement('a');
    a.download='느좋점수.png'; a.href=cv.toDataURL('image/png'); a.click();
    toast('이미지를 저장했어요! 스토리에 공유해보세요 ✨');
  };

  // 업로드 이미지 넣기 (정사각 크롭)
  const img = new Image();
  img.onload = ()=>{ drawCover(ctx, img, 110, 360, W-220, 560, 28); drawRest(); };
  img.onerror = ()=>{ ctx.fillStyle='#e7ddd0'; roundRect(ctx,110,360,W-220,560,28); ctx.fill(); drawRest(); };
  img.src = State.uploadedDataURL || gradientDataURL('me');
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function drawCover(ctx,img,x,y,w,h,r){
  ctx.save(); roundRect(ctx,x,y,w,h,r); ctx.clip();
  const ir=img.width/img.height, tr=w/h; let dw,dh,dx,dy;
  if(ir>tr){ dh=h; dw=h*ir; dx=x-(dw-w)/2; dy=y; } else { dw=w; dh=w/ir; dx=x; dy=y-(dh-h)/2; }
  ctx.drawImage(img,dx,dy,dw,dh); ctx.restore();
}
function wrapText(ctx,text,cx,y,maxW,lh){
  const words=text.split(' '); let line='';
  for(const w of words){ const t=line+w+' ';
    if(ctx.measureText(t).width>maxW && line){ ctx.fillText(line.trim(),cx,y); line=w+' '; y+=lh; }
    else line=t; }
  ctx.fillText(line.trim(),cx,y);
}

// ---------- 초기화 ----------
renderCandy();
go('home');
