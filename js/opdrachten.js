// js/opdrachten.js (of onderaan je hoofdscript)
const OPDRACHTEN = [
  {id:'duo-2', titel:'Duo-gesprek', duur:120, tekst:'Praat met je buur over de hoofdvraag. Schrijf 3 kernwoorden.'},
  {id:'schrijf-5', titel:'Schrijf-opstart', duur:300, tekst:'Schrijf 7 zinnen: 3 feiten uit de les, 3 vragen, 1 conclusie.'},
  {id:'lezen-10', titel:'Stillees', duur:600, tekst:'10 min lezen. Markeer 3 zinnen die je wil bespreken.'},
  {id:'klassendiscussie-8', titel:'Klassendiscussie', duur:480, tekst:'Stelling op het bord. Jij: 1 argument + 1 voorbeeld.'},
  {id:'woordenschat-4', titel:'Woordenschat Sprint', duur:240, tekst:'Noteer 5 moeilijke woorden + eigen uitleg.'},
  {id:'present-1', titel:'1-minuut pitch', duur:60, tekst:'Vat je alinea in 3 zinnen samen. Klaar? Hand omhoog.'},
];

const lsKeyFav = 'lp_fav_opdrachten_v1';
let favorieten = new Set(JSON.parse(localStorage.getItem(lsKeyFav) || '[]'));

function renderOpdrachten(filter = '', alleenFav = false){
  const lijst = document.getElementById('opdrachtLijst');
  const q = filter.trim().toLowerCase();
  lijst.innerHTML = '';
  let data = OPDRACHTEN
    .filter(o => (!q || o.titel.toLowerCase().includes(q) || o.tekst.toLowerCase().includes(q)))
    .sort((a,b)=> (favorieten.has(b.id)-favorieten.has(a.id)) || a.titel.localeCompare(b.titel));
  if (alleenFav) data = data.filter(o=>favorieten.has(o.id));
  data.forEach(o=>{
    const el = document.createElement('div');
    el.className = 'opdracht-chip';
    el.innerHTML = `
      <h4>${o.titel} · ${fmtDuur(o.duur)}</h4>
      <p>${o.tekst}</p>
      <div class="opdracht-actions">
        <button class="proj">Projecteer</button>
        <button class="start">Start hier</button>
        <button class="fav">${favorieten.has(o.id) ? '★' : '☆'}</button>
      </div>`;
    el.querySelector('.proj').onclick = ()=> projecteerOpdracht(o);
    el.querySelector('.start').onclick = ()=> startLokaleTimer(o.duur);
    el.querySelector('.fav').onclick = (e)=>{
      if (favorieten.has(o.id)) favorieten.delete(o.id); else favorieten.add(o.id);
      localStorage.setItem(lsKeyFav, JSON.stringify([...favorieten]));
      renderOpdrachten(document.getElementById('opdrachtZoek').value, alleenFav);
    };
    lijst.appendChild(el);
  });
}
function fmtDuur(s){ const m=Math.floor(s/60), r=s%60; return m?`${m}m${r?` ${r}s`:''}`:`${r}s`; }

// Koppel UI
document.getElementById('opdrachtZoek').addEventListener('input', e=>renderOpdrachten(e.target.value));
document.getElementById('toonFavorieten').addEventListener('click', ()=>renderOpdrachten(document.getElementById('opdrachtZoek').value,true));
document.getElementById('toonAlle').addEventListener('click', ()=>renderOpdrachten(document.getElementById('opdrachtZoek').value,false));
renderOpdrachten();

// --- Projector venster (minimalistisch, met countdown & sneltoetsen) ---
function projecteerOpdracht(o){
  const w = window.open('', 'lp_projector', 'noopener,width=1200,height=800');
  const html = `
  <html><head><meta charset="utf-8"><title>${o.titel}</title>
  <style>
    html,body{height:100%;margin:0;font-family:system-ui,Segoe UI,Arial}
    body{background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px}
    .titel{font-size:56px;font-weight:800;text-align:center;line-height:1.1}
    .tekst{font-size:28px;max-width:1200px;text-align:center;opacity:.95}
    .timer{font-size:80px;font-weight:900;letter-spacing:.03em}
    .bar{position:fixed;top:16px;left:16px;right:16px;display:flex;justify-content:space-between;opacity:.8}
    .btn{background:#fff;color:#111;border:none;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}
    .hint{position:fixed;bottom:16px;opacity:.6;font-size:14px}
  </style></head>
  <body>
    <div class="bar">
      <button class="btn" id="pauseBtn">⏯︎ Start</button>
      <button class="btn" id="fullscreenBtn">⛶ Beeldvullend</button>
      <button class="btn" id="plusMin">+1m</button>
      <button class="btn" id="minMin">−1m</button>
      <button class="btn" id="resetBtn">↺ Reset</button>
    </div>
    <div class="titel">${o.titel}</div>
    <div class="tekst">${o.tekst}</div>
    <div class="timer" id="t">00:00</div>
    <div class="hint">Spatie: start/pauze · F: fullscreen · Esc: stoppen</div>
    <script>
      let rest=${o.duur}, run=false, iv=null;
      const tEl=document.getElementById('t');
      function fmt(s){const m=Math.floor(s/60),r=s%60;return (m<10?'0':'')+m+':'+(r<10?'0':'')+r}
      function render(){tEl.textContent=fmt(rest);}
      function tick(){ if(!run) return; rest=Math.max(0,rest-1); render(); if(rest===0) {run=false; clearInterval(iv);} }
      function start(){ if(run) return; run=true; document.getElementById('pauseBtn').textContent='⏸︎ Pauze'; iv=setInterval(tick,1000); }
      function pause(){ run=false; document.getElementById('pauseBtn').textContent='⏯︎ Start'; clearInterval(iv); }
      function toggle(){ run?pause():start(); }
      document.getElementById('pauseBtn').onclick=toggle;
      document.getElementById('resetBtn').onclick=()=>{pause(); rest=${o.duur}; render();};
      document.getElementById('plusMin').onclick=()=>{rest+=60; render();};
      document.getElementById('minMin').onclick=()=>{rest=Math.max(0,rest-60); render();};
      document.getElementById('fullscreenBtn').onclick=()=>{document.documentElement.requestFullscreen?.()};
      window.addEventListener('keydown',e=>{
        if(e.code==='Space'){e.preventDefault(); toggle();}
        if(e.key==='f' || e.key==='F'){document.documentElement.requestFullscreen?.();}
        if(e.key==='Escape'){pause();}
      });
      render();
    <\/script>
  </body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}

// Optioneel: start lokale (rechter) timer als je IDs hebt; anders laat deze noop staan
function startLokaleTimer(seconden){
  // Voorbeeld: vul je bestaande timerinputs (pas selectors aan jouw pagina aan)
  const min = Math.floor(seconden/60), sec = seconden%60;
  const minIn = document.querySelector('#timerMin'), secIn = document.querySelector('#timerSec');
  const startBtn = document.querySelector('#timerStart');
  if(minIn && secIn && startBtn){ minIn.value=min; secIn.value=sec; startBtn.click(); }
}
