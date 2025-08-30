// seating-presets.js — v1.3
// Drop-in opslag & beheer van klassenopstellingen via localStorage + export/import
// Wijziging v1.3: export genereert een printklare HTML-presentatie i.p.v. JSON.

const STORAGE_KEY = 'lespresentatie.presets.v1';
const VERSION = 1;

/**
 * Data model in localStorage
 * {
 *   version: 1,
 *   classes: {
 *     [classId]: {
 *       presets: {
 *         [presetName]: { createdAt, updatedAt, arrangement }
 *       },
 *       lastUsedPreset: ""
 *     }
 *   }
 * }
 */

class PresetStore {
  constructor(storageKey = STORAGE_KEY) {
    this.key = storageKey;
    this.state = this.#load();
  }
  #blank() { return { version: VERSION, classes: {} }; }
  #load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return this.#blank();
      const parsed = JSON.parse(raw);
      if (!parsed.version) parsed.version = 1;
      if (!parsed.classes) parsed.classes = {};
      return parsed;
    } catch (e) {
      console.warn('PresetStore load error, resetting', e);
      return this.#blank();
    }
  }
  #save() { localStorage.setItem(this.key, JSON.stringify(this.state)); }

  list(classId) {
    const cls = this.state.classes[classId];
    if (!cls) return [];
    return Object.keys(cls.presets || {}).sort((a,b)=>a.localeCompare(b,'nl'));
  }
  get(classId, name) {
    return this.state.classes?.[classId]?.presets?.[name] || null;
  }
  upsert(classId, name, arrangement) {
    if (!this.state.classes[classId]) this.state.classes[classId] = { presets:{}, lastUsedPreset:"" };
    const now = new Date().toISOString();
    const existed = !!this.state.classes[classId].presets[name];
    this.state.classes[classId].presets[name] = {
      createdAt: existed ? this.state.classes[classId].presets[name].createdAt : now,
      updatedAt: now,
      arrangement
    };
    this.state.classes[classId].lastUsedPreset = name;
    this.#save();
  }
  rename(classId, oldName, newName) {
    const cls = this.state.classes[classId];
    if (!cls || !cls.presets[oldName]) return false;
    if (cls.presets[newName]) throw new Error('Bestaat al');
    cls.presets[newName] = cls.presets[oldName];
    delete cls.presets[oldName];
    if (cls.lastUsedPreset === oldName) cls.lastUsedPreset = newName;
    this.#save();
    return true;
  }
  remove(classId, name) {
    const cls = this.state.classes[classId];
    if (!cls || !cls.presets[name]) return false;
    delete cls.presets[name];
    if (cls.lastUsedPreset === name) cls.lastUsedPreset = "";
    this.#save();
    return true;
  }
  lastUsed(classId) {
    return this.state.classes?.[classId]?.lastUsedPreset || '';
  }
}

// ===== Validatie & utils =====
function isArrangementValid(arr) {
  if (!arr) return false;

  // Nieuw objectmodel (vanaf jouw recente versies)
  if (typeof arr === 'object' && !Array.isArray(arr)) {
    if (arr.type === 'presentatievolgorde') {
      return Array.isArray(arr.order);
    }
    if (Array.isArray(arr.seats)) {
      return arr.seats.every(x => x && (x.seatId != null) && ('studentId' in x));
    }
    return false;
  }

  // Legacy array
  if (Array.isArray(arr)) {
    return arr.every(x => x && (x.seatId != null) && ('studentId' in x));
  }

  return false;
}

function sanitizeFilename(s) {
  return String(s).replace(/[^a-z0-9-_]+/gi,'_');
}
function escapeHTML(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function nlDateTime(ts=new Date()){
  return new Intl.DateTimeFormat('nl-NL',{
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  }).format(ts);
}

/**
 * Render een arrangement als nette, zelfstandige HTML (voor publiek/print).
 * - presentatievolgorde: 3 kolommen, genummerd
 * - overige types: tabelachtig overzicht Stoel → Leerling
 */
function renderArrangementAsHTML(classId, presetName, arrangement){
  const safeClass = escapeHTML(classId || 'Onbekend');
  const safeName  = escapeHTML(presetName || 'Opstelling');
  const safeWhen  = escapeHTML(nlDateTime());

  const baseCSS = `
    :root {
      --c1:#111827; --c2:#374151; --c3:#6B7280;
      --brand:#007bff; --paper:#ffffff; --bg:#f5f7fb;
      --chip:#eef2ff;
    }
    *{ box-sizing:border-box; }
    html, body { margin:0; padding:0; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      color: var(--c1); background: var(--bg);
    }
    .page {
      max-width: 1120px; margin: 24px auto; padding: 24px;
      background: var(--paper); border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.06);
    }
    .title {
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      border-bottom: 2px solid #eef0f5; padding-bottom: 12px; margin-bottom: 18px;
    }
    .title h1 { margin:0; font-size: 24px; line-height:1.2; }
    .meta { color: var(--c3); font-size: 14px; }
    .chip { background: var(--chip); color:#1f2a44; padding:4px 10px; border-radius:999px; font-weight:700; font-size:12px; }

    .note {
      background:#f9fafb; border:1px solid #eef0f5; border-radius:12px;
      padding:10px 12px; color:#374151; margin-bottom: 14px;
    }

    /* 3-koloms lijst voor presentatievolgorde */
    .lijst3 {
      list-style: none; padding:0; margin: 8px 0 0 0;
      columns: 3; column-gap: 24px;
    }
    .lijst3 li {
      break-inside: avoid;
      display: flex; align-items: center; gap:10px;
      background:#fff; border:1px solid #eef0f5; border-radius:10px;
      padding:8px 10px; margin:0 0 8px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,.03);
      font-size: 15px;
    }
    .lijst3 .nr {
      width:26px; height:26px; border-radius:50%;
      background: var(--brand); color:#fff; font-weight:800;
      display:grid; place-items:center; font-size: 13px;
    }

    /* Stoel → leerling tabelachtig */
    .table {
      width:100%; border-collapse: separate; border-spacing: 0 8px; margin-top: 8px;
    }
    .table th {
      text-align:left; color:var(--c2); font-size:12px; text-transform:uppercase; letter-spacing:.06em;
      padding: 6px 10px;
    }
    .table td {
      background:#fff; border:1px solid #eef0f5;
      padding:10px 12px; font-size:15px;
    }
    .table tr td:first-child { border-radius:10px 0 0 10px; width:120px; color:#1f2a44; font-weight:700; }
    .table tr td:last-child  { border-radius:0 10px 10px 0; }

    @media print {
      body { background:#fff; }
      .page { box-shadow:none; margin:0; border-radius:0; max-width:none; }
    }
  `;

  function renderPresentatieVolgorde(order){
    const items = (order || []).filter(Boolean);
    const lis = items.map((naam, i) => `
      <li><span class="nr">${i+1}</span><span>${escapeHTML(naam)}</span></li>
    `).join('');
    return `
      <div class="note">Presentatievolgorde — klas <strong>${safeClass}</strong></div>
      <ol class="lijst3">${lis}</ol>
    `;
  }

  function renderSeats(seats){
    const rows = (seats || []).map((s, i) => {
      const stoelnr = s?.seatId ?? i+1;
      const naam = s?.studentId ? escapeHTML(s.studentId) : '';
      return `<tr><td>Stoel ${escapeHTML(String(stoelnr))}</td><td>${naam}</td></tr>`;
    }).join('');
    return `
      <div class="note">Zitplaatsen — klas <strong>${safeClass}</strong></div>
      <table class="table">
        <thead><tr><th>Stoel</th><th>Leerling</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  let body = '';
  if (arrangement?.type === 'presentatievolgorde') {
    body = renderPresentatieVolgorde(arrangement.order || []);
  } else if (Array.isArray(arrangement?.seats)) {
    body = renderSeats(arrangement.seats);
  } else if (Array.isArray(arrangement)) { // legacy array
    body = renderSeats(arrangement);
  } else {
    body = `<div class="note">Onbekend formaat opstelling.</div>`;
  }

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Indeling ${safeClass} ${safeName}</title>
<style>${baseCSS}</style>
</head>
<body>
  <div class="page">
    <div class="title">
      <h1>Indeling <span class="chip">${safeClass}</span> ${safeName}</h1>
      <div class="meta">${safeWhen}</div>
    </div>
    ${body}
  </div>
</body>
</html>`;
}

/** Download helper — sla HTML-string als .html bestand op. */
function downloadHTML(filename, htmlText){
  const blob = new Blob([htmlText], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Exporteer één preset als HTML met bestandsnaam: Indeling [klas] [preset].html */
function exportPresetAsHTML(classId, presetName, arrangement){
  const html = renderArrangementAsHTML(classId, presetName, arrangement);
  const fname = `Indeling ${sanitizeFilename(classId)} ${sanitizeFilename(presetName)}.html`;
  downloadHTML(fname, html);
}

// ===== UI wiring =====
export function initPresetUI({ getCurrentClassId, getCurrentArrangement, applyArrangement }) {
  const store = new PresetStore();
  const $sel = document.getElementById('presetSelect');
  const $btnLoad = document.getElementById('btnPresetLoad');
  const $btnSave = document.getElementById('btnPresetSave');
  const $btnOverwrite = document.getElementById('btnPresetOverwrite');
  const $btnRename = document.getElementById('btnPresetRename');
  const $btnDelete = document.getElementById('btnPresetDelete');
  const $btnExport = document.getElementById('btnPresetExport');
  const $inpImport = document.getElementById('presetImport');

  function refill() {
    const classId = getCurrentClassId();
    const names = store.list(classId);
    const last = store.lastUsed(classId);
    if (!$sel) return;
    $sel.innerHTML = '';
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      if (name === last) opt.selected = true;
      $sel.appendChild(opt);
    }
  }
  function ensureSelection() {
    if (!$sel || $sel.options.length === 0) return '';
    return $sel.value || $sel.options[0].value;
  }

  // "Opslaan als…" => opslaan + DIRECT exporteren (mooie HTML)
  $btnSave?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const name = prompt('Naam voor deze opstelling:');
    if (!name) return;

    const arrangement = getCurrentArrangement();
    if (!isArrangementValid(arrangement)) {
      alert('Ongeldige opstelling.');
      return;
    }

    if (store.get(classId, name)) {
      const ok = confirm('Bestaat al. Overschrijven?');
      if (!ok) return;
    }

    // 1) Opslaan
    store.upsert(classId, name, arrangement);
    refill();

    // 2) HTML exporteren van deze preset
    try {
      exportPresetAsHTML(classId, name, arrangement);
    } catch (e) {
      console.warn('Export na opslaan mislukt:', e);
      alert('Opgeslagen, maar exporteren mislukte.');
    }
  });

  // "Overschrijven" => opslaan + DIRECT exporteren (mooie HTML)
  $btnOverwrite?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }

    const ok = confirm(`Opstelling "${current}" overschrijven met de huidige indeling?`);
    if (!ok) return;

    const arrangement = getCurrentArrangement();
    if (!isArrangementValid(arrangement)) {
      alert('Ongeldige opstelling.');
      return;
    }

    store.upsert(classId, current, arrangement);
    refill();

    try {
      exportPresetAsHTML(classId, current, arrangement);
    } catch (e) {
      console.warn('Export na overschrijven mislukt:', e);
      alert('Overschreven, maar exporteren mislukte.');
    }
  });

  $btnLoad?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }
    const data = store.get(classId, current);
    if (!data) { alert('Preset niet gevonden.'); return; }
    applyArrangement(structuredClone(data.arrangement));
  });

  $btnRename?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }
    const newName = prompt('Nieuwe naam voor deze opstelling:', current);
    if (!newName || newName === current) return;
    try { store.rename(classId, current, newName); refill(); }
    catch(e){ alert('Hernoemen mislukt: ' + e.message); }
  });

  $btnDelete?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }
    const ok = confirm(`Preset "${current}" verwijderen? Dit kan niet ongedaan worden gemaakt.`);
    if (!ok) return;
    store.remove(classId, current);
    refill();
  });

  // Losse Export-knop: exporteert de GESELECTEERDE preset als HTML met dezelfde bestandsnaamstructuur
  $btnExport?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }
    const data = store.get(classId, current);
    if (!data) { alert('Preset niet gevonden.'); return; }
    try {
      exportPresetAsHTML(classId, current, data.arrangement);
    } catch (e) {
      console.warn('Export mislukt:', e);
      alert('Export mislukt.');
    }
  });

  $inpImport?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const overwrite = confirm('Bestaande presets met dezelfde naam overschrijven?');
    try {
      // Import-format blijft JSON (intern), dat is prima voor beheer; we renderen bij export.
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('Ongeldig bestand.');
      // Ondersteun zowel "volledige klas export" als "één preset"
      if (data.presets && data.classId) {
        // klas-export
        const classId = getCurrentClassId();
        const dest = new PresetStore().state; // gewoon valideren
        // Reuse simpele import: map alle presets in dit bestand naar huidige classId
        const tmp = { presets: data.presets };
        const jsonText = JSON.stringify(tmp);
        const storeLocal = new PresetStore(); // reuse API
        storeLocal.importClass(classId, jsonText, { overwrite });
      } else if (data.arrangement && data.name) {
        // enkelvoudige preset-export (mocht je die ooit gebruiken)
        const classId = getCurrentClassId();
        const storeLocal = new PresetStore();
        if (!overwrite && storeLocal.get(classId, data.name)) {
          // sla desnoods over
        }
        storeLocal.upsert(classId, data.name, data.arrangement);
      } else {
        // fallback naar jouw bestaande importer
        const storeLocal = new PresetStore();
        storeLocal.importClass(getCurrentClassId(), text, { overwrite });
      }
      refill();
      alert('Import voltooid.');
    } catch(err) {
      alert('Import mislukt: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  function refreshForClassChange() { refill(); }
  refill();
  return { refreshForClassChange };
}
