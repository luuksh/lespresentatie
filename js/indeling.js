// js/indeling.js
import { initPresetUI } from './seating-presets.js';

const modules = {
  h216:               () => import('./h216.js').then(m => m.h216Indeling),
  u008:               () => import('./u008.js').then(m => m.u008Indeling),
  groepjes:           () => import('./groepjes.js').then(m => m.groepjesIndeling),
  drietallen:         () => import('./drietallen.js').then(m => m.drietallenIndeling),
  vijftallen:         () => import('./vijftallen.js').then(m => m.vijftallenIndeling),
  presentatievolgorde:() => import('./presentatievolgorde.js').then(m => m.presentatievolgordeIndeling),
};

/* ---------- Helpers ---------- */

// Fisher-Yates shuffle: maakt standaardopstelling willekeurig
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Haalt de leerlingenlijst op uit de JSON voor een gegeven klas.
 * @param {string} klasnaam - Bijv. "G1D"
 * @returns {Promise<string[]>}
 */
async function laadLeerlingen(klasnaam = "G1D") {
  try {
    const res = await fetch("js/leerlingen_per_klas.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("Netwerkfout bij ophalen JSON");

    const data = await res.json();
    const lijst = data[klasnaam];
    if (!Array.isArray(lijst)) throw new Error(`Klas ${klasnaam} niet gevonden of onjuist formaat`);
    return lijst;
  } catch (err) {
    console.error("Fout bij laden leerlingen:", err);
    return [];
  }
}

/**
 * Laadt dynamisch de juiste indelingsfunctie en tekent de plattegrond.
 * Standaard: leerlingen worden willekeurig gezet.
 * Alleen bij het handmatig Laden van een preset (via applyArrangement) wordt niet gerandomized.
 * @param {"h216"|"u008"|"groepjes"|"vijftallen"|"presentatievolgorde"} type
 * @param {string} klasnaam
 */
export async function kiesIndeling(type = "h216", klasnaam = "G1D") {
  const leerlingen = await laadLeerlingen(klasnaam);

  // Maak standaardopstelling willekeurig
  const shuffled = shuffleInPlace([...leerlingen]);

  const moduleLader = modules[type] || modules.h216;

  try {
    const indeling = await moduleLader();
    if (typeof indeling !== "function") throw new Error("Module bevat geen exporteerbare functie");
    indeling(shuffled);
  } catch (err) {
    console.error(`Fout bij toepassen van indeling "${type}":`, err);
    const fallback = await modules.h216();
    fallback(shuffled);
  }
}

// Maak kiesIndeling ook beschikbaar voor init.js (dat zonder import werkt)
if (typeof window !== 'undefined') {
  window.kiesIndeling = kiesIndeling;
}

/* ---------- Presets: hooks ---------- */

/**
 * Leest de huidige opstelling uit de DOM (#plattegrond).
 * Geeft een object terug met type + seats of order.
 */
function getCurrentArrangement() {
  const typeSel = document.getElementById('indelingSelect');
  const type = typeSel?.value || 'h216';
  const klasSel = document.getElementById('klasSelect');
  const klasId = klasSel?.value || localStorage.getItem('lastClassId') || 'onbekend';

  if (type === 'presentatievolgorde') {
    const items = Array.from(document.querySelectorAll('#plattegrond .presentatie-item .naam'))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);
    return {
      type,
      klasId,
      savedAt: new Date().toISOString(),
      order: items,
      seats: []
    };
  }

  const seats = Array.from(document.querySelectorAll('#plattegrond .tafel')).map((el, i) => ({
    seatId: el.dataset.seatId ?? String(i),
    studentId: (el.textContent || '').trim()
  }));

  return {
    type,
    klasId,
    savedAt: new Date().toISOString(),
    seats,
    order: []
  };
}

function waitForRendered(type, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('indeling:rendered', onRendered);
      clearTimeout(timer);
      resolve();
    };

    const onRendered = (evt) => {
      const renderedType = evt?.detail?.type;
      if (!type || renderedType === type) finish();
    };

    const timer = setTimeout(finish, timeoutMs);
    window.addEventListener('indeling:rendered', onRendered);
  });
}

/**
 * Past een opgeslagen opstelling toe.
 * - Zet eerst het juiste type in de dropdown en triggert de bestaande change-flow (laadIndeling).
 * - Wacht op de re-render en projecteert daarna de opgeslagen inhoud.
 * - Voorkomt dat styling/klassen van de vorige indeling doorlekken.
 */
async function applyArrangement(payload) {
  const grid = document.getElementById('plattegrond');
  const typeSel = document.getElementById('indelingSelect');

  // Backward compat: legacy array -> objectvorm
  if (Array.isArray(payload)) {
    payload = { type: typeSel?.value || 'h216', seats: payload, order: [] };
  }
  const type = payload?.type || typeSel?.value || 'h216';

  // 1) Dropdown op juiste type zetten + change dispatchen,
  // zodat init.js -> laadIndeling() alle themastates/klassen goed reset.
  if (typeSel) {
    typeSel.value = type;
    typeSel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 2) Wacht expliciet op "render klaar" vanuit init.js
  await waitForRendered(type);

  // 3) Inhoud projecteren
  if (type === 'presentatievolgorde') {
    if (Array.isArray(payload.order) && payload.order.length) {
      grid.innerHTML = '';
      const ol = document.createElement('ol');
      ol.className = 'presentatie-lijst';
      payload.order.forEach((naam, idx) => {
        const li = document.createElement('li');
        li.className = 'presentatie-item';

        const nr = document.createElement('span');
        nr.className = 'nr';
        nr.textContent = idx + 1;

        const nm = document.createElement('span');
        nm.className = 'naam';
        nm.textContent = naam;

        li.appendChild(nr);
        li.appendChild(nm);
        ol.appendChild(li);
      });
      grid.appendChild(ol);
    }

    window.dispatchEvent(new CustomEvent('indeling:arrangement-applied', {
      detail: { type, timestamp: Date.now() }
    }));
    return;
  }

  // Tafels invullen (h216/u008/groepjes/vijftallen)
  const seatsEls = Array.from(document.querySelectorAll('#plattegrond .tafel'));
  const byIdx = new Map(seatsEls.map((el, i) => [i, el]));
  const byId = new Map(seatsEls.map((el, i) => [(el.dataset.seatId ?? `__idx_${i}`), el]));

  (payload.seats || []).forEach((item, i) => {
    const key = (item.seatId != null && byId.has(String(item.seatId)))
      ? String(item.seatId)
      : `__idx_${i}`;
    const el = byId.get(key) || byIdx.get(i);
    if (el) el.textContent = item.studentId || '';
  });

  window.dispatchEvent(new CustomEvent('indeling:arrangement-applied', {
    detail: { type, timestamp: Date.now() }
  }));
}

/* ---------- Presets: initialisatie ---------- */
(function initPresetsUI() {
  const klasSel = document.getElementById('klasSelect');
  const plattegrond = document.getElementById('plattegrond');
  if (!klasSel || !plattegrond) return;

  function getCurrentClassId() {
    const v = klasSel?.value?.trim();
    return v || localStorage.getItem('lastClassId') || 'onbekend';
  }

  const presetUI = initPresetUI({
    getCurrentClassId,
    getCurrentArrangement,
    applyArrangement
  });

  // bij klaswissel: lijst met presets verversen + laatst gebruikte onthouden
  klasSel.addEventListener('change', () => {
    if (klasSel.value) localStorage.setItem('lastClassId', klasSel.value);
    presetUI.refreshForClassChange();
  });

  // kickstart: extra refresh zodra de klaslijst is gevuld
  setTimeout(() => presetUI.refreshForClassChange(), 300);
})();
