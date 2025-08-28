// js/init.js
// ---------------------------------------------
// Bouwt de plattegrond op basis van indeling + klas
// - H216 / U008  : duotafels
// - groepjes     : viertallen, 5e onder het viertal
// ---------------------------------------------

// DOM
const indelingSelect = document.getElementById('indelingSelect');
const klasSelect     = document.getElementById('klasSelect');
const grid           = document.getElementById('plattegrond');

// Databron met klassen en namen
const KLASSEN_URL = 'klassen.json';
let KLASSEN = {};

// ===== helpers ===============================================================
const el = (tag, cls, text) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
};

function shuffle(arr) {
  // nette shallow-copy + fisher-yates (optioneel, zet aan indien gewenst)
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chunkBy4WithFiveFix(names) {
  // chunk in viertallen; als de rest 1 is -> schuif bij het laatste viertal (wordt 5)
  const groups = [];
  for (let i = 0; i < names.length; i += 4) {
    groups.push(names.slice(i, i + 4));
  }
  if (groups.length >= 2) {
    const last = groups[groups.length - 1];
    const prev = groups[groups.length - 2];
    if (last.length === 1 && prev.length === 4) {
      prev.push(last[0]);       // maak 5-tal
      groups.pop();             // verwijder losse 1
    }
  }
  return groups;
}

function makeTafel(name) {
  const d = el('div', 'tafel', name);
  // let op: klik/toggle voor absentie gebeurt in leeglokaal.html (UI-only script)
  return d;
}

// ===== renderers =============================================================

// --- groepjes (viertallen; 5e onder) ---
function renderGroepjes(names) {
  grid.classList.add('groepjes-layout');

  // volgorde: gebruik je eigen volgorde, of shuffle() als je wilt mixen
  const groups = chunkBy4WithFiveFix(names);

  groups.forEach(g => {
    const wrap = el('div', 'groepje');
    wrap.dataset.size = String(g.length); // 4 of 5
    g.forEach(n => wrap.appendChild(makeTafel(n)));
    grid.appendChild(wrap);
  });
}

// --- duotafels (algemeen) ---
function renderDuotafels(names) {
  grid.classList.remove('groepjes-layout');

  // maak rijen met "duotafels" (2 stoelen per set)
  const perRij = 6; // aantal sets per rij; pas aan naar wens
  let idx = 0;

  while (idx < names.length) {
    const rij = el('div', 'tafelrij');

    for (let s = 0; s < perRij && idx < names.length; s++) {
      const duo = el('div', 'duotafel');
      const tafels = el('div', 'tafels');

      // stoel 1
      const n1 = names[idx++];
      tafels.appendChild(makeTafel(n1));

      // stoel 2 (als er nog iemand is)
      if (idx < names.length) {
        const n2 = names[idx++];
        tafels.appendChild(makeTafel(n2));
      }

      duo.appendChild(tafels);
      rij.appendChild(duo);
    }

    grid.appendChild(rij);
  }
}

// ===== indeling kiezen + kleuren ============================================
function kiesIndeling(type, klasKey) {
  grid.innerHTML = '';

  const names = (KLASSEN[klasKey] || []).slice(); // copy
  // Je kunt hier shufflen als je random wilt: const ordered = shuffle(names);
  const ordered = names;

  if (type === 'groepjes') {
    renderGroepjes(ordered);
  } else if (type === 'h216') {
    renderDuotafels(ordered);
  } else if (type === 'u008') {
    renderDuotafels(ordered);
  } else {
    renderDuotafels(ordered);
  }
}

function applyTheme(type) {
  const kleuren = { h216:'#007bff', u008:'#28a745', groepjes:'#e83e8c' };
  const achtergronden = { h216:'#eef2f7', u008:'#eaf7ef', groepjes:'#fdf2f7' };

  const kleur  = kleuren[type] || '#007bff';
  const bg     = achtergronden[type] || '#eef2f7';
  const hover  = kleur; // zelfde basiskleur voor hover; je CSS gebruikt var(--hover-kleur)

  document.documentElement.style.setProperty('--primaire-kleur', kleur);
  document.documentElement.style.setProperty('--hover-kleur',   kleur);
  document.documentElement.style.setProperty('--achtergrond',   bg);
}

// ===== lifecycle =============================================================
function laadIndeling() {
  const type = indelingSelect.value;
  const klas = klasSelect.value;

  applyTheme(type);

  grid.style.opacity = 0;
  // kleine delay voor nette fade
  setTimeout(() => {
    grid.innerHTML = '';
    kiesIndeling(type, klas);
    grid.style.opacity = 1;
  }, 160);
}

function vulKlasSelect() {
  const keys = Object.keys(KLASSEN).sort();
  const current = klasSelect.value;

  klasSelect.innerHTML = '';
  keys.forEach(k => {
    const opt = el('option', '', `Klas ${k}`);
    opt.value = k;
    klasSelect.appendChild(opt);
  });

  // probeer vorige selectie te behouden
  if (current && KLASSEN[current]) {
    klasSelect.value = current;
  }
}

async function init() {
  try {
    const res = await fetch(KLASSEN_URL, { cache: 'no-cache' });
    KLASSEN = await res.json();
  } catch (e) {
    console.warn('Kon klassen.json niet laden; gebruik lege set.', e);
    KLASSEN = {};
  }

  vulKlasSelect();
  laadIndeling();

  indelingSelect.addEventListener('change', laadIndeling);
  klasSelect.addEventListener('change', laadIndeling);
}

// start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
