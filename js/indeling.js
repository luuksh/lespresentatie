// js/indeling.js
import { initPresetUI } from './seating-presets.js';

const modules = {
  h216:       () => import('./h216.js').then(m => m.h216Indeling),
  u008:       () => import('./u008.js').then(m => m.u008Indeling),
  groepjes:   () => import('./groepjes.js').then(m => m.groepjesIndeling),
  vijftallen: () => import('./vijftallen.js').then(m => m.vijftallenIndeling),
};

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
    console.error("❌ Fout bij laden leerlingen:", err);
    return [];
  }
}

/**
 * Laadt dynamisch de juiste indelingsfunctie en tekent de plattegrond.
 * @param {"h216"|"u008"|"groepjes"|"vijftallen"} type
 * @param {string} klasnaam
 */
export async function kiesIndeling(type = "h216", klasnaam = "G1D") {
  const leerlingen = await laadLeerlingen(klasnaam);
  const moduleLader = modules[type] || modules.h216;

  try {
    const indeling = await moduleLader();
    if (typeof indeling !== "function") throw new Error("Module bevat geen exporteerbare functie");
    indeling(leerlingen);
  } catch (err) {
    console.error(`⚠️ Fout bij toepassen van indeling "${type}":`, err);
    const fallback = await modules.h216();
    fallback(leerlingen);
  }
}

// Maak kiesIndeling ook beschikbaar voor init.js (dat zonder import werkt)
if (typeof window !== 'undefined') {
  window.kiesIndeling = kiesIndeling;
}

/* ---------- Presets: hooks ---------- */

/**
 * Leest de huidige opstelling uit de DOM (#plattegrond .tafel).
 * - seatId: prefer data-seat-id; anders indexvolgorde als fallback.
 * - studentId: de (getrimde) tekst in het tafeltje.
 */
function getCurrentArrangement() {
  const seats = Array.from(document.querySelectorAll('#plattegrond .tafel'));
  return seats.map((el, i) => ({
    seatId: el.dataset.seatId ?? String(i),
    studentId: (el.textContent || '').trim()
  }));
}

/**
 * Past een opgeslagen opstelling toe.
 * Probeert eerst te matchen op data-seat-id; zo niet, valt terug op index.
 */
function applyArrangement(arr) {
  const seats = Array.from(document.querySelectorAll('#plattegrond .tafel'));

  // indexeer bestaande tafels zowel op id als op index
  const byIdx = new Map(seats.map((el, i) => [i, el]));
  const byId  = new Map(seats.map((el, i) => [(el.dataset.seatId ?? `__idx_${i}`), el]));

  arr.forEach((item, i) => {
    const key = (item.seatId != null && byId.has(String(item.seatId)))
      ? String(item.seatId)
      : `__idx_${i}`;
    const el = byId.get(key) || byIdx.get(i);
    if (el) el.textContent = item.studentId || '';
  });
}

/* ---------- Presets: initialisatie ---------- */

(function initPresetsUI() {
  // Alleen initialiseren als de controls bestaan in deze pagina
  const klasSel = document.getElementById('klasSelect');
  const plattegrond = document.getElementById('plattegrond');
  if (!klasSel || !plattegrond) return;

  const presetUI = initPresetUI({
    getCurrentClassId: () => klasSel.value || 'onbekend',
    getCurrentArrangement,
    applyArrangement
  });

  // bij klaswissel: lijst met presets verversen
  klasSel.addEventListener('change', () => presetUI.refreshForClassChange());
})();
