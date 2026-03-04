const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const BASE_SOURCE = 'js/jaarplanning-live.json';

const classSelect = document.getElementById('classSelect');
const weekInput = document.getElementById('weekInput');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const weekList = document.getElementById('weekList');
const editorTitle = document.getElementById('editorTitle');
const lessonsInput = document.getElementById('lessonsInput');
const itemsInput = document.getElementById('itemsInput');
const noteInput = document.getElementById('noteInput');
const saveWeekBtn = document.getElementById('saveWeekBtn');
const clearWeekBtn = document.getElementById('clearWeekBtn');
const resetStudioBtn = document.getElementById('resetStudioBtn');
const exportStudioBtn = document.getElementById('exportStudioBtn');
const statusLine = document.getElementById('statusLine');

const state = {
  baseDoc: { entries: [], presentations: {}, updatedAt: '' },
  doc: { entries: [], presentations: {}, updatedAt: '' },
  classes: [],
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

function currentIsoWeek() {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
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

async function fetchJson(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set('_t', String(Date.now()));
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function classesFromDoc(doc) {
  return [...new Set(doc.entries.map((e) => normalizeClassId(e.classId)).filter(Boolean))].sort();
}

function parseLessons(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 3) {
        const [slot, project, lesson] = parts;
        const row = { project, lesson };
        if (/^[ABC]$/i.test(slot)) row.lessonKey = slot.toUpperCase();
        return row;
      }
      if (parts.length === 2) {
        const [project, lesson] = parts;
        return { project, lesson };
      }
      return { project: parts[0], lesson: '' };
    })
    .filter((row) => String(row.project || '').trim() || String(row.lesson || '').trim());
}

function formatLessons(lessons) {
  return (Array.isArray(lessons) ? lessons : []).map((lesson) => {
    const slot = String(lesson?.lessonKey || '').trim().toUpperCase();
    const project = String(lesson?.project || '').trim();
    const title = String(lesson?.lesson || '').trim();
    return slot ? `${slot} | ${project} | ${title}` : `${project} | ${title}`;
  }).join('\n');
}

function weekCandidates(weekNo) {
  const week = String(Math.max(1, Math.min(53, Number(weekNo) || 1)));
  const padded = String(Number(week)).padStart(2, '0');
  const year = new Date().getFullYear();
  return [week, padded, `W${padded}`, `${year}-W${padded}`];
}

function selectedClass() {
  return normalizeClassId(classSelect.value);
}

function selectedWeek() {
  return Math.max(1, Math.min(53, Number(weekInput.value) || currentIsoWeek()));
}

function findEntry(classId, weekNo) {
  const wk = weekCandidates(weekNo);
  return state.doc.entries.find((entry) => (
    normalizeClassId(entry.classId) === normalizeClassId(classId)
    && wk.includes(String(entry.week || '').trim().toUpperCase())
  )) || null;
}

function saveStudio() {
  state.doc.updatedAt = new Date().toISOString();
  localStorage.setItem(STUDIO_KEY, JSON.stringify(state.doc));
}

function renderWeekList() {
  const cid = selectedClass();
  const weeks = state.doc.entries
    .filter((entry) => normalizeClassId(entry.classId) === cid)
    .map((entry) => Number(String(entry.week).replace(/[^0-9]/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 53);
  const uniqueWeeks = [...new Set(weeks)].sort((a, b) => a - b);

  weekList.innerHTML = '';
  if (!uniqueWeeks.length) {
    weekList.innerHTML = '<p class="status-line">Nog geen weken voor deze klas.</p>';
    return;
  }

  for (const week of uniqueWeeks) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `week-btn${week === selectedWeek() ? ' active' : ''}`;
    btn.textContent = `Week ${week}`;
    btn.addEventListener('click', () => {
      weekInput.value = String(week);
      renderEditor();
    });
    weekList.appendChild(btn);
  }
}

function renderEditor() {
  const cid = selectedClass();
  const week = selectedWeek();
  const entry = findEntry(cid, week);
  editorTitle.textContent = `Editor · ${cid} · week ${week}`;
  lessonsInput.value = formatLessons(entry?.lessons || []);
  itemsInput.value = (entry?.items || []).join('\n');
  noteInput.value = String(entry?.note || '');
  renderWeekList();
}

function saveWeek() {
  const cid = selectedClass();
  const week = selectedWeek();
  const existing = findEntry(cid, week);
  const payload = {
    classId: cid,
    week: String(week),
    lessons: parseLessons(lessonsInput.value),
    items: String(itemsInput.value).split('\n').map((line) => line.trim()).filter(Boolean),
  };
  const note = String(noteInput.value || '').trim();
  if (note) payload.note = note;

  if (existing) {
    existing.classId = payload.classId;
    existing.week = payload.week;
    existing.lessons = payload.lessons;
    existing.items = payload.items;
    if (payload.note) existing.note = payload.note;
    else delete existing.note;
  } else {
    state.doc.entries.push(payload);
  }

  saveStudio();
  renderEditor();
  setStatus(`Opgeslagen: ${cid} week ${week}.`);
}

function clearWeek() {
  const cid = selectedClass();
  const week = selectedWeek();
  const wk = weekCandidates(week);
  state.doc.entries = state.doc.entries.filter((entry) => !(
    normalizeClassId(entry.classId) === cid
    && wk.includes(String(entry.week || '').trim().toUpperCase())
  ));
  saveStudio();
  renderEditor();
  setStatus(`Leeggemaakt: ${cid} week ${week}.`);
}

function exportStudio() {
  const blob = new Blob([`${JSON.stringify(state.doc, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'jaarplanning-studio-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus('Export gemaakt.');
}

async function resetStudio() {
  localStorage.removeItem(STUDIO_KEY);
  state.doc = normalizeDoc(state.baseDoc);
  weekInput.value = String(currentIsoWeek());
  saveStudio();
  renderEditor();
  setStatus('Studio teruggezet naar basisplanning.');
}

function fillClassOptions(classes) {
  classSelect.innerHTML = '';
  for (const cid of classes) {
    const option = document.createElement('option');
    option.value = cid;
    option.textContent = cid;
    classSelect.appendChild(option);
  }
}

async function boot() {
  try {
    const [baseRaw, classRaw] = await Promise.all([
      fetchJson(BASE_SOURCE),
      fetchJson('js/leerlingen_per_klas.json'),
    ]);

    state.baseDoc = normalizeDoc(baseRaw);
    const fromStorage = localStorage.getItem(STUDIO_KEY);
    state.doc = fromStorage ? normalizeDoc(JSON.parse(fromStorage)) : normalizeDoc(baseRaw);

    const uiClasses = Object.keys(classRaw || {}).map((cid) => normalizeClassId(cid));
    const allClasses = [...new Set([...uiClasses, ...classesFromDoc(state.doc)])].filter(Boolean).sort();
    state.classes = allClasses;

    fillClassOptions(allClasses);
    classSelect.value = allClasses[0] || '1A';
    weekInput.value = String(currentIsoWeek());

    saveStudio();
    renderEditor();
    setStatus('Studio klaar. Wijzigingen zijn intern opgeslagen.');
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij laden studio: ${err?.message || err}`, true);
  }
}

saveWeekBtn.addEventListener('click', saveWeek);
clearWeekBtn.addEventListener('click', clearWeek);
exportStudioBtn.addEventListener('click', exportStudio);
resetStudioBtn.addEventListener('click', resetStudio);
classSelect.addEventListener('change', renderEditor);
weekInput.addEventListener('input', renderEditor);
prevWeekBtn.addEventListener('click', () => {
  weekInput.value = String(Math.max(1, selectedWeek() - 1));
  renderEditor();
});
nextWeekBtn.addEventListener('click', () => {
  weekInput.value = String(Math.min(53, selectedWeek() + 1));
  renderEditor();
});

boot();
