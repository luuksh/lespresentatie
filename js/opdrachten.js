// Standaard-opdrachten (pas aan naar eigen smaak)
const OPDRACHTEN = [
  {id:'duo-2',   titel:'Duo-gesprek',        duur:120, tekst:'Praat met je buur over de hoofdvraag. Schrijf 3 kernwoorden.'},
  {id:'schrijf-5', titel:'Schrijf-opstart',   duur:300, tekst:'Schrijf 7 zinnen: 3 feiten uit de les, 3 vragen, 1 conclusie.'},
  {id:'lezen-10',  titel:'Stillezen',         duur:600, tekst:'10 min lezen. Markeer 3 zinnen die je wil bespreken.'},
  {id:'disc-8',    titel:'Klassendiscussie',  duur:480, tekst:'Stelling op het bord. Jij: 1 argument + 1 voorbeeld.'},
  {id:'woorden-4', titel:'Woordenschat Sprint',duur:240, tekst:'Noteer 5 moeilijke woorden + eigen uitleg.'},
  {id:'pitch-1',   titel:'1-minuut pitch',    duur:60,  tekst:'Vat je alinea in 3 zinnen samen. Klaar? Hand omhoog.'},
];

const lsKeyFav = 'lp_fav_opdrachten_v1';
let favorieten = new Set(JSON.parse(localStorage.getItem(lsKeyFav) || '[]'));

const zoekEl = document.getElementById('opdrachtZoek');
const lijstEl = document.getElementById('opdrachtLijst');
const btnFav = document.getElementById('toonFavorieten');
const btnAlle = document.getElementById('toonAlle');

function fmtDuur(s){ const m=Math.floor(s/60), r=s%60; return m?`${m}m${r?` ${r}s`:''}`:`${r}s`; }

function renderOpdrachten(filter = '', alleenFav = false){
  if (!lijstEl) return;
  const q = filter.trim().toLowerCase();
  lijstEl.innerHTML = '';
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
        <button class="start">Start timer rechts</button>
        <button class="fav">${favorieten.has(o.id) ? '★' : '☆'}</button>
      </div>`;
    el.querySelector('.proj').onclick = ()=> projecteerOpdracht(o);
    el.querySelector('.start').onclick = ()=> startLokaleTimer(o.duur);
    el.querySelector('.fav').onclick = ()=>{
      if (favorieten.has(o.id)) favorieten.delete(o.id); else favorieten.add(o.id);
      localStorage.setItem(lsKeyFav, JSON.stringify([...favorieten]));
      renderOpdrachten(zoekEl.value, alleenFav);
    };
    lijstEl.appendChild(el);
  });
}

// Projector-venster met full-screen countdown
function projecteerOpdracht(o){
  const w = window.open('', 'lp_projector', 'noopener,width=1200,height=800');
  const html = `
  <html><head><meta charset="utf-8"><title>${o.titel}</title>
  <style>
    html,body{height:100%;margin:0;font-family:system-ui,Segoe UI,Arial}
    body{background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px}
    .titel{font-size:56px;font-weight:800;text-align:center;line-height:1.1;max-width:1200px}
    .tekst{font-size:28px;max-width:1200px;text-align:center;opacity:.95}
    .timer{font-size:80px;font-weight:900;letter-spacing:.03em}
    .bar{position:fixed;top:16px;left:16px;right:16px;display:flex;gap:8px;justify-content:center;opacity:.9}
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

// Timer aan de rechterkant starten (vul selectors aan jouw timer.html als je die bedient via postMessage)
function startLokaleTimer(seconden){
  // Voor nu: geen directe koppeling. Later kunnen we via window.parent.postMessage() de iframe-timer starten.
  console.log('Start lokale timer:', seconden, 's');
}

// Koppelingen/filters
if (zoekEl) zoekEl.addEventListener('input', e=>renderOpdrachten(e.target.value));
if (btnFav) btnFav.addEventListener('click', ()=>renderOpdrachten(zoekEl?.value || '', true));
if (btnAlle) btnAlle.addEventListener('click', ()=>renderOpdrachten(zoekEl?.value || '', false));

// Eerste render
renderOpdrachten();
