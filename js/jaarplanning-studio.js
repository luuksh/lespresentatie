const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const BASE_SOURCE = 'js/jaarplanning-live.json';
const PUBLISH_ENDPOINT = 'api/presentatie-studio/publish';
const STUDIO_SCHEMA_VERSION = 2;
const MENTOR_LESSON_CLASS_ID = 'MENTORLES';
const SPECIAL_PLANNING_CLASS_IDS = [MENTOR_LESSON_CLASS_ID];
const SCHOOL_YEAR_START_WEEK = 36;
const STARTWEEK_PLANNING_WEEK = 35;
const MENTOR_STARTWEEK_PRESENTATION_ID = 'project-mentorles-1d';
const MAX_ISO_WEEK = 53;

const classSelect = document.getElementById('classSelect');
const saveAllBtn = document.getElementById('saveAllBtn');
const exportAllBtn = document.getElementById('exportAllBtn');
const editorTitle = document.getElementById('editorTitle');
const sheetBody = document.getElementById('sheetBody');
const statusLine = document.getElementById('statusLine');
const lessonOrderPanel = document.getElementById('lessonOrderPanel');
const AUTOSAVE_DELAY_MS = 900;

const state = {
  baseDoc: { entries: [], presentations: {}, updatedAt: '' },
  doc: { entries: [], presentations: {}, updatedAt: '' },
  layers: [],
};

let publishInFlight = false;
let publishQueuedAfterCurrent = false;
let autosaveTimer = null;

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.style.color = isError ? '#9f1d1d' : '#2c4f7c';
}

function setBusyStatus(message) {
  statusLine.textContent = message;
  statusLine.style.color = '#5a3b00';
}

function isStorageQuotaError(err) {
  return err?.name === 'QuotaExceededError'
    || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err?.code === 22
    || err?.code === 1014;
}

function trySaveStudioCache() {
  try {
    localStorage.setItem(STUDIO_KEY, JSON.stringify(state.doc));
    return true;
  } catch (err) {
    if (!isStorageQuotaError(err)) throw err;
    try { localStorage.removeItem(STUDIO_KEY); } catch {}
    console.warn('Browseropslag is vol; jaarplanning-studiocache is overgeslagen.', err);
    return false;
  }
}

function setButtonBusy(button, label) {
  if (!button) return;
  button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
  button.textContent = label;
  button.disabled = true;
}

function resetButton(button) {
  if (!button) return;
  button.textContent = button.dataset.originalLabel || button.textContent;
  button.disabled = false;
}

function setButtonDone(button, label, resetDelay = 1800) {
  if (!button) return;
  button.textContent = label;
  window.setTimeout(() => resetButton(button), resetDelay);
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

function planningLayerFromClassId(rawClassId) {
  const cid = normalizeClassId(rawClassId);
  if (SPECIAL_PLANNING_CLASS_IDS.includes(cid)) return cid;
  return gradeLayerFromClassId(cid);
}

function planningLayerLabel(layer) {
  return normalizeClassId(layer) === MENTOR_LESSON_CLASS_ID ? 'Mentorles' : `Jaarlaag ${layer}`;
}

function schoolYearWeeks() {
  const regularWeeks = Array.from(
    { length: MAX_ISO_WEEK },
    (_, index) => ((SCHOOL_YEAR_START_WEEK - 1 + index) % MAX_ISO_WEEK) + 1,
  );
  return [
    STARTWEEK_PLANNING_WEEK,
    ...regularWeeks.filter((week) => week !== STARTWEEK_PLANNING_WEEK),
  ];
}

function normalizeDoc(raw) {
  const doc = (raw && typeof raw === 'object') ? structuredClone(raw) : {};
  if (!Array.isArray(doc.entries)) doc.entries = [];
  if (!doc.presentations || typeof doc.presentations !== 'object') doc.presentations = {};
  doc.sourceRevision = String(doc.sourceRevision || '').trim();
  doc.schemaVersion = Number(doc.schemaVersion || 0);
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

function hasAssessmentData(doc) {
  return (doc?.entries || []).some((entry) => (
    (entry?.lessons || []).some((lesson) => String(lesson?.assessment || '').trim())
  ));
}

function hasMentorStartweekPlanning(doc) {
  const entries = Array.isArray(doc?.entries) ? doc.entries : [];
  const entry = entries.find((row) => (
    normalizeClassId(row?.classId) === MENTOR_LESSON_CLASS_ID
    && String(row?.week || '').trim() === String(STARTWEEK_PLANNING_WEEK)
  ));
  const lessons = Array.isArray(entry?.lessons) ? entry.lessons : [];
  return ['A', 'B', 'C'].every((slot) => lessons.some((lesson) => (
    String(lesson?.lessonKey || '').trim().toUpperCase() === slot
    && String(lesson?.presentationId || '').trim() === MENTOR_STARTWEEK_PRESENTATION_ID
  )));
}

function parseDocTimestamp(doc) {
  const raw = String(doc?.updatedAt || '').trim();
  if (!raw) return 0;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? stamp : 0;
}

function baseShouldReplaceLocal(baseDoc, localDoc) {
  const localSchema = Number(localDoc?.schemaVersion || 0);
  if (localSchema < STUDIO_SCHEMA_VERSION) return true;
  const baseRevision = String(baseDoc?.sourceRevision || '').trim();
  const localRevision = String(localDoc?.sourceRevision || '').trim();
  if (hasAssessmentData(baseDoc) && !hasAssessmentData(localDoc)) return true;
  const baseStamp = parseDocTimestamp(baseDoc);
  const localStamp = parseDocTimestamp(localDoc);
  if (baseRevision && localRevision && baseRevision !== localRevision) {
    return !(localStamp && (!baseStamp || localStamp >= baseStamp));
  }
  if (baseRevision && !localRevision) {
    return !(localStamp && baseStamp && localStamp >= baseStamp);
  }
  if (!baseStamp || !localStamp) return false;
  return baseStamp > localStamp;
}

function collapseToYearLayerDoc(doc) {
  const source = normalizeDoc(doc);
  const merged = new Map();
  const passthrough = [];

  for (const entry of source.entries || []) {
    const layer = planningLayerFromClassId(entry.classId);
    if (!layer) {
      if (String(entry?.classId || '').trim().toUpperCase() === 'ALL') {
        passthrough.push(entry);
      }
      continue;
    }
    const week = String(entry.week || '').trim();
    if (!week) continue;
    const key = `${layer}__${week}`;
    if (!merged.has(key)) {
      merged.set(key, { classId: layer, week, lessons: [], items: [], notes: [] });
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
    schemaVersion: Math.max(Number(source.schemaVersion || 0), STUDIO_SCHEMA_VERSION),
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
  return [...new Set(doc.entries.map((e) => planningLayerFromClassId(e.classId)).filter(Boolean))]
    .sort((left, right) => planningLayerLabel(left).localeCompare(planningLayerLabel(right), 'nl', { numeric: true, sensitivity: 'base' }));
}

function selectedLayer() {
  return planningLayerFromClassId(classSelect.value);
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

function academicWeekOrder(weekRaw) {
  const week = parseWeek(weekRaw);
  if (!Number.isFinite(week)) return Number.POSITIVE_INFINITY;
  if (week === STARTWEEK_PLANNING_WEEK) return -1;
  return week >= SCHOOL_YEAR_START_WEEK
    ? week - SCHOOL_YEAR_START_WEEK
    : week + (MAX_ISO_WEEK - SCHOOL_YEAR_START_WEEK + 1);
}

function currentIsoWeek() {
  const now = new Date();
  const local = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
}

function lessonTimelineStatus(weekRaw) {
  const lessonOrder = academicWeekOrder(weekRaw);
  const currentOrder = academicWeekOrder(currentIsoWeek());
  if (lessonOrder < currentOrder) return { state: 'done', label: 'Afgelopen', icon: '✓' };
  if (lessonOrder === currentOrder) return { state: 'active', label: 'Nu', icon: '•' };
  return { state: 'future', label: 'Hierna', icon: '○' };
}

function findLayerWeekEntry(layer, week) {
  return state.doc.entries.find((entry) => (
    planningLayerFromClassId(entry.classId) === layer && parseWeek(entry.week) === week
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
    A: { project: '', lesson: '', homework: '', assessment: '' },
    B: { project: '', lesson: '', homework: '', assessment: '' },
    C: { project: '', lesson: '', homework: '', assessment: '' },
  };
  const lessons = Array.isArray(entry?.lessons) ? entry.lessons : [];
  const fallback = [];
  for (const lesson of lessons) {
    const key = String(lesson?.lessonKey || '').trim().toUpperCase();
    const project = String(lesson?.project || '').trim();
    const title = String(lesson?.lesson || '').trim();
    const homework = String(lesson?.homework || '').trim();
    const assessment = String(lesson?.assessment || '').trim();
    if (['A', 'B', 'C'].includes(key)) {
      out[key] = { project, lesson: title, homework, assessment };
    } else {
      fallback.push({ project, lesson: title, homework, assessment });
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
    lesson = { lessonKey: slot, project: '', lesson: '', homework: '', assessment: '' };
    entry.lessons.push(lesson);
  }
  lesson[field] = cleaned;
  entry.lessons = entry.lessons.filter((row) => {
    const project = String(row?.project || '').trim();
    const title = String(row?.lesson || '').trim();
    const homework = String(row?.homework || '').trim();
    const assessment = String(row?.assessment || '').trim();
    return project || title || homework || assessment;
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

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isReadingProjectName(project) {
  const key = String(project || '').trim().toLocaleLowerCase('nl-NL');
  return key === 'leesmeters' || key === 'heel veel lezen';
}

function lessonSlotOrderValue(lessonKey) {
  return { A: 0, B: 1, C: 2 }[String(lessonKey || '').trim().toUpperCase()] ?? 99;
}

function lessonSlotsForLayer(layer, { editableOnly = false } = {}) {
  const slots = [];
  const weeks = schoolYearWeeks();
  for (const week of weeks) {
    const entry = findLayerWeekEntry(layer, week);
    if (!entry || !Array.isArray(entry.lessons)) continue;
    entry.lessons
      .map((lesson, lessonIndex) => ({ lesson, lessonIndex }))
      .filter((item) => item.lesson && typeof item.lesson === 'object')
      .sort((left, right) => lessonSlotOrderValue(left.lesson.lessonKey) - lessonSlotOrderValue(right.lesson.lessonKey))
      .forEach(({ lesson, lessonIndex }) => {
        const project = String(lesson.project || '').trim();
        const title = String(lesson.lesson || '').trim();
        if (!project && !title) return;
        const locked = isReadingProjectName(project);
        if (editableOnly && locked) return;
        slots.push({
          entry,
          lesson,
          lessonIndex,
          week: String(entry.week || week),
          lessonKey: String(lesson.lessonKey || '').trim().toUpperCase(),
          locked,
        });
      });
  }
  return slots;
}

function lessonTitleForCard(slot) {
  return String(slot?.lesson?.lesson || slot?.lesson?.project || 'Les zonder titel').trim();
}

function presentationStudioUrlForLesson(lesson) {
  const project = String(lesson?.project || '').trim();
  const markerId = String(lesson?.presentationMarkerId || '').trim();
  const url = new URL('presentatie-studio.html', window.location.href);
  if (project) url.searchParams.set('project', project);
  if (markerId) url.searchParams.set('marker', markerId);
  return url.toString();
}

function cleanupEmptyEntries() {
  state.doc.entries = (state.doc.entries || []).filter((entry) => {
    const hasLessons = Array.isArray(entry?.lessons) && entry.lessons.length > 0;
    const hasItems = Array.isArray(entry?.items) && entry.items.length > 0;
    const hasNote = Boolean(String(entry?.note || '').trim());
    return hasLessons || hasItems || hasNote;
  });
}

function persistPlanningMutation(message) {
  saveStudio();
  renderSheet();
  renderLessonOrderPanel();
  setBusyStatus(message);
  queueAutoPublish();
}

function moveArrayItem(items, fromIndex, toIndex) {
  const copy = [...items];
  const [item] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, item);
  return copy;
}

function reorderEditableLessons(fromIndex, toIndex) {
  const layer = selectedLayer();
  const slots = lessonSlotsForLayer(layer, { editableOnly: true });
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= slots.length || toIndex >= slots.length || fromIndex === toIndex) return;
  const reorderedLessons = moveArrayItem(slots.map((slot) => structuredClone(slot.lesson)), fromIndex, toIndex);
  reorderedLessons.forEach((lesson, index) => {
    const slot = slots[index];
    slot.entry.lessons[slot.lessonIndex] = {
      ...lesson,
      lessonKey: slot.lessonKey || lesson.lessonKey,
      preserveLessonKey: true,
    };
  });
  persistPlanningMutation(`Lesvolgorde aangepast voor ${planningLayerLabel(layer).toLocaleLowerCase('nl-NL')}. Publiceren start automatisch.`);
}

function unplanEditableLesson(index) {
  const layer = selectedLayer();
  const slots = lessonSlotsForLayer(layer, { editableOnly: true });
  const slot = slots[index];
  if (!slot) return;
  const title = lessonTitleForCard(slot);
  const confirmed = window.confirm(`"${title}" uit deze jaarplanning halen? De presentatie zelf blijft bestaan.`);
  if (!confirmed) return;
  slot.entry.lessons.splice(slot.lessonIndex, 1);
  cleanupEmptyEntries();
  persistPlanningMutation(`"${title}" uit de jaarplanning gehaald. Publiceren start automatisch.`);
}

function renderLessonOrderPanel() {
  if (!lessonOrderPanel) return;
  const layer = selectedLayer();
  const slots = lessonSlotsForLayer(layer);
  const editableIndexBySlot = new Map();
  lessonSlotsForLayer(layer, { editableOnly: true }).forEach((slot, index) => {
    editableIndexBySlot.set(slot.lesson, index);
  });
  if (!slots.length) {
    lessonOrderPanel.innerHTML = '<p class="lesson-order-empty">Nog geen lessen in deze planning.</p>';
    return;
  }

  const groups = [
    { state: 'done', title: 'Afgelopen', items: [] },
    { state: 'active', title: 'Nu', items: [] },
    { state: 'future', title: 'Hierna', items: [] },
  ];
  for (const slot of slots) {
    const status = lessonTimelineStatus(slot.week);
    const group = groups.find((item) => item.state === status.state) || groups[2];
    group.items.push({ slot, status, editableIndex: editableIndexBySlot.get(slot.lesson) });
  }

  lessonOrderPanel.innerHTML = groups
    .filter((group) => group.items.length)
    .map((group) => `
      <section class="lesson-order-section">
        <h4>${escapeHtml(group.title)}</h4>
        <div class="lesson-order-cards">
          ${group.items.map(({ slot, status, editableIndex }) => {
            const lesson = slot.lesson;
            const project = String(lesson.project || '').trim();
            const title = lessonTitleForCard(slot);
            const canEditOrder = Number.isInteger(editableIndex);
            return `
              <article
                class="lesson-order-card is-${escapeHtml(status.state)}${slot.locked ? ' is-locked' : ''}"
                ${canEditOrder ? `draggable="true" data-order-index="${editableIndex}"` : ''}
              >
                <div>
                  <p class="lesson-order-status">
                    <span aria-hidden="true">${escapeHtml(status.icon)}</span>
                    <span>${escapeHtml(status.label)} · W${escapeHtml(slot.week)}${slot.lessonKey ? ` · ${escapeHtml(slot.lessonKey)}` : ''}</span>
                  </p>
                  <h5>${escapeHtml(title)}</h5>
                  ${project ? `<p>${escapeHtml(project)}</p>` : ''}
                </div>
                <div class="lesson-order-actions">
                  ${canEditOrder ? '<button type="button" data-move-lesson="-1" title="Omhoog">↑</button><button type="button" data-move-lesson="1" title="Omlaag">↓</button>' : ''}
                  ${project ? `<a href="${escapeHtml(presentationStudioUrlForLesson(lesson))}" target="_blank" rel="noopener noreferrer">Bewerk</a>` : ''}
                  ${canEditOrder ? '<button type="button" data-unplan-lesson="1">Uit planning</button>' : ''}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `)
    .join('');

  bindLessonOrderPanel();
}

function bindLessonOrderPanel() {
  if (!lessonOrderPanel) return;
  let draggedIndex = -1;
  for (const card of lessonOrderPanel.querySelectorAll('[data-order-index]')) {
    card.addEventListener('dragstart', (event) => {
      draggedIndex = Number(card.dataset.orderIndex);
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(draggedIndex));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      for (const item of lessonOrderPanel.querySelectorAll('[data-order-index]')) item.classList.remove('is-drop-before', 'is-drop-after');
      draggedIndex = -1;
    });
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      card.classList.toggle('is-drop-before', !after);
      card.classList.toggle('is-drop-after', after);
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('is-drop-before', 'is-drop-after');
    });
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain') || draggedIndex);
      const target = Number(card.dataset.orderIndex);
      if (!Number.isInteger(from) || !Number.isInteger(target) || from === target) return;
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      const to = after && from < target ? target : after ? target + 1 : from < target ? target - 1 : target;
      reorderEditableLessons(from, Math.max(0, to));
    });
    card.querySelectorAll('[data-move-lesson]').forEach((button) => {
      button.addEventListener('click', () => {
        const from = Number(card.dataset.orderIndex);
        reorderEditableLessons(from, from + Number(button.dataset.moveLesson || 0));
      });
    });
    card.querySelector('[data-unplan-lesson]')?.addEventListener('click', () => {
      unplanEditableLesson(Number(card.dataset.orderIndex));
    });
  }
}

function saveStudio() {
  state.doc.updatedAt = new Date().toISOString();
  return trySaveStudioCache();
}

async function syncFromPublishedSource() {
  try {
    state.doc = collapseToYearLayerDoc(await fetchJson(BASE_SOURCE));
    saveStudio();
    renderSheet();
    renderLessonOrderPanel();
  } catch (err) {
    console.warn('Live bron kon na publiceren niet worden teruggelezen:', err);
  }
}

function countSlides(presentation) {
  return Array.isArray(presentation?.slides) ? presentation.slides.length : 0;
}

function countMarkerDeckSlides(presentation) {
  if (!presentation?.markerDecks || typeof presentation.markerDecks !== 'object') return 0;
  return Object.values(presentation.markerDecks).reduce((total, deck) => (
    total + (Array.isArray(deck) ? deck.length : 0)
  ), 0);
}

function buildExportPayload() {
  const fullDoc = structuredClone(state.doc);
  const yearLayers = [...new Set(
    (state.doc.entries || [])
      .map((entry) => planningLayerFromClassId(entry?.classId || ''))
      .filter(Boolean)
  )].sort((left, right) => planningLayerLabel(left).localeCompare(planningLayerLabel(right), 'nl', { numeric: true, sensitivity: 'base' }));
  const presentations = fullDoc.presentations || {};
  const presentationEntries = Object.entries(presentations).map(([id, presentation]) => ({
    id,
    title: String(presentation?.title || '').trim(),
    subtitle: String(presentation?.subtitle || '').trim(),
    project: String(presentation?.project || '').trim(),
    presentationType: String(presentation?.presentationType || '').trim(),
    slideCount: countSlides(presentation),
    markerCount: Object.keys(presentation?.markerDecks || {}).length,
    markerDeckSlideCount: countMarkerDeckSlides(presentation),
    slides: Array.isArray(presentation?.slides) ? structuredClone(presentation.slides) : [],
    markerDecks: presentation?.markerDecks && typeof presentation.markerDecks === 'object'
      ? structuredClone(presentation.markerDecks)
      : {},
    markers: presentation?.markers && typeof presentation.markers === 'object'
      ? structuredClone(presentation.markers)
      : {},
    lessonMeta: presentation?.lessonMeta && typeof presentation.lessonMeta === 'object'
      ? structuredClone(presentation.lessonMeta)
      : {},
  }));

  return {
    ...fullDoc,
    studioSource: 'jaarplanning-studio',
    exportType: 'jaarplanning-presentaties',
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    yearLayers,
    counts: {
      yearLayers: yearLayers.length,
      entries: Array.isArray(state.doc.entries) ? state.doc.entries.length : 0,
      presentations: Object.keys(state.doc.presentations || {}).length,
    },
    presentationsExport: {
      description: 'Expliciete export van alle presentaties met volledige slide-inhoud.',
      totalPresentations: presentationEntries.length,
      totalSlides: presentationEntries.reduce((total, item) => total + item.slideCount, 0),
      totalMarkerDeckSlides: presentationEntries.reduce((total, item) => total + item.markerDeckSlideCount, 0),
      items: presentationEntries,
    },
  };
}

function exportAll() {
  try {
    saveStudio();
    const payload = buildExportPayload();
    const stamp = payload.exportedAt.replace(/[:.]/g, '-');
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jaarplanning-presentaties-export-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`Export gedownload: ${payload.counts.entries} weekregels, ${payload.counts.presentations} presentaties.`);
  } catch (err) {
    console.error(err);
    setStatus(`Export mislukt: ${err?.message || err}`, true);
  }
}

function autoGitMessage(result = {}) {
  const git = result.autoGit;
  if (!git || git.enabled === false) return '';
  return git.ok
    ? ` ${git.message || 'Automatisch gepusht.'}`
    : ` Let op: automatisch pushen lukte niet: ${git.message || 'onbekende fout'}`;
}

function publishErrorMessage(err) {
  const message = String(err?.message || err || '');
  if (message.includes('HTTP 501')) {
    return 'de oude lokale server draait nog. Sluit dit venster en dubbelklik eenmalig op Open Jaarplanning Studio.command; daarna werkt deze knop direct.';
  }
  return message;
}

function queueAutoPublish() {
  if (publishInFlight) {
    publishQueuedAfterCurrent = true;
    return;
  }
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    void publishAll({ auto: true });
  }, AUTOSAVE_DELAY_MS);
}

async function publishAll({ auto = false } = {}) {
  if (publishInFlight) {
    publishQueuedAfterCurrent = true;
    setBusyStatus('Er loopt al een publicatie. De nieuwste wijziging wordt daarna meegenomen.');
    return false;
  }
  publishInFlight = true;
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  saveStudio();
  const payload = buildExportPayload();
  setButtonBusy(saveAllBtn, auto ? 'Auto-publiceren...' : 'Opslaan...');
  setBusyStatus(auto
    ? 'Automatisch opslaan en publiceren naar docent- en leerlingomgeving...'
    : 'Opslaan naar lokale en publieke leerlingomgeving...');
  try {
    if (window.location.protocol === 'file:') {
      throw new Error('Publiceren werkt alleen via http://127.0.0.1:4173. Open de lokale docentomgeving met start-docentomgeving.command.');
    }
    const res = await fetch(PUBLISH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result?.ok === false) {
      throw new Error(result?.error || `HTTP ${res.status}`);
    }
    await syncFromPublishedSource();
    setButtonDone(saveAllBtn, auto ? 'Online' : 'Opgeslagen');
    setStatus(
      `${auto ? 'Automatisch opgeslagen' : 'Opgeslagen'}: ${result.entries || payload.counts.entries} planningregels en ${result.presentations || payload.counts.presentations} presentaties bijgewerkt.${autoGitMessage(result)}`,
      result.autoGit?.ok === false,
    );
    return true;
  } catch (err) {
    console.error(err);
    setStatus(`Lokaal opgeslagen, maar publiceren is mislukt: ${publishErrorMessage(err)}`, true);
    resetButton(saveAllBtn);
    return false;
  } finally {
    publishInFlight = false;
    if (publishQueuedAfterCurrent) {
      publishQueuedAfterCurrent = false;
      queueAutoPublish();
    }
  }
}

function renderSheet() {
  const layer = selectedLayer();
  editorTitle.textContent = `Jaarplanning Raster · ${planningLayerLabel(layer).toLocaleLowerCase('nl-NL')}`;
  sheetBody.innerHTML = '';

  for (const week of schoolYearWeeks()) {
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
    tr.appendChild(makeInputCell(parts.A.assessment, 'A', 'assessment', true));
    tr.appendChild(makeInputCell(parts.B.project, 'B', 'project'));
    tr.appendChild(makeInputCell(parts.B.lesson, 'B', 'lesson'));
    tr.appendChild(makeInputCell(parts.B.homework, 'B', 'homework', true));
    tr.appendChild(makeInputCell(parts.B.assessment, 'B', 'assessment', true));
    tr.appendChild(makeInputCell(parts.C.project, 'C', 'project'));
    tr.appendChild(makeInputCell(parts.C.lesson, 'C', 'lesson'));
    tr.appendChild(makeInputCell(parts.C.homework, 'C', 'homework', true));
    tr.appendChild(makeInputCell(parts.C.assessment, 'C', 'assessment', true));
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
  } else if (['A', 'B', 'C'].includes(slot) && ['project', 'lesson', 'homework', 'assessment'].includes(field)) {
    setLesson(entry, slot, field, target.value);
  }

  const hasLessons = Array.isArray(entry.lessons) && entry.lessons.length > 0;
  const hasItems = Array.isArray(entry.items) && entry.items.length > 0;
  const hasNote = Boolean(String(entry.note || '').trim());
  if (!hasLessons && !hasItems && !hasNote) {
    state.doc.entries = state.doc.entries.filter((row) => row !== entry);
  }

  saveStudio();
  renderLessonOrderPanel();
  setBusyStatus(`Gewijzigd: ${planningLayerLabel(layer).toLocaleLowerCase('nl-NL')}, week ${week}. Publiceren start automatisch.`);
  queueAutoPublish();
}

function fillLayerOptions(layers) {
  classSelect.innerHTML = '';
  for (const layer of layers) {
    const option = document.createElement('option');
    option.value = layer;
    option.textContent = planningLayerLabel(layer);
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
    let localDoc = fromStorage ? collapseToYearLayerDoc(JSON.parse(fromStorage)) : null;
    if (localDoc && !hasMentorStartweekPlanning(localDoc)) {
      localStorage.removeItem(STUDIO_KEY);
      localDoc = null;
    }
    state.doc = (localDoc && !baseShouldReplaceLocal(state.baseDoc, localDoc))
      ? localDoc
      : collapseToYearLayerDoc(baseRaw);

    const uiLayers = Object.keys(classRaw || {}).map((cid) => planningLayerFromClassId(cid)).filter(Boolean);
    const allLayers = [...new Set([...uiLayers, ...SPECIAL_PLANNING_CLASS_IDS, ...layersFromDoc(state.doc)])]
      .sort((left, right) => planningLayerLabel(left).localeCompare(planningLayerLabel(right), 'nl', { numeric: true, sensitivity: 'base' }));
    state.layers = allLayers;

    fillLayerOptions(allLayers);
    classSelect.value = allLayers[0] || '1';

    saveStudio();
    renderSheet();
    renderLessonOrderPanel();
    setStatus('Studio klaar. Excel-overzicht actief.');
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij laden studio: ${err?.message || err}`, true);
  }
}

saveAllBtn.addEventListener('click', publishAll);
exportAllBtn?.addEventListener('click', exportAll);
classSelect.addEventListener('change', renderSheet);
classSelect.addEventListener('change', renderLessonOrderPanel);

boot();
