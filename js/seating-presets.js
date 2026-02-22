const STORAGE_KEY = 'lespresentatie.presets.v2';
const STORAGE_BACKUP_KEY = 'lespresentatie.presets.v2.backup';
const VERSION = 2;

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function safeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isArrangementValid(arr) {
  if (!arr || typeof arr !== 'object') return false;

  if (typeof arr.domSnapshot === 'string' && arr.domSnapshot.trim().length > 0) return true;

  if (arr.type === 'presentatievolgorde') {
    return Array.isArray(arr.order) && arr.order.length > 0;
  }

  if (Array.isArray(arr.seats) && arr.seats.length > 0) {
    return arr.seats.every((x) => x && x.seatId != null && 'studentId' in x);
  }

  return false;
}

function downloadJSON(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

class PresetStore {
  constructor() {
    this.state = this.load();
  }

  blank() {
    return { version: VERSION, classes: {} };
  }

  normalize(state) {
    const out = state && typeof state === 'object' ? state : this.blank();
    if (!out.version) out.version = VERSION;
    if (!out.classes || typeof out.classes !== 'object') out.classes = {};
    return out;
  }

  load() {
    const main = safeGet(STORAGE_KEY, null);
    if (main && main.classes) return this.normalize(main);

    const backup = safeGet(STORAGE_BACKUP_KEY, null);
    if (backup && backup.classes) {
      const normalized = this.normalize(backup);
      this.saveState(normalized);
      return normalized;
    }

    return this.blank();
  }

  saveState(nextState = this.state) {
    this.state = this.normalize(nextState);
    const okMain = safeSet(STORAGE_KEY, this.state);
    const okBackup = safeSet(STORAGE_BACKUP_KEY, this.state);
    if (!okMain && !okBackup) {
      throw new Error('Opslaan in browseropslag is mislukt.');
    }
  }

  ensureClass(classId) {
    if (!this.state.classes[classId]) {
      this.state.classes[classId] = { selectedPreset: '', presets: {} };
    }
    if (!this.state.classes[classId].presets || typeof this.state.classes[classId].presets !== 'object') {
      this.state.classes[classId].presets = {};
    }
    return this.state.classes[classId];
  }

  list(classId) {
    const cls = this.state.classes[classId];
    if (!cls) return [];
    return Object.keys(cls.presets).sort((a, b) => a.localeCompare(b, 'nl'));
  }

  get(classId, name) {
    return this.state.classes?.[classId]?.presets?.[name] || null;
  }

  upsert(classId, name, arrangement) {
    const cls = this.ensureClass(classId);
    const now = new Date().toISOString();
    const existing = cls.presets[name];
    cls.presets[name] = {
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      arrangement: deepClone(arrangement)
    };
    cls.selectedPreset = name;
    this.saveState();
  }

  rename(classId, oldName, newName) {
    const cls = this.ensureClass(classId);
    if (!cls.presets[oldName]) return false;
    if (cls.presets[newName]) throw new Error('Naam bestaat al.');
    cls.presets[newName] = cls.presets[oldName];
    delete cls.presets[oldName];
    if (cls.selectedPreset === oldName) cls.selectedPreset = newName;
    this.saveState();
    return true;
  }

  remove(classId, name) {
    const cls = this.ensureClass(classId);
    if (!cls.presets[name]) return false;
    delete cls.presets[name];
    if (cls.selectedPreset === name) cls.selectedPreset = '';
    this.saveState();
    return true;
  }

  selected(classId) {
    return this.state.classes?.[classId]?.selectedPreset || '';
  }

  setSelected(classId, name) {
    const cls = this.ensureClass(classId);
    cls.selectedPreset = name || '';
    this.saveState();
  }

  exportClass(classId) {
    const cls = this.ensureClass(classId);
    return {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      classId,
      selectedPreset: cls.selectedPreset || '',
      presets: deepClone(cls.presets)
    };
  }

  importClass(classId, payload, { overwrite = false } = {}) {
    const source = payload?.presets;
    if (!source || typeof source !== 'object') {
      throw new Error('Importbestand bevat geen presets.');
    }

    const cls = this.ensureClass(classId);
    let imported = 0;
    let skippedExisting = 0;
    let skippedInvalid = 0;

    for (const [name, entry] of Object.entries(source)) {
      const arrangement = entry?.arrangement || entry;
      if (!isArrangementValid(arrangement)) {
        skippedInvalid++;
        continue;
      }

      if (!overwrite && cls.presets[name]) {
        skippedExisting++;
        continue;
      }

      const now = new Date().toISOString();
      cls.presets[name] = {
        createdAt: cls.presets[name]?.createdAt || entry?.createdAt || now,
        updatedAt: now,
        arrangement: deepClone(arrangement)
      };
      cls.selectedPreset = name;
      imported++;
    }

    this.saveState();
    return { imported, skippedExisting, skippedInvalid };
  }
}

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

  if (!$sel) return { refreshForClassChange: () => {} };

  let isApplying = false;

  function classId() {
    return (getCurrentClassId() || 'onbekend').trim() || 'onbekend';
  }

  function selectedOptionValue() {
    if (!$sel.options.length) return '';
    if ($sel.value) return $sel.value;
    return $sel.options[0].value;
  }

  function refill() {
    const currentClass = classId();
    const names = store.list(currentClass);
    const preferred = store.selected(currentClass);

    $sel.innerHTML = '';
    names.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      $sel.appendChild(opt);
    });

    if (!names.length) return;
    if (preferred && names.includes(preferred)) {
      $sel.value = preferred;
    } else {
      $sel.value = names[0];
      store.setSelected(currentClass, names[0]);
    }
  }

  async function loadNamed(name, { markAsSelected = true } = {}) {
    const currentClass = classId();
    const data = store.get(currentClass, name);
    if (!data) throw new Error('Preset niet gevonden.');
    if (!isArrangementValid(data.arrangement)) throw new Error('Presetdata is ongeldig.');

    isApplying = true;
    try {
      await applyArrangement(deepClone(data.arrangement));
      if (markAsSelected) store.setSelected(currentClass, name);
      $sel.value = name;
    } finally {
      isApplying = false;
    }
  }

  async function autoApplySelectedForClass() {
    const currentClass = classId();
    const name = store.selected(currentClass);
    if (!name || isApplying) return;
    try {
      await loadNamed(name, { markAsSelected: false });
    } catch (err) {
      console.warn('Auto-laden van preset mislukt:', err);
    }
  }

  $sel.addEventListener('change', () => {
    const v = selectedOptionValue();
    if (!v) return;
    store.setSelected(classId(), v);
  });

  $btnSave?.addEventListener('click', () => {
    const currentClass = classId();
    const name = prompt('Naam voor deze opstelling:');
    if (!name) return;

    const arrangement = getCurrentArrangement();
    if (!isArrangementValid(arrangement)) {
      alert('Deze opstelling kan niet worden opgeslagen.');
      return;
    }

    if (store.get(currentClass, name) && !confirm('Bestaat al. Overschrijven?')) return;

    store.upsert(currentClass, name, arrangement);
    refill();
    $sel.value = name;
  });

  $btnOverwrite?.addEventListener('click', () => {
    const currentClass = classId();
    const name = selectedOptionValue();
    if (!name) {
      alert('Geen preset geselecteerd.');
      return;
    }

    if (!confirm(`Preset "${name}" overschrijven met de huidige indeling?`)) return;

    const arrangement = getCurrentArrangement();
    if (!isArrangementValid(arrangement)) {
      alert('Deze opstelling kan niet worden opgeslagen.');
      return;
    }

    store.upsert(currentClass, name, arrangement);
    refill();
    $sel.value = name;
  });

  $btnLoad?.addEventListener('click', async () => {
    const name = selectedOptionValue();
    if (!name) {
      alert('Geen preset geselecteerd.');
      return;
    }

    try {
      await loadNamed(name);
    } catch (err) {
      console.error(err);
      alert(`Laden mislukt: ${err.message || err}`);
    }
  });

  $btnRename?.addEventListener('click', () => {
    const currentClass = classId();
    const current = selectedOptionValue();
    if (!current) {
      alert('Geen preset geselecteerd.');
      return;
    }

    const newName = prompt('Nieuwe naam:', current);
    if (!newName || newName === current) return;

    try {
      store.rename(currentClass, current, newName);
      refill();
      $sel.value = newName;
    } catch (err) {
      alert(`Hernoemen mislukt: ${err.message || err}`);
    }
  });

  $btnDelete?.addEventListener('click', () => {
    const currentClass = classId();
    const current = selectedOptionValue();
    if (!current) {
      alert('Geen preset geselecteerd.');
      return;
    }
    if (!confirm(`Preset "${current}" verwijderen?`)) return;

    store.remove(currentClass, current);
    refill();
  });

  $btnExport?.addEventListener('click', () => {
    const currentClass = classId();
    const payload = store.exportClass(currentClass);
    const filename = `opstellingen-${currentClass}.json`;
    downloadJSON(filename, payload);
  });

  $inpImport?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const overwrite = confirm('Bestaande presets met dezelfde naam overschrijven?');
      const result = store.importClass(classId(), parsed, { overwrite });
      refill();
      alert(`Import klaar: ${result.imported} toegevoegd, ${result.skippedExisting} overgeslagen, ${result.skippedInvalid} ongeldig.`);
    } catch (err) {
      alert(`Import mislukt: ${err.message || err}`);
    } finally {
      e.target.value = '';
    }
  });

  async function refreshForClassChange() {
    refill();
    await autoApplySelectedForClass();
  }

  refill();
  setTimeout(() => {
    autoApplySelectedForClass();
  }, 0);

  return { refreshForClassChange };
}
