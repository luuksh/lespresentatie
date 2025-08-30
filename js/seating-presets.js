// seating-presets.js — v1.1
// Drop-in opslag & beheer van klassenopstellingen via localStorage + export/import

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
  exportClass(classId) {
    const cls = this.state.classes[classId] || { presets:{}, lastUsedPreset:"" };
    return JSON.stringify({
      exportVersion: VERSION,
      classId,
      exportedAt: new Date().toISOString(),
      presets: cls.presets
    }, null, 2);
  }
  importClass(classId, jsonText, { overwrite=false } = {}) {
    const data = JSON.parse(jsonText);
    if (typeof data !== 'object' || !data.presets) throw new Error('Ongeldige import');
    if (!this.state.classes[classId]) this.state.classes[classId] = { presets:{}, lastUsedPreset:"" };
    const dest = this.state.classes[classId].presets;
    for (const [name, payload] of Object.entries(data.presets)) {
      if (!overwrite && dest[name]) continue;
      dest[name] = payload;
    }
    this.#save();
  }
}

// ===== Validatie & utils =====
function isArrangementValid(arr) {
  if (!arr) return false;

  // Nieuw objectmodel
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

function triggerExportAllForClass(store, classId, nameForFilename = '') {
  const json = store.exportClass(classId); // volledige set voor deze klas
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const extra = nameForFilename ? `-${sanitizeFilename(nameForFilename)}` : '';
  a.href = url;
  a.download = `opstellingen-${sanitizeFilename(classId)}${extra}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

  // "Opslaan als…" => opslaan + DIRECT exporteren
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

    // 2) Direct exporteren (hele klas, bestandsnaam met presetnaam)
    try {
      triggerExportAllForClass(store, classId, name);
    } catch (e) {
      console.warn('Export na opslaan mislukt:', e);
      alert('Opgeslagen, maar exporteren mislukte.');
    }
  });

  // "Overschrijven" => opslaan + DIRECT exporteren
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

    // 1) Overschrijven
    store.upsert(classId, current, arrangement);
    refill();

    // 2) Direct exporteren (hele klas, bestandsnaam met presetnaam)
    try {
      triggerExportAllForClass(store, classId, current);
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

  // Handmatige export-knop blijft bestaan (exporteert hele klas)
  $btnExport?.addEventListener('click', () => {
    const classId = getCurrentClassId();
    try {
      triggerExportAllForClass(store, classId, '');
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
      store.importClass(getCurrentClassId(), text, { overwrite });
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
