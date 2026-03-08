const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const BASE_SOURCE = 'js/jaarplanning-live.json';

const classSelect = document.getElementById('classSelect');
const saveAllBtn = document.getElementById('saveAllBtn');
const editorTitle = document.getElementById('editorTitle');
const sheetBody = document.getElementById('sheetBody');
const statusLine = document.getElementById('statusLine');

const state = {
  baseDoc: { entries: [], presentations: {}, updatedAt: '' },
  doc: { entries: [], presentations: {}, updatedAt: '' },
  layers: [],
};

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.style.color = isError ? '#9f1d1d' : '#2c4f7c';
}

function normalizeClassId(raw) {
  const text = String(raw || '').replace(/\s+/g, '').toUpperCase();
  const prefixed = text.match(/^G([1-4][A-Z])$/);
  return prefixed ? prefixed[1] : text;
}

function gradeLayerFromClassId(rawClassId) {
  const cid = normalizeClassId(rawClassId);
  if (!cid) return '';
  const patterns = [
    /^G([1-6])[A-Z]$/,
    /^([1-6])[A-Z]$/,
    /^([1-6])\.\d+$/,
    /^([1-6])G\d+$/,
    /^([1-6])$/,
  ];
  for (const pattern of patterns) {
    const match = cid.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function normalizeDoc(raw) {
  const doc = (raw && typeof raw === 'object') ? structuredClone(raw) : {};
  if (!Array.isArray(doc.entries)) doc.entries = [];
  if (!doc.presentations || typeof doc.presentations !== 'object') doc.presentations = {};
  doc.entries = doc.entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const classId = normalizeClassId(entry.classId || '');
      const week = String(entry.week || '').trim();
      const lessons = Array.isArray(entry.lessons) ? entry.lessons : [];
      const items = Array.isArray(entry.items) ? entry.items.map((x) => String(x).trim()).filter(Boolean) : [];
      const note = String(entry.note || '').trim();
      const out = { classId, week, lessons, items };
      if (note) out.note = note;
      return out;
    })
    .filter((entry) => entry.classId && entry.week);
  return doc;
}

function collapseToYearLayerDoc(doc) {
  const source = normalizeDoc(doc);
  const merged = new Map();
  const passthrough = [];

  for (const entry of source.entries || []) {
    const grade = gradeLayerFromClassId(entry.classId);
    if (!grade) {
      if (String(entry?.classId || '').trim().toUpperCase() === 'ALL') {
        passthrough.push(entry);
      }
      continue;
    }
    const week = String(entry.week || '').trim();
    if (!week) continue;
    const key = `${grade}__${week}`;
    if (!merged.has(key)) {
      merged.set(key, { classId: grade, week, lessons: [], items: [], notes: [] });
    }
    const bucket = merged.get(key);
    for (const lesson of Array.isArray(entry.lessons) ? entry.lessons : []) {
      const fingerprint = JSON.stringify(lesson || {});
      if (!bucket.lessons.some((it) => JSON.stringify(it || {}) === fingerprint)) {
        bucket.lessons.push(lesson);
      }
    }
    for (const item of Array.isArray(entry.items) ? entry.items : []) {
      const text = String(item || '').trim();
      if (text && !bucket.items.includes(text)) bucket.items.push(text);
    }
    const note = String(entry.note || '').trim();
    if (note && !bucket.notes.includes(note)) bucket.notes.push(note);
  }

  const entries = [...merged.values()].map((row) => {
    const out = {
      classId: row.classId,
      week: row.week,
      lessons: row.lessons,
      items: row.items,
    };
    if (row.notes.length) out.note = row.notes.join(' | ');
    return out;
  });
  entries.push(...passthrough);

  return {
    ...source,
    entries,
    updatedAt: source.updatedAt || new Date().toISOString(),
  };
}

async function fetchJson(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set('_t', String(Date.now()));
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function layersFromDoc(doc) {
  return [...new Set(doc.entries.map((e) => gradeLayerFromClassId(e.classId)).filter(Boolean))].sort();
}

function selectedLayer() {
  return gradeLayerFromClassId(classSelect.value);
}

function parseWeek(weekRaw) {
  const cleaned = String(weekRaw || '').trim().toUpperCase();
  if (!cleaned) return NaN;
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  const mW = cleaned.match(/^W(\d{1,2})$/);
  if (mW) return Number(mW[1]);
  const mIso = cleaned.match(/^\d{4}-W(\d{1,2})$/);
  if (mIso) return Number(mIso[1]);
  return NaN;
}

function findLayerWeekEntry(layer, week) {
  return state.doc.entries.find((entry) => (
    gradeLayerFromClassId(entry.classId) === layer && parseWeek(entry.week) === week
  )) || null;
}

function normalizeWeekEntry(layer, week, entry) {
  const e = entry || { classId: layer, week: String(week), lessons: [], items: [] };
  if (!Array.isArray(e.lessons)) e.lessons = [];
  if (!Array.isArray(e.items)) e.items = [];
  e.classId = layer;
  e.week = String(week);
  return e;
}

function lessonParts(entry) {
  const out = {
    A: { project: '', lesson: '', homework: '' },
    B: { project: '', lesson: '', homework: '' },
    C: { project: '', lesson: '', homework: '' },
  };
  const lessons = Array.isArray(entry?.lessons) ? entry.lessons : [];
  const fallback = [];
  for (const lesson of lessons) {
    const key = String(lesson?.lessonKey || '').trim().toUpperCase();
    const project = String(lesson?.project || '').trim();
    const title = String(lesson?.lesson || '').trim();
    const homework = String(lesson?.homework || '').trim();
    if (['A', 'B', 'C'].includes(key)) {
      out[key] = { project, lesson: title, homework };
    } else {
      fallback.push({ project, lesson: title, homework });
    }
  }
  for (const key of ['A', 'B', 'C']) {
    if (!out[key].project && !out[key].lesson && !out[key].homework && fallback.length) {
      out[key] = fallback.shift();
    }
  }
  return out;
}

function setLesson(entry, slot, field, value) {
  const cleaned = String(value || '').trim();
  if (!Array.isArray(entry.lessons)) entry.lessons = [];
  let lesson = entry.lessons.find((row) => String(row?.lessonKey || '').toUpperCase() === slot);
  if (!lesson) {
    lesson = { lessonKey: slot, project: '', lesson: '', homework: '' };
    entry.lessons.push(lesson);
  }
  lesson[field] = cleaned;
  entry.lessons = entry.lessons.filter((row) => {
    const project = String(row?.project || '').trim();
    const title = String(row?.lesson || '').trim();
    const homework = String(row?.homework || '').trim();
    return project || title || homework;
  });
}

function setItems(entry, value) {
  entry.items = String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

function setNote(entry, value) {
  const note = String(value || '').trim();
  if (note) entry.note = note;
  else delete entry.note;
}

function saveStudio() {
  state.doc.updatedAt = new Date().toISOString();
  localStorage.setItem(STUDIO_KEY, JSON.stringify(state.doc));
}

function renderSheet() {
  const layer = selectedLayer();
  editorTitle.textContent = `Jaarplanning Raster · jaarlaag ${layer}`;
  sheetBody.innerHTML = '';

  for (let week = 1; week <= 53; week += 1) {
    const entry = normalizeWeekEntry(layer, week, findLayerWeekEntry(layer, week));
    const parts = lessonParts(entry);
    const tr = document.createElement('tr');

    const weekCell = document.createElement('td');
    weekCell.className = 'week-col';
    weekCell.textContent = `W${String(week).padStart(2, '0')}`;
    tr.appendChild(weekCell);

    const makeInputCell = (value, slot, field, multiline = false) => {
      const td = document.createElement('td');
      const el = multiline ? document.createElement('textarea') : document.createElement('input');
      el.className = `sheet-cell${multiline ? ' multiline' : ''}`;
      el.value = value;
      el.dataset.week = String(week);
      el.dataset.slot = slot;
      el.dataset.field = field;
      el.addEventListener('change', onCellChange);
      td.appendChild(el);
      return td;
    };

    tr.appendChild(makeInputCell(parts.A.project, 'A', 'project'));
    tr.appendChild(makeInputCell(parts.A.lesson, 'A', 'lesson'));
    tr.appendChild(makeInputCell(parts.A.homework, 'A', 'homework', true));
    tr.appendChild(makeInputCell(parts.B.project, 'B', 'project'));
    tr.appendChild(makeInputCell(parts.B.lesson, 'B', 'lesson'));
    tr.appendChild(makeInputCell(parts.B.homework, 'B', 'homework', true));
    tr.appendChild(makeInputCell(parts.C.project, 'C', 'project'));
    tr.appendChild(makeInputCell(parts.C.lesson, 'C', 'lesson'));
    tr.appendChild(makeInputCell(parts.C.homework, 'C', 'homework', true));
    tr.appendChild(makeInputCell((entry.items || []).join('\n'), 'ITEMS', 'items', true));
    tr.appendChild(makeInputCell(String(entry.note || ''), 'NOTE', 'note', true));

    sheetBody.appendChild(tr);
  }
}

function onCellChange(event) {
  const target = event.target;
  const layer = selectedLayer();
  const week = Number(target.dataset.week || '0');
  if (!layer || !week) return;

  let entry = findLayerWeekEntry(layer, week);
  if (!entry) {
    entry = normalizeWeekEntry(layer, week, null);
    state.doc.entries.push(entry);
  }

  const slot = String(target.dataset.slot || '');
  const field = String(target.dataset.field || '');
  if (slot === 'ITEMS') {
    setItems(entry, target.value);
  } else if (slot === 'NOTE') {
    setNote(entry, target.value);
  } else if (['A', 'B', 'C'].includes(slot) && ['project', 'lesson', 'homework'].includes(field)) {
    setLesson(entry, slot, field, target.value);
  }

  const hasLessons = Array.isArray(entry.lessons) && entry.lessons.length > 0;
  const hasItems = Array.isArray(entry.items) && entry.items.length > 0;
  const hasNote = Boolean(String(entry.note || '').trim());
  if (!hasLessons && !hasItems && !hasNote) {
    state.doc.entries = state.doc.entries.filter((row) => row !== entry);
  }

  saveStudio();
  setStatus(`Gewijzigd: jaarlaag ${layer}, week ${week}.`);
}

function saveAll() {
  saveStudio();
  setStatus(`Alles opgeslagen voor jaarlaag ${selectedLayer()}.`);
}

function fillLayerOptions(layers) {
  classSelect.innerHTML = '';
  for (const layer of layers) {
    const option = document.createElement('option');
    option.value = layer;
    option.textContent = `Jaarlaag ${layer}`;
    classSelect.appendChild(option);
  }
}

async function boot() {
  try {
    const [baseRaw, classRaw] = await Promise.all([
      fetchJson(BASE_SOURCE),
      fetchJson('js/leerlingen_per_klas.json'),
    ]);

    state.baseDoc = collapseToYearLayerDoc(baseRaw);
    const fromStorage = localStorage.getItem(STUDIO_KEY);
    state.doc = fromStorage ? collapseToYearLayerDoc(JSON.parse(fromStorage)) : collapseToYearLayerDoc(baseRaw);

    const uiLayers = Object.keys(classRaw || {}).map((cid) => gradeLayerFromClassId(cid)).filter(Boolean);
    const allLayers = [...new Set([...uiLayers, ...layersFromDoc(state.doc)])].sort();
    state.layers = allLayers;

    fillLayerOptions(allLayers);
    classSelect.value = allLayers[0] || '1';

    saveStudio();
    renderSheet();
    setStatus('Studio klaar. Excel-overzicht actief.');
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij laden studio: ${err?.message || err}`, true);
  }
}

saveAllBtn.addEventListener('click', saveAll);
classSelect.addEventListener('change', renderSheet);

boot();
