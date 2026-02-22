// seating-presets.js — v1.6 (load fix only)
// Presets via localStorage + export naar Word (.doc) met publieksvriendelijke opmaak

const STORAGE_KEY = 'lespresentatie.presets.v1';
const STORAGE_BACKUP_KEY = 'lespresentatie.presets.v1.backup';
const STORAGE_SESSION_KEY = 'lespresentatie.presets.v1.session';
const VERSION = 1;
let memoryPresetState = null;

function deepCloneJSON(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function emitPresetDiag(event, details = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('preset:diag', {
    detail: { event, at: new Date().toISOString(), ...details }
  }));
}

/**
 * localStorage schema
 * {
 *   version: 1,
 *   classes: {
 *     [classId]: {
 *       presets: {
 *         [presetName]: { createdAt, updatedAt, arrangement } // arrangement: {type, seats[]} | {type:'presentatievolgorde', order[]}
 *       },
 *       lastUsedPreset: ""
 *     }
 *   }
 * }
 */

class PresetStore {
  constructor(storageKey = STORAGE_KEY) {
    this.key = storageKey;
    this.backupKey = STORAGE_BACKUP_KEY;
    this.sessionKey = STORAGE_SESSION_KEY;
    this.state = this.#load();
  }
  #blank() { return { version: VERSION, classes: {} }; }
  #isValidState(obj) {
    return !!obj && typeof obj === 'object' && !!obj.classes && typeof obj.classes === 'object';
  }
  #normalizeState(obj) {
    const out = obj && typeof obj === 'object' ? obj : this.#blank();
    if (!out.version) out.version = VERSION;
    if (!out.classes || typeof out.classes !== 'object') out.classes = {};
    return out;
  }
  #parse(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!this.#isValidState(parsed)) return null;
      return this.#normalizeState(parsed);
    } catch {
      return null;
    }
  }
  #safeGet(storage, key) {
    try { return storage.getItem(key); } catch { return null; }
  }
  #safeSet(storage, key, value) {
    try { storage.setItem(key, value); return true; } catch { return false; }
  }
  #load() {
    const primary = this.#parse(this.#safeGet(localStorage, this.key));
    if (primary) {
      emitPresetDiag('load', { source: 'localStorage.primary' });
      return primary;
    }

    const backup = this.#parse(this.#safeGet(localStorage, this.backupKey));
    if (backup) {
      emitPresetDiag('load', { source: 'localStorage.backup' });
      return this.#repairAndReturn(backup);
    }

    const session = this.#parse(this.#safeGet(sessionStorage, this.sessionKey));
    if (session) {
      emitPresetDiag('load', { source: 'sessionStorage' });
      return this.#repairAndReturn(session);
    }

    if (memoryPresetState && this.#isValidState(memoryPresetState)) {
      emitPresetDiag('load', { source: 'memory' });
      return this.#repairAndReturn(this.#normalizeState(deepCloneJSON(memoryPresetState)));
    }

    emitPresetDiag('load', { source: 'blank' });
    return this.#blank();
  }
  #repairAndReturn(state) {
    const normalized = this.#normalizeState(state);
    const payload = JSON.stringify(normalized);
    this.#safeSet(localStorage, this.key, payload);
    this.#safeSet(localStorage, this.backupKey, payload);
    this.#safeSet(sessionStorage, this.sessionKey, payload);
    memoryPresetState = normalized;
    return normalized;
  }
  #save() {
    const payload = JSON.stringify(this.state);
    const wrotePrimary = this.#safeSet(localStorage, this.key, payload);
    const wroteBackup = this.#safeSet(localStorage, this.backupKey, payload);
    const wroteSession = this.#safeSet(sessionStorage, this.sessionKey, payload);
    memoryPresetState = this.#normalizeState(deepCloneJSON(this.state));
    emitPresetDiag('save', {
      primary: wrotePrimary,
      backup: wroteBackup,
      session: wroteSession,
      classes: Object.keys(this.state.classes || {}).length
    });
    if (!wrotePrimary) {
      console.warn('PresetStore: localStorage write blocked, using fallback stores.');
      emitPresetDiag('warning', { message: 'localStorage primary write blocked' });
    }
  }

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
  lastUsed(classId) { return this.state.classes?.[classId]?.lastUsedPreset || ''; }

  // ✅ Nieuw: expliciet laatst gebruikte preset zetten
  setLastUsed(classId, name) {
    if (!this.state.classes[classId]) {
      this.state.classes[classId] = { presets: {}, lastUsedPreset: "" };
    }
    this.state.classes[classId].lastUsedPreset = name || "";
    this.#save();
  }

  // ✅ Nieuw: importeer presets voor een klas vanuit JSON
  importClass(classId, jsonText, { overwrite = false } = {}) {
    const parsed = JSON.parse(jsonText);
    const source = parsed?.presets ?? parsed?.classes?.[classId]?.presets;

    if (!source || typeof source !== "object") {
      throw new Error("Geen presets gevonden in importbestand.");
    }

    if (!this.state.classes[classId]) {
      this.state.classes[classId] = { presets: {}, lastUsedPreset: "" };
    }

    const cls = this.state.classes[classId];
    const now = new Date().toISOString();
    let imported = 0;
    let skippedExisting = 0;
    let skippedInvalid = 0;

    for (const [name, value] of Object.entries(source)) {
      const arrangement = value?.arrangement ?? value;

      if (!isArrangementValid(arrangement)) {
        skippedInvalid++;
        continue;
      }

      if (!overwrite && cls.presets[name]) {
        skippedExisting++;
        continue;
      }

      cls.presets[name] = {
        createdAt: cls.presets[name]?.createdAt || value?.createdAt || now,
        updatedAt: now,
        arrangement
      };

      cls.lastUsedPreset = name;
      imported++;
    }

    this.#save();
    return { imported, skippedExisting, skippedInvalid };
  }
}

/* ===== Validatie & helpers ===== */
function isArrangementValid(arr) {
  if (!arr) return false;

  if (typeof arr === 'object' && !Array.isArray(arr)) {
    if (arr.type === 'presentatievolgorde') return Array.isArray(arr.order);
    if (Array.isArray(arr.seats)) return arr.seats.every(x => x && (x.seatId != null) && ('studentId' in x));
    return false;
  }
  if (Array.isArray(arr)) return arr.every(x => x && (x.seatId != null) && ('studentId' in x));
  return false;
}
function sanitizeFilename(s) { return String(s).replace(/[^a-z0-9-_]+/gi,'_'); }
function escapeHTML(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function nlDateTime(ts=new Date()){
  return new Intl.DateTimeFormat('nl-NL',{
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
  }).format(ts);
}

/* ===== Groepen opbouwen uit seats =====
   1) Prefix in seatId -> groepeer daarop (groep3, g_2, G1-1, A-1, etc.)
   2) Anders chunken op basis van type: viertallen=4, vijftallen=5, anders 4
*/
function buildGroupsFromSeats(arrangement) {
  const seats = Array.isArray(arrangement?.seats) ? arrangement.seats
              : Array.isArray(arrangement) ? arrangement
              : [];

  const type = arrangement?.type || '';
  const defaultSize = (type === 'vijftallen') ? 5 : 4;

  const byKey = new Map();
  let hasKey = false;
  for (const s of seats) {
    const id = String(s?.seatId ?? '');
    let key = null;
    const m1 = id.match(/^(groep|group|grp|g)[\s\-_]?(\d+)/i);
    if (m1) { key = `G${m1[2]}`; }
    else {
      const m2 = id.match(/^([A-Za-z]+)\W/);
      if (m2) key = m2[1].toUpperCase();
    }
    if (key) {
      hasKey = true;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(s);
    }
  }
  if (hasKey && byKey.size > 0) {
    const out = [];
    const keys = Array.from(byKey.keys()).sort((a,b)=>{
      const na = parseInt(a.replace(/\D+/g,''),10);
      const nb = parseInt(b.replace(/\D+/g,''),10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b,'nl');
    });
    let n=1;
    for (const k of keys) {
      const members = byKey.get(k).map(x => x?.studentId || '').filter(Boolean);
      out.push({ id: String(n++), members });
    }
    return out;
  }

  // chunk volgorde
  const groups = [];
  let bucket = [];
  let n = 1;
  for (const s of seats) {
    if (bucket.length === 0) groups.push({ id: String(n++), members: bucket });
    bucket.push(s?.studentId || '');
    if (bucket.length >= defaultSize) bucket = [];
  }
  return groups;
}

/* ===== Word-export (HTML voor Word) ===== */
function renderArrangementAsWordHTML(classId, presetName, arrangement) {
  const safeClass = escapeHTML(classId || 'Onbekend');
  const safeName  = escapeHTML(presetName || 'Opstelling');
  const safeWhen  = escapeHTML(nlDateTime());
  const type = arrangement?.type || '';

  const styles = `
    <style>
      @page { margin: 2cm; }
      body { font-family: "Segoe UI", Arial, sans-serif; color:#111; }
      h1 { font-size:22pt; margin:0 0 6pt 0; }
      .meta { color:#555; font-size:10pt; margin:0 0 14pt 0; }
      .groups { display: table; width:100%; border-collapse:separate; border-spacing:9pt; }
      .group { display: table-cell; width: 33%; vertical-align: top; background:#fff; border:1pt solid #ddd; padding:8pt; border-radius:8pt; }
      .group h2 { font-size:12pt; margin:0 0 6pt 0; }
      .label { color:#555; font-size:9pt; margin:8pt 0 2pt 0; }
      .field { min-height:12pt; padding:6pt; border:1pt dashed #bbb; border-radius:6pt; }
      .members { margin:6pt 0 0 0; padding:0; }
      .members p { margin:0 0 4pt 0; padding:6pt; border:1pt solid #eee; border-radius:6pt; }
      .threecol-break { page-break-inside: avoid; }
      /* Presentatievolgorde */
      .list3 { column-count: 3; column-gap: 18pt; list-style: none; padding:0; margin:0; }
      .list3 li { break-inside: avoid; border:1pt solid #eee; padding:6pt; border-radius:6pt; margin:0 0 6pt 0; }
      .nr { font-weight:700; display:inline-block; min-width:16pt; }
      /* Zorg dat "cells" onder elkaar vallen bij smalle weergave (fallback) */
      @media screen and (max-width:900px) {
        .group { display:block; width:100%; margin-bottom:10pt; }
      }
    </style>
  `;

  let body = '';

  if (arrangement?.type === 'presentatievolgorde') {
    const items = (arrangement.order || []).filter(Boolean);
    const lis = items.map((naam, i)=>`<li><span class="nr">${i+1}.</span> ${escapeHTML(naam)}</li>`).join('');
    body = `
      <h1>Presentatievolgorde — ${safeClass} ${safeName}</h1>
      <p class="meta">${safeWhen}</p>
      <ol class="list3">${lis}</ol>
    `;
  } else {
    const groups = buildGroupsFromSeats(arrangement);
    const cards = groups.map((g, idx) => {
      const members = (g.members || []).filter(Boolean)
        .map(n => `<p>${escapeHTML(n)}</p>`).join('');
      return `
        <div class="group threecol-break">
          <h2>Groep ${escapeHTML(String(g.id || idx+1))}</h2>
          <div class="label">Thema / Rollen:</div>
          <div class="field"></div>
          <div class="label">Leden:</div>
          <div class="members">${members || '<p>&nbsp;</p>'}</div>
          <div class="label">Notities:</div>
          <div class="field"></div>
        </div>
      `;
    }).join('');

    const typeLabel = type ? ` — <em>${escapeHTML(type)}</em>` : '';
    body = `
      <h1>Indeling — ${safeClass} ${safeName}${typeLabel}</h1>
      <p class="meta">${safeWhen}</p>
      <div class="groups">${cards}</div>
    `;
  }

  // Word-compatible HTML (mso headers)
  return `
    <!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]><xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml><![endif]-->
        ${styles}
        <title>Indeling ${safeClass} ${safeName}</title>
      </head>
      <body>
        ${body}
      </body>
    </html>
  `;
}

/* Download helper: sla Word-HTML als .doc */
function downloadDOC(filename, htmlText){
  const blob = new Blob([htmlText], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.doc') ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Exporteer preset als .doc met bestandsnaam: Indeling [klas] [preset].doc */
function exportPresetAsDOC(classId, presetName, arrangement){
  const html = renderArrangementAsWordHTML(classId, presetName, arrangement);
  const fname = `Indeling ${sanitizeFilename(classId)} ${sanitizeFilename(presetName)}.doc`;
  downloadDOC(fname, html);
}

/* ===== UI wiring ===== */
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
  let autoLoading = false;

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

  // ✅ nieuwe ensureSelection(): valt terug op lastUsedPreset als niks expliciet is gekozen
  function ensureSelection() {
    if (!$sel || $sel.options.length === 0) return '';
    if ($sel.value) return $sel.value;

    const classId = getCurrentClassId();
    const last = store.lastUsed(classId);
    if (last) {
      for (const opt of $sel.options) {
        if (opt.value === last) {
          $sel.value = last;
          return last;
        }
      }
    }
    return $sel.options[0].value;
  }

  function isArrangementLoadable(arr) {
    return !!(
      arr &&
      (
        (arr.type === 'presentatievolgorde' && Array.isArray(arr.order) && arr.order.length > 0) ||
        (Array.isArray(arr.seats) && arr.seats.length > 0 && arr.seats.every(x => x && ('studentId' in x)))
      )
    );
  }

  async function applyLastUsedPreset(classId) {
    if (autoLoading) return false;
    const last = store.lastUsed(classId);
    if (!last) return false;
    const data = store.get(classId, last);
    if (!data || !isArrangementLoadable(data.arrangement)) return false;

    autoLoading = true;
    try {
      await applyArrangement(deepCloneJSON(data.arrangement));
      if ($sel) $sel.value = last;
      emitPresetDiag('auto-load', { classId, name: last, ok: true });
      return true;
    } catch (e) {
      emitPresetDiag('auto-load', { classId, name: last, ok: false, error: String(e?.message || e) });
      return false;
    } finally {
      autoLoading = false;
    }
  }

  // Opslaan als… => opslaan + DIRECT Word-export (ongewijzigd)
  $btnSave?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const name = prompt('Naam voor deze opstelling:');
    if (!name) return;

    const arrangement = getCurrentArrangement();
    if (!isArrangementValid(arrangement)) { alert('Ongeldige opstelling.'); return; }

    if (store.get(classId, name)) {
      const ok = confirm('Bestaat al. Overschrijven?');
      if (!ok) return;
    }

    store.upsert(classId, name, arrangement);
    emitPresetDiag('ui-save', { classId, name });
    refill();

    try { exportPresetAsDOC(classId, name, arrangement); }
    catch (e) { console.warn('Export na opslaan mislukt:', e); alert('Opgeslagen, maar exporteren mislukte.'); }
  });

  // Overschrijven => opslaan + DIRECT Word-export (ongewijzigd)
  $btnOverwrite?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }

    const ok = confirm(`Opstelling "${current}" overschrijven met de huidige indeling?`);
    if (!ok) return;

    const arrangement = getCurrentArrangement();
    if (!isArrangementValid(arrangement)) { alert('Ongeldige opstelling.'); return; }

    store.upsert(classId, current, arrangement);
    emitPresetDiag('ui-overwrite', { classId, name: current });
    refill();

    try { exportPresetAsDOC(classId, current, arrangement); }
    catch (e) { console.warn('Export na overschrijven mislukt:', e); alert('Overschreven, maar exporteren mislukte.'); }
  });

  // ✅ Laden — stabiel, met validatie + onthoud "laatst gebruikt"
  $btnLoad?.addEventListener('click', async () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }

    const data = store.get(classId, current);
    if (!data) {
      console.warn('Preset niet gevonden:', { classId, current, known: store.list(classId) });
      alert('Preset niet gevonden. Controleer of je de juiste klas hebt gekozen.');
      return;
    }

    // Hardere validatie om random fallback te voorkomen
    const arr = data.arrangement;
    const valid = isArrangementLoadable(arr);

    if (!valid) {
      console.warn('Ongeldige/lege arrangement-data bij laden:', arr);
      alert('Deze preset lijkt leeg of ongeldig (geen leerlingen/stoelen).');
      return;
    }

    // Pas toe (met diepe kopie) en onthoud als laatst gebruikt
    try {
      await applyArrangement(deepCloneJSON(arr));
      store.setLastUsed(classId, current);
      emitPresetDiag('ui-load', { classId, name: current, ok: true });
    } catch (e) {
      console.warn('Preset laden faalde:', e);
      emitPresetDiag('ui-load', { classId, name: current, ok: false, error: String(e?.message || e) });
      alert('Laden van preset is mislukt. Probeer opnieuw.');
    }
  });

  // Hernoemen (ongewijzigd)
  $btnRename?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }
    const newName = prompt('Nieuwe naam voor deze opstelling:', current);
    if (!newName || newName === current) return;
    try { store.rename(classId, current, newName); refill(); }
    catch(e){ alert('Hernoemen mislukt: ' + e.message); }
  });

  // Verwijderen (ongewijzigd)
  $btnDelete?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }
    const ok = confirm(`Preset "${current}" verwijderen? Dit kan niet ongedaan worden gemaakt.`);
    if (!ok) return;
    store.remove(classId, current);
    refill();
  });

  // Export-knop => exporteer GESELECTEERDE preset als .doc (ongewijzigd)
  $btnExport?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    const current = ensureSelection();
    if (!current) { alert('Geen preset geselecteerd.'); return; }
    const data = store.get(classId, current);
    if (!data) { alert('Preset niet gevonden.'); return; }
    try { exportPresetAsDOC(classId, current, data.arrangement); }
    catch (e) { console.warn('Export mislukt:', e); alert('Export mislukt.'); }
  });

  // Import (ongewijzigd; JSON voor beheer)
  $inpImport?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const overwrite = confirm('Bestaande presets met dezelfde naam overschrijven?');
    try {
      const parsed = JSON.parse(text);
      const storeLocal = new PresetStore();
      const result = parsed && parsed.presets
        ? storeLocal.importClass(getCurrentClassId(), JSON.stringify({ presets: parsed.presets }), { overwrite })
        : storeLocal.importClass(getCurrentClassId(), text, { overwrite });

      refill();
      alert(`Import voltooid: ${result.imported} toegevoegd, ${result.skippedExisting} overgeslagen (bestaat al), ${result.skippedInvalid} ongeldig.`);
    } catch(err) {
      alert('Import mislukt: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  async function refreshForClassChange() {
    refill();
    await applyLastUsedPreset(getCurrentClassId());
  }
  refill();
  setTimeout(() => { applyLastUsedPreset(getCurrentClassId()); }, 0);
  return { refreshForClassChange };
}
