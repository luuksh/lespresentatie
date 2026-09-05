import {
  buildProjectSnapshot,
  loadKerndoelenDoc,
  saveStoredKerndoelenDoc,
  slugifyProject,
} from './kerndoelen-data.js';

const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const PLATFORM_REFRESH_KEY = 'lespresentatie.platformRefresh';
const LESSTUDIO_CONTEXT_KEY = 'lesstudio.context';
const PLANNING_URL = 'js/jaarplanning-live.json';
const CLASSES_URL = 'js/leerlingen_per_klas.json';
const AGENDA_URL = 'js/zermelo-agenda-live.json';
const KERNDOELEN_URL = 'data/kerndoelen/kerndoelen-map.json';
const PUBLISH_ENDPOINT = 'api/presentatie-studio/publish';
const SCHOOL_YEAR_START_WEEK = 36;
const STARTWEEK_PLANNING_WEEK = 35;
const MAX_ISO_WEEK = 53;
const AUTOSAVE_DELAY_MS = 800;
const PRESENTATION_PLACEHOLDER = '[title] Intro\nsubtitle: Project\n---\n[bullets] Kern\n- punt 1\n- punt 2';
const EMPTY_PRESENTATION_PLACEHOLDER = 'Geen presentatie. Typ hier nieuwe presentatietekst om opnieuw een presentatie te maken.';
const SLOT_KEYS = ['A', 'B', 'C'];
const EXPECTED_LESSONS_BY_GRADE = { 1: 3, 3: 2, 4: 3 };
const WEEKDAYS = {
  1: 'maandag',
  2: 'dinsdag',
  3: 'woensdag',
  4: 'donderdag',
  5: 'vrijdag',
};
const DEFAULT_READING_DAYS = {
  '1C': 4,
  '1D': 4,
  '3B': 2,
  '3C': 2,
  '3E': 2,
  '3F': 4,
  '4B': 4,
  '4C': 2,
  '4.2': 4,
  '4.3': 2,
};
const BASE_SCHEDULE = {
  '1C': [
    { slot: 'A', day: 1, start: '10:50' },
    { slot: 'B', day: 2, start: '08:15' },
    { slot: 'C', day: 4, start: '12:50' },
  ],
  '1D': [
    { slot: 'A', day: 2, start: '14:40' },
    { slot: 'B', day: 4, start: '10:50' },
    { slot: 'C', day: 5, start: '08:15' },
  ],
  '3B': [
    { slot: 'A', day: 2, start: '09:00' },
    { slot: 'B', day: 5, start: '10:50' },
  ],
  '3C': [
    { slot: 'A', day: 1, start: '09:45' },
    { slot: 'B', day: 2, start: '10:50' },
  ],
  '3E': [
    { slot: 'A', day: 2, start: '09:45' },
    { slot: 'B', day: 5, start: '11:35' },
  ],
  '3F': [
    { slot: 'A', day: 1, start: '09:00' },
    { slot: 'B', day: 4, start: '11:35' },
  ],
  '4B': [
    { slot: 'A', day: 4, start: '08:15' },
    { slot: 'B', day: 4, start: '09:00' },
    { slot: 'C', day: 5, start: '09:00' },
  ],
  '4C': [
    { slot: 'A', day: 1, start: '12:50' },
    { slot: 'B', day: 1, start: '13:35' },
    { slot: 'C', day: 2, start: '12:50' },
  ],
};

const els = {
  tabs: [...document.querySelectorAll('[data-view]')],
  views: {
    studio: document.getElementById('studioView'),
    presentations: document.getElementById('presentationLibraryView'),
    curriculum: document.getElementById('curriculumView'),
    netschrift: document.getElementById('netschriftView'),
  },
  statusDot: document.getElementById('globalStatusDot'),
  statusText: document.getElementById('globalStatusText'),
  retryPublishBtn: document.getElementById('retryPublishBtn'),
  layerSelect: document.getElementById('layerSelect'),
  readingClassSelect: document.getElementById('readingClassSelect'),
  readingDaySelect: document.getElementById('readingDaySelect'),
  readingLockLine: document.getElementById('readingLockLine'),
  curriculumLayerSelect: document.getElementById('curriculumLayerSelect'),
  netschriftLayerSelect: document.getElementById('netschriftLayerSelect'),
  projectList: document.getElementById('projectList'),
  newProjectBtn: document.getElementById('newProjectBtn'),
  newLessonTopBtn: document.getElementById('newLessonTopBtn'),
  planningTitle: document.getElementById('planningTitle'),
  planningTimeline: document.getElementById('planningTimeline'),
  editorEmpty: document.getElementById('editorEmpty'),
  lessonEditor: document.getElementById('lessonEditor'),
  lessonContext: document.getElementById('lessonContext'),
  lessonTitleInput: document.getElementById('lessonTitleInput'),
  lessonProjectInput: document.getElementById('lessonProjectInput'),
  lessonWeekInput: document.getElementById('lessonWeekInput'),
  lessonKeySelect: document.getElementById('lessonKeySelect'),
  homeworkTextarea: document.getElementById('homeworkTextarea'),
  netschriftTextarea: document.getElementById('netschriftTextarea'),
  teacherNoteTextarea: document.getElementById('teacherNoteTextarea'),
  assessmentTextarea: document.getElementById('assessmentTextarea'),
  slidesTextarea: document.getElementById('slidesTextarea'),
  slidePreview: document.getElementById('slidePreview'),
  projectGoalsSummary: document.getElementById('projectGoalsSummary'),
  presentationLibrary: document.getElementById('presentationLibrary'),
  openPresentationBtn: document.getElementById('openPresentationBtn'),
  unplanLessonBtn: document.getElementById('unplanLessonBtn'),
  deletePresentationBtn: document.getElementById('deletePresentationBtn'),
  curriculumDashboard: document.getElementById('curriculumDashboard'),
  netschriftDashboard: document.getElementById('netschriftDashboard'),
  presentationDialog: document.getElementById('presentationDialog'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogStage: document.getElementById('dialogStage'),
  dialogCloseBtn: document.getElementById('dialogCloseBtn'),
  dialogPrevBtn: document.getElementById('dialogPrevBtn'),
  dialogNextBtn: document.getElementById('dialogNextBtn'),
  dialogCounter: document.getElementById('dialogCounter'),
};

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  kerndoelenDoc: null,
  agendaEntries: [],
  layers: [],
  classesByLayer: {},
  selectedLayer: '',
  selectedProject: '',
  selectedLessonKey: '',
  selectedReadingClass: '',
  selectedTab: 'studio',
  editorTab: 'presentation',
  activeSlides: [],
  activeSlideIndex: 0,
};

let autosaveTimer = null;
let publishInFlight = false;
let publishQueuedAfterCurrent = false;
let suppressEditorEvents = false;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function projectDeckId(project) {
  return `project-${slugify(project)}`;
}

function lessonMarkerId(title) {
  return `marker-${slugify(title)}`;
}

function normalizeClassId(raw) {
  const text = String(raw || '').replace(/\s+/g, '').toUpperCase();
  const prefixed = text.match(/^G([1-6][A-Z])$/);
  return prefixed ? prefixed[1] : text;
}

function gradeLayerFromClassId(rawClassId) {
  const cid = normalizeClassId(rawClassId);
  const patterns = [/^G?([1-6])[A-Z]$/, /^([1-6])\.\d+$/, /^([1-6])G\d+$/, /^([1-6])$/];
  for (const pattern of patterns) {
    const match = cid.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function planningLayerFromClassId(rawClassId) {
  const cid = normalizeClassId(rawClassId);
  if (cid === 'MENTORLES') return cid;
  return gradeLayerFromClassId(cid);
}

function layerLabel(layer) {
  return layer === 'MENTORLES' ? 'Mentorles' : `Leerjaar ${layer}`;
}

function parseWeek(weekRaw) {
  const cleaned = String(weekRaw || '').trim().toUpperCase();
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  const prefixed = cleaned.match(/^W(\d{1,2})$/);
  if (prefixed) return Number(prefixed[1]);
  const iso = cleaned.match(/^\d{4}-W(\d{1,2})$/);
  return iso ? Number(iso[1]) : NaN;
}

function academicWeekOrder(weekRaw) {
  const week = parseWeek(weekRaw);
  if (!Number.isFinite(week)) return Number.POSITIVE_INFINITY;
  if (week === STARTWEEK_PLANNING_WEEK) return -1;
  return week >= SCHOOL_YEAR_START_WEEK ? week - SCHOOL_YEAR_START_WEEK : week + (MAX_ISO_WEEK - SCHOOL_YEAR_START_WEEK + 1);
}

function currentIsoWeek() {
  const now = new Date();
  const local = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
}

function academicIsoYearForWeek(weekRaw) {
  const week = parseWeek(weekRaw);
  const currentWeek = currentIsoWeek();
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(week) || !Number.isFinite(currentWeek)) return currentYear;
  if (week === STARTWEEK_PLANNING_WEEK) return currentYear;
  if (currentWeek < SCHOOL_YEAR_START_WEEK && week >= SCHOOL_YEAR_START_WEEK) return currentYear - 1;
  if (currentWeek >= SCHOOL_YEAR_START_WEEK && week < SCHOOL_YEAR_START_WEEK) return currentYear + 1;
  return currentYear;
}

function isoWeekMonday(year, weekNumber) {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53) return null;
  const simple = new Date(year, 0, 4);
  const day = simple.getDay() || 7;
  const monday = new Date(simple);
  monday.setDate(simple.getDate() - day + 1 + ((weekNumber - 1) * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function schoolYearWeeks() {
  const regular = Array.from({ length: MAX_ISO_WEEK }, (_, index) => ((SCHOOL_YEAR_START_WEEK - 1 + index) % MAX_ISO_WEEK) + 1);
  return [STARTWEEK_PLANNING_WEEK, ...regular.filter((week) => week !== STARTWEEK_PLANNING_WEEK)];
}

function lessonStatus(lesson) {
  const firstMoment = lessonSchedulePredictions(lesson)[0]?.date || null;
  if (firstMoment) {
    const now = new Date();
    if (firstMoment < now) return { state: 'done', label: 'Geweest', icon: '✓' };
    if (firstMoment.toDateString() === now.toDateString()) return { state: 'active', label: 'Vandaag', icon: '•' };
    return { state: 'future', label: 'Komt eraan', icon: '○' };
  }
  return { state: 'future', label: 'Hierna', icon: '○' };
}

function normalizeDoc(raw) {
  const doc = raw && typeof raw === 'object' ? structuredClone(raw) : {};
  if (!Array.isArray(doc.entries)) doc.entries = [];
  if (!doc.presentations || typeof doc.presentations !== 'object') doc.presentations = {};
  doc.readingLocks = normalizeReadingLocks(doc.readingLocks);
  doc.entries = doc.entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      ...entry,
      classId: normalizeClassId(entry.classId),
      week: String(entry.week || '').trim(),
      lessons: Array.isArray(entry.lessons) ? entry.lessons.filter((lesson) => lesson && typeof lesson === 'object') : [],
      items: Array.isArray(entry.items) ? entry.items.map((item) => String(item || '').trim()).filter(Boolean) : [],
      note: String(entry.note || '').trim(),
    }))
    .filter((entry) => entry.classId && entry.week);
  return doc;
}

function semanticLessonFingerprint(lesson) {
  const project = String(lesson?.project || '').trim().toLocaleLowerCase('nl-NL');
  const title = String(lesson?.lesson || '').trim().toLocaleLowerCase('nl-NL');
  const markerId = String(lesson?.presentationMarkerId || lessonMarkerId(title)).trim().toLocaleLowerCase('nl-NL');
  return `${project}__${markerId || title}`;
}

function collapseToLayerDoc(raw) {
  const source = normalizeDoc(raw);
  const merged = new Map();
  const passthrough = [];
  for (const entry of source.entries) {
    const layer = planningLayerFromClassId(entry.classId);
    if (!layer) {
      if (entry.classId === 'ALL') passthrough.push(entry);
      continue;
    }
    const key = `${layer}__${entry.week}`;
    if (!merged.has(key)) merged.set(key, { classId: layer, week: entry.week, lessons: [], items: [], notes: [] });
    const bucket = merged.get(key);
    const seenLessons = new Set(bucket.lessons.map(semanticLessonFingerprint));
    for (const lesson of entry.lessons) {
      const fingerprint = semanticLessonFingerprint(lesson);
      if (!fingerprint || seenLessons.has(fingerprint)) continue;
      seenLessons.add(fingerprint);
      bucket.lessons.push(lesson);
    }
    for (const item of entry.items) {
      if (!bucket.items.includes(item)) bucket.items.push(item);
    }
    if (entry.note && !bucket.notes.includes(entry.note)) bucket.notes.push(entry.note);
  }
  const entries = [...merged.values()].map((entry) => {
    const out = { classId: entry.classId, week: entry.week, lessons: entry.lessons, items: entry.items };
    if (entry.notes.length) out.note = entry.notes.join(' | ');
    return out;
  });
  return { ...source, entries: [...entries, ...passthrough] };
}

function normalizeReadingLocks(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [classId, value] of Object.entries(raw)) {
    const normalizedClass = normalizeClassId(classId);
    const rawDay = value && typeof value === 'object' ? value.day || value.weekday : value;
    const day = normalizeWeekday(rawDay);
    if (normalizedClass && day) {
      const start = normalizeTime(value && typeof value === 'object' ? value.start || value.time : '');
      out[normalizedClass] = start ? { day, start } : { day };
      continue;
    }
    const lessonKey = String((value && typeof value === 'object' ? value.lessonKey || value.slot : value) || '').trim().toUpperCase();
    const slot = scheduleSlotForClassSlot(normalizedClass, lessonKey);
    if (normalizedClass && slot) out[normalizedClass] = { day: slot.day, start: slot.start };
  }
  return out;
}

function normalizeAgendaEntry(row) {
  if (!row || typeof row !== 'object') return null;
  const classId = normalizeClassId(row.classId || row.klas || row.class || '');
  const start = new Date(row.start || row.startTime || row.startDateTime || '');
  const end = new Date(row.end || row.endTime || row.endDateTime || '');
  if (!classId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    classId,
    start,
    end,
    summary: String(row.summary || row.description || '').trim(),
    description: String(row.description || '').trim(),
  };
}

function normalizeAgendaDoc(raw) {
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  return entries
    .map((entry) => normalizeAgendaEntry(entry))
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);
}

function agendaSubjectText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9.]+/g, ' ')
    .trim();
}

function isDutchAgendaEntry(entry) {
  const text = agendaSubjectText(`${entry?.summary || ''}\n${entry?.description || ''}`);
  return /\bNE\b|\bNETL\b/.test(text);
}

function normalizeWeekday(value) {
  const text = String(value || '').trim().toLocaleLowerCase('nl-NL');
  if (/^[1-5]$/.test(text)) return Number(text);
  const names = {
    maandag: 1,
    ma: 1,
    dinsdag: 2,
    di: 2,
    woensdag: 3,
    wo: 3,
    donderdag: 4,
    do: 4,
    vrijdag: 5,
    vr: 5,
  };
  return names[text] || 0;
}

function minutesFromTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeTime(value) {
  const minutes = minutesFromTime(value);
  if (!Number.isFinite(minutes)) return '';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function fetchJson(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set('_t', String(Date.now()));
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function parseDocTimestamp(doc) {
  const stamp = Date.parse(String(doc?.updatedAt || '').trim());
  return Number.isFinite(stamp) ? stamp : 0;
}

function loadStoredContext() {
  try {
    return JSON.parse(localStorage.getItem(LESSTUDIO_CONTEXT_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveContext() {
  localStorage.setItem(LESSTUDIO_CONTEXT_KEY, JSON.stringify({
    selectedLayer: state.selectedLayer,
    selectedProject: state.selectedProject,
    selectedLessonKey: state.selectedLessonKey,
    selectedReadingClass: state.selectedReadingClass,
    selectedTab: state.selectedTab,
    editorTab: state.editorTab,
  }));
}

function storedStudioDoc(baseDoc) {
  try {
    const raw = localStorage.getItem(STUDIO_KEY);
    if (!raw) return collapseToLayerDoc(baseDoc);
    const localDoc = collapseToLayerDoc(JSON.parse(raw));
    return parseDocTimestamp(localDoc) >= parseDocTimestamp(baseDoc) ? localDoc : collapseToLayerDoc(baseDoc);
  } catch {
    return collapseToLayerDoc(baseDoc);
  }
}

function setGlobalStatus(message, stateValue = 'idle') {
  els.statusText.textContent = message;
  els.statusDot.dataset.state = stateValue;
  els.retryPublishBtn.hidden = stateValue !== 'error';
}

function saveStudioCache() {
  state.doc.updatedAt = new Date().toISOString();
  localStorage.setItem(STUDIO_KEY, JSON.stringify(state.doc));
}

function projectNames() {
  const names = [
    ...visibleLessonsForLayer(state.selectedLayer).map((lesson) => lesson.project),
    ...Object.values(state.doc.presentations || {}).map((presentation) => presentation?.project || ''),
  ].map((value) => String(value || '').trim()).filter((value) => value && !isReadingProject(value));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' }));
}

function findEntry(layer, week) {
  return state.doc.entries.find((entry) => planningLayerFromClassId(entry.classId) === layer && parseWeek(entry.week) === Number(week)) || null;
}

function findOrCreateEntry(layer, week) {
  const cleanWeek = String(week || '').trim();
  let entry = findEntry(layer, cleanWeek);
  if (!entry) {
    entry = { classId: layer, week: cleanWeek, lessons: [], items: [] };
    state.doc.entries.push(entry);
  }
  if (!Array.isArray(entry.lessons)) entry.lessons = [];
  if (!Array.isArray(entry.items)) entry.items = [];
  return entry;
}

function lessonSort(left, right) {
  const weekDelta = academicWeekOrder(left.week) - academicWeekOrder(right.week);
  if (weekDelta !== 0) return weekDelta;
  return SLOT_KEYS.indexOf(left.lessonKey) - SLOT_KEYS.indexOf(right.lessonKey);
}

function getLessonsForLayer(layer) {
  if (!layer) return [];
  return state.doc.entries
    .filter((entry) => planningLayerFromClassId(entry.classId) === layer)
    .flatMap((entry) => (entry.lessons || []).map((lesson) => ({
      ...lesson,
      classId: entry.classId,
      week: String(entry.week),
      lessonKey: String(lesson.lessonKey || '').trim().toUpperCase(),
    })))
    .filter((lesson) => lesson.project || lesson.lesson)
    .sort(lessonSort);
}

function isReadingProject(project) {
  const key = String(project || '').trim().toLocaleLowerCase('nl-NL');
  return key === 'leesmeters' || key === 'heel veel lezen';
}

function visibleLessonsForLayer(layer) {
  return getLessonsForLayer(layer).filter((lesson) => !isReadingProject(lesson.project));
}

function classIdsForLayer(layer) {
  const explicit = Array.isArray(state.classesByLayer[layer]) ? state.classesByLayer[layer] : [];
  if (explicit.length) return explicit;
  return [...new Set(state.doc.entries
    .filter((entry) => planningLayerFromClassId(entry.classId) === layer && normalizeClassId(entry.classId) !== layer)
    .map((entry) => normalizeClassId(entry.classId))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' }));
}

function readingLocks() {
  state.doc.readingLocks = normalizeReadingLocks(state.doc.readingLocks);
  return state.doc.readingLocks;
}

function defaultReadingDay(classId) {
  return DEFAULT_READING_DAYS[normalizeClassId(classId)] || 0;
}

function defaultReadingMoment(classId) {
  const day = defaultReadingDay(classId);
  const slot = firstScheduleSlotForDay(classId, day);
  return slot ? { day: slot.day, start: slot.start } : { day, start: '' };
}

function readingMomentForClass(classId) {
  const normalizedClass = normalizeClassId(classId);
  const lock = readingLocks()[normalizedClass];
  if (lock?.day) return { day: lock.day, start: normalizeTime(lock.start) };
  return defaultReadingMoment(normalizedClass);
}

function readingDayForClass(classId) {
  return readingMomentForClass(classId).day || 0;
}

function setReadingMomentForClass(classId, value) {
  const normalizedClass = normalizeClassId(classId);
  if (!normalizedClass) return;
  const moment = parseReadingMomentValue(value);
  const locks = readingLocks();
  if (moment) locks[normalizedClass] = { day: moment.day, start: moment.start };
  else delete locks[normalizedClass];
}

function scheduleForClass(classId) {
  return BASE_SCHEDULE[normalizeClassId(classId)] || [];
}

function agendaReadingMomentOptionsForClass(classId) {
  const normalizedClass = normalizeClassId(classId);
  const byMoment = new Map();
  for (const entry of state.agendaEntries) {
    if (entry.classId !== normalizedClass || !isDutchAgendaEntry(entry)) continue;
    const day = entry.start.getDay() || 7;
    if (day < 1 || day > 5) continue;
    const start = normalizeTime(entry.start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
    const key = `${day}|${start}`;
    const existing = byMoment.get(key);
    if (!existing || entry.start < existing.entry.start) byMoment.set(key, { day, start, entry });
  }
  return [...byMoment.values()]
    .sort((left, right) => left.day - right.day || minutesFromTime(left.start) - minutesFromTime(right.start))
    .map((moment) => ({
      day: moment.day,
      start: moment.start,
      value: readingMomentValue(moment),
      label: `${WEEKDAYS[moment.day]} ${moment.start}`,
      source: 'zermelo',
    }));
}

function readingMomentOptionsForClass(classId) {
  const zermeloOptions = agendaReadingMomentOptionsForClass(classId);
  if (zermeloOptions.length) return zermeloOptions;
  return scheduleForClass(classId)
    .reduce((moments, slot) => {
      const day = Number(slot.day);
      const start = normalizeTime(slot.start);
      if (day >= 1 && day <= 5 && start && !moments.some((item) => item.day === day && item.start === start)) {
        moments.push({ day, start, value: `${day}|${start}`, label: `${WEEKDAYS[day]} ${start}`, source: 'roosterfallback' });
      }
      return moments;
    }, [])
    .sort((left, right) => left.day - right.day || minutesFromTime(left.start) - minutesFromTime(right.start));
}

function firstScheduleSlotForDay(classId, day) {
  const cleanDay = normalizeWeekday(day);
  return scheduleForClass(classId)
    .filter((slot) => Number(slot.day) === cleanDay)
    .sort((left, right) => minutesFromTime(left.start) - minutesFromTime(right.start))[0] || null;
}

function scheduleSlotForClassSlot(classId, lessonKey) {
  const cleanKey = String(lessonKey || '').trim().toUpperCase();
  const slot = scheduleForClass(classId).find((item) => item.slot === cleanKey);
  return slot ? { day: Number(slot.day), start: normalizeTime(slot.start), slot: slot.slot } : null;
}

function readingMomentValue(moment) {
  return moment?.day && moment?.start ? `${moment.day}|${moment.start}` : '';
}

function parseReadingMomentValue(value) {
  const [rawDay, rawStart] = String(value || '').split('|');
  const day = normalizeWeekday(rawDay);
  const start = normalizeTime(rawStart);
  return day && start ? { day, start } : null;
}

function setDateTimeFromSlot(date, slot) {
  const start = normalizeTime(slot?.start);
  const [hour, minute] = start.split(':').map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const out = new Date(date);
  out.setHours(hour, minute, 0, 0);
  return out;
}

function dateForWeekSlot(week, slot) {
  const weekNumber = parseWeek(week);
  if (!Number.isInteger(weekNumber) || !slot?.day) return null;
  if (weekNumber === STARTWEEK_PLANNING_WEEK) {
    const startweekStart = new Date(academicIsoYearForWeek(weekNumber), 8, 1);
    const date = new Date(startweekStart);
    date.setDate(startweekStart.getDate() + Math.max(0, Number(slot.day) - 1));
    return setDateTimeFromSlot(date, slot);
  }
  const monday = isoWeekMonday(academicIsoYearForWeek(weekNumber), weekNumber);
  if (!monday) return null;
  const date = new Date(monday);
  date.setDate(monday.getDate() + Number(slot.day) - 1);
  return setDateTimeFromSlot(date, slot);
}

function isReadingMomentSlot(classId, slot) {
  const readingMoment = readingMomentForClass(classId);
  return Boolean(
    readingMoment.day
    && Number(slot?.day) === Number(readingMoment.day)
    && (!readingMoment.start || normalizeTime(slot?.start) === normalizeTime(readingMoment.start)),
  );
}

function projectScheduleSlotsForClass(classId) {
  const schedule = scheduleForClass(classId).filter((slot) => !isReadingMomentSlot(classId, slot));
  return (schedule.length ? schedule : scheduleForClass(classId))
    .map((slot) => ({ ...slot, start: normalizeTime(slot.start) }))
    .filter((slot) => slot.day && slot.start)
    .sort((left, right) => Number(left.day) - Number(right.day) || minutesFromTime(left.start) - minutesFromTime(right.start));
}

function projectAgendaEntriesForClass(classId) {
  const normalizedClass = normalizeClassId(classId);
  return state.agendaEntries
    .filter((entry) => (
      normalizeClassId(entry.classId) === normalizedClass
      && isDutchAgendaEntry(entry)
      && !isReadingMomentSlot(normalizedClass, {
        day: entry.start.getDay() || 7,
        start: entry.start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      })
    ))
    .sort((left, right) => left.start - right.start);
}

function fallbackProjectMomentsForClass(classId, neededCount) {
  const slots = projectScheduleSlotsForClass(classId);
  if (!slots.length) return [];
  const moments = [];
  for (const week of schoolYearWeeks()) {
    for (const slot of slots) {
      const date = dateForWeekSlot(week, slot);
      if (!date) continue;
      moments.push({ classId: normalizeClassId(classId), date, source: 'rooster' });
      if (moments.length >= neededCount) return moments;
    }
  }
  return moments;
}

function projectMomentsForClass(classId, neededCount) {
  const agendaMoments = projectAgendaEntriesForClass(classId).map((entry) => ({
    classId: normalizeClassId(classId),
    date: entry.start,
    source: 'zermelo',
  }));
  const fallbackMoments = fallbackProjectMomentsForClass(classId, neededCount);
  const firstFallback = fallbackMoments[0]?.date || null;
  const firstAgenda = agendaMoments[0]?.date || null;
  const agendaStartsNearSchoolYearStart = firstFallback
    && firstAgenda
    && firstAgenda.getTime() <= firstFallback.getTime() + (14 * 24 * 60 * 60 * 1000);
  if (agendaMoments.length >= neededCount && agendaStartsNearSchoolYearStart) {
    return agendaMoments.slice(0, neededCount);
  }
  return fallbackMoments.length ? fallbackMoments : agendaMoments.slice(0, neededCount);
}

function lessonOrderIndex(lesson, layer = state.selectedLayer) {
  return visibleLessonsForLayer(layer).findIndex((candidate) => lessonKey(candidate) === lessonKey(lesson));
}

function lessonOrderLabel(lesson, layer = state.selectedLayer) {
  const index = lessonOrderIndex(lesson, layer);
  return index >= 0 ? `Les ${index + 1}` : 'Les';
}

function formatPredictionDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function lessonSchedulePredictions(lesson, layer = state.selectedLayer) {
  const index = lessonOrderIndex(lesson, layer);
  if (index < 0) return [];
  return classIdsForLayer(layer)
    .map((classId) => projectMomentsForClass(classId, index + 1)[index] || null)
    .filter((moment) => moment?.date && !Number.isNaN(moment.date.getTime()))
    .sort((left, right) => left.date - right.date || left.classId.localeCompare(right.classId, 'nl'));
}

function lessonPredictionSummary(lesson, layer = state.selectedLayer) {
  const predictions = lessonSchedulePredictions(lesson, layer);
  if (!predictions.length) return '';
  const visible = predictions.slice(0, 3).map((moment) => `${moment.classId} ${formatPredictionDate(moment.date)}`);
  const hiddenCount = predictions.length - visible.length;
  return `Verwacht: ${visible.join(' · ')}${hiddenCount > 0 ? ` · +${hiddenCount}` : ''}`;
}

function projectSlotKeysForLayer(layer) {
  const expected = EXPECTED_LESSONS_BY_GRADE[gradeLayerFromClassId(layer)];
  return expected ? SLOT_KEYS.slice(0, Math.max(1, expected - 1)) : SLOT_KEYS;
}

function editableSlotPositions(layer) {
  const slots = [];
  for (const week of schoolYearWeeks()) {
    const entry = findEntry(layer, week);
    for (const slot of projectSlotKeysForLayer(layer)) {
      const existing = entry?.lessons?.find((lesson) => String(lesson.lessonKey || '').trim().toUpperCase() === slot);
      if (existing && isReadingProject(existing.project)) continue;
      slots.push({ week: String(week), lessonKey: slot });
    }
  }
  return slots;
}

function editableLessonsForLayer(layer) {
  return getLessonsForLayer(layer).filter((lesson) => !isReadingProject(lesson.project));
}

function cleanupEntries() {
  state.doc.entries = state.doc.entries.filter((entry) => {
    const hasLessons = Array.isArray(entry.lessons) && entry.lessons.length;
    const hasItems = Array.isArray(entry.items) && entry.items.length;
    return hasLessons || hasItems || String(entry.note || '').trim();
  });
}

function rewriteEditableLessonOrder(layer, lessons) {
  for (const entry of state.doc.entries.filter((item) => planningLayerFromClassId(item.classId) === layer)) {
    entry.lessons = (entry.lessons || []).filter((lesson) => isReadingProject(lesson.project));
  }
  const slots = editableSlotPositions(layer);
  lessons.forEach((lesson, index) => {
    const slot = slots[index];
    if (!slot) return;
    const entry = findOrCreateEntry(layer, slot.week);
    entry.lessons = [
      ...entry.lessons.filter((candidate) => String(candidate.lessonKey || '').trim().toUpperCase() !== slot.lessonKey),
      sequenceLessonForSlot(lesson, slot.lessonKey),
    ].sort((a, b) => SLOT_KEYS.indexOf(String(a.lessonKey || '').trim().toUpperCase()) - SLOT_KEYS.indexOf(String(b.lessonKey || '').trim().toUpperCase()));
  });
  cleanupEntries();
}

function sequenceLessonForSlot(lesson, lessonKeyValue) {
  const out = { ...lesson, lessonKey: lessonKeyValue };
  delete out.preserveLessonKey;
  return out;
}

function selectedLesson() {
  return visibleLessonsForLayer(state.selectedLayer).find((lesson) => lessonKey(lesson) === state.selectedLessonKey) || null;
}

function lessonKey(lesson) {
  return `${lesson.week}__${lesson.lessonKey}__${lesson.project || ''}__${lesson.presentationMarkerId || lesson.lesson || ''}`;
}

function ensureProjectPresentation(project) {
  const deckId = projectDeckId(project);
  if (!state.doc.presentations[deckId] || typeof state.doc.presentations[deckId] !== 'object') {
    state.doc.presentations[deckId] = {
      id: deckId,
      presentationType: 'project-overview',
      title: project,
      subtitle: project,
      project,
      markerDecks: {},
      markers: {},
      slides: [],
    };
  }
  const presentation = state.doc.presentations[deckId];
  presentation.id = deckId;
  presentation.presentationType = 'project-overview';
  presentation.project = String(presentation.project || project).trim() || project;
  if (!presentation.markerDecks || typeof presentation.markerDecks !== 'object') presentation.markerDecks = {};
  if (!presentation.markers || typeof presentation.markers !== 'object') presentation.markers = {};
  return presentation;
}

function markerIdForLesson(lesson) {
  return String(lesson?.presentationMarkerId || lessonMarkerId(lesson?.lesson)).trim();
}

function deckIdForLesson(lesson) {
  const project = String(lesson?.project || '').trim();
  return String(lesson?.presentationId || projectDeckId(project)).trim();
}

function presentationForLesson(lesson) {
  const project = String(lesson?.project || '').trim();
  return state.doc.presentations?.[deckIdForLesson(lesson)] || state.doc.presentations?.[projectDeckId(project)] || null;
}

function deletedMarkerSet(presentation) {
  return new Set(Array.isArray(presentation?.deletedMarkerIds)
    ? presentation.deletedMarkerIds.map((markerId) => String(markerId || '').trim()).filter(Boolean)
    : []);
}

function orderedMarkerIds(project, presentation) {
  const deleted = deletedMarkerSet(presentation);
  const planned = visibleLessonsForLayer(state.selectedLayer)
    .filter((lesson) => String(lesson.project || '').trim() === project)
    .map(markerIdForLesson)
    .filter((markerId) => markerId && !deleted.has(markerId));
  const extras = Object.keys(presentation?.markerDecks || {}).filter((markerId) => !deleted.has(markerId));
  return [...new Set([...planned, ...extras])];
}

function compilePresentation(project) {
  const presentation = ensureProjectPresentation(project);
  const slides = [{
    type: 'title',
    title: String(presentation.title || project).trim() || project,
    subtitle: String(presentation.subtitle || project).trim() || project,
    showProjectLogo: true,
  }];
  const markers = {};
  for (const markerId of orderedMarkerIds(project, presentation)) {
    const deck = Array.isArray(presentation.markerDecks[markerId]) ? presentation.markerDecks[markerId] : [];
    if (!deck.length) continue;
    markers[markerId] = slides.length;
    slides.push(...deck.map(normalizeSlide));
  }
  presentation.slides = slides;
  presentation.markers = markers;
}

function normalizeSlide(slide) {
  return {
    type: String(slide?.type || 'title').toLowerCase() === 'bullets' ? 'bullets' : 'title',
    title: String(slide?.title || '').trim(),
    subtitle: String(slide?.subtitle || '').trim(),
    showProjectLogo: Boolean(slide?.showProjectLogo),
    items: Array.isArray(slide?.items) ? slide.items.map((item) => String(item || '').trim()).filter(Boolean) : [],
  };
}

function parseSlides(text, { fallback = true } = {}) {
  const chunks = String(text || '').split(/\n\s*---\s*\n/g).map((chunk) => chunk.trim()).filter(Boolean);
  const slides = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const head = lines[0].match(/^\[(title|bullets)\]\s*(.*)$/i);
    const slide = {
      type: head?.[1]?.toLowerCase() === 'bullets' ? 'bullets' : 'title',
      title: head ? String(head[2] || '').trim() : lines[0],
      subtitle: '',
      items: [],
    };
    for (const line of lines.slice(1)) {
      const subtitle = line.match(/^subtitle\s*:\s*(.*)$/i);
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (subtitle) slide.subtitle = String(subtitle[1] || '').trim();
      else if (bullet) slide.items.push(String(bullet[1] || '').trim());
    }
    if (slide.type === 'title') delete slide.items;
    slides.push(slide);
  }
  if (slides.length) return slides;
  return fallback ? [{ type: 'title', title: 'Nieuwe les', subtitle: '', items: [] }] : [];
}

function serializeSlides(slides) {
  return (Array.isArray(slides) ? slides : []).map((slide) => {
    const normalized = normalizeSlide(slide);
    const lines = [`[${normalized.type}] ${normalized.title}`.trim()];
    if (normalized.subtitle) lines.push(`subtitle: ${normalized.subtitle}`);
    for (const item of normalized.items) lines.push(`- ${item}`);
    return lines.join('\n');
  }).join('\n---\n');
}

function parseList(value) {
  return String(value || '').split('\n').map((line) => line.replace(/^\s*[-*•]\s+/, '').trim()).filter(Boolean);
}

function serializeList(items) {
  return (Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean).join('\n');
}

function netschriftItems(project, markerId) {
  const items = state.doc.presentations?.[projectDeckId(project)]?.lessonMeta?.[markerId]?.netschrift?.items;
  return Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function setNetschriftItems(project, markerId, items) {
  const clean = Array.isArray(items) ? items.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const presentation = ensureProjectPresentation(project);
  if (!clean.length) {
    const meta = presentation.lessonMeta?.[markerId];
    if (meta) {
      delete meta.netschrift;
      if (!Object.keys(meta).length) delete presentation.lessonMeta[markerId];
    }
    if (presentation.lessonMeta && !Object.keys(presentation.lessonMeta).length) delete presentation.lessonMeta;
    return;
  }
  if (!presentation.lessonMeta || typeof presentation.lessonMeta !== 'object') presentation.lessonMeta = {};
  if (!presentation.lessonMeta[markerId] || typeof presentation.lessonMeta[markerId] !== 'object') presentation.lessonMeta[markerId] = {};
  presentation.lessonMeta[markerId].netschrift = { items: clean };
}

function slidesForLesson(lesson) {
  const markerId = markerIdForLesson(lesson);
  const presentation = presentationForLesson(lesson);
  if (deletedMarkerSet(presentation).has(markerId)) return [];
  return Array.isArray(presentation?.markerDecks?.[markerId]) ? presentation.markerDecks[markerId] : [];
}

function markerTitleFromDeck(markerId, slides = []) {
  const first = Array.isArray(slides) ? slides.find((slide) => slide && typeof slide === 'object') : null;
  const title = String(first?.title || '').trim();
  if (title) return title;
  return String(markerId || '').replace(/^marker-/, '').replaceAll('-', ' ') || 'Presentatie';
}

function studioUrlForMarker(project, markerId) {
  const url = new URL('presentatie-studio.html', window.location.href);
  url.searchParams.set('project', project);
  url.searchParams.set('marker', markerId);
  return url.toString();
}

function renderLayerOptions() {
  for (const select of [els.layerSelect, els.curriculumLayerSelect, els.netschriftLayerSelect]) {
    select.replaceChildren();
    for (const layer of state.layers) {
      const option = document.createElement('option');
      option.value = layer;
      option.textContent = layerLabel(layer);
      select.appendChild(option);
    }
    select.value = state.selectedLayer;
  }
}

function renderReadingLocks() {
  const classes = classIdsForLayer(state.selectedLayer);
  if (!classes.length) {
    state.selectedReadingClass = '';
    els.readingClassSelect.replaceChildren();
    els.readingDaySelect.value = '';
    els.readingDaySelect.disabled = true;
    els.readingLockLine.textContent = 'Geen klassen gevonden voor deze selectie.';
    return;
  }
  if (!classes.includes(state.selectedReadingClass)) state.selectedReadingClass = classes[0];
  els.readingClassSelect.replaceChildren();
  for (const classId of classes) {
    const option = document.createElement('option');
    option.value = classId;
    option.textContent = classId;
    els.readingClassSelect.appendChild(option);
  }
  els.readingClassSelect.value = state.selectedReadingClass;
  els.readingDaySelect.disabled = false;
  const momentOptions = readingMomentOptionsForClass(state.selectedReadingClass);
  const selectedMoment = readingMomentForClass(state.selectedReadingClass);
  els.readingDaySelect.replaceChildren();
  for (const optionData of momentOptions) {
    const option = document.createElement('option');
    option.value = optionData.value;
    option.textContent = optionData.label;
    els.readingDaySelect.appendChild(option);
  }
  if (!momentOptions.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Geen Zermelo-lesmomenten gevonden';
    els.readingDaySelect.appendChild(option);
    els.readingDaySelect.disabled = true;
  }
  const selectedOption = momentOptions.find((option) => (
    option.day === selectedMoment.day && option.start === selectedMoment.start
  )) || momentOptions.find((option) => option.day === selectedMoment.day) || momentOptions[0] || null;
  els.readingDaySelect.value = selectedOption?.value || '';
  const lockSummary = Object.entries(WEEKDAYS)
    .map(([day, label]) => {
      const classMoments = classes
        .map((classId) => ({ classId, moment: readingMomentForClass(classId) }))
        .filter(({ moment }) => moment.day === Number(day));
      return classMoments.length
        ? `${label}: ${classMoments.map(({ classId, moment }) => `${classId} ${moment.start || ''}`.trim()).join(', ')}`
        : '';
    })
    .filter(Boolean)
    .join(' · ');
  const optionSource = momentOptions.some((option) => option.source === 'zermelo') ? 'Zermelo' : 'roosterfallback';
  els.readingLockLine.textContent = lockSummary
    ? `Opties uit ${optionSource}. Geblokkeerd in ${layerLabel(state.selectedLayer)}: ${lockSummary}.`
    : 'Geen vast Leesmeters-moment ingesteld voor dit leerjaar.';
}

function renderProjectList() {
  const counts = new Map();
  for (const lesson of visibleLessonsForLayer(state.selectedLayer)) {
    const project = String(lesson.project || 'Losse lessen').trim();
    counts.set(project, (counts.get(project) || 0) + 1);
  }
  const projects = projectNames();
  els.projectList.innerHTML = projects.map((project) => `
    <div class="project-nav-row${project === state.selectedProject ? ' is-active' : ''}">
      <button type="button" class="project-nav-item" data-project="${escapeHtml(project)}">
        <span>${escapeHtml(project)}</span>
        <small>${escapeHtml(counts.get(project) || 0)} lessen</small>
      </button>
      <button type="button" class="project-delete-btn" data-delete-project="${escapeHtml(project)}" title="Project verwijderen" aria-label="Project ${escapeHtml(project)} verwijderen">×</button>
    </div>
  `).join('');
  for (const button of els.projectList.querySelectorAll('[data-project]')) {
    button.addEventListener('click', () => {
      state.selectedProject = button.dataset.project || '';
      const first = visibleLessonsForLayer(state.selectedLayer).find((lesson) => lesson.project === state.selectedProject);
      if (first) state.selectedLessonKey = lessonKey(first);
      saveContext();
      renderAll();
    });
  }
  for (const button of els.projectList.querySelectorAll('[data-delete-project]')) {
    button.addEventListener('click', () => deleteProject(button.dataset.deleteProject || ''));
  }
}

function groupedLessons() {
  const groups = [];
  let current = null;
  for (const lesson of visibleLessonsForLayer(state.selectedLayer)) {
    const project = String(lesson.project || 'Losse lessen').trim();
    if (!current || current.project !== project) {
      current = { project, lessons: [] };
      groups.push(current);
    }
    current.lessons.push(lesson);
  }
  return groups;
}

function renderTimeline() {
  const lessons = visibleLessonsForLayer(state.selectedLayer);
  els.planningTitle.textContent = `${layerLabel(state.selectedLayer)} · ${lessons.length} lessen`;
  if (!lessons.length) {
    els.planningTimeline.innerHTML = '<p class="empty-state">Nog geen lessen in deze planning.</p>';
    return;
  }
  els.planningTimeline.innerHTML = groupedLessons().map((group, groupIndex) => `
    <section class="project-group" draggable="true" data-project-group="${escapeHtml(group.project)}">
      <header>
        <button type="button" data-add-lesson="${escapeHtml(group.project)}" data-insert-index="${editableIndexAfterGroup(group)}">+</button>
        <div>
          <p class="app-kicker">Project</p>
          <h3>${escapeHtml(group.project)}</h3>
        </div>
        <span>${escapeHtml(group.lessons.length)} lessen</span>
      </header>
      <div class="lesson-list">
        ${group.lessons.map((lesson) => lessonRowHtml(lesson)).join('')}
      </div>
      ${groupIndex < groupedLessons().length - 1 ? `<button type="button" class="insert-line" data-insert-index="${editableIndexAfterGroup(group)}">+ hier toevoegen</button>` : ''}
    </section>
  `).join('');
  bindTimeline();
}

function editableIndexForLesson(lesson) {
  return editableLessonsForLayer(state.selectedLayer).findIndex((candidate) => lessonKey(candidate) === lessonKey(lesson));
}

function editableIndexAfterGroup(group) {
  const indexes = group.lessons.map(editableIndexForLesson).filter((index) => index >= 0);
  return indexes.length ? Math.max(...indexes) + 1 : editableLessonsForLayer(state.selectedLayer).length;
}

function lessonRowHtml(lesson) {
  const status = lessonStatus(lesson);
  const selected = lessonKey(lesson) === state.selectedLessonKey;
  const editableIndex = editableIndexForLesson(lesson);
  const canDrag = editableIndex >= 0;
  const prediction = lessonPredictionSummary(lesson);
  return `
    <article
      class="lesson-row is-${escapeHtml(status.state)}${selected ? ' is-selected' : ''}${canDrag ? '' : ' is-locked'}"
      data-lesson-key="${escapeHtml(lessonKey(lesson))}"
      ${canDrag ? `draggable="true" data-editable-index="${editableIndex}"` : ''}
    >
      <button type="button" class="lesson-main" data-select-lesson="${escapeHtml(lessonKey(lesson))}">
        <span class="status-icon">${escapeHtml(status.icon)}</span>
        <span>
          <strong>${escapeHtml(lesson.lesson || lesson.project || 'Les zonder titel')}</strong>
          <small>${escapeHtml(lessonOrderLabel(lesson))} · ${escapeHtml(status.label)}</small>
          ${prediction ? `<small class="lesson-prediction">${escapeHtml(prediction)}</small>` : ''}
        </span>
      </button>
      <button type="button" class="insert-mini" data-insert-index="${Math.max(0, editableIndex + 1)}">+</button>
    </article>
  `;
}

function bindTimeline() {
  for (const button of els.planningTimeline.querySelectorAll('[data-select-lesson]')) {
    button.addEventListener('click', () => {
      state.selectedLessonKey = button.dataset.selectLesson || '';
      const lesson = selectedLesson();
      state.selectedProject = lesson?.project || state.selectedProject;
      saveContext();
      renderAll();
    });
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-insert-index]')) {
    button.addEventListener('click', () => createLessonAtIndex(Number(button.dataset.insertIndex || 0), button.dataset.addLesson || state.selectedProject));
  }
  bindLessonDrag();
  bindProjectDrag();
}

function bindLessonDrag() {
  let dragged = -1;
  for (const row of els.planningTimeline.querySelectorAll('[data-editable-index]')) {
    row.addEventListener('dragstart', (event) => {
      dragged = Number(row.dataset.editableIndex);
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragged));
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      els.planningTimeline.querySelectorAll('.is-drop-before,.is-drop-after').forEach((item) => item.classList.remove('is-drop-before', 'is-drop-after'));
      dragged = -1;
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      const after = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      row.classList.toggle('is-drop-before', !after);
      row.classList.toggle('is-drop-after', after);
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain') || dragged);
      const target = Number(row.dataset.editableIndex);
      const after = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      const to = after && from < target ? target : after ? target + 1 : from < target ? target - 1 : target;
      moveLesson(from, Math.max(0, to));
    });
  }
}

function bindProjectDrag() {
  let draggedProject = '';
  for (const group of els.planningTimeline.querySelectorAll('[data-project-group]')) {
    group.addEventListener('dragstart', (event) => {
      if (!event.target.closest('.project-group') || event.target.closest('.lesson-row')) return;
      draggedProject = group.dataset.projectGroup || '';
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/project', draggedProject);
      group.classList.add('is-dragging');
    });
    group.addEventListener('dragend', () => {
      group.classList.remove('is-dragging');
      draggedProject = '';
    });
    group.addEventListener('dragover', (event) => {
      if (!draggedProject) return;
      event.preventDefault();
      group.classList.add('is-project-drop');
    });
    group.addEventListener('dragleave', () => group.classList.remove('is-project-drop'));
    group.addEventListener('drop', (event) => {
      const source = event.dataTransfer.getData('text/project') || draggedProject;
      const target = group.dataset.projectGroup || '';
      group.classList.remove('is-project-drop');
      if (!source || !target || source === target) return;
      moveProject(source, target);
    });
  }
}

function moveLesson(fromIndex, toIndex) {
  const lessons = editableLessonsForLayer(state.selectedLayer);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= lessons.length || toIndex >= lessons.length || fromIndex === toIndex) return;
  const [lesson] = lessons.splice(fromIndex, 1);
  lessons.splice(toIndex, 0, lesson);
  rewriteEditableLessonOrder(state.selectedLayer, lessons);
  scheduleSave('Lesvolgorde aangepast. Publiceren...');
}

function moveProject(sourceProject, targetProject) {
  const lessons = editableLessonsForLayer(state.selectedLayer);
  const moving = lessons.filter((lesson) => lesson.project === sourceProject);
  const rest = lessons.filter((lesson) => lesson.project !== sourceProject);
  const targetIndex = rest.findIndex((lesson) => lesson.project === targetProject);
  if (!moving.length || targetIndex < 0) return;
  rest.splice(targetIndex, 0, ...moving);
  rewriteEditableLessonOrder(state.selectedLayer, rest);
  state.selectedProject = sourceProject;
  scheduleSave(`Project "${sourceProject}" verplaatst. Publiceren...`);
}

function uniqueMarkerId(presentation, title) {
  const base = lessonMarkerId(title);
  const used = new Set([...Object.keys(presentation.markerDecks || {}), ...Object.keys(presentation.markers || {})]);
  let markerId = base;
  let suffix = 2;
  while (used.has(markerId)) {
    markerId = `${base}-${suffix}`;
    suffix += 1;
  }
  return markerId;
}

function createLessonAtIndex(index, projectHint = '') {
  const title = String(window.prompt('Titel voor de nieuwe les:', 'Nieuwe les') || '').trim();
  if (!title) return;
  const project = String(projectHint || state.selectedProject || window.prompt('Project:', 'Nieuw project') || '').trim();
  if (!project) return;
  const presentation = ensureProjectPresentation(project);
  const markerId = uniqueMarkerId(presentation, title);
  presentation.markerDecks[markerId] = [{ type: 'title', title, subtitle: project }];
  const lessons = editableLessonsForLayer(state.selectedLayer);
  lessons.splice(Math.max(0, Math.min(index, lessons.length)), 0, {
    project,
    lesson: title,
    homework: '',
    assessment: '',
    teacherNote: '',
    presentationId: projectDeckId(project),
    presentationMarkerId: markerId,
  });
  rewriteEditableLessonOrder(state.selectedLayer, lessons);
  compilePresentation(project);
  const created = getLessonsForLayer(state.selectedLayer).find((lesson) => lesson.presentationMarkerId === markerId);
  state.selectedProject = project;
  state.selectedLessonKey = created ? lessonKey(created) : '';
  saveContext();
  renderAll();
  setEditorTab('presentation');
  scheduleSave(`Nieuwe les "${title}" toegevoegd. Publiceren...`);
  els.slidesTextarea.focus();
}

function createProject() {
  const name = String(window.prompt('Naam voor het nieuwe project:', 'Nieuw project') || '').trim();
  if (!name) return;
  ensureProjectPresentation(name);
  state.selectedProject = name;
  saveContext();
  renderAll();
  scheduleSave(`Project "${name}" aangemaakt. Publiceren...`);
}

function projectDeleteImpact(project) {
  const cleanProject = String(project || '').trim();
  if (!cleanProject) return { lessons: 0, presentations: [] };
  const lessons = state.doc.entries.reduce((count, entry) => (
    count + (entry.lessons || []).filter((lesson) => String(lesson.project || '').trim() === cleanProject).length
  ), 0);
  const presentations = Object.entries(state.doc.presentations || {})
    .filter(([id, presentation]) => (
      id === projectDeckId(cleanProject)
      || String(presentation?.project || '').trim() === cleanProject
      || String(presentation?.title || '').trim() === cleanProject
    ))
    .map(([id]) => id);
  return { lessons, presentations };
}

function deleteProject(project) {
  const cleanProject = String(project || '').trim();
  if (!cleanProject || isReadingProject(cleanProject)) return;
  const impact = projectDeleteImpact(cleanProject);
  const detail = [
    impact.lessons ? `${impact.lessons} geplande lessen` : '',
    impact.presentations.length ? `${impact.presentations.length} presentatie${impact.presentations.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' en ') || 'de projectkaart';
  if (!window.confirm(`Project "${cleanProject}" volledig verwijderen? Dit verwijdert ${detail}.`)) return;

  for (const entry of state.doc.entries) {
    if (!Array.isArray(entry.lessons)) continue;
    entry.lessons = entry.lessons.filter((lesson) => String(lesson.project || '').trim() !== cleanProject);
  }
  for (const id of impact.presentations) delete state.doc.presentations[id];
  cleanupEntries();

  if (state.selectedProject === cleanProject) {
    const first = visibleLessonsForLayer(state.selectedLayer)[0];
    state.selectedProject = first?.project || projectNames()[0] || '';
    state.selectedLessonKey = first ? lessonKey(first) : '';
  } else if (!selectedLesson()) {
    const first = visibleLessonsForLayer(state.selectedLayer).find((lesson) => lesson.project === state.selectedProject) || visibleLessonsForLayer(state.selectedLayer)[0];
    state.selectedLessonKey = first ? lessonKey(first) : '';
  }
  saveContext();
  renderAll();
  scheduleSave(`Project "${cleanProject}" verwijderd. Publiceren...`);
}

function renderEditor() {
  const lesson = selectedLesson();
  els.editorEmpty.hidden = Boolean(lesson);
  els.lessonEditor.hidden = !lesson;
  if (!lesson) return;
  suppressEditorEvents = true;
  const markerId = String(lesson.presentationMarkerId || lessonMarkerId(lesson.lesson)).trim();
  const slides = slidesForLesson(lesson);
  const hasPresentation = slides.length > 0;
  els.lessonContext.textContent = `${lesson.project || 'Project'} · ${lessonOrderLabel(lesson)}`;
  els.lessonTitleInput.value = lesson.lesson || '';
  els.lessonProjectInput.value = lesson.project || '';
  els.lessonWeekInput.value = lesson.week || '';
  els.lessonKeySelect.value = SLOT_KEYS.includes(lesson.lessonKey) ? lesson.lessonKey : 'A';
  els.homeworkTextarea.value = lesson.homework || '';
  els.teacherNoteTextarea.value = lesson.teacherNote || '';
  els.assessmentTextarea.value = lesson.assessment || '';
  els.netschriftTextarea.value = serializeList(netschriftItems(lesson.project, markerId));
  els.slidesTextarea.value = hasPresentation ? serializeSlides(slides) : '';
  els.slidesTextarea.placeholder = hasPresentation ? PRESENTATION_PLACEHOLDER : EMPTY_PRESENTATION_PLACEHOLDER;
  els.openPresentationBtn.disabled = !hasPresentation;
  els.deletePresentationBtn.disabled = false;
  els.deletePresentationBtn.textContent = hasPresentation ? 'Verwijder presentatie' : 'Presentatie verwijderd';
  renderSlidePreview();
  renderGoalSummary(lesson.project);
  suppressEditorEvents = false;
}

function renderGoalSummary(project) {
  const snapshot = state.kerndoelenDoc ? buildProjectSnapshot(state.kerndoelenDoc, slugifyProject(project)) : null;
  if (!snapshot) {
    els.projectGoalsSummary.innerHTML = '<p class="empty-state">Nog geen kerndoelenkaart voor dit project.</p>';
    return;
  }
  const visibleRecords = snapshot.records.slice(0, 24);
  els.projectGoalsSummary.innerHTML = `
    <div class="metric-row">
      <span>${escapeHtml(snapshot.skills.length)} vaardigheden</span>
      <span>${escapeHtml(snapshot.goals.length)} subkerndoelen</span>
      <span>${escapeHtml(snapshot.focusRecords.length)} eindlabels</span>
    </div>
    <h3>${escapeHtml(snapshot.project.name)}</h3>
    <p>${escapeHtml(snapshot.project.assessmentSummary || snapshot.project.studentFacingDescription || 'Geen samenvatting ingevuld.')}</p>
    <div class="chip-row">${snapshot.skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('') || '<span>Nog geen vaardigheden</span>'}</div>
    <div class="chip-row muted">${snapshot.goals.slice(0, 8).map((goal) => `<span>${escapeHtml(goal)}</span>`).join('') || '<span>Nog geen subkerndoelen</span>'}</div>
    <div class="goal-records">
      ${visibleRecords.map((record) => {
        const value = record.projects?.[snapshot.project.id] || '';
        return `
          <label class="goal-record">
            <span>
              <strong>${escapeHtml(record.label || record.subgoalCode || 'Doel')}</strong>
              <small>${escapeHtml([record.subgoalCode, record.magisterSkill, record.phase].filter(Boolean).join(' · ') || 'Geen detail')}</small>
            </span>
            <select data-goal-record="${escapeHtml(record.id)}" data-goal-project="${escapeHtml(snapshot.project.id)}">
              <option value=""${value ? '' : ' selected'}>Niet gekoppeld</option>
              <option value="support"${value === 'support' ? ' selected' : ''}>Ondersteunend</option>
              <option value="focus"${value === 'focus' ? ' selected' : ''}>Eindbeoordeling</option>
            </select>
          </label>
        `;
      }).join('')}
    </div>
  `;
  bindGoalRecordEditors();
}

function bindGoalRecordEditors() {
  for (const select of els.projectGoalsSummary.querySelectorAll('[data-goal-record]')) {
    select.addEventListener('change', () => {
      const record = state.kerndoelenDoc?.records?.find((item) => item.id === select.dataset.goalRecord);
      const projectId = select.dataset.goalProject || '';
      if (!record || !projectId) return;
      if (!record.projects || typeof record.projects !== 'object') record.projects = {};
      const value = String(select.value || '').trim();
      if (value) record.projects[projectId] = value;
      else delete record.projects[projectId];
      state.kerndoelenDoc = saveStoredKerndoelenDoc(state.kerndoelenDoc);
      renderGoalSummary(selectedLesson()?.project || state.selectedProject);
      renderCurriculumDashboard();
      setGlobalStatus('Kerndoelen lokaal opgeslagen · publicatie volgt bestaande kerndoelenstroom', 'success');
    });
  }
}

function currentLessonReference() {
  const lesson = selectedLesson();
  if (!lesson) return null;
  const entry = findEntry(state.selectedLayer, lesson.week);
  const item = entry?.lessons?.find((candidate) => (
    String(candidate.lessonKey || '').trim().toUpperCase() === lesson.lessonKey
    && String(candidate.presentationMarkerId || lessonMarkerId(candidate.lesson)).trim() === String(lesson.presentationMarkerId || lessonMarkerId(lesson.lesson)).trim()
  ));
  return item ? { entry, lesson: item } : null;
}

function persistEditorFields() {
  if (suppressEditorEvents) return;
  const ref = currentLessonReference();
  if (!ref) return;
  const oldProject = String(ref.lesson.project || '').trim();
  const oldMarkerId = String(ref.lesson.presentationMarkerId || lessonMarkerId(ref.lesson.lesson)).trim();
  const title = String(els.lessonTitleInput.value || '').trim() || 'Nieuwe les';
  const project = String(els.lessonProjectInput.value || oldProject).trim() || oldProject;
  const week = String(els.lessonWeekInput.value || ref.entry.week).replace(/^W/i, '').trim();
  const lessonKeyValue = String(els.lessonKeySelect.value || ref.lesson.lessonKey || 'A').trim().toUpperCase();
  const markerId = oldProject === project ? oldMarkerId : uniqueMarkerId(ensureProjectPresentation(project), title);
  const oldPresentation = ensureProjectPresentation(oldProject);
  const presentation = ensureProjectPresentation(project);
  if (oldProject !== project) {
    presentation.markerDecks[markerId] = structuredClone(oldPresentation.markerDecks?.[oldMarkerId] || [{ type: 'title', title, subtitle: project }]);
    const oldItems = netschriftItems(oldProject, oldMarkerId);
    if (oldItems.length) setNetschriftItems(project, markerId, oldItems);
  }
  const slides = parseSlides(els.slidesTextarea.value, { fallback: false });
  if (slides.length) {
    presentation.markerDecks[markerId] = slides;
    if (Array.isArray(presentation.deletedMarkerIds)) {
      presentation.deletedMarkerIds = presentation.deletedMarkerIds.filter((id) => String(id || '').trim() !== markerId);
    }
  } else {
    delete presentation.markerDecks?.[markerId];
    delete presentation.markers?.[markerId];
    if (!Array.isArray(presentation.deletedMarkerIds)) presentation.deletedMarkerIds = [];
    if (!presentation.deletedMarkerIds.includes(markerId)) presentation.deletedMarkerIds.push(markerId);
  }
  setNetschriftItems(project, markerId, parseList(els.netschriftTextarea.value));
  Object.assign(ref.lesson, {
    lessonKey: lessonKeyValue,
    project,
    lesson: title,
    homework: String(els.homeworkTextarea.value || '').trim(),
    assessment: String(els.assessmentTextarea.value || '').trim(),
    teacherNote: String(els.teacherNoteTextarea.value || '').trim(),
    presentationId: projectDeckId(project),
    presentationMarkerId: markerId,
  });
  delete ref.lesson.preserveLessonKey;
  if (week && week !== String(ref.entry.week)) {
    ref.entry.lessons = ref.entry.lessons.filter((candidate) => candidate !== ref.lesson);
    const nextEntry = findOrCreateEntry(state.selectedLayer, week);
    nextEntry.lessons = nextEntry.lessons.filter((candidate) => String(candidate.lessonKey || '').trim().toUpperCase() !== lessonKeyValue);
    nextEntry.lessons.push(ref.lesson);
    cleanupEntries();
  }
  compilePresentation(project);
  state.selectedProject = project;
  const updated = getLessonsForLayer(state.selectedLayer).find((lesson) => String(lesson.presentationMarkerId || '') === markerId);
  if (updated) state.selectedLessonKey = lessonKey(updated);
  saveContext();
  renderSlidePreview();
  scheduleSave('Wijziging opgeslagen. Publiceren...');
}

function renderSlidePreview() {
  const slides = parseSlides(els.slidesTextarea.value, { fallback: false });
  els.openPresentationBtn.disabled = !slides.length;
  els.deletePresentationBtn.disabled = false;
  if (!slides.length) {
    els.slidePreview.innerHTML = `
      <article>
        <p class="app-kicker">Preview</p>
        <h3>Geen presentatie</h3>
        <p>Deze les heeft nu geen presentatie.</p>
      </article>
    `;
    return;
  }
  const first = slides[0] || {};
  els.slidePreview.innerHTML = `
    <article>
      <p class="app-kicker">Preview</p>
      <h3>${escapeHtml(first.title || 'Nieuwe les')}</h3>
      ${first.subtitle ? `<p>${escapeHtml(first.subtitle)}</p>` : ''}
      ${Array.isArray(first.items) && first.items.length ? `<ul>${first.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    </article>
  `;
}

function scheduleSave(message) {
  try {
    saveStudioCache();
    renderProjectList();
    renderTimeline();
    renderDashboards();
    setGlobalStatus(message, 'busy');
  } catch (err) {
    console.error(err);
    setGlobalStatus(`Opslaan mislukt: ${err?.message || err}`, 'error');
    return;
  }
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    void publishAll({ auto: true });
  }, AUTOSAVE_DELAY_MS);
}

function buildExportPayload() {
  const payload = structuredClone(state.doc);
  if (Array.isArray(payload.entries)) {
    for (const entry of payload.entries) {
      if (!Array.isArray(entry?.lessons)) continue;
      for (const lesson of entry.lessons) delete lesson.preserveLessonKey;
    }
  }
  const presentations = payload.presentations || {};
  const presentationEntries = Object.entries(presentations).map(([id, presentation]) => ({
    id,
    title: String(presentation?.title || '').trim(),
    subtitle: String(presentation?.subtitle || '').trim(),
    project: String(presentation?.project || '').trim(),
    presentationType: String(presentation?.presentationType || '').trim(),
    slides: Array.isArray(presentation?.slides) ? structuredClone(presentation.slides) : [],
    markerDecks: presentation?.markerDecks && typeof presentation.markerDecks === 'object' ? structuredClone(presentation.markerDecks) : {},
    markers: presentation?.markers && typeof presentation.markers === 'object' ? structuredClone(presentation.markers) : {},
    lessonMeta: presentation?.lessonMeta && typeof presentation.lessonMeta === 'object' ? structuredClone(presentation.lessonMeta) : {},
    deletedMarkerIds: Array.isArray(presentation?.deletedMarkerIds)
      ? presentation.deletedMarkerIds.map((markerId) => String(markerId || '').trim()).filter(Boolean)
      : [],
  }));
  return {
    ...payload,
    studioSource: 'jaarplanning-studio',
    exportType: 'jaarplanning-presentaties',
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    counts: {
      entries: Array.isArray(payload.entries) ? payload.entries.length : 0,
      presentations: Object.keys(presentations).length,
    },
    presentationsExport: {
      description: 'Lesstudio export met planning, presentaties en lesmetadata.',
      totalPresentations: presentationEntries.length,
      items: presentationEntries,
    },
  };
}

async function publishAll({ auto = false } = {}) {
  if (publishInFlight) {
    publishQueuedAfterCurrent = true;
    return false;
  }
  if (window.location.protocol === 'file:') {
    setGlobalStatus('Lokaal opgeslagen · open via http://127.0.0.1:4173 om te publiceren', 'error');
    return false;
  }
  publishInFlight = true;
  setGlobalStatus(auto ? 'Publiceren...' : 'Handmatig publiceren...', 'busy');
  try {
    const response = await fetch(PUBLISH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildExportPayload()),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || `HTTP ${response.status}`);
    state.doc.sourceRevision = String(result.sourceRevision || state.doc.sourceRevision || '');
    state.doc.updatedAt = String(result.updatedAt || state.doc.updatedAt || '');
    saveStudioCache();
    localStorage.setItem(PLATFORM_REFRESH_KEY, JSON.stringify({ updatedAt: state.doc.updatedAt, sourceRevision: state.doc.sourceRevision }));
    setGlobalStatus(result.autoGit?.ok === false ? `Opgeslagen · publicatie ok · git: ${result.autoGit.message}` : 'Opgeslagen · Online', result.autoGit?.ok === false ? 'error' : 'success');
    return true;
  } catch (err) {
    console.error(err);
    setGlobalStatus(`Lokaal opgeslagen · publiceren mislukt: ${err?.message || err}`, 'error');
    return false;
  } finally {
    publishInFlight = false;
    if (publishQueuedAfterCurrent) {
      publishQueuedAfterCurrent = false;
      void publishAll({ auto: true });
    }
  }
}

function unplanSelectedLesson() {
  const ref = currentLessonReference();
  if (!ref) return;
  const title = ref.lesson.lesson || ref.lesson.project || 'deze les';
  if (!window.confirm(`"${title}" uit de planning halen? De presentatie blijft bewaard.`)) return;
  ref.entry.lessons = ref.entry.lessons.filter((lesson) => lesson !== ref.lesson);
  cleanupEntries();
  state.selectedLessonKey = '';
  saveContext();
  renderAll();
  scheduleSave(`"${title}" uit de planning gehaald. Publiceren...`);
}

function deletePresentationMarker(deckId, markerId, title) {
  const cleanDeckId = String(deckId || '').trim();
  const cleanMarkerId = String(markerId || '').trim();
  const presentation = state.doc.presentations?.[cleanDeckId];
  if (!presentation || typeof presentation !== 'object' || !cleanMarkerId) return false;
  const project = String(presentation.project || presentation.title || '').trim();
  const displayTitle = String(title || markerTitleFromDeck(cleanMarkerId, presentation.markerDecks?.[cleanMarkerId])).trim() || 'deze presentatie';
  const alreadyDeleted = deletedMarkerSet(presentation).has(cleanMarkerId) && !Array.isArray(presentation.markerDecks?.[cleanMarkerId]);
  if (alreadyDeleted) {
    setGlobalStatus(`Presentatie "${displayTitle}" was al verwijderd.`, 'success');
    return false;
  }
  if (!window.confirm(`Presentatie "${displayTitle}" echt verwijderen? De les blijft als planningregel staan.`)) return false;
  if (!Array.isArray(presentation.deletedMarkerIds)) presentation.deletedMarkerIds = [];
  if (!presentation.deletedMarkerIds.includes(cleanMarkerId)) presentation.deletedMarkerIds.push(cleanMarkerId);
  delete presentation.markerDecks?.[cleanMarkerId];
  delete presentation.markers?.[cleanMarkerId];
  if (presentation.lessonMeta?.[cleanMarkerId]) delete presentation.lessonMeta[cleanMarkerId];
  if (project && cleanDeckId === projectDeckId(project)) compilePresentation(project);
  return true;
}

function deleteSelectedPresentation() {
  const lesson = selectedLesson();
  if (!lesson) return;
  const project = String(lesson.project || '').trim();
  const explicitDeckId = deckIdForLesson(lesson);
  const deckId = state.doc.presentations?.[explicitDeckId] ? explicitDeckId : projectDeckId(project);
  if (!state.doc.presentations?.[deckId] && project) ensureProjectPresentation(project);
  const markerId = markerIdForLesson(lesson);
  const title = lesson.lesson || project || 'deze presentatie';
  if (!deletePresentationMarker(deckId, markerId, title)) return;
  renderAll();
  scheduleSave(`Presentatie "${title}" verwijderd. Publiceren...`);
}

function renderDashboards() {
  renderCurriculumDashboard();
  renderNetschriftDashboard();
}

function renderCurriculumDashboard() {
  const layer = els.curriculumLayerSelect.value || state.selectedLayer;
  const projects = [...new Set(visibleLessonsForLayer(layer).map((lesson) => lesson.project).filter(Boolean))];
  if (!state.kerndoelenDoc) {
    els.curriculumDashboard.innerHTML = '<p class="empty-state">Kerndoelen konden niet worden geladen.</p>';
    return;
  }
  const rows = projects.map((project) => ({ project, snapshot: buildProjectSnapshot(state.kerndoelenDoc, slugifyProject(project)) }));
  els.curriculumDashboard.innerHTML = rows.map(({ project, snapshot }) => `
    <article class="dashboard-card" data-dashboard-project="${escapeHtml(project)}">
      <h3>${escapeHtml(project)}</h3>
      ${snapshot ? `
        <p>${escapeHtml(snapshot.skills.length)} vaardigheden · ${escapeHtml(snapshot.goals.length)} subkerndoelen · ${escapeHtml(snapshot.focusRecords.length)} eindlabels</p>
        <div class="chip-row">${snapshot.skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('') || '<span>Geen vaardigheden</span>'}</div>
      ` : '<p>Nog geen kerndoelenkaart gekoppeld.</p>'}
    </article>
  `).join('') || '<p class="empty-state">Geen projecten voor deze selectie.</p>';
  bindDashboardProjectLinks();
}

function renderNetschriftDashboard() {
  const layer = els.netschriftLayerSelect.value || state.selectedLayer;
  const lessons = visibleLessonsForLayer(layer);
  const byProject = new Map();
  for (const lesson of lessons) {
    const markerId = String(lesson.presentationMarkerId || lessonMarkerId(lesson.lesson)).trim();
    const items = netschriftItems(lesson.project, markerId);
    if (!items.length) continue;
    if (!byProject.has(lesson.project)) byProject.set(lesson.project, []);
    byProject.get(lesson.project).push({ lesson, items });
  }
  els.netschriftDashboard.innerHTML = [...byProject.entries()].map(([project, rows]) => `
    <article class="dashboard-card wide">
      <h3>${escapeHtml(project)}</h3>
      <ol class="netschrift-list">
        ${rows.map(({ lesson, items }) => `
          <li>
            <button type="button" data-dashboard-lesson="${escapeHtml(lessonKey(lesson))}">
              ${escapeHtml(lesson.lesson || 'Les')} · ${escapeHtml(lessonOrderLabel(lesson, layer))}
            </button>
            <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </li>
        `).join('')}
      </ol>
    </article>
  `).join('') || '<p class="empty-state">Nog geen expliciete netschriftmetadata voor deze selectie.</p>';
  bindDashboardLessonLinks();
}

function allVisibleLessons() {
  return state.layers.flatMap((layer) => visibleLessonsForLayer(layer));
}

function presentationReferenceMap() {
  const refs = new Map();
  for (const lesson of allVisibleLessons()) {
    const project = String(lesson.project || '').trim();
    const deckId = deckIdForLesson(lesson) || projectDeckId(project);
    const markerId = markerIdForLesson(lesson);
    if (!deckId || !markerId) continue;
    const key = `${deckId}__${markerId}`;
    if (!refs.has(key)) refs.set(key, []);
    refs.get(key).push({ lesson, layer: planningLayerFromClassId(lesson.classId) });
  }
  return refs;
}

function presentationLibraryRows() {
  const refs = presentationReferenceMap();
  const rows = [];
  for (const [deckId, presentation] of Object.entries(state.doc.presentations || {})) {
    if (!presentation || typeof presentation !== 'object') continue;
    const project = String(presentation.project || presentation.title || deckId.replace(/^project-/, '').replaceAll('-', ' ')).trim();
    const decks = presentation.markerDecks && typeof presentation.markerDecks === 'object' ? presentation.markerDecks : {};
    const deleted = deletedMarkerSet(presentation);
    for (const [markerId, slides] of Object.entries(decks)) {
      const cleanMarkerId = String(markerId || '').trim();
      if (!cleanMarkerId || deleted.has(cleanMarkerId) || !Array.isArray(slides) || !slides.length) continue;
      const key = `${deckId}__${cleanMarkerId}`;
      const linked = refs.get(key) || refs.get(`${projectDeckId(project)}__${cleanMarkerId}`) || [];
      rows.push({
        deckId,
        markerId: cleanMarkerId,
        project,
        title: markerTitleFromDeck(cleanMarkerId, slides),
        slideCount: slides.length,
        linked,
      });
    }
  }
  return rows.sort((left, right) => (
    left.project.localeCompare(right.project, 'nl', { numeric: true, sensitivity: 'base' })
    || left.title.localeCompare(right.title, 'nl', { numeric: true, sensitivity: 'base' })
  ));
}

function renderPresentationLibrary() {
  const rows = presentationLibraryRows();
  if (!els.presentationLibrary) return;
  if (!rows.length) {
    els.presentationLibrary.innerHTML = '<p class="empty-state">Nog geen presentaties in de bibliotheek.</p>';
    return;
  }
  els.presentationLibrary.innerHTML = rows.map((row) => {
    const firstLink = row.linked[0] || null;
    const planningLabel = row.linked.length
      ? `${row.linked.length}x ingepland`
      : 'Niet ingepland';
    return `
      <article class="presentation-card">
        <div>
          <p class="app-kicker">${escapeHtml(row.project)}</p>
          <h3>${escapeHtml(row.title)}</h3>
          <p>${escapeHtml(planningLabel)} · ${escapeHtml(row.slideCount)} slide${row.slideCount === 1 ? '' : 's'}</p>
          ${row.linked.length ? `<div class="chip-row muted">${row.linked.slice(0, 4).map(({ lesson, layer }) => `<span>${escapeHtml(layerLabel(layer))} · ${escapeHtml(lessonOrderLabel(lesson, layer))}</span>`).join('')}</div>` : '<div class="chip-row muted"><span>Losse presentatie</span></div>'}
        </div>
        <div class="presentation-card-actions">
          <button type="button" data-library-open="${escapeHtml(row.deckId)}" data-library-marker="${escapeHtml(row.markerId)}">Open</button>
          ${firstLink ? `<button type="button" data-library-lesson="${escapeHtml(lessonKey(firstLink.lesson))}" data-library-layer="${escapeHtml(firstLink.layer)}">Naar les</button>` : `<a href="${escapeHtml(studioUrlForMarker(row.project, row.markerId))}">Bewerk</a>`}
          <button type="button" class="danger" data-library-delete="${escapeHtml(row.deckId)}" data-library-marker="${escapeHtml(row.markerId)}" data-library-title="${escapeHtml(row.title)}">Verwijderen</button>
        </div>
      </article>
    `;
  }).join('');
  bindPresentationLibrary();
}

function bindPresentationLibrary() {
  for (const button of els.presentationLibrary.querySelectorAll('[data-library-open]')) {
    button.addEventListener('click', () => openLibraryPresentation(button.dataset.libraryOpen || '', button.dataset.libraryMarker || ''));
  }
  for (const button of els.presentationLibrary.querySelectorAll('[data-library-lesson]')) {
    button.addEventListener('click', () => {
      state.selectedLayer = button.dataset.libraryLayer || state.selectedLayer;
      state.selectedLessonKey = button.dataset.libraryLesson || '';
      const lesson = selectedLesson();
      state.selectedProject = lesson?.project || state.selectedProject;
      setMainView('studio');
      setEditorTab('presentation');
    });
  }
  for (const button of els.presentationLibrary.querySelectorAll('[data-library-delete]')) {
    button.addEventListener('click', () => {
      const deckId = button.dataset.libraryDelete || '';
      const markerId = button.dataset.libraryMarker || '';
      const title = button.dataset.libraryTitle || '';
      if (!deletePresentationMarker(deckId, markerId, title)) return;
      renderAll();
      scheduleSave(`Presentatie "${title || markerId}" verwijderd. Publiceren...`);
    });
  }
}

function openLibraryPresentation(deckId, markerId) {
  const presentation = state.doc.presentations?.[String(deckId || '').trim()];
  const slides = Array.isArray(presentation?.markerDecks?.[markerId]) ? presentation.markerDecks[markerId] : [];
  if (!slides.length) {
    setGlobalStatus('Deze presentatie heeft geen slides meer.', 'error');
    return;
  }
  state.activeSlides = slides;
  state.activeSlideIndex = 0;
  els.dialogTitle.textContent = `${presentation.project || presentation.title || 'Presentatie'} · ${markerTitleFromDeck(markerId, slides)}`;
  renderDialogSlide();
  els.presentationDialog.showModal();
}

function bindDashboardProjectLinks() {
  for (const card of els.curriculumDashboard.querySelectorAll('[data-dashboard-project]')) {
    card.addEventListener('click', () => {
      state.selectedProject = card.dataset.dashboardProject || '';
      setMainView('studio');
    });
  }
}

function bindDashboardLessonLinks() {
  for (const button of els.netschriftDashboard.querySelectorAll('[data-dashboard-lesson]')) {
    button.addEventListener('click', () => {
      state.selectedLessonKey = button.dataset.dashboardLesson || '';
      const lesson = selectedLesson();
      state.selectedProject = lesson?.project || state.selectedProject;
      setMainView('studio');
    });
  }
}

function renderAll() {
  renderLayerOptions();
  renderReadingLocks();
  renderProjectList();
  renderTimeline();
  renderEditor();
  renderPresentationLibrary();
  renderDashboards();
}

function setMainView(view) {
  if (!els.views[view]) view = 'studio';
  state.selectedTab = view;
  for (const [key, panel] of Object.entries(els.views)) panel.hidden = key !== view;
  for (const tab of els.tabs) tab.classList.toggle('is-active', tab.dataset.view === view);
  saveContext();
  renderAll();
}

function setEditorTab(tab) {
  if (!['presentation', 'lesson', 'goals'].includes(tab)) tab = 'presentation';
  state.editorTab = tab;
  for (const button of document.querySelectorAll('[data-editor-tab]')) button.classList.toggle('is-active', button.dataset.editorTab === tab);
  for (const panel of document.querySelectorAll('[data-editor-panel]')) panel.classList.toggle('is-active', panel.dataset.editorPanel === tab);
  saveContext();
}

function openSelectedPresentation() {
  const lesson = selectedLesson();
  if (!lesson) return;
  state.activeSlides = slidesForLesson(lesson);
  if (!state.activeSlides.length) return;
  state.activeSlideIndex = 0;
  els.dialogTitle.textContent = `${lesson.project || ''} · ${lesson.lesson || 'Presentatie'}`;
  renderDialogSlide();
  els.presentationDialog.showModal();
}

function renderDialogSlide() {
  const slides = state.activeSlides;
  const slide = normalizeSlide(slides[state.activeSlideIndex] || {});
  els.dialogStage.innerHTML = `
    <article class="dialog-slide">
      <h2>${escapeHtml(slide.title || 'Presentatie')}</h2>
      ${slide.subtitle ? `<p>${escapeHtml(slide.subtitle)}</p>` : ''}
      ${slide.items.length ? `<ul>${slide.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    </article>
  `;
  els.dialogCounter.textContent = slides.length ? `${state.activeSlideIndex + 1} / ${slides.length}` : '0 / 0';
  els.dialogPrevBtn.disabled = state.activeSlideIndex <= 0;
  els.dialogNextBtn.disabled = state.activeSlideIndex >= slides.length - 1;
}

function stepDialog(delta) {
  if (!state.activeSlides.length) return;
  state.activeSlideIndex = Math.max(0, Math.min(state.activeSlides.length - 1, state.activeSlideIndex + delta));
  renderDialogSlide();
}

async function boot() {
  try {
    const [planningRaw, classRaw, agendaRaw, kerndoelenDoc] = await Promise.all([
      fetchJson(PLANNING_URL),
      fetchJson(CLASSES_URL).catch(() => ({})),
      fetchJson(AGENDA_URL).catch(() => ({ entries: [] })),
      loadKerndoelenDoc(KERNDOELEN_URL).catch(() => null),
    ]);
    state.doc = storedStudioDoc(planningRaw);
    state.kerndoelenDoc = kerndoelenDoc;
    state.agendaEntries = normalizeAgendaDoc(agendaRaw);
    const context = loadStoredContext();
    state.classesByLayer = {};
    for (const classId of Object.keys(classRaw || {}).map(normalizeClassId).filter(Boolean)) {
      const layer = planningLayerFromClassId(classId);
      if (!layer || classId === layer) continue;
      if (!state.classesByLayer[layer]) state.classesByLayer[layer] = [];
      if (!state.classesByLayer[layer].includes(classId)) state.classesByLayer[layer].push(classId);
    }
    for (const classes of Object.values(state.classesByLayer)) {
      classes.sort((a, b) => a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' }));
    }
    const classLayers = Object.keys(state.classesByLayer);
    const docLayers = state.doc.entries.map((entry) => planningLayerFromClassId(entry.classId)).filter(Boolean);
    state.layers = [...new Set([...classLayers, ...docLayers])]
      .sort((a, b) => layerLabel(a).localeCompare(layerLabel(b), 'nl', { numeric: true, sensitivity: 'base' }));
    state.selectedLayer = state.layers.includes(context.selectedLayer) ? context.selectedLayer : (state.layers[0] || '3');
    state.selectedProject = String(context.selectedProject || '').trim();
    state.selectedLessonKey = String(context.selectedLessonKey || '').trim();
    state.selectedReadingClass = String(context.selectedReadingClass || '').trim();
    state.selectedTab = String(context.selectedTab || 'studio');
    state.editorTab = String(context.editorTab || 'presentation');
    if (!state.selectedProject) state.selectedProject = projectNames()[0] || '';
    if (!selectedLesson()) {
      const first = visibleLessonsForLayer(state.selectedLayer).find((lesson) => lesson.project === state.selectedProject) || visibleLessonsForLayer(state.selectedLayer)[0];
      state.selectedLessonKey = first ? lessonKey(first) : '';
      state.selectedProject = first?.project || projectNames()[0] || '';
    }
    renderAll();
    setMainView(state.selectedTab);
    setEditorTab(state.editorTab);
    setGlobalStatus('Opgeslagen · Online', 'success');
  } catch (err) {
    console.error(err);
    setGlobalStatus(`Laden mislukt: ${err?.message || err}`, 'error');
  }
}

els.tabs.forEach((tab) => tab.addEventListener('click', () => setMainView(tab.dataset.view)));
els.layerSelect.addEventListener('change', () => {
  state.selectedLayer = els.layerSelect.value;
  const first = visibleLessonsForLayer(state.selectedLayer)[0];
  state.selectedLessonKey = first ? lessonKey(first) : '';
  state.selectedProject = first?.project || projectNames()[0] || '';
  state.selectedReadingClass = classIdsForLayer(state.selectedLayer)[0] || '';
  saveContext();
  renderAll();
});
els.readingClassSelect.addEventListener('change', () => {
  state.selectedReadingClass = els.readingClassSelect.value;
  saveContext();
  renderReadingLocks();
});
els.readingDaySelect.addEventListener('change', () => {
  setReadingMomentForClass(state.selectedReadingClass, els.readingDaySelect.value);
  saveContext();
  scheduleSave('Vast Leesmeters-moment opgeslagen. Publiceren...');
});
els.curriculumLayerSelect.addEventListener('change', () => {
  state.selectedLayer = els.curriculumLayerSelect.value;
  saveContext();
  renderAll();
});
els.netschriftLayerSelect.addEventListener('change', () => {
  state.selectedLayer = els.netschriftLayerSelect.value;
  saveContext();
  renderAll();
});
els.newLessonTopBtn.addEventListener('click', () => createLessonAtIndex(editableLessonsForLayer(state.selectedLayer).length, state.selectedProject));
els.newProjectBtn.addEventListener('click', createProject);
els.openPresentationBtn.addEventListener('click', openSelectedPresentation);
els.unplanLessonBtn.addEventListener('click', unplanSelectedLesson);
els.deletePresentationBtn.addEventListener('click', deleteSelectedPresentation);
els.retryPublishBtn.addEventListener('click', () => publishAll({ auto: false }));
els.dialogCloseBtn.addEventListener('click', () => els.presentationDialog.close());
els.dialogPrevBtn.addEventListener('click', () => stepDialog(-1));
els.dialogNextBtn.addEventListener('click', () => stepDialog(1));
document.querySelectorAll('[data-editor-tab]').forEach((button) => button.addEventListener('click', () => setEditorTab(button.dataset.editorTab)));
[
  els.lessonTitleInput,
  els.lessonProjectInput,
  els.lessonWeekInput,
  els.lessonKeySelect,
  els.homeworkTextarea,
  els.netschriftTextarea,
  els.teacherNoteTextarea,
  els.assessmentTextarea,
  els.slidesTextarea,
].forEach((input) => input.addEventListener('input', persistEditorFields));
els.lessonKeySelect.addEventListener('change', persistEditorFields);

window.addEventListener('beforeunload', () => {
  if (autosaveTimer) saveStudioCache();
});

boot();
