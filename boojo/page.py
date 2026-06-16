"""방문자 페이지 — 가입 없이 3초 판정 → 결과 카드 → 익명 데이터 입력 → 공유.

외부 의존 0(인라인 CSS/JS). 서버가 /api/options · /api/judge · /api/record 를 제공.
"""

from __future__ import annotations

import json

from .norms import ATTEND, EVENTS, MEALS, RELATIONS


def render() -> str:
    opts = {
        "events": list(EVENTS),
        "relations": list(RELATIONS),
        "meals": list(MEALS),
        "attend": list(ATTEND),
    }
    return _HTML.replace("__OPTS__", json.dumps(opts, ensure_ascii=False))


_HTML = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>부조 · 호구지수 — 축의금 얼마 내야 정상?</title>
<style>
 *{box-sizing:border-box} body{font-family:-apple-system,system-ui,"Apple SD Gothic Neo",sans-serif;
  margin:0;background:#f5f3ef;color:#1c1c1c}
 .wrap{max-width:480px;margin:0 auto;padding:20px}
 h1{font-size:22px;margin:8px 0 2px} .sub{color:#777;font-size:14px;margin:0 0 18px}
 .card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.06);margin-bottom:14px}
 label{display:block;font-size:13px;color:#555;margin:12px 0 6px;font-weight:600}
 select,input[type=number]{width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:16px;background:#fff}
 .chips{display:flex;flex-wrap:wrap;gap:8px}
 .chip{padding:9px 12px;border:1px solid #ddd;border-radius:999px;font-size:14px;cursor:pointer;background:#fff}
 .chip.on{background:#1c1c1c;color:#fff;border-color:#1c1c1c}
 .row{display:flex;gap:10px} .row>div{flex:1}
 input[type=range]{width:100%}
 button{width:100%;padding:15px;border:0;border-radius:12px;background:#ff5a3c;color:#fff;font-size:17px;font-weight:700;cursor:pointer;margin-top:16px}
 button.ghost{background:#eee;color:#333}
 .result{text-align:center;padding:24px 16px}
 .score{font-size:54px;font-weight:800;margin:6px 0}
 .label{font-size:20px;font-weight:700} .drip{color:#444;margin:14px 0;font-size:15px;line-height:1.5}
 .fair{color:#777;font-size:14px} .muted{color:#999;font-size:12px;margin-top:10px}
 .hidden{display:none}
</style></head>
<body><div class="wrap">
 <h1>부조 · 호구지수 🧧</h1>
 <p class="sub">축의금·부의금, 나만 호구인가? 또래 데이터로 3초 판정.</p>

 <div class="card" id="form">
  <label>경조사</label><div class="chips" id="events"></div>
  <label>관계</label><select id="relation"></select>
  <div class="row">
   <div><label>친밀도 <span id="intimv">3</span>/5</label>
     <input type="range" id="intimacy" min="1" max="5" value="3"></div>
  </div>
  <div class="row">
   <div><label>식대</label><div class="chips" id="meals"></div></div>
   <div><label>참석</label><div class="chips" id="attend"></div></div>
  </div>
  <label>낸(낼) 금액 (원)</label>
  <input type="number" id="amount" inputmode="numeric" placeholder="예: 100000">
  <button id="go">호구지수 판정 →</button>
 </div>

 <div class="card result hidden" id="out">
  <div class="label"><span id="emoji"></span> <span id="rlabel"></span></div>
  <div class="score" id="score"></div>
  <div class="drip" id="drip"></div>
  <div class="fair" id="fair"></div>
  <div class="muted" id="sample"></div>
  <button id="rec">내 금액도 데이터에 더하기(익명)</button>
  <button class="ghost" id="share">결과 공유하기</button>
  <button class="ghost" id="again">다시 판정</button>
 </div>
 <p class="muted" style="text-align:center" id="total"></p>
</div>
<script>
const OPTS=__OPTS__;
const S={event:OPTS.events[0],meal:OPTS.meals[0],attend:OPTS.attend[0]};
function chips(id,arr,key){const el=document.getElementById(id);el.innerHTML='';
 arr.forEach(v=>{const c=document.createElement('div');c.className='chip'+(S[key]===v?' on':'');
  c.textContent=v;c.onclick=()=>{S[key]=v;chips(id,arr,key)};el.appendChild(c)})}
chips('events',OPTS.events,'event');chips('meals',OPTS.meals,'meal');chips('attend',OPTS.attend,'attend');
const rel=document.getElementById('relation');OPTS.relations.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=r;rel.appendChild(o)});
const intim=document.getElementById('intimacy');intim.oninput=()=>document.getElementById('intimv').textContent=intim.value;
function payload(){return{event:S.event,relation:rel.value,intimacy:+intim.value,meal:S.meal,attended:S.attend,amount:+document.getElementById('amount').value}}
function won(n){return n.toLocaleString('ko-KR')+'원'}
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return r.json()}
let last=null;
document.getElementById('go').onclick=async()=>{const p=payload();if(!p.amount){alert('금액을 입력해줘');return}
 last=p;const v=await post('/api/judge',p);
 document.getElementById('emoji').textContent=v.emoji;document.getElementById('rlabel').textContent=v.label;
 document.getElementById('score').textContent='호구지수 '+v.score;
 document.getElementById('drip').textContent=v.drip;
 document.getElementById('fair').textContent='또래 적정 구간: '+won(v.fair_low)+' ~ '+won(v.fair_high);
 document.getElementById('sample').textContent=v.sample>0?('또래 실데이터 '+v.sample+'건 반영'):'(아직 실데이터 없음 — 통념 기준 판정)';
 document.getElementById('form').classList.add('hidden');document.getElementById('out').classList.remove('hidden')}
document.getElementById('rec').onclick=async()=>{const r=await post('/api/record',last);
 document.getElementById('rec').textContent='✓ 더해졌어! (이 코호트 '+r.sample+'건)';document.getElementById('rec').disabled=true;refresh()}
document.getElementById('share').onclick=()=>{const t='내 '+last.relation+' '+S.event+' 호구지수: '+document.getElementById('score').textContent.replace('호구지수 ','')+' '+document.getElementById('emoji').textContent+'\\n'+OPTS_ATTR;
 if(navigator.share){navigator.share({text:t})}else{navigator.clipboard.writeText(t);alert('결과를 복사했어!\\n'+t)}}
document.getElementById('again').onclick=()=>{document.getElementById('out').classList.add('hidden');document.getElementById('form').classList.remove('hidden');
 document.getElementById('rec').disabled=false;document.getElementById('rec').textContent='내 금액도 데이터에 더하기(익명)'}
const OPTS_ATTR='내 호구지수 판정받기 → 부조';
async function refresh(){const r=await fetch('/api/total');const j=await r.json();document.getElementById('total').textContent='지금까지 모인 익명 부조 데이터 '+j.total+'건';}
refresh();
</script></body></html>
"""
