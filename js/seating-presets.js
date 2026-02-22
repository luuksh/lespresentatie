const DB_NAME = 'lespresentatie';
const DB_VERSION = 1;
const PRESET_STORE = 'presets';
const META_STORE = 'preset_meta';

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
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

class IndexedPresetStore {
  constructor() {
    this.dbPromise = this.open();
  }

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(PRESET_STORE)) {
          const presetStore = db.createObjectStore(PRESET_STORE, { keyPath: ['classId', 'name'] });
          presetStore.createIndex('by_class', 'classId', { unique: false });
        }

        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'classId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Kan presetdatabase niet openen.'));
    });
  }

  async tx(storeName, mode, run) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let out;

      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error || new Error('Database-transactie mislukt.'));
      tx.onabort = () => reject(tx.error || new Error('Database-transactie afgebroken.'));

      try {
        out = run(store, tx);
      } catch (err) {
        tx.abort();
        reject(err);
      }
    });
  }

  reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Database-aanvraag mislukt.'));
    });
  }

  async list(classId) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PRESET_STORE, 'readonly');
      const store = tx.objectStore(PRESET_STORE);
      const idx = store.index('by_class');
      const req = idx.getAll(IDBKeyRange.only(classId));

      req.onsuccess = () => {
        const names = (req.result || [])
          .map((row) => row.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'nl'));
        resolve(names);
      };
      req.onerror = () => reject(req.error || new Error('Ophalen presets mislukt.'));
    });
  }

  async get(classId, name) {
    return this.tx(PRESET_STORE, 'readonly', (store) => {
      const req = store.get([classId, name]);
      req.onsuccess = () => {};
      req.onerror = () => {};
      return this.reqToPromise(req);
    });
  }

  async upsert(classId, name, arrangement) {
    if (!isArrangementValid(arrangement)) throw new Error('Deze opstelling kan niet worden opgeslagen.');

    const existing = await this.get(classId, name);
    const now = new Date().toISOString();
    const record = {
      classId,
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      arrangement: deepClone(arrangement)
    };

    await this.tx(PRESET_STORE, 'readwrite', (store) => {
      store.put(record);
    });

    await this.setSelected(classId, name);
  }

  async rename(classId, oldName, newName) {
    if (oldName === newName) return;
    const existing = await this.get(classId, oldName);
    if (!existing) throw new Error('Preset niet gevonden.');

    const clash = await this.get(classId, newName);
    if (clash) throw new Error('Naam bestaat al.');

    const updated = {
      ...existing,
      name: newName,
      updatedAt: new Date().toISOString()
    };

    await this.tx(PRESET_STORE, 'readwrite', (store) => {
      store.delete([classId, oldName]);
      store.put(updated);
    });

    const selected = await this.selected(classId);
    if (selected === oldName) await this.setSelected(classId, newName);
  }

  async remove(classId, name) {
    await this.tx(PRESET_STORE, 'readwrite', (store) => {
      store.delete([classId, name]);
    });

    const selected = await this.selected(classId);
    if (selected === name) await this.setSelected(classId, '');
  }

  async selected(classId) {
    const row = await this.tx(META_STORE, 'readonly', (store) => {
      const req = store.get(classId);
      return this.reqToPromise(req);
    });
    return row?.selectedPreset || '';
  }

  async setSelected(classId, name) {
    await this.tx(META_STORE, 'readwrite', (store) => {
      store.put({ classId, selectedPreset: name || '' });
    });
  }

  async exportClass(classId) {
    const names = await this.list(classId);
    const presets = {};
    for (const name of names) {
      const row = await this.get(classId, name);
      if (!row) continue;
      presets[name] = {
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        arrangement: deepClone(row.arrangement)
      };
    }

    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      classId,
      selectedPreset: await this.selected(classId),
      presets
    };
  }

  async importClass(classId, payload, { overwrite = false } = {}) {
    const source = payload?.presets;
    if (!source || typeof source !== 'object') {
      throw new Error('Importbestand bevat geen presets.');
    }

    let imported = 0;
    let skippedExisting = 0;
    let skippedInvalid = 0;

    for (const [name, entry] of Object.entries(source)) {
      const arrangement = entry?.arrangement || entry;
      if (!isArrangementValid(arrangement)) {
        skippedInvalid++;
        continue;
      }

      const exists = await this.get(classId, name);
      if (exists && !overwrite) {
        skippedExisting++;
        continue;
      }

      await this.upsert(classId, name, arrangement);
      imported++;
    }

    return { imported, skippedExisting, skippedInvalid };
  }
}

export function initPresetUI({ getCurrentClassId, getCurrentArrangement, applyArrangement }) {
  const store = new IndexedPresetStore();
  const $sel = document.getElementById('presetSelect');
  const $btnLoad = document.getElementById('btnPresetLoad');
  const $btnSave = document.getElementById('btnPresetSave');
  const $btnOverwrite = document.getElementById('btnPresetOverwrite');
  const $btnRename = document.getElementById('btnPresetRename');
  const $btnDelete = document.getElementById('btnPresetDelete');
  const $btnExport = document.getElementById('btnPresetExport');
  const $inpImport = document.getElementById('presetImport');

  if (!$sel) return { refreshForClassChange: async () => {} };

  let isApplying = false;

  function classId() {
    return (getCurrentClassId() || 'onbekend').trim() || 'onbekend';
  }

  function selectedOptionValue() {
    if (!$sel.options.length) return '';
    if ($sel.value) return $sel.value;
    return $sel.options[0].value;
  }

  async function refill() {
    const currentClass = classId();
    const names = await store.list(currentClass);
    const preferred = await store.selected(currentClass);

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
      await store.setSelected(currentClass, names[0]);
    }
  }

  async function loadNamed(name, { markAsSelected = true } = {}) {
    const currentClass = classId();
    const row = await store.get(currentClass, name);
    if (!row) throw new Error('Preset niet gevonden.');
    if (!isArrangementValid(row.arrangement)) throw new Error('Presetdata is ongeldig.');

    isApplying = true;
    try {
      await applyArrangement(deepClone(row.arrangement));
      if (markAsSelected) await store.setSelected(currentClass, name);
      $sel.value = name;
    } finally {
      isApplying = false;
    }
  }

  async function autoApplySelectedForClass() {
    if (isApplying) return;
    const currentClass = classId();
    const selected = await store.selected(currentClass);
    if (!selected) return;

    try {
      await loadNamed(selected, { markAsSelected: false });
    } catch (err) {
      console.warn('Auto-laden van preset mislukt:', err);
    }
  }

  $sel.addEventListener('change', async () => {
    const v = selectedOptionValue();
    if (!v) return;
    await store.setSelected(classId(), v);
  });

  $btnSave?.addEventListener('click', async () => {
    const currentClass = classId();
    const name = prompt('Naam voor deze opstelling:');
    if (!name) return;

    try {
      const arrangement = getCurrentArrangement();
      if (await store.get(currentClass, name)) {
        if (!confirm('Bestaat al. Overschrijven?')) return;
      }
      await store.upsert(currentClass, name, arrangement);
      await refill();
      $sel.value = name;
    } catch (err) {
      alert(`Opslaan mislukt: ${err.message || err}`);
    }
  });

  $btnOverwrite?.addEventListener('click', async () => {
    const currentClass = classId();
    const name = selectedOptionValue();
    if (!name) {
      alert('Geen preset geselecteerd.');
      return;
    }

    if (!confirm(`Preset "${name}" overschrijven met de huidige indeling?`)) return;

    try {
      const arrangement = getCurrentArrangement();
      await store.upsert(currentClass, name, arrangement);
      await refill();
      $sel.value = name;
    } catch (err) {
      alert(`Overschrijven mislukt: ${err.message || err}`);
    }
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
      alert(`Laden mislukt: ${err.message || err}`);
    }
  });

  $btnRename?.addEventListener('click', async () => {
    const currentClass = classId();
    const current = selectedOptionValue();
    if (!current) {
      alert('Geen preset geselecteerd.');
      return;
    }

    const newName = prompt('Nieuwe naam:', current);
    if (!newName || newName === current) return;

    try {
      await store.rename(currentClass, current, newName);
      await refill();
      $sel.value = newName;
    } catch (err) {
      alert(`Hernoemen mislukt: ${err.message || err}`);
    }
  });

  $btnDelete?.addEventListener('click', async () => {
    const currentClass = classId();
    const current = selectedOptionValue();
    if (!current) {
      alert('Geen preset geselecteerd.');
      return;
    }
    if (!confirm(`Preset "${current}" verwijderen?`)) return;

    await store.remove(currentClass, current);
    await refill();
  });

  $btnExport?.addEventListener('click', async () => {
    const payload = await store.exportClass(classId());
    downloadJSON(`opstellingen-${classId()}.json`, payload);
  });

  $inpImport?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const overwrite = confirm('Bestaande presets met dezelfde naam overschrijven?');
      const result = await store.importClass(classId(), parsed, { overwrite });
      await refill();
      alert(`Import klaar: ${result.imported} toegevoegd, ${result.skippedExisting} overgeslagen, ${result.skippedInvalid} ongeldig.`);
    } catch (err) {
      alert(`Import mislukt: ${err.message || err}`);
    } finally {
      e.target.value = '';
    }
  });

  async function refreshForClassChange() {
    await refill();
    await autoApplySelectedForClass();
  }

  void (async () => {
    await refill();
    await autoApplySelectedForClass();
  })();

  return { refreshForClassChange };
}
