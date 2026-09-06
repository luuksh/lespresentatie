import {
  buildProjectSnapshot,
  loadKerndoelenDoc,
  saveStoredKerndoelenDoc,
  slugifyProject,
} from './kerndoelen-data.js';

const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const STUDIO_DIRTY_KEY = 'lespresentatie.jaarplanningStudioDirty';
const PLATFORM_REFRESH_KEY = 'lespresentatie.platformRefresh';
const LESSTUDIO_CONTEXT_KEY = 'lesstudio.context';
const PLANNING_URL = 'js/jaarplanning-live.json';
const STUDIO_DOC_ENDPOINT = 'api/studio/doc';
const CLASSES_URL = 'js/leerlingen_per_klas.json';
const AGENDA_URL = 'js/zermelo-agenda-live.json';
const KERNDOELEN_URL = 'data/kerndoelen/kerndoelen-map.json';
const PUBLISH_ENDPOINT = STUDIO_DOC_ENDPOINT;
const SCHOOL_YEAR_START_WEEK = 36;
const STARTWEEK_PLANNING_WEEK = 35;
const MAX_ISO_WEEK = 53;
const AUTOSAVE_DELAY_MS = 800;
const MENTOR_LESSON_CLASS_ID = 'MENTORLES';
const SPECIAL_PLANNING_LAYERS = [MENTOR_LESSON_CLASS_ID];
const MENTOR_STARTWEEK_PRESENTATION_ID = 'project-mentorles-1d';
const PRESENTATION_PLACEHOLDER = '[netschrift]\n- Wat moet aan het einde van deze les in het netschrift staan?\n---\n[title] Intro\nsubtitle: Project\n---\n[visual] Beeld dat de les opent\nsubtitle: Kijk eerst goed. Wat valt op?\nimage: https://voorbeeld.nl/beeld.jpg\ncaption: Korte context bij het beeld\nsource: Bron of maker\nlayout: image-right\n---\n[bullets] Kern\n- punt 1\n- punt 2\n---\n[metadata]\nvaardigheden: Schrijven; Reflectie\nkerndoelen: KD1; KD2\nsubkerndoelen: 1A; 2B';
const EMPTY_PRESENTATION_PLACEHOLDER = 'Geen presentatie. Typ hier nieuwe presentatietekst om opnieuw een presentatie te maken.';
const SLOT_KEYS = ['A', 'B', 'C'];
const MENTOR_LESSON_SLOT_KEYS = ['0', ...SLOT_KEYS];
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
const PROJECT_LOGOS = new Map([
  ['droomschool', 'droomschool.svg'],
  ['faalfestival', 'faalfestival.svg'],
  ['heel-veel-lezen', 'heel-veel-lezen.svg'],
  ['invloed', 'invloed.svg'],
  ['klasfeed', 'klasfeed.svg'],
  ['leesmeters', 'heel-veel-lezen.svg'],
  ['nutspot', 'nutspot.svg'],
  ['taalmakers', 'taalmakers.svg'],
  ['taaltopia', 'taaltopia.svg'],
  ['v-rede', 'v-rede.svg'],
  ['verweggers', 'verweggers.svg'],
]);
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
    curriculum: document.getElementById('curriculumView'),
    netschrift: document.getElementById('netschriftView'),
  },
  statusDot: document.getElementById('globalStatusDot'),
  statusText: document.getElementById('globalStatusText'),
  undoLastChangeBtn: document.getElementById('undoLastChangeBtn'),
  retryPublishBtn: document.getElementById('retryPublishBtn'),
  layerSelect: document.getElementById('layerSelect'),
  progressClassSelect: document.getElementById('progressClassSelect'),
  readingClassSelect: document.getElementById('readingClassSelect'),
  readingDaySelect: document.getElementById('readingDaySelect'),
  readingLockLine: document.getElementById('readingLockLine'),
  curriculumLayerSelect: document.getElementById('curriculumLayerSelect'),
  netschriftLayerSelect: document.getElementById('netschriftLayerSelect'),
  projectList: document.getElementById('projectList'),
  newProjectBtn: document.getElementById('newProjectBtn'),
  newLessonTopBtn: document.getElementById('newLessonTopBtn'),
  clearPlanningBtn: document.getElementById('clearPlanningBtn'),
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
  openBoardPresentationBtn: document.getElementById('openBoardPresentationBtn'),
  markLessonDoneBtn: document.getElementById('markLessonDoneBtn'),
  openNetschriftBtn: document.getElementById('openNetschriftBtn'),
  selectNextLessonBtn: document.getElementById('selectNextLessonBtn'),
  unplanLessonBtn: document.getElementById('unplanLessonBtn'),
  deletePresentationBtn: document.getElementById('deletePresentationBtn'),
  curriculumDashboard: document.getElementById('curriculumDashboard'),
  netschriftDashboard: document.getElementById('netschriftDashboard'),
  presentationDialog: document.getElementById('presentationDialog'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogFrame: document.getElementById('dialogFrame'),
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
  selectedProgressClass: '',
  selectedProject: '',
  selectedLessonKey: '',
  expandedProject: '',
  selectedReadingClass: '',
  selectedTab: 'studio',
  editorTab: 'presentation',
  activeSlides: [],
  activeSlideIndex: 0,
  undoStack: [],
};

let autosaveTimer = null;
let publishInFlight = false;
let publishQueuedAfterCurrent = false;
let suppressEditorEvents = false;
let suppressUndoPoint = false;
let lastUndoSnapshot = null;
let lastUndoFingerprint = '';
let studioDirty = false;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function projectInitials(project) {
  const words = String(project || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1
    ? words.slice(0, 2).map((word) => word[0]).join('')
    : String(words[0] || '?').slice(0, 2);
  return letters.toLocaleUpperCase('nl-NL');
}

function projectBadgeHtml(project, className = 'project-badge') {
  const slug = slugifyProject(project);
  const logo = PROJECT_LOGOS.get(slug);
  return logo
    ? `<span class="${className}" aria-hidden="true"><img src="assets/project-logos/${escapeHtml(logo)}" alt="" loading="lazy" /></span>`
    : `<span class="${className} project-badge-fallback" aria-hidden="true">${escapeHtml(projectInitials(project))}</span>`;
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
  if (cid === MENTOR_LESSON_CLASS_ID) return cid;
  return gradeLayerFromClassId(cid);
}

function layerLabel(layer) {
  return layer === MENTOR_LESSON_CLASS_ID ? 'Mentorles' : `Leerjaar ${layer}`;
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

function manualLessonStatus(lesson) {
  const value = normalizeProgressStatus(lesson?.manualStatus || lesson?.statusOverride);
  if (value === 'done' || value === 'todo') return value;
  if (lesson?.lessonDone === true || lesson?.completed === true) return 'done';
  return '';
}

function normalizeProgressStatus(value) {
  const clean = String(value || '').trim().toLowerCase();
  return clean === 'done' || clean === 'todo' ? clean : '';
}

function normalizeProgressByClass(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [classId, value] of Object.entries(raw)) {
    const cleanClass = normalizeClassId(classId);
    const cleanValue = normalizeProgressStatus(value && typeof value === 'object' ? value.status : value);
    if (cleanClass && cleanValue) out[cleanClass] = cleanValue;
  }
  return out;
}

function classProgressAliases(classId) {
  const aliases = [];
  const push = (value) => {
    const normalized = normalizeClassId(value);
    if (normalized && !aliases.includes(normalized)) aliases.push(normalized);
  };
  const clean = normalizeClassId(classId);
  push(clean);

  const lowerGrade = clean.match(/^([1-3])([A-Z])$/);
  if (lowerGrade) push(`G${lowerGrade[1]}${lowerGrade[2]}`);

  const prefixedUpperGrade = clean.match(/^G([4-6])([A-Z])$/);
  if (prefixedUpperGrade) {
    const index = prefixedUpperGrade[2].charCodeAt(0) - 64;
    push(`${prefixedUpperGrade[1]}${prefixedUpperGrade[2]}`);
    push(`${prefixedUpperGrade[1]}G${index}`);
    push(`${prefixedUpperGrade[1]}.${index}`);
  }

  const upperGrade = clean.match(/^([4-6])([A-Z])$/);
  if (upperGrade) {
    const index = upperGrade[2].charCodeAt(0) - 64;
    push(`G${upperGrade[1]}${upperGrade[2]}`);
    push(`${upperGrade[1]}G${index}`);
    push(`${upperGrade[1]}.${index}`);
  }

  const upperGradeGroup = clean.match(/^([4-6])G(\d+)$/);
  if (upperGradeGroup) {
    const letter = String.fromCharCode(64 + Number(upperGradeGroup[2]));
    push(`${upperGradeGroup[1]}${letter}`);
    push(`G${upperGradeGroup[1]}${letter}`);
    push(`${upperGradeGroup[1]}.${upperGradeGroup[2]}`);
  }

  const dotted = clean.match(/^([4-6])\.(\d+)$/);
  if (dotted) {
    const letter = String.fromCharCode(64 + Number(dotted[2]));
    push(`${dotted[1]}${letter}`);
    push(`G${dotted[1]}${letter}`);
    push(`${dotted[1]}G${dotted[2]}`);
  }

  return aliases;
}

function classIdMatches(left, right) {
  const rightAliases = classProgressAliases(right);
  return classProgressAliases(left).some((alias) => rightAliases.includes(alias));
}

function manualLessonStatusForClass(lesson, classId) {
  const progress = normalizeProgressByClass(lesson?.progressByClass);
  for (const alias of classProgressAliases(classId)) {
    const value = progress[alias];
    if (value) return value;
  }
  return manualLessonStatus(lesson);
}

function manualProgressClassKey(classId) {
  return classProgressAliases(classId)[0] || normalizeClassId(classId);
}

function selectedProgressClassForLayer(layer = state.selectedLayer) {
  const classes = classIdsForLayer(layer);
  if (classes.includes(state.selectedProgressClass)) return state.selectedProgressClass;
  return classes[0] || normalizeClassId(layer);
}

function predictionForClass(predictions, classId) {
  if (!classId) return predictions[0] || null;
  return predictions.find((moment) => classIdMatches(moment.classId, classId)) || null;
}

function lessonStatusForClass(lesson, classId, layer = state.selectedLayer, orderIndex = null) {
  const manualStatus = manualLessonStatusForClass(lesson, classId);
  if (manualStatus === 'done') return { state: 'done', label: 'Handmatig afgevinkt', icon: '✓', manual: true };
  if (manualStatus === 'todo') return { state: 'future', label: 'Handmatig open', icon: '○', manual: true };
  const predictions = Number.isInteger(orderIndex)
    ? lessonSchedulePredictionsForIndex(orderIndex, layer)
    : lessonSchedulePredictions(lesson, layer);
  const firstMoment = predictionForClass(predictions, classId)?.date || null;
  if (firstMoment) {
    const now = new Date();
    if (firstMoment < now) return { state: 'done', label: 'Geweest', icon: '✓' };
    if (firstMoment.toDateString() === now.toDateString()) return { state: 'active', label: 'Vandaag', icon: '•' };
    return { state: 'future', label: 'Komt eraan', icon: '○' };
  }
  return { state: 'future', label: 'Hierna', icon: '○' };
}

function lessonStatus(lesson, layer = state.selectedLayer, orderIndex = null) {
  return lessonStatusForClass(lesson, selectedProgressClassForLayer(layer), layer, orderIndex);
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
      lessons: Array.isArray(entry.lessons) ? entry.lessons.filter((lesson) => lesson && typeof lesson === 'object').map((lesson) => {
        const normalizedLesson = { ...lesson };
        const progressByClass = normalizeProgressByClass(normalizedLesson.progressByClass);
        if (Object.keys(progressByClass).length) normalizedLesson.progressByClass = progressByClass;
        else delete normalizedLesson.progressByClass;
        return normalizedLesson;
      }) : [],
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

function mergeLessonProgress(target, source, sourceClassId = '') {
  if (!target || !source) return;
  const merged = {
    ...normalizeProgressByClass(target.progressByClass),
    ...normalizeProgressByClass(source.progressByClass),
  };
  const legacyStatus = manualLessonStatus(source);
  const legacyClass = manualProgressClassKey(sourceClassId);
  if (legacyStatus && legacyClass && !merged[legacyClass]) merged[legacyClass] = legacyStatus;
  if (Object.keys(merged).length) target.progressByClass = merged;
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
    for (const lesson of entry.lessons) {
      const fingerprint = semanticLessonFingerprint(lesson);
      if (!fingerprint) continue;
      const existing = bucket.lessons.find((candidate) => semanticLessonFingerprint(candidate) === fingerprint);
      if (existing) {
        mergeLessonProgress(existing, lesson, entry.classId);
      } else {
        const clonedLesson = { ...lesson };
        mergeLessonProgress(clonedLesson, lesson, entry.classId);
        bucket.lessons.push(clonedLesson);
      }
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

async function fetchCentralStudioDoc() {
  if (window.location.protocol === 'file:') return fetchJson(PLANNING_URL);
  try {
    const payload = await fetchJson(STUDIO_DOC_ENDPOINT);
    if (payload?.ok === false) throw new Error(payload.error || 'Centrale opslag gaf geen geldige response.');
    const doc = payload?.doc && typeof payload.doc === 'object' ? payload.doc : payload;
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.entries)) {
      throw new Error('Centrale opslag bevat geen geldige jaarplanning.');
    }
    return doc;
  } catch (err) {
    console.warn('Centrale Lesstudio-opslag niet bereikbaar; val terug op live JSON.', err);
    return fetchJson(PLANNING_URL);
  }
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
    selectedProgressClass: state.selectedProgressClass,
    selectedProject: state.selectedProject,
    selectedLessonKey: state.selectedLessonKey,
    expandedProject: state.expandedProject,
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
    if (localStorage.getItem(STUDIO_DIRTY_KEY)) return localDoc;
    return parseDocTimestamp(localDoc) >= parseDocTimestamp(baseDoc) ? localDoc : collapseToLayerDoc(baseDoc);
  } catch {
    return collapseToLayerDoc(baseDoc);
  }
}

function teacherFriendlyStatus(message) {
  return String(message || '')
    .replaceAll('Opgeslagen · Online', 'Alles opgeslagen')
    .replaceAll('Publiceren...', 'Online zetten...')
    .replaceAll('publiceren...', 'online zetten...')
    .replaceAll('Handmatig publiceren...', 'Nu online zetten...')
    .replaceAll('Lokaal opgeslagen · publiceren mislukt:', 'Je werk is lokaal veilig · online zetten mislukt:')
    .replaceAll('Lokaal opgeslagen · open via http://127.0.0.1:4173 om te publiceren', 'Je werk is lokaal opgeslagen · open via http://127.0.0.1:4173 om online te zetten');
}

function updateUndoButton() {
  if (!els.undoLastChangeBtn) return;
  els.undoLastChangeBtn.hidden = !state.undoStack.length;
  els.undoLastChangeBtn.textContent = state.undoStack.length ? 'Herstel laatste wijziging' : 'Herstel';
}

function currentUndoSnapshot(label = 'Laatste wijziging') {
  return {
    label,
    doc: structuredClone(state.doc),
    selectedLayer: state.selectedLayer,
    selectedProgressClass: state.selectedProgressClass,
    selectedProject: state.selectedProject,
    selectedLessonKey: state.selectedLessonKey,
    expandedProject: state.expandedProject,
    selectedReadingClass: state.selectedReadingClass,
    selectedTab: state.selectedTab,
    editorTab: state.editorTab,
  };
}

function syncUndoBaseline() {
  lastUndoSnapshot = currentUndoSnapshot();
  lastUndoFingerprint = JSON.stringify(state.doc);
  updateUndoButton();
}

function rememberUndoPoint(label = 'Laatste wijziging') {
  if (suppressUndoPoint || !lastUndoSnapshot) return;
  const currentFingerprint = JSON.stringify(state.doc);
  if (currentFingerprint === lastUndoFingerprint) return;
  state.undoStack.push({ ...lastUndoSnapshot, label });
  state.undoStack = state.undoStack.slice(-12);
  syncUndoBaseline();
}

function restoreLastChange() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) return;
  suppressUndoPoint = true;
  state.doc = normalizeDoc(snapshot.doc);
  state.selectedLayer = snapshot.selectedLayer || state.selectedLayer;
  state.selectedProgressClass = snapshot.selectedProgressClass || '';
  state.selectedProject = snapshot.selectedProject || '';
  state.selectedLessonKey = snapshot.selectedLessonKey || '';
  state.expandedProject = snapshot.expandedProject || state.selectedProject;
  state.selectedReadingClass = snapshot.selectedReadingClass || '';
  state.selectedTab = snapshot.selectedTab || 'studio';
  state.editorTab = snapshot.editorTab || 'presentation';
  if (!selectedLesson()) selectNearestPlannedLesson(state.selectedProject);
  saveContext();
  renderAll();
  setMainView(state.selectedTab);
  setEditorTab(state.editorTab);
  scheduleSave('Laatste wijziging hersteld. Online zetten...');
  suppressUndoPoint = false;
  syncUndoBaseline();
}

function setGlobalStatus(message, stateValue = 'idle') {
  els.statusText.textContent = teacherFriendlyStatus(message);
  els.statusDot.dataset.state = stateValue;
  els.retryPublishBtn.hidden = stateValue !== 'error';
  updateUndoButton();
}

function saveStudioCache({ dirty = studioDirty, touch = true } = {}) {
  state.doc = collapseToLayerDoc(state.doc);
  if (touch) state.doc.updatedAt = new Date().toISOString();
  localStorage.setItem(STUDIO_KEY, JSON.stringify(state.doc));
  studioDirty = Boolean(dirty);
  if (dirty) localStorage.setItem(STUDIO_DIRTY_KEY, new Date().toISOString());
  else localStorage.removeItem(STUDIO_DIRTY_KEY);
}

function flushEditorToStudioCache() {
  const before = JSON.stringify(state.doc);
  persistEditorFields();
  const changed = JSON.stringify(state.doc) !== before || studioDirty;
  saveStudioCache({ dirty: changed, touch: changed });
}

function cleanProjectName(value) {
  return String(value || 'Losse lessen').trim() || 'Losse lessen';
}

function projectNames() {
  const orderedProjects = projectOrderForLayer(state.selectedLayer);
  const lessonProjects = [
    ...orderedProjects,
    ...Object.values(state.doc.presentations || {}).map((presentation) => presentation?.project || ''),
  ]
    .map((value) => String(value || '').trim())
    .filter((value) => value && !isReadingProject(value));
  const names = [...new Set(lessonProjects)];
  const knownOrder = new Map(orderedProjects.map((project, index) => [project, index]));
  return names.sort((left, right) => {
    const leftOrder = knownOrder.has(left) ? knownOrder.get(left) : Number.POSITIVE_INFINITY;
    const rightOrder = knownOrder.has(right) ? knownOrder.get(right) : Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.localeCompare(right, 'nl', { numeric: true, sensitivity: 'base' });
  });
}

function sameProjectName(left, right) {
  return cleanProjectName(left) === cleanProjectName(right);
}

function findEntry(layer, week) {
  return state.doc.entries.find((entry) => planningLayerFromClassId(entry.classId) === layer && parseWeek(entry.week) === Number(week)) || null;
}

function findEntryForClass(classId, week) {
  const normalizedClass = normalizeClassId(classId);
  return state.doc.entries.find((entry) => normalizeClassId(entry.classId) === normalizedClass && parseWeek(entry.week) === Number(week)) || null;
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

function findOrCreateEntryForClass(classId, week) {
  const cleanClass = normalizeClassId(classId);
  const cleanWeek = String(week || '').trim();
  let entry = findEntryForClass(cleanClass, cleanWeek);
  if (!entry) {
    entry = { classId: cleanClass, week: cleanWeek, lessons: [], items: [] };
    state.doc.entries.push(entry);
  }
  if (!Array.isArray(entry.lessons)) entry.lessons = [];
  if (!Array.isArray(entry.items)) entry.items = [];
  return entry;
}

function lessonSort(left, right) {
  const weekDelta = academicWeekOrder(left.week) - academicWeekOrder(right.week);
  if (weekDelta !== 0) return weekDelta;
  return lessonSlotOrder(left.lessonKey) - lessonSlotOrder(right.lessonKey);
}

function lessonSlotOrder(lessonKey) {
  const key = String(lessonKey || '').trim().toUpperCase();
  const mentorIndex = MENTOR_LESSON_SLOT_KEYS.indexOf(key);
  if (mentorIndex >= 0) return mentorIndex;
  return Number.POSITIVE_INFINITY;
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

function visibleLessonFingerprint(lesson) {
  return semanticLessonFingerprint(lesson) || [
    cleanProjectName(lesson?.project).toLocaleLowerCase('nl-NL'),
    String(lesson?.lesson || '').trim().toLocaleLowerCase('nl-NL'),
  ].join('__');
}

function mergedVisibleLessonsForLayer(layer) {
  if (SPECIAL_PLANNING_LAYERS.includes(normalizeClassId(layer))) return getLessonsForLayer(layer);
  const merged = new Map();
  for (const lesson of getLessonsForLayer(layer).sort(plannedLessonSort)) {
    const key = visibleLessonFingerprint(lesson);
    if (!key) continue;
    const existing = merged.get(key);
    if (existing) {
      mergeLessonProgress(existing, lesson, lesson.classId);
      continue;
    }
    const cloned = { ...lesson };
    mergeLessonProgress(cloned, lesson, lesson.classId);
    merged.set(key, cloned);
  }
  return [...merged.values()].sort(plannedLessonSort);
}

function hasMentorLessonPlanning() {
  return getLessonsForLayer(MENTOR_LESSON_CLASS_ID)
    .some((lesson) => String(lesson.presentationId || '').trim() === MENTOR_STARTWEEK_PRESENTATION_ID);
}

function isReadingProject(project) {
  const key = String(project || '').trim().toLocaleLowerCase('nl-NL');
  return key === 'leesmeters' || key === 'heel veel lezen';
}

function visibleLessonsForLayer(layer) {
  return projectOrderedLessonsForLayer(layer);
}

function projectOrderForLayer(layer) {
  const projects = [];
  for (const lesson of getLessonsForLayer(layer).sort(plannedLessonSort)) {
    const project = cleanProjectName(lesson.project);
    if (isReadingProject(project) || projects.includes(project)) continue;
    projects.push(project);
  }
  return projects;
}

function projectOrderMapForLayer(layer) {
  return new Map(projectOrderForLayer(layer).map((project, index) => [project, index]));
}

function presentationCandidatesForProject(project, preferredDeckId = '') {
  const cleanProject = String(project || '').trim();
  const candidates = [];
  const seen = new Set();
  const add = (presentation) => {
    if (!presentation || typeof presentation !== 'object') return;
    const id = String(presentation.id || '').trim();
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    candidates.push(presentation);
  };
  if (preferredDeckId) add(state.doc.presentations?.[preferredDeckId]);
  add(state.doc.presentations?.[projectDeckId(cleanProject)]);
  for (const presentation of Object.values(state.doc.presentations || {})) {
    const presentationProject = String(presentation?.project || presentation?.title || '').trim();
    if (presentationProject === cleanProject) add(presentation);
  }
  return candidates;
}

function presentationForProjectPlanning(project) {
  return presentationCandidatesForProject(project)
    .find((presentation) => projectLessonsFromPresentation(project, presentation).length) || null;
}

function lessonPlanningMeta(project, markerId) {
  for (const presentation of presentationCandidatesForProject(project)) {
    const meta = presentation?.lessonMeta?.[markerId]?.planning;
    if (meta && typeof meta === 'object') return meta;
  }
  return {};
}

function setLessonPlanningMeta(project, markerId, lesson, deckId = '') {
  const cleanProject = String(project || '').trim();
  const cleanMarkerId = String(markerId || '').trim();
  if (!cleanProject || !cleanMarkerId || !lesson) return;
  const cleanDeckId = String(deckId || '').trim();
  const presentation = state.doc.presentations?.[cleanDeckId] || ensureProjectPresentation(cleanProject);
  if (!presentation.lessonMeta || typeof presentation.lessonMeta !== 'object') presentation.lessonMeta = {};
  if (!presentation.lessonMeta[cleanMarkerId] || typeof presentation.lessonMeta[cleanMarkerId] !== 'object') {
    presentation.lessonMeta[cleanMarkerId] = {};
  }
  const progressByClass = normalizeProgressByClass(lesson.progressByClass);
  presentation.lessonMeta[cleanMarkerId].planning = {
    lesson: String(lesson.lesson || '').trim(),
    homework: String(lesson.homework || '').trim(),
    assessment: String(lesson.assessment || '').trim(),
    teacherNote: String(lesson.teacherNote || '').trim(),
  };
  if (Object.keys(progressByClass).length) {
    presentation.lessonMeta[cleanMarkerId].planning.progressByClass = progressByClass;
  }
  const legacyStatus = manualLessonStatus(lesson);
  if (legacyStatus) presentation.lessonMeta[cleanMarkerId].planning.manualStatus = legacyStatus;
}

function projectLessonsFromPresentation(project, presentation) {
  if (!presentation || typeof presentation !== 'object') return [];
  const cleanProject = String(project || presentation.project || presentation.title || '').trim();
  const deckId = String(presentation.id || projectDeckId(cleanProject)).trim();
  const deleted = deletedMarkerSet(presentation);
  return Object.entries(presentation.markerDecks || {})
    .filter(([markerId, slides]) => (
      String(markerId || '').trim()
      && !deleted.has(String(markerId || '').trim())
      && Array.isArray(slides)
      && slides.length
    ))
    .map(([markerId, slides]) => {
      const cleanMarkerId = String(markerId || '').trim();
      const meta = lessonPlanningMeta(cleanProject, cleanMarkerId);
      const lesson = {
        project: cleanProject,
        lesson: String(meta.lesson || markerTitleFromDeck(cleanMarkerId, slides)).trim() || cleanProject,
        homework: String(meta.homework || '').trim(),
        assessment: String(meta.assessment || '').trim(),
        teacherNote: String(meta.teacherNote || '').trim(),
        presentationId: deckId,
        presentationMarkerId: cleanMarkerId,
      };
      if (meta.manualStatus) lesson.manualStatus = String(meta.manualStatus).trim();
      const progressByClass = normalizeProgressByClass(meta.progressByClass);
      if (Object.keys(progressByClass).length) lesson.progressByClass = progressByClass;
      return lesson;
    });
}

function mentorLessonNumber(lesson) {
  const text = `${lesson?.lesson || ''} ${lesson?.presentationMarkerId || ''}`.toLocaleLowerCase('nl-NL');
  const mentorMatch = text.match(/\bmentorles\s*(\d+)\b/);
  if (mentorMatch) return Number(mentorMatch[1]);
  return lessonNumberFromTitle(text);
}

function mentorLessonPreference(lesson) {
  const text = `${lesson?.lesson || ''} ${lesson?.presentationMarkerId || ''}`.toLocaleLowerCase('nl-NL');
  if (/\bmentorles\s*0\b/.test(text)) return 0;
  return text.includes('kennismakingsmiddag') ? 1 : 2;
}

function ensureMentorLessonPlanning(baseDoc = null) {
  if (hasMentorLessonPlanning()) return;
  if (!state.doc.presentations || typeof state.doc.presentations !== 'object') state.doc.presentations = {};
  if (
    !state.doc.presentations[MENTOR_STARTWEEK_PRESENTATION_ID]
    && baseDoc?.presentations?.[MENTOR_STARTWEEK_PRESENTATION_ID]
  ) {
    state.doc.presentations[MENTOR_STARTWEEK_PRESENTATION_ID] = structuredClone(baseDoc.presentations[MENTOR_STARTWEEK_PRESENTATION_ID]);
  }
  const presentation = state.doc.presentations?.[MENTOR_STARTWEEK_PRESENTATION_ID];
  if (!presentation || typeof presentation !== 'object') return;

  const project = String(presentation.project || presentation.title || 'Mentorles 1D').trim();
  const byLessonNumber = new Map();
  for (const lesson of projectLessonsFromPresentation(project, presentation)) {
    const number = mentorLessonNumber(lesson);
    if (number < 0 || number > SLOT_KEYS.length) continue;
    const current = byLessonNumber.get(number);
    if (!current || mentorLessonPreference(lesson) < mentorLessonPreference(current.lesson)) {
      byLessonNumber.set(number, { lesson, number });
    }
  }
  const numberedLessons = [...byLessonNumber.values()]
    .sort((left, right) => left.number - right.number);

  if (!numberedLessons.length) return;

  state.doc.entries.push({
    classId: MENTOR_LESSON_CLASS_ID,
    week: String(STARTWEEK_PLANNING_WEEK),
    lessons: numberedLessons.map(({ lesson, number }, index) => ({
      ...lesson,
      project,
      lessonKey: number === 0 ? '0' : SLOT_KEYS[index - 1] || SLOT_KEYS[index],
      presentationId: MENTOR_STARTWEEK_PRESENTATION_ID,
    })),
    items: [],
  });
}

function plannedProjectMarkerIds(layer, project) {
  return new Set(visibleLessonsForLayer(layer)
    .filter((lesson) => sameProjectName(lesson.project, project))
    .map(markerIdForLesson)
    .filter(Boolean));
}

function projectPlanningSummary(project, layer = state.selectedLayer) {
  const presentation = presentationForProjectPlanning(project);
  const sourceLessons = projectLessonsFromPresentation(project, presentation);
  const plannedMarkers = plannedProjectMarkerIds(layer, project);
  return {
    planned: visibleLessonsForLayer(layer).filter((lesson) => sameProjectName(lesson.project, project)).length,
    source: sourceLessons.length,
    missing: sourceLessons.filter((lesson) => !plannedMarkers.has(markerIdForLesson(lesson))),
  };
}

function markerOrderIndexForLesson(lesson) {
  const project = cleanProjectName(lesson.project);
  const markerId = markerIdForLesson(lesson);
  if (!markerId) return Number.POSITIVE_INFINITY;
  for (const presentation of presentationCandidatesForProject(project, deckIdForLesson(lesson))) {
    const markerIds = Object.keys(presentation?.markerDecks || {});
    const index = markerIds.indexOf(markerId);
    if (index >= 0) return index;
  }
  return Number.POSITIVE_INFINITY;
}

function lessonTitleOrderValue(lesson) {
  const text = `${lesson?.lesson || ''} ${markerIdForLesson(lesson) || ''}`;
  const match = text.match(/\bles\s*(\d{1,3})([a-z])?\b/i);
  if (!match) return Number.POSITIVE_INFINITY;
  const suffix = match[2] ? match[2].toLowerCase().charCodeAt(0) - 96 : 0;
  return Number(match[1]) * 100 + suffix;
}

function storedSequenceValue(lesson) {
  const value = Number(lesson?.sequenceIndex);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function plannedLessonSort(left, right) {
  const leftSequence = storedSequenceValue(left);
  const rightSequence = storedSequenceValue(right);
  if (leftSequence !== rightSequence && (Number.isFinite(leftSequence) || Number.isFinite(rightSequence))) {
    return leftSequence - rightSequence;
  }
  return lessonSort(left, right);
}

function projectLessonSort(left, right) {
  const plannedDelta = plannedLessonSort(left, right);
  if (plannedDelta !== 0) return plannedDelta;
  const markerDelta = markerOrderIndexForLesson(left) - markerOrderIndexForLesson(right);
  if (markerDelta !== 0) return markerDelta;
  const titleDelta = lessonTitleOrderValue(left) - lessonTitleOrderValue(right);
  if (titleDelta !== 0) return titleDelta;
  return 0;
}

function projectOrderedLessonsForLayer(layer) {
  const projectOrder = projectOrderMapForLayer(layer);
  return mergedVisibleLessonsForLayer(layer)
    .filter((lesson) => !isReadingProject(lesson.project))
    .sort((left, right) => {
      const leftProject = cleanProjectName(left.project);
      const rightProject = cleanProjectName(right.project);
      const leftProjectOrder = projectOrder.get(leftProject) ?? Number.POSITIVE_INFINITY;
      const rightProjectOrder = projectOrder.get(rightProject) ?? Number.POSITIVE_INFINITY;
      if (leftProjectOrder !== rightProjectOrder) return leftProjectOrder - rightProjectOrder;
      const nameDelta = leftProject.localeCompare(rightProject, 'nl', { numeric: true, sensitivity: 'base' });
      if (nameDelta !== 0) return nameDelta;
      return projectLessonSort(left, right);
    });
}

function classIdsForLayer(layer) {
  if (SPECIAL_PLANNING_LAYERS.includes(normalizeClassId(layer))) return [normalizeClassId(layer)];
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
  if (agendaMoments.length && agendaStartsNearSchoolYearStart) {
    const lastAgenda = agendaMoments[agendaMoments.length - 1]?.date || null;
    const fallbackLookahead = Math.max(neededCount * 2, neededCount + agendaMoments.length + 12);
    const supplementalFallback = fallbackProjectMomentsForClass(classId, fallbackLookahead)
      .filter((moment) => lastAgenda && moment.date > lastAgenda);
    return [...agendaMoments, ...supplementalFallback].slice(0, neededCount);
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

function lessonOrderLabelForIndex(index) {
  return Number.isInteger(index) && index >= 0 ? `Les ${index + 1}` : 'Les';
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

function lessonSchedulePredictionsForIndex(index, layer = state.selectedLayer) {
  if (!Number.isInteger(index) || index < 0) return [];
  return classIdsForLayer(layer)
    .map((classId) => projectMomentsForClass(classId, index + 1)[index] || null)
    .filter((moment) => moment?.date && !Number.isNaN(moment.date.getTime()))
    .sort((left, right) => left.date - right.date || left.classId.localeCompare(right.classId, 'nl'));
}

function lessonSchedulePredictions(lesson, layer = state.selectedLayer) {
  const index = lessonOrderIndex(lesson, layer);
  return lessonSchedulePredictionsForIndex(index, layer);
}

function lessonPredictionSummary(lesson, layer = state.selectedLayer, orderIndex = null) {
  const predictions = Number.isInteger(orderIndex)
    ? lessonSchedulePredictionsForIndex(orderIndex, layer)
    : lessonSchedulePredictions(lesson, layer);
  if (!predictions.length) return '';
  const visible = predictions.slice(0, 3).map((moment) => `${moment.classId} ${formatPredictionDate(moment.date)}`);
  const hiddenCount = predictions.length - visible.length;
  return `Verwacht: ${visible.join(' · ')}${hiddenCount > 0 ? ` · +${hiddenCount}` : ''}`;
}

function formatProjectRangeDate(value, includeYear = false) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date);
}

function projectDateRangeLabel(group, layer = state.selectedLayer, startIndex = null) {
  const lessons = Array.isArray(group?.lessons) ? group.lessons : [];
  const dates = lessons
    .flatMap((lesson, lessonIndex) => (
      Number.isInteger(startIndex)
        ? lessonSchedulePredictionsForIndex(startIndex + lessonIndex, layer)
        : lessonSchedulePredictions(lesson, layer)
    ))
    .map((moment) => moment.date)
    .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
    .sort((left, right) => left - right);
  const start = dates[0] || null;
  const end = dates[dates.length - 1] || start;
  if (!start) return '';
  const includeYear = start.getFullYear() !== end.getFullYear();
  if (start.toDateString() === end.toDateString()) return formatProjectRangeDate(start, includeYear);
  return `${formatProjectRangeDate(start, includeYear)} t/m ${formatProjectRangeDate(end, includeYear)}`;
}

function projectSlotKeysForLayer(layer) {
  const expected = EXPECTED_LESSONS_BY_GRADE[gradeLayerFromClassId(layer)];
  return expected ? SLOT_KEYS.slice(0, Math.max(1, expected - 1)) : SLOT_KEYS;
}

function editableSlotPositions(layer, classId = layer) {
  const slots = [];
  const slotClassId = normalizeClassId(classId || layer);
  for (const week of schoolYearWeeks()) {
    const entry = findEntryForClass(slotClassId, week);
    for (const slot of projectSlotKeysForLayer(slotClassId || layer)) {
      const existing = entry?.lessons?.find((lesson) => String(lesson.lessonKey || '').trim().toUpperCase() === slot);
      if (existing && isReadingProject(existing.project)) continue;
      slots.push({ week: String(week), lessonKey: slot });
    }
  }
  return slots;
}

function editableLessonsForLayer(layer) {
  return visibleLessonsForLayer(layer);
}

function cleanupEntries() {
  state.doc.entries = state.doc.entries.filter((entry) => {
    const hasLessons = Array.isArray(entry.lessons) && entry.lessons.length;
    const hasItems = Array.isArray(entry.items) && entry.items.length;
    return hasLessons || hasItems || String(entry.note || '').trim();
  });
}

function plannedLessonIdentity(lesson) {
  return [
    normalizeClassId(lesson?.classId),
    String(lesson?.week || '').trim(),
    String(lesson?.lessonKey || '').trim().toUpperCase(),
    cleanProjectName(lesson?.project),
    String(lesson?.presentationMarkerId || lessonMarkerId(lesson?.lesson)).trim(),
  ].join('|');
}

function countLessonIdentities(lessons) {
  return (lessons || []).reduce((counts, lesson) => {
    const key = plannedLessonIdentity(lesson);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function removableLessonSummary(lessons) {
  return (lessons || [])
    .slice(0, 3)
    .map((lesson) => `${lesson.project || 'Project'}: ${lesson.lesson || 'les'}`)
    .join(', ');
}

function rewriteClassIdForLesson(lesson, layer) {
  const classId = normalizeClassId(lesson?.classId);
  return classId && planningLayerFromClassId(classId) === layer && classId !== layer ? classId : '';
}

function rewriteTargetClassIds(layer, lessons, existingLessons) {
  const explicit = [
    ...existingLessons,
    ...(lessons || []),
  ]
    .map((lesson) => rewriteClassIdForLesson(lesson, layer))
    .filter(Boolean);
  const known = classIdsForLayer(layer).filter((classId) => planningLayerFromClassId(classId) === layer);
  const classIds = [...new Set([...explicit, ...known])];
  return classIds.length ? classIds : [normalizeClassId(layer)];
}

function groupLessonsForRewrite(layer, lessons, classIds) {
  const grouped = new Map(classIds.map((classId) => [classId, []]));
  const fallbackClassIds = classIds.length ? classIds : [normalizeClassId(layer)];
  for (const lesson of lessons || []) {
    const classId = rewriteClassIdForLesson(lesson, layer);
    if (classId && grouped.has(classId)) {
      grouped.get(classId).push(lesson);
      continue;
    }
    for (const targetClassId of fallbackClassIds) {
      grouped.get(targetClassId).push({ ...lesson, classId: targetClassId });
    }
  }
  return grouped;
}

function rewriteEditableLessonOrder(layer, lessons, { allowRemoval = false } = {}) {
  const existingLessons = mergedVisibleLessonsForLayer(layer).filter((lesson) => !isReadingProject(lesson.project));
  if (!allowRemoval) {
    const incomingCounts = countLessonIdentities(lessons);
    const missing = [];
    for (const lesson of existingLessons) {
      const key = plannedLessonIdentity(lesson);
      const count = incomingCounts.get(key) || 0;
      if (count <= 0) missing.push(lesson);
      else incomingCounts.set(key, count - 1);
    }
    if (missing.length) {
      console.error('rewriteEditableLessonOrder blocked: planned lessons would be removed', missing);
      setGlobalStatus(`Opslaan geblokkeerd: ${missing.length} bestaande les(sen) zouden verdwijnen (${removableLessonSummary(missing)}).`, 'error');
      return false;
    }
  }
  const targetClassIds = rewriteTargetClassIds(layer, lessons, existingLessons);
  const lessonsByClass = groupLessonsForRewrite(layer, lessons, targetClassIds);
  const slotsByClass = new Map(targetClassIds.map((classId) => [classId, editableSlotPositions(layer, classId)]));
  for (const [classId, classLessons] of lessonsByClass) {
    const slots = slotsByClass.get(classId) || [];
    if (classLessons.length > slots.length) {
      setGlobalStatus(`Opslaan geblokkeerd: ${classLessons.length} lessen voor ${classId} passen niet in ${slots.length} beschikbare lesmomenten.`, 'error');
      return false;
    }
  }
  for (const entry of state.doc.entries.filter((item) => planningLayerFromClassId(item.classId) === layer)) {
    entry.lessons = (entry.lessons || []).filter((lesson) => isReadingProject(lesson.project));
  }
  for (const [classId, classLessons] of lessonsByClass) {
    const slots = slotsByClass.get(classId) || [];
    classLessons.forEach((lesson, index) => {
      const slot = slots[index];
      if (!slot) return;
      const entry = findOrCreateEntryForClass(classId, slot.week);
      entry.lessons = [
        ...entry.lessons.filter((candidate) => String(candidate.lessonKey || '').trim().toUpperCase() !== slot.lessonKey),
        sequenceLessonForSlot(lesson, slot.lessonKey, index),
      ].sort((a, b) => SLOT_KEYS.indexOf(String(a.lessonKey || '').trim().toUpperCase()) - SLOT_KEYS.indexOf(String(b.lessonKey || '').trim().toUpperCase()));
    });
  }
  cleanupEntries();
  return true;
}

function sequenceLessonForSlot(lesson, lessonKeyValue, sequenceIndex) {
  const out = { ...lesson, lessonKey: lessonKeyValue, sequenceIndex: sequenceIndex + 1 };
  delete out.preserveLessonKey;
  return out;
}

function samePlannedLesson(left, right) {
  if (!left || !right) return false;
  const leftProject = cleanProjectName(left.project);
  const rightProject = cleanProjectName(right.project);
  if (leftProject !== rightProject) return false;
  const leftMarker = String(left.presentationMarkerId || lessonMarkerId(left.lesson)).trim();
  const rightMarker = String(right.presentationMarkerId || lessonMarkerId(right.lesson)).trim();
  return leftMarker && rightMarker
    ? leftMarker === rightMarker
    : String(left.lesson || '').trim() === String(right.lesson || '').trim();
}

function visibleLessonLike(layer, reference) {
  if (!reference) return null;
  return visibleLessonsForLayer(layer).find((lesson) => samePlannedLesson(lesson, reference)) || null;
}

function firstVisibleLessonForProject(layer, project) {
  const cleanProject = cleanProjectName(project);
  return visibleLessonsForLayer(layer).find((lesson) => cleanProjectName(lesson.project) === cleanProject) || null;
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

function presentationHasMarker(presentation, markerId) {
  const cleanMarkerId = String(markerId || '').trim();
  if (!presentation || typeof presentation !== 'object' || !cleanMarkerId) return false;
  return Boolean(
    presentation.markers && Object.prototype.hasOwnProperty.call(presentation.markers, cleanMarkerId)
    || presentation.markerDecks && Object.prototype.hasOwnProperty.call(presentation.markerDecks, cleanMarkerId)
  );
}

function presentationProjectMatches(presentation, project) {
  const cleanProject = String(project || '').trim();
  if (!presentation || typeof presentation !== 'object' || !cleanProject) return false;
  return String(presentation.project || presentation.title || '').trim() === cleanProject
    || String(presentation.id || '').trim() === projectDeckId(cleanProject);
}

function addPresentationCandidate(candidates, presentation) {
  if (!presentation || typeof presentation !== 'object') return;
  if (candidates.includes(presentation)) return;
  candidates.push(presentation);
}

function presentationForProjectMarker(project, markerId, preferredDeckId = '') {
  const candidates = [];
  addPresentationCandidate(candidates, state.doc.presentations?.[String(preferredDeckId || '').trim()]);
  addPresentationCandidate(candidates, state.doc.presentations?.[projectDeckId(project)]);
  for (const presentation of Object.values(state.doc.presentations || {})) {
    if (presentationProjectMatches(presentation, project)) addPresentationCandidate(candidates, presentation);
  }

  return candidates.find((presentation) => presentationHasMarker(presentation, markerId))
    || Object.values(state.doc.presentations || {}).find((presentation) => (
      presentationProjectMatches(presentation, project)
      && presentationHasMarker(presentation, markerId)
    ))
    || Object.values(state.doc.presentations || {}).find((presentation) => presentationHasMarker(presentation, markerId))
    || candidates[0]
    || null;
}

function lessonNumberFromTitle(title) {
  const match = String(title || '').match(/\b(?:startles|les)\s*(\d+)\b/i);
  return match ? Number(match[1]) : 0;
}

function inferMarkerIdForPresentationTitle(presentation, title) {
  if (!presentation || typeof presentation !== 'object') return '';
  const lessonNumber = lessonNumberFromTitle(title);
  if (!lessonNumber) return '';

  const markerIds = [
    ...Object.keys(presentation.markerDecks || {}),
    ...Object.keys(presentation.markers || {}),
  ].filter(Boolean);

  return markerIds.find((markerId) => {
    const normalizedMarker = String(markerId || '').toLocaleLowerCase('nl-NL');
    if (new RegExp(`(?:^|-)${lessonNumber}$`).test(normalizedMarker)) return true;
    const firstSlide = Array.isArray(presentation.markerDecks?.[markerId])
      ? presentation.markerDecks[markerId].find((slide) => slide && typeof slide === 'object')
      : null;
    const slideTitle = String(`${firstSlide?.title || ''} ${firstSlide?.subtitle || ''}`).toLocaleLowerCase('nl-NL');
    return new RegExp(`\\bles\\s*${lessonNumber}\\b`, 'i').test(slideTitle);
  }) || '';
}

function presentationForLesson(lesson) {
  return presentationForProjectMarker(
    String(lesson?.project || '').trim(),
    markerIdForLesson(lesson),
    deckIdForLesson(lesson)
  );
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
  const variant = String(slide?.variant || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const rawType = String(slide?.type || 'title').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const allowedTypes = new Set(['title', 'bullets', 'visual', 'quote', 'compare', 'steps', 'question', 'task']);
  const layout = String(slide?.layout || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return {
    type: allowedTypes.has(rawType) ? rawType : 'title',
    title: String(slide?.title || '').trim(),
    subtitle: String(slide?.subtitle || '').trim(),
    showProjectLogo: Boolean(slide?.showProjectLogo),
    items: Array.isArray(slide?.items) ? slide.items.map((item) => String(item || '').trim()).filter(Boolean) : [],
    emphasis: Boolean(slide?.emphasis),
    variant,
    layout,
    kicker: String(slide?.kicker || '').trim(),
    image: String(slide?.image || '').trim(),
    imageAlt: String(slide?.imageAlt || slide?.alt || '').trim(),
    caption: String(slide?.caption || '').trim(),
    source: String(slide?.source || '').trim(),
    quote: String(slide?.quote || '').trim(),
    attribution: String(slide?.attribution || '').trim(),
  };
}

const NETSCHRIFT_STRUCTURE_TAGS = new Set(['netschrift', 'netschrift-start', 'netschrift-eind', 'netschrift-check']);
const HOMEWORK_STRUCTURE_TAGS = new Set(['huiswerk', 'homework', 'agenda']);
const CURRICULUM_STRUCTURE_TAGS = new Set(['metadata', 'meta', 'doelen', 'lesdoelen', 'curriculum']);
const CURRICULUM_FIELD_ALIASES = {
  lesdoel: 'lessonGoals',
  lesdoelen: 'lessonGoals',
  leerdoel: 'lessonGoals',
  leerdoelen: 'lessonGoals',
  vaardigheid: 'skills',
  vaardigheden: 'skills',
  skill: 'skills',
  skills: 'skills',
  kerndoel: 'kerndoelen',
  kerndoelen: 'kerndoelen',
  subkerndoel: 'subkerndoelen',
  subkerndoelen: 'subkerndoelen',
};

function cleanListItems(items) {
  return [...new Set((Array.isArray(items) ? items : [])
    .map((item) => String(item || '').replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean))];
}

function splitStructuredList(value) {
  return cleanListItems(String(value || '')
    .split(/[;\n]/)
    .flatMap((part) => part.split(/\s+\|\s+/)));
}

function parseStructureHead(line) {
  const match = String(line || '').trim().match(/^\[([a-z0-9_-]+)\]\s*(.*)$/i);
  if (!match) return null;
  return {
    tag: String(match[1] || '').trim().toLowerCase().replaceAll('_', '-'),
    title: String(match[2] || '').trim(),
  };
}

function normalizePresentationText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim().match(/^```/) ? '' : line)
    .join('\n')
    .trim();
}

function parseStructureBlockItems(lines) {
  const items = [];
  for (const line of lines) {
    const subtitle = line.match(/^subtitle\s*:\s*(.*)$/i);
    if (subtitle) {
      const value = String(subtitle[1] || '').trim();
      if (value) items.push(value);
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) items.push(String(bullet[1] || '').trim());
    else if (line && !/^[a-z][a-z\s-]*\s*:/i.test(line)) items.push(line);
  }
  return cleanListItems(items);
}

function parseCurriculumStructure(lines) {
  const out = { lessonGoals: [], skills: [], kerndoelen: [], subkerndoelen: [] };
  let activeField = 'lessonGoals';
  for (const rawLine of lines) {
    const line = String(rawLine || '').replace(/^\s*[-*•]\s+/, '').trim();
    if (!line) continue;
    const field = line.match(/^([a-zA-ZÀ-ž\s-]+)\s*:\s*(.*)$/);
    if (field) {
      const key = CURRICULUM_FIELD_ALIASES[String(field[1] || '').trim().toLowerCase()];
      if (key) {
        activeField = key;
        out[key].push(...splitStructuredList(field[2]));
        continue;
      }
    }
    out[activeField].push(line);
  }
  return {
    lessonGoals: cleanListItems(out.lessonGoals),
    skills: cleanListItems(out.skills),
    kerndoelen: cleanListItems(out.kerndoelen),
    subkerndoelen: cleanListItems(out.subkerndoelen),
  };
}

function parsePresentationStructure(text, { fallback = true } = {}) {
  const chunks = normalizePresentationText(text).split(/\n\s*---\s*\n/g).map((chunk) => chunk.trim()).filter(Boolean);
  const visibleChunks = [];
  const netschriftItems = [];
  const homeworkItems = [];
  const curriculum = { lessonGoals: [], skills: [], kerndoelen: [], subkerndoelen: [] };
  let hasHomeworkBlock = false;
  let hasCurriculumBlock = false;

  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    const head = parseStructureHead(lines[0]);
    if (!head) {
      visibleChunks.push(chunk);
      continue;
    }
    if (NETSCHRIFT_STRUCTURE_TAGS.has(head.tag)) {
      netschriftItems.push(...parseStructureBlockItems([head.title, ...lines.slice(1)].filter(Boolean)));
      continue;
    }
    if (HOMEWORK_STRUCTURE_TAGS.has(head.tag)) {
      hasHomeworkBlock = true;
      homeworkItems.push(...parseStructureBlockItems([head.title, ...lines.slice(1)].filter(Boolean)));
      continue;
    }
    if (CURRICULUM_STRUCTURE_TAGS.has(head.tag)) {
      hasCurriculumBlock = true;
      const parsed = parseCurriculumStructure(lines.slice(1));
      for (const key of Object.keys(curriculum)) curriculum[key].push(...parsed[key]);
      continue;
    }
    visibleChunks.push(chunk);
  }

  const slides = parseSlides(visibleChunks.join('\n---\n'), { fallback });
  return {
    slides,
    netschriftItems: cleanListItems(netschriftItems),
    homeworkItems: cleanListItems(homeworkItems),
    hasHomeworkBlock,
    hasCurriculumBlock,
    curriculum: {
      lessonGoals: cleanListItems(curriculum.lessonGoals),
      skills: cleanListItems(curriculum.skills),
      kerndoelen: cleanListItems(curriculum.kerndoelen),
      subkerndoelen: cleanListItems(curriculum.subkerndoelen),
    },
  };
}

function hasAutomaticLessonSlides(structure) {
  return Boolean(
    cleanListItems(structure?.netschriftItems).length
    || cleanListItems(structure?.homeworkItems).length
  );
}

function assembleRenderableLessonSlides(baseSlides, { startSlide = null, endSlide = null, homeworkSlide = null } = {}) {
  const slides = (Array.isArray(baseSlides) ? baseSlides : []).filter((slide) => slide && typeof slide === 'object');
  const out = [];
  if (slides.length) {
    out.push(slides[0]);
    if (startSlide) out.push(startSlide);
    out.push(...slides.slice(1));
  } else if (startSlide) {
    out.push(startSlide);
  }
  if (endSlide) out.push(endSlide);
  if (homeworkSlide) out.push(homeworkSlide);
  return out;
}

function renderableSlidesForStructure(structure) {
  const netschriftItems = cleanListItems(structure?.netschriftItems);
  const homeworkItems = cleanListItems(structure?.homeworkItems);
  return assembleRenderableLessonSlides(structure?.slides, {
    startSlide: netschriftItems.length ? {
      type: 'lesson-start-netschrift',
      emphasis: true,
      variant: 'netschrift',
      title: 'Opdracht netschrift',
      subtitle: 'Dit moet straks terug te vinden zijn',
      items: netschriftItems,
    } : null,
    endSlide: netschriftItems.length ? {
      type: 'lesson-end-netschrift',
      emphasis: true,
      variant: 'netschrift',
      title: 'Netschriftcheck: gelukt?',
      subtitle: 'Controleer dit voordat je afsluit',
      items: netschriftItems,
    } : null,
    homeworkSlide: homeworkItems.length ? {
      type: 'homework-preview',
      emphasis: true,
      variant: 'homework',
      title: 'Schrijf in je agenda',
      subtitle: 'Huiswerk voor de volgende keer',
      items: homeworkItems,
    } : null,
  });
}

function parseSlides(text, { fallback = true } = {}) {
  const chunks = normalizePresentationText(text).split(/\n\s*---\s*\n/g).map((chunk) => chunk.trim()).filter(Boolean);
  const slides = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const head = lines[0].match(/^\[(title|bullets|visual|quote|compare|steps|question|task)\]\s*(.*)$/i);
    const slide = {
      type: head?.[1]?.toLowerCase() || 'title',
      title: head ? String(head[2] || '').trim() : lines[0],
      subtitle: '',
      items: [],
    };
    for (const line of lines.slice(1)) {
      const field = line.match(/^([a-zA-ZÀ-ž_-]+)\s*:\s*(.*)$/);
      const bullet = line.match(/^[-*•]\s+(.*)$/);
      if (field) {
        const key = String(field[1] || '').trim().toLowerCase().replaceAll('_', '-');
        const value = String(field[2] || '').trim();
        if (key === 'subtitle') slide.subtitle = value;
        else if (key === 'variant') slide.variant = value;
        else if (key === 'layout') slide.layout = value;
        else if (key === 'kicker') slide.kicker = value;
        else if (key === 'image') slide.image = value;
        else if (key === 'image-alt' || key === 'alt') slide.imageAlt = value;
        else if (key === 'caption') slide.caption = value;
        else if (key === 'source' || key === 'bron') slide.source = value;
        else if (key === 'quote' || key === 'citaat') slide.quote = value;
        else if (key === 'attribution' || key === 'auteur') slide.attribution = value;
        else if (key === 'emphasis') slide.emphasis = /^(1|true|yes|ja)$/i.test(value);
        else if (key === 'show-project-logo') slide.showProjectLogo = /^(1|true|yes|ja)$/i.test(value);
      }
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
    if (normalized.kicker) lines.push(`kicker: ${normalized.kicker}`);
    if (normalized.variant) lines.push(`variant: ${normalized.variant}`);
    if (normalized.layout) lines.push(`layout: ${normalized.layout}`);
    if (normalized.image) lines.push(`image: ${normalized.image}`);
    if (normalized.imageAlt) lines.push(`image-alt: ${normalized.imageAlt}`);
    if (normalized.caption) lines.push(`caption: ${normalized.caption}`);
    if (normalized.source) lines.push(`source: ${normalized.source}`);
    if (normalized.quote) lines.push(`quote: ${normalized.quote}`);
    if (normalized.attribution) lines.push(`attribution: ${normalized.attribution}`);
    if (normalized.emphasis) lines.push('emphasis: true');
    if (normalized.showProjectLogo) lines.push('show-project-logo: true');
    for (const item of normalized.items) lines.push(`- ${item}`);
    return lines.join('\n');
  }).join('\n---\n');
}

function serializeStructureBlock(tag, items) {
  const clean = cleanListItems(items);
  if (!clean.length) return '';
  return [`[${tag}]`, ...clean.map((item) => `- ${item}`)].join('\n');
}

function serializeCurriculumStructure(curriculum) {
  const clean = cleanCurriculumMeta(curriculum);
  if (!hasCurriculumMeta(clean)) return '';
  const lines = ['[metadata]'];
  const add = (label, items) => {
    if (!items.length) return;
    lines.push(`${label}:`);
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  };
  add('lesdoelen', clean.lessonGoals);
  add('vaardigheden', clean.skills);
  add('kerndoelen', clean.kerndoelen);
  add('subkerndoelen', clean.subkerndoelen);
  return lines.join('\n').trim();
}

function serializePresentationInput(slides, project, markerId, lesson = null) {
  const meta = lessonStructureMeta(project, markerId);
  const blocks = [
    serializeStructureBlock('netschrift', meta?.netschrift?.items),
    serializeStructureBlock('huiswerk', meta?.homework?.items || parseList(lesson?.homework || '')),
    serializeCurriculumStructure(meta?.curriculum),
    serializeSlides(slides),
  ].filter(Boolean);
  return blocks.join('\n---\n');
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

function cleanCurriculumMeta(curriculum) {
  const source = curriculum && typeof curriculum === 'object' ? curriculum : {};
  return {
    lessonGoals: cleanListItems(source.lessonGoals),
    skills: cleanListItems(source.skills),
    kerndoelen: cleanListItems(source.kerndoelen),
    subkerndoelen: cleanListItems(source.subkerndoelen),
  };
}

function hasCurriculumMeta(curriculum) {
  const clean = cleanCurriculumMeta(curriculum);
  return Object.values(clean).some((items) => items.length);
}

function lessonMetaFor(project, markerId) {
  const cleanMarkerId = String(markerId || '').trim();
  const presentation = ensureProjectPresentation(project);
  if (!cleanMarkerId) return null;
  if (!presentation.lessonMeta || typeof presentation.lessonMeta !== 'object') presentation.lessonMeta = {};
  if (!presentation.lessonMeta[cleanMarkerId] || typeof presentation.lessonMeta[cleanMarkerId] !== 'object') {
    presentation.lessonMeta[cleanMarkerId] = {};
  }
  return presentation.lessonMeta[cleanMarkerId];
}

function cleanupLessonMeta(project, markerId) {
  const presentation = ensureProjectPresentation(project);
  const cleanMarkerId = String(markerId || '').trim();
  const meta = presentation.lessonMeta?.[cleanMarkerId];
  if (meta && !Object.keys(meta).length) delete presentation.lessonMeta[cleanMarkerId];
  if (presentation.lessonMeta && !Object.keys(presentation.lessonMeta).length) delete presentation.lessonMeta;
}

function setCurriculumMeta(project, markerId, curriculum) {
  const clean = cleanCurriculumMeta(curriculum);
  if (!hasCurriculumMeta(clean)) {
    const presentation = ensureProjectPresentation(project);
    if (presentation.lessonMeta?.[markerId]) {
      delete presentation.lessonMeta[markerId].curriculum;
      cleanupLessonMeta(project, markerId);
    }
    return;
  }
  const meta = lessonMetaFor(project, markerId);
  if (meta) meta.curriculum = clean;
}

function setHomeworkMeta(project, markerId, items) {
  const clean = cleanListItems(items);
  if (!clean.length) {
    const presentation = ensureProjectPresentation(project);
    if (presentation.lessonMeta?.[markerId]) {
      delete presentation.lessonMeta[markerId].homework;
      cleanupLessonMeta(project, markerId);
    }
    return;
  }
  const meta = lessonMetaFor(project, markerId);
  if (meta) meta.homework = { items: clean };
}

function lessonStructureMeta(project, markerId) {
  const presentation = presentationForProjectMarker(project, markerId);
  const meta = presentation?.lessonMeta?.[markerId];
  return meta && typeof meta === 'object' ? meta : {};
}

function slidesForLesson(lesson) {
  const markerId = markerIdForLesson(lesson);
  const presentation = presentationForLesson(lesson);
  const resolvedMarkerId = presentationHasMarker(presentation, markerId)
    ? markerId
    : inferMarkerIdForPresentationTitle(presentation, lesson?.lesson);
  if (deletedMarkerSet(presentation).has(resolvedMarkerId)) return [];
  return Array.isArray(presentation?.markerDecks?.[resolvedMarkerId]) ? presentation.markerDecks[resolvedMarkerId] : [];
}

function lessonHasStructuredSlides(lesson, markerId = markerIdForLesson(lesson)) {
  const meta = lessonStructureMeta(lesson?.project, markerId);
  return Boolean(
    cleanListItems(meta?.netschrift?.items).length
    || cleanListItems(meta?.homework?.items).length
    || hasCurriculumMeta(meta?.curriculum)
  );
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

function renderProgressClassOptions() {
  const classes = classIdsForLayer(state.selectedLayer);
  const fallback = normalizeClassId(state.selectedLayer);
  const options = classes.length ? classes : [fallback].filter(Boolean);
  if (!options.includes(state.selectedProgressClass)) state.selectedProgressClass = options[0] || '';
  if (!els.progressClassSelect) return;
  els.progressClassSelect.replaceChildren();
  for (const classId of options) {
    const option = document.createElement('option');
    option.value = classId;
    option.textContent = classId === MENTOR_LESSON_CLASS_ID ? 'Mentorles' : `Klas ${classId}`;
    els.progressClassSelect.appendChild(option);
  }
  els.progressClassSelect.value = state.selectedProgressClass;
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
  els.projectList.innerHTML = projects.map((project) => {
    const summary = projectPlanningSummary(project);
    const lessonCount = counts.get(project) || 0;
    const status = [
      `${lessonCount} lessen`,
      summary.missing.length ? `${summary.missing.length} niet ingepland` : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="project-nav-row${project === state.selectedProject ? ' is-active' : ''}">
        <button type="button" class="project-nav-item" data-project="${escapeHtml(project)}">
          ${projectBadgeHtml(project)}
          <span class="project-nav-text">
            <span class="project-name">${escapeHtml(project)}</span>
            <small>${escapeHtml(status)}</small>
          </span>
        </button>
        ${summary.missing.length ? `<button type="button" class="project-plan-btn" data-plan-project="${escapeHtml(project)}" title="Project in planning zetten" aria-label="Project ${escapeHtml(project)} in planning zetten">+</button>` : ''}
        <details class="danger-menu project-list-more">
          <summary>Meer</summary>
          <button type="button" class="project-delete-btn" data-delete-project="${escapeHtml(project)}" title="Project verwijderen" aria-label="Project ${escapeHtml(project)} verwijderen">Verwijderen</button>
        </details>
      </div>
    `;
  }).join('');
  for (const button of els.projectList.querySelectorAll('[data-project]')) {
    button.addEventListener('click', () => {
      state.selectedProject = button.dataset.project || '';
      state.expandedProject = state.selectedProject;
      const first = visibleLessonsForLayer(state.selectedLayer).find((lesson) => lesson.project === state.selectedProject);
      if (first) state.selectedLessonKey = lessonKey(first);
      saveContext();
      renderAll();
    });
  }
  for (const button of els.projectList.querySelectorAll('[data-plan-project]')) {
    button.addEventListener('click', () => planProjectInPlanning(button.dataset.planProject || ''));
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
  const groups = groupedLessons();
  let lessonOffset = 0;
  els.planningTimeline.innerHTML = groups.map((group, groupIndex) => {
    const isExpanded = group.project === state.expandedProject;
    const firstLessonIndex = lessonOffset;
    lessonOffset += group.lessons.length;
    const dateRange = projectDateRangeLabel(group, state.selectedLayer, firstLessonIndex);
    const summary = projectPlanningSummary(group.project);
    const missingLessons = summary.missing;
    const projectCount = [
      `${group.lessons.length} lessen`,
      missingLessons.length ? `${missingLessons.length} niet ingepland` : '',
    ].filter(Boolean).join(' · ');
    return `
    <section class="project-group${isExpanded ? ' is-expanded' : ' is-collapsed'}" draggable="true" data-project-group="${escapeHtml(group.project)}">
      <header>
        <button type="button" data-add-lesson="${escapeHtml(group.project)}" data-insert-index="${editableIndexAfterGroup(group)}">+</button>
        ${projectBadgeHtml(group.project, 'project-badge project-badge-small')}
        <button type="button" class="project-group-toggle" data-toggle-project="${escapeHtml(group.project)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
          <span class="app-kicker">Project</span>
          <span class="project-group-title">${escapeHtml(group.project)}</span>
          ${dateRange ? `<small class="project-range">Geschat: ${escapeHtml(dateRange)}</small>` : ''}
        </button>
        <span class="project-count">${escapeHtml(projectCount)}</span>
        <details class="danger-menu project-more-menu">
          <summary>Meer</summary>
          <button type="button" class="project-unplan-btn" data-unplan-project="${escapeHtml(group.project)}">Uit planning</button>
        </details>
      </header>
      <div class="lesson-list">
        ${group.lessons.map((lesson, lessonIndex) => lessonRowHtml(lesson, firstLessonIndex + lessonIndex)).join('')}
        ${missingLessons.map((lesson) => missingLessonRowHtml(lesson, editableIndexAfterGroup(group))).join('')}
      </div>
      ${groupIndex < groups.length - 1 ? `<button type="button" class="insert-line" data-insert-index="${editableIndexAfterGroup(group)}">+ hier toevoegen</button>` : ''}
    </section>
  `;
  }).join('');
  bindTimeline();
}

function editableIndexForLesson(lesson) {
  return editableLessonsForLayer(state.selectedLayer).findIndex((candidate) => lessonKey(candidate) === lessonKey(lesson));
}

function editableIndexAfterGroup(group) {
  const indexes = group.lessons.map(editableIndexForLesson).filter((index) => index >= 0);
  return indexes.length ? Math.max(...indexes) + 1 : editableLessonsForLayer(state.selectedLayer).length;
}

function lessonRowHtml(lesson, orderIndex = null) {
  const status = lessonStatus(lesson, state.selectedLayer, orderIndex);
  const selected = lessonKey(lesson) === state.selectedLessonKey;
  const key = lessonKey(lesson);
  const editableIndex = editableIndexForLesson(lesson);
  const canDrag = editableIndex >= 0;
  const prediction = lessonPredictionSummary(lesson, state.selectedLayer, orderIndex);
  const progressClass = selectedProgressClassForLayer(state.selectedLayer);
  const classStatuses = lessonClassStatusSummary(lesson, state.selectedLayer, orderIndex);
  const hasManualOverride = Boolean(manualLessonStatusForClass(lesson, progressClass));
  const toggleLabel = status.state === 'done'
    ? `Zet deze les voor ${progressClass} op niet geweest`
    : `Vink deze les af voor ${progressClass}`;
  const orderLabel = Number.isInteger(orderIndex) ? lessonOrderLabelForIndex(orderIndex) : lessonOrderLabel(lesson);
  return `
    <article
      class="lesson-row is-${escapeHtml(status.state)}${status.manual ? ' is-manual-progress' : ''}${selected ? ' is-selected' : ''}${canDrag ? '' : ' is-locked'}"
      data-lesson-key="${escapeHtml(key)}"
      ${canDrag ? `draggable="true" data-editable-index="${editableIndex}"` : ''}
    >
      <div class="status-cell">
        <button
          type="button"
          class="status-icon status-toggle"
          data-toggle-lesson-status="${escapeHtml(key)}"
          aria-label="${escapeHtml(toggleLabel)}"
          title="${escapeHtml(toggleLabel)}"
        >${escapeHtml(status.icon)}</button>
        ${hasManualOverride ? `
          <button
            type="button"
            class="status-reset"
            data-reset-lesson-status="${escapeHtml(key)}"
            aria-label="Reset voortgang voor ${escapeHtml(progressClass)} naar automatisch"
            title="Reset ${escapeHtml(progressClass)} naar automatisch"
          >↺</button>
        ` : ''}
      </div>
      <div class="lesson-main">
        <button type="button" class="lesson-select-button" data-select-lesson="${escapeHtml(key)}">
          <strong>${escapeHtml(lesson.lesson || lesson.project || 'Les zonder titel')}</strong>
          <small>${escapeHtml(orderLabel)} · ${escapeHtml(progressClass)}: ${escapeHtml(status.label)}</small>
          ${prediction ? `<small class="lesson-prediction">${escapeHtml(prediction)}</small>` : ''}
        </button>
        ${classStatuses.length ? `<span class="class-progress-row">${classStatuses.map(({ classId, itemStatus }) => {
            const classToggleLabel = itemStatus.state === 'done'
              ? `Zet deze les voor ${classId} op niet geweest`
              : `Vink deze les af voor ${classId}`;
            return `
            <button
              type="button"
              class="class-progress-chip is-${escapeHtml(itemStatus.state)}${itemStatus.manual ? ' is-manual' : ''}"
              data-toggle-class-lesson-status="${escapeHtml(key)}"
              data-progress-class="${escapeHtml(classId)}"
              aria-label="${escapeHtml(classToggleLabel)}"
              title="${escapeHtml(classToggleLabel)}"
            >
              <span>${escapeHtml(classId)}</span>
              <strong>${escapeHtml(itemStatus.icon)}</strong>
            </button>
          `;
          }).join('')}</span>` : ''}
      </div>
      <button type="button" class="insert-mini" data-insert-index="${Math.max(0, editableIndex + 1)}">+</button>
    </article>
  `;
}

function missingLessonRowHtml(lesson, insertIndex) {
  const markerId = markerIdForLesson(lesson);
  const title = String(lesson.lesson || lesson.project || 'Les zonder titel').trim();
  return `
    <article class="lesson-row is-missing" data-missing-marker="${escapeHtml(markerId)}">
      <div class="status-cell">
        <span class="status-icon" aria-hidden="true">○</span>
      </div>
      <div class="lesson-main">
        <div class="lesson-select-button">
          <strong>${escapeHtml(title)}</strong>
          <small>Niet ingepland</small>
        </div>
      </div>
      <button
        type="button"
        class="insert-mini"
        data-plan-missing-lesson="${escapeHtml(markerId)}"
        data-plan-missing-project="${escapeHtml(lesson.project || '')}"
        data-plan-missing-index="${escapeHtml(insertIndex)}"
        aria-label="${escapeHtml(title)} inplannen"
        title="${escapeHtml(title)} inplannen"
      >+</button>
    </article>
  `;
}

function lessonClassStatusSummary(lesson, layer = state.selectedLayer, orderIndex = null) {
  return classIdsForLayer(layer).map((classId) => ({
    classId,
    itemStatus: lessonStatusForClass(lesson, classId, layer, orderIndex),
  }));
}

function lessonReferenceForKey(key) {
  const lesson = visibleLessonsForLayer(state.selectedLayer).find((candidate) => lessonKey(candidate) === key) || null;
  return lessonReferenceForLesson(lesson);
}

function setLessonManualStatusForClass(lesson, classId, value) {
  const status = normalizeProgressStatus(value);
  const key = manualProgressClassKey(classId);
  if (!lesson || !key || !status) return;
  const progress = normalizeProgressByClass(lesson.progressByClass);
  progress[key] = status;
  lesson.progressByClass = progress;
  delete lesson.statusOverride;
  delete lesson.lessonDone;
  delete lesson.completed;
}

function resetLessonManualStatusForClass(key) {
  const ref = lessonReferenceForKey(key);
  const classId = selectedProgressClassForLayer(state.selectedLayer);
  const progressKey = manualProgressClassKey(classId);
  if (!ref || !progressKey) return;
  const progress = normalizeProgressByClass(ref.lesson.progressByClass);
  for (const alias of classProgressAliases(classId)) delete progress[alias];
  if (Object.keys(progress).length) ref.lesson.progressByClass = progress;
  else delete ref.lesson.progressByClass;
  delete ref.lesson.manualStatus;
  delete ref.lesson.statusOverride;
  delete ref.lesson.lessonDone;
  delete ref.lesson.completed;
  setLessonPlanningMeta(ref.lesson.project, markerIdForLesson(ref.lesson), ref.lesson, deckIdForLesson(ref.lesson));
  state.selectedLessonKey = key;
  state.selectedProject = ref.lesson.project || state.selectedProject;
  state.expandedProject = ref.lesson.project || state.expandedProject;
  saveContext();
  renderEditor();
  scheduleSave(`Voortgang voor ${classId} teruggezet naar automatisch. Publiceren...`);
}

function toggleLessonManualStatusForClass(key, classId) {
  const ref = lessonReferenceForKey(key);
  if (!ref) return;
  const cleanClassId = normalizeClassId(classId) || selectedProgressClassForLayer(state.selectedLayer);
  const lessonSnapshot = {
    ...ref.lesson,
    classId: ref.entry.classId,
    week: String(ref.entry.week || ''),
    lessonKey: String(ref.lesson.lessonKey || '').trim().toUpperCase(),
  };
  const currentStatus = lessonStatusForClass(lessonSnapshot, cleanClassId);
  const nextStatus = currentStatus.state === 'done' ? 'todo' : 'done';
  setLessonManualStatusForClass(ref.lesson, cleanClassId, nextStatus);
  setLessonPlanningMeta(ref.lesson.project, markerIdForLesson(ref.lesson), ref.lesson, deckIdForLesson(ref.lesson));
  state.selectedProgressClass = cleanClassId;
  state.selectedLessonKey = key;
  state.selectedProject = ref.lesson.project || state.selectedProject;
  state.expandedProject = ref.lesson.project || state.expandedProject;
  saveContext();
  studioDirty = true;
  saveStudioCache({ dirty: true });
  renderEditor();
  scheduleSave(nextStatus === 'done'
    ? `Les afgevinkt voor ${cleanClassId}. Publiceren...`
    : `Les voor ${cleanClassId} teruggezet naar niet geweest. Publiceren...`);
}

function toggleLessonManualStatus(key) {
  toggleLessonManualStatusForClass(key, selectedProgressClassForLayer(state.selectedLayer));
}

function bindTimeline() {
  for (const button of els.planningTimeline.querySelectorAll('[data-toggle-project]')) {
    button.addEventListener('click', () => {
      const project = button.dataset.toggleProject || '';
      state.selectedProject = project;
      state.expandedProject = state.expandedProject === project ? '' : project;
      const currentSelection = selectedLesson();
      if (!currentSelection || cleanProjectName(currentSelection.project) !== cleanProjectName(project)) {
        const first = firstVisibleLessonForProject(state.selectedLayer, project);
        state.selectedLessonKey = first ? lessonKey(first) : '';
      }
      saveContext();
      renderAll();
    });
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-select-lesson]')) {
    button.addEventListener('click', () => {
      state.selectedLessonKey = button.dataset.selectLesson || '';
      const lesson = selectedLesson();
      state.selectedProject = lesson?.project || state.selectedProject;
      saveContext();
      renderAll();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      button.click();
    });
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-toggle-lesson-status]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleLessonManualStatus(button.dataset.toggleLessonStatus || '');
    });
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-toggle-class-lesson-status]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleLessonManualStatusForClass(
        button.dataset.toggleClassLessonStatus || '',
        button.dataset.progressClass || '',
      );
    });
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-reset-lesson-status]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      resetLessonManualStatusForClass(button.dataset.resetLessonStatus || '');
    });
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-unplan-project]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      unplanProjectFromPlanning(button.dataset.unplanProject || '');
    });
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-insert-index]')) {
    button.addEventListener('click', () => createLessonAtIndex(Number(button.dataset.insertIndex || 0), button.dataset.addLesson || state.selectedProject));
  }
  for (const button of els.planningTimeline.querySelectorAll('[data-plan-missing-lesson]')) {
    button.addEventListener('click', () => {
      planMissingLessonInPlanning(
        button.dataset.planMissingProject || '',
        button.dataset.planMissingLesson || '',
        Number(button.dataset.planMissingIndex || editableLessonsForLayer(state.selectedLayer).length),
      );
    });
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
  const selectedBefore = selectedLesson();
  const [lesson] = lessons.splice(fromIndex, 1);
  lessons.splice(toIndex, 0, lesson);
  if (!rewriteEditableLessonOrder(state.selectedLayer, lessons)) return;
  const selectedAfter = visibleLessonLike(state.selectedLayer, selectedBefore || lesson)
    || visibleLessonsForLayer(state.selectedLayer)[Math.min(toIndex, visibleLessonsForLayer(state.selectedLayer).length - 1)];
  state.selectedProject = selectedAfter?.project || state.selectedProject;
  state.expandedProject = selectedAfter?.project || state.expandedProject;
  state.selectedLessonKey = selectedAfter ? lessonKey(selectedAfter) : '';
  saveContext();
  scheduleSave('Lesvolgorde aangepast. Publiceren...');
}

function moveProject(sourceProject, targetProject) {
  const lessons = editableLessonsForLayer(state.selectedLayer);
  const moving = lessons.filter((lesson) => lesson.project === sourceProject);
  const rest = lessons.filter((lesson) => lesson.project !== sourceProject);
  const targetIndex = rest.findIndex((lesson) => lesson.project === targetProject);
  if (!moving.length || targetIndex < 0) return;
  const selectedBefore = selectedLesson();
  rest.splice(targetIndex, 0, ...moving);
  if (!rewriteEditableLessonOrder(state.selectedLayer, rest)) return;
  state.selectedProject = sourceProject;
  state.expandedProject = sourceProject;
  const selectedAfter = (selectedBefore && cleanProjectName(selectedBefore.project) === cleanProjectName(sourceProject)
    ? visibleLessonLike(state.selectedLayer, selectedBefore)
    : null) || firstVisibleLessonForProject(state.selectedLayer, sourceProject);
  state.selectedLessonKey = selectedAfter ? lessonKey(selectedAfter) : '';
  saveContext();
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
  if (!rewriteEditableLessonOrder(state.selectedLayer, lessons)) return;
  compilePresentation(project);
  const created = getLessonsForLayer(state.selectedLayer).find((lesson) => lesson.presentationMarkerId === markerId);
  state.selectedProject = project;
  state.expandedProject = project;
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
  state.expandedProject = name;
  saveContext();
  renderAll();
  scheduleSave(`Project "${name}" aangemaakt. Publiceren...`);
}

function planProjectInPlanning(project, index = editableLessonsForLayer(state.selectedLayer).length) {
  const cleanProject = String(project || '').trim();
  if (!cleanProject || isReadingProject(cleanProject)) return;
  const summary = projectPlanningSummary(cleanProject);
  if (!summary.source) {
    setGlobalStatus(`Project "${cleanProject}" heeft nog geen lespresentaties om in te plannen.`, 'error');
    return;
  }
  if (!summary.missing.length) {
    setGlobalStatus(`Project "${cleanProject}" staat al volledig in deze planning.`, 'success');
    return;
  }
  const lessons = editableLessonsForLayer(state.selectedLayer);
  lessons.splice(
    Math.max(0, Math.min(index, lessons.length)),
    0,
    ...summary.missing.map((lesson) => structuredClone(lesson)),
  );
  if (!rewriteEditableLessonOrder(state.selectedLayer, lessons)) return;
  compilePresentation(cleanProject);
  const first = firstVisibleLessonForProject(state.selectedLayer, cleanProject);
  state.selectedProject = cleanProject;
  state.expandedProject = cleanProject;
  state.selectedLessonKey = first ? lessonKey(first) : '';
  saveContext();
  renderAll();
  scheduleSave(`Project "${cleanProject}" ingepland. Publiceren...`);
}

function planMissingLessonInPlanning(project, markerId, index = editableLessonsForLayer(state.selectedLayer).length) {
  const cleanProject = String(project || '').trim();
  const cleanMarkerId = String(markerId || '').trim();
  if (!cleanProject || !cleanMarkerId || isReadingProject(cleanProject)) return;
  const summary = projectPlanningSummary(cleanProject);
  const missingLesson = summary.missing.find((lesson) => markerIdForLesson(lesson) === cleanMarkerId);
  if (!missingLesson) {
    setGlobalStatus(`Deze les staat al in de planning of is niet meer beschikbaar.`, 'success');
    renderAll();
    return;
  }
  const lessons = editableLessonsForLayer(state.selectedLayer);
  lessons.splice(
    Math.max(0, Math.min(index, lessons.length)),
    0,
    structuredClone(missingLesson),
  );
  if (!rewriteEditableLessonOrder(state.selectedLayer, lessons)) return;
  compilePresentation(cleanProject);
  const planned = visibleLessonLike(state.selectedLayer, missingLesson);
  state.selectedProject = cleanProject;
  state.expandedProject = cleanProject;
  state.selectedLessonKey = planned ? lessonKey(planned) : '';
  saveContext();
  renderAll();
  scheduleSave(`"${missingLesson.lesson || cleanProject}" ingepland. Publiceren...`);
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
  if (state.expandedProject === cleanProject) state.expandedProject = '';
  saveContext();
  renderAll();
  scheduleSave(`Project "${cleanProject}" verwijderd. Publiceren...`);
}

function selectNearestPlannedLesson(preferredProject = '') {
  const firstPreferred = preferredProject ? firstVisibleLessonForProject(state.selectedLayer, preferredProject) : null;
  const first = firstPreferred || visibleLessonsForLayer(state.selectedLayer)[0] || null;
  state.selectedProject = first?.project || projectNames()[0] || preferredProject || '';
  state.expandedProject = first?.project || '';
  state.selectedLessonKey = first ? lessonKey(first) : '';
}

function renderEditor() {
  const lesson = selectedLesson();
  els.editorEmpty.hidden = Boolean(lesson);
  els.lessonEditor.hidden = !lesson;
  if (!lesson) return;
  suppressEditorEvents = true;
  const markerId = String(lesson.presentationMarkerId || lessonMarkerId(lesson.lesson)).trim();
  const slides = slidesForLesson(lesson);
  const hasPresentation = slides.length > 0 || lessonHasStructuredSlides(lesson, markerId);
  els.lessonContext.textContent = `${lesson.project || 'Project'} · ${lessonOrderLabel(lesson)}`;
  els.lessonTitleInput.value = lesson.lesson || '';
  els.lessonProjectInput.value = lesson.project || '';
  els.lessonWeekInput.value = lesson.week || '';
  els.lessonKeySelect.value = SLOT_KEYS.includes(lesson.lessonKey) ? lesson.lessonKey : 'A';
  els.homeworkTextarea.value = lesson.homework || '';
  els.teacherNoteTextarea.value = lesson.teacherNote || '';
  els.assessmentTextarea.value = lesson.assessment || '';
  els.netschriftTextarea.value = serializeList(netschriftItems(lesson.project, markerId));
  els.slidesTextarea.value = hasPresentation ? serializePresentationInput(slides, lesson.project, markerId, lesson) : '';
  els.slidesTextarea.placeholder = hasPresentation ? PRESENTATION_PLACEHOLDER : EMPTY_PRESENTATION_PLACEHOLDER;
  els.openPresentationBtn.disabled = !hasPresentation;
  if (els.openBoardPresentationBtn) els.openBoardPresentationBtn.disabled = !hasPresentation;
  if (els.openNetschriftBtn) els.openNetschriftBtn.disabled = false;
  if (els.selectNextLessonBtn) els.selectNextLessonBtn.disabled = !nextLessonAfter(lesson);
  if (els.markLessonDoneBtn) {
    const status = lessonStatus(lesson);
    els.markLessonDoneBtn.textContent = status.state === 'done' ? 'Zet les open' : 'Vink les af';
  }
  els.deletePresentationBtn.disabled = false;
  els.deletePresentationBtn.textContent = hasPresentation ? 'Verwijder presentatie' : 'Presentatie verwijderd';
  renderSlidePreview();
  renderGoalSummary(lesson.project);
  suppressEditorEvents = false;
}

function renderGoalSummary(project) {
  const lesson = selectedLesson();
  const markerId = lesson ? markerIdForLesson(lesson) : '';
  const draftStructure = lesson ? parsePresentationStructure(els.slidesTextarea?.value || '', { fallback: false }) : null;
  const curriculum = draftStructure?.hasCurriculumBlock
    ? cleanCurriculumMeta(draftStructure.curriculum)
    : (lesson ? cleanCurriculumMeta(lessonStructureMeta(project, markerId).curriculum) : cleanCurriculumMeta(null));
  const lessonCurriculumHtml = hasCurriculumMeta(curriculum)
    ? `
      <div class="lesson-structure-meta">
        <h4>Deze les</h4>
        ${curriculum.lessonGoals.length ? `<p><strong>Lesdoelen:</strong> ${escapeHtml(curriculum.lessonGoals.join(' · '))}</p>` : ''}
        ${curriculum.skills.length ? `<p><strong>Vaardigheden:</strong> ${escapeHtml(curriculum.skills.join(' · '))}</p>` : ''}
        ${curriculum.kerndoelen.length ? `<p><strong>Kerndoelen:</strong> ${escapeHtml(curriculum.kerndoelen.join(' · '))}</p>` : ''}
        ${curriculum.subkerndoelen.length ? `<p><strong>Subkerndoelen:</strong> ${escapeHtml(curriculum.subkerndoelen.join(' · '))}</p>` : ''}
      </div>
    `
    : '';
  const snapshot = state.kerndoelenDoc ? buildProjectSnapshot(state.kerndoelenDoc, slugifyProject(project)) : null;
  if (!snapshot) {
    els.projectGoalsSummary.innerHTML = `
      ${lessonCurriculumHtml || '<p class="empty-state">Nog geen lesdoelen of kerndoelen voor deze les.</p>'}
      <p class="empty-state">Nog geen kerndoelenkaart voor dit project.</p>
    `;
    return;
  }
  const visibleRecords = snapshot.records.slice(0, 24);
  els.projectGoalsSummary.innerHTML = `
    ${lessonCurriculumHtml}
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
  return lesson ? lessonReferenceForLesson(lesson) : null;
}

function lessonReferenceForLesson(lesson) {
  if (!lesson) return null;
  const matchesLesson = (candidate) => (
    String(candidate.lessonKey || '').trim().toUpperCase() === lesson.lessonKey
    && String(candidate.presentationMarkerId || lessonMarkerId(candidate.lesson)).trim() === String(lesson.presentationMarkerId || lessonMarkerId(lesson.lesson)).trim()
  );
  const candidateEntries = [
    lesson.classId ? findEntryForClass(lesson.classId, lesson.week) : null,
    ...state.doc.entries.filter((entry) => (
      planningLayerFromClassId(entry.classId) === state.selectedLayer
      && parseWeek(entry.week) === Number(lesson.week)
    )),
  ].filter(Boolean);
  const seen = new Set();
  for (const entry of candidateEntries) {
    const key = `${entry.classId}__${entry.week}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = entry.lessons?.find(matchesLesson);
    if (item) return { entry, lesson: item };
  }
  return null;
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
  const structure = parsePresentationStructure(els.slidesTextarea.value, { fallback: false });
  const slides = structure.slides;
  const explicitNetschriftItems = structure.netschriftItems;
  const netschriftValue = explicitNetschriftItems.length
    ? explicitNetschriftItems
    : parseList(els.netschriftTextarea.value);
  const hasGeneratedLessonSlides = Boolean(cleanListItems(netschriftValue).length || hasAutomaticLessonSlides(structure));
  if (slides.length || hasGeneratedLessonSlides) {
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
  setNetschriftItems(project, markerId, netschriftValue);
  if (structure.hasCurriculumBlock) setCurriculumMeta(project, markerId, structure.curriculum);
  if (structure.hasHomeworkBlock) setHomeworkMeta(project, markerId, structure.homeworkItems);
  const structuredHomework = structure.hasHomeworkBlock ? serializeList(structure.homeworkItems) : '';
  const homeworkValue = structuredHomework || String(els.homeworkTextarea.value || '').trim();
  if (explicitNetschriftItems.length && document.activeElement !== els.netschriftTextarea) {
    els.netschriftTextarea.value = serializeList(explicitNetschriftItems);
  }
  if (structuredHomework && document.activeElement !== els.homeworkTextarea) {
    els.homeworkTextarea.value = structuredHomework;
  }
  Object.assign(ref.lesson, {
    lessonKey: lessonKeyValue,
    project,
    lesson: title,
    homework: homeworkValue,
    assessment: String(els.assessmentTextarea.value || '').trim(),
    teacherNote: String(els.teacherNoteTextarea.value || '').trim(),
    presentationId: projectDeckId(project),
    presentationMarkerId: markerId,
  });
  setLessonPlanningMeta(project, markerId, ref.lesson, projectDeckId(project));
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
  renderGoalSummary(project);
  scheduleSave('Wijziging opgeslagen. Publiceren...');
}

function renderSlidePreview() {
  const structure = parsePresentationStructure(els.slidesTextarea.value, { fallback: false });
  if (!structure.netschriftItems.length) {
    structure.netschriftItems = parseList(els.netschriftTextarea?.value || '');
  }
  const slides = renderableSlidesForStructure(structure);
  els.openPresentationBtn.disabled = !slides.length;
  if (els.openBoardPresentationBtn) els.openBoardPresentationBtn.disabled = !slides.length;
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
  const specialSlides = slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide }) => String(slide?.variant || '').trim());
  els.slidePreview.innerHTML = `
    <article>
      <p class="app-kicker">Preview · ${slides.length} dia's</p>
      <h3>${escapeHtml(first.title || 'Nieuwe les')}</h3>
      ${first.subtitle ? `<p>${escapeHtml(first.subtitle)}</p>` : ''}
      ${Array.isArray(first.items) && first.items.length ? `<ul>${first.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${specialSlides.length ? `
        <ul class="preview-generated-slides">
          ${specialSlides.map(({ slide, index }) => `<li>${index + 1}. ${escapeHtml(slide.title || 'Automatische dia')}</li>`).join('')}
        </ul>
      ` : ''}
    </article>
  `;
}

function scheduleSave(message) {
  try {
    const changedSinceBaseline = JSON.stringify(state.doc) !== lastUndoFingerprint;
    rememberUndoPoint(message);
    if (changedSinceBaseline) studioDirty = true;
    saveStudioCache({ dirty: studioDirty, touch: changedSinceBaseline || studioDirty });
    syncUndoBaseline();
    renderProgressClassOptions();
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
  const payload = collapseToLayerDoc(state.doc);
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

function autoGitNeedsAttention(result = {}) {
  return result.autoGit?.ok === false || result.autoGit?.enabled === false;
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
    saveStudioCache({ dirty: false, touch: false });
    localStorage.setItem(PLATFORM_REFRESH_KEY, JSON.stringify({ updatedAt: state.doc.updatedAt, sourceRevision: state.doc.sourceRevision }));
    const gitNeedsAttention = autoGitNeedsAttention(result);
    const gitMessage = result.autoGit?.message || 'automatisch git-pushen staat uit; online kan nog oud zijn';
    setGlobalStatus(gitNeedsAttention ? `Opgeslagen · publicatie lokaal ok · git: ${gitMessage}` : 'Opgeslagen · Online', gitNeedsAttention ? 'error' : 'success');
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

function unplanProjectFromPlanning(project) {
  const cleanProject = String(project || '').trim();
  if (!cleanProject || isReadingProject(cleanProject)) return;
  const lessons = editableLessonsForLayer(state.selectedLayer);
  const removed = lessons.filter((lesson) => sameProjectName(lesson.project, cleanProject));
  if (!removed.length) {
    setGlobalStatus(`Project "${cleanProject}" staat niet in deze planning.`, 'success');
    return;
  }
  if (!window.confirm(`Project "${cleanProject}" met ${removed.length} lessen uit deze planning halen? De presentaties blijven bewaard.`)) return;
  for (const lesson of removed) {
    setLessonPlanningMeta(cleanProject, markerIdForLesson(lesson), lesson, deckIdForLesson(lesson));
  }
  rewriteEditableLessonOrder(
    state.selectedLayer,
    lessons.filter((lesson) => !sameProjectName(lesson.project, cleanProject)),
    { allowRemoval: true },
  );
  if (sameProjectName(state.selectedProject, cleanProject)) selectNearestPlannedLesson();
  else if (!selectedLesson()) selectNearestPlannedLesson(state.selectedProject);
  saveContext();
  renderAll();
  scheduleSave(`Project "${cleanProject}" uit de planning gehaald. Publiceren...`);
}

function clearSelectedPlanning() {
  const lessons = editableLessonsForLayer(state.selectedLayer);
  if (!lessons.length) {
    setGlobalStatus(`${layerLabel(state.selectedLayer)} heeft al geen geplande projectlessen.`, 'success');
    return;
  }
  if (!window.confirm(`Hele planning van ${layerLabel(state.selectedLayer)} leegmaken? Dit haalt ${lessons.length} projectlessen uit de planning; presentaties blijven bewaard.`)) return;
  for (const lesson of lessons) {
    setLessonPlanningMeta(lesson.project, markerIdForLesson(lesson), lesson, deckIdForLesson(lesson));
  }
  rewriteEditableLessonOrder(state.selectedLayer, [], { allowRemoval: true });
  selectNearestPlannedLesson();
  saveContext();
  renderAll();
  scheduleSave(`${layerLabel(state.selectedLayer)} uit de planning gehaald. Publiceren...`);
}

function unplanSelectedLesson() {
  const ref = currentLessonReference();
  if (!ref) return;
  const title = ref.lesson.lesson || ref.lesson.project || 'deze les';
  if (!window.confirm(`"${title}" uit de planning halen? De presentatie blijft bewaard.`)) return;
  setLessonPlanningMeta(ref.lesson.project, markerIdForLesson(ref.lesson), ref.lesson, deckIdForLesson(ref.lesson));
  ref.entry.lessons = ref.entry.lessons.filter((lesson) => lesson !== ref.lesson);
  cleanupEntries();
  selectNearestPlannedLesson(ref.lesson.project);
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
      <div class="dashboard-card-head">
        ${projectBadgeHtml(project, 'project-badge project-badge-small')}
        <h3>${escapeHtml(project)}</h3>
      </div>
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
      <div class="dashboard-card-head">
        ${projectBadgeHtml(project, 'project-badge project-badge-small')}
        <h3>${escapeHtml(project)}</h3>
      </div>
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

function docentClassIdForPreview(value) {
  const classId = normalizeClassId(value);
  if (/^[1-6][A-Z]$/.test(classId)) return `G${classId}`;
  return classId;
}

function previewClassIdForPresentationRow(row) {
  const firstLink = row?.linked?.[0] || null;
  const linkedClassId = String(firstLink?.lesson?.classId || '').trim();
  const linkedLayer = String(firstLink?.layer || '').trim();
  const layerClassId = linkedLayer ? classIdsForLayer(linkedLayer)[0] : '';
  const selectedLayerClassId = state.selectedLayer ? classIdsForLayer(state.selectedLayer)[0] : '';
  return docentClassIdForPreview(linkedClassId || layerClassId || selectedLayerClassId || state.selectedLayer);
}

function docentPresentationPreviewUrl({ presentationId = '', markerId = '', project = '', title = '', classId = '' } = {}) {
  const url = new URL('docent.html', window.location.href);
  url.searchParams.set('presentationPreview', '1');
  url.searchParams.set('embeddedPreview', '1');
  url.searchParams.set('presentationId', String(presentationId || '').trim());
  url.searchParams.set('markerId', String(markerId || '').trim());
  if (project) url.searchParams.set('project', String(project).trim());
  if (title) url.searchParams.set('title', String(title).trim());
  if (classId) url.searchParams.set('classId', docentClassIdForPreview(classId));
  return url.toString();
}

function presentationPreviewUrl(row) {
  return docentPresentationPreviewUrl({
    presentationId: row?.deckId,
    markerId: row?.markerId,
    project: row?.project,
    title: row?.title,
    classId: previewClassIdForPresentationRow(row),
  });
}

function presentationPreviewUrlForLesson(lesson) {
  const project = String(lesson?.project || '').trim();
  const title = String(lesson?.lesson || '').trim() || 'Presentatie';
  const classId = String(lesson?.classId || classIdsForLayer(state.selectedLayer)[0] || state.selectedLayer || '').trim();
  return docentPresentationPreviewUrl({
    presentationId: deckIdForLesson(lesson) || projectDeckId(project),
    markerId: markerIdForLesson(lesson) || lessonMarkerId(title),
    project,
    title,
    classId,
  });
}

function renderPresentationLibrary() {
  if (!els.presentationLibrary) return;
  const rows = presentationLibraryRows();
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
          <div class="presentation-card-head">
            ${projectBadgeHtml(row.project, 'project-badge project-badge-small')}
            <div>
              <p class="app-kicker">${escapeHtml(row.project)}</p>
              <h3>${escapeHtml(row.title)}</h3>
            </div>
          </div>
          <p>${escapeHtml(planningLabel)} · ${escapeHtml(row.slideCount)} slide${row.slideCount === 1 ? '' : 's'}</p>
          ${row.linked.length ? `<div class="chip-row muted">${row.linked.slice(0, 4).map(({ lesson, layer }) => `<span>${escapeHtml(layerLabel(layer))} · ${escapeHtml(lessonOrderLabel(lesson, layer))}</span>`).join('')}</div>` : '<div class="chip-row muted"><span>Losse presentatie</span></div>'}
        </div>
        <div class="presentation-card-actions">
          <button type="button" data-library-preview-url="${escapeHtml(presentationPreviewUrl(row))}">Preview</button>
          ${firstLink ? `<button type="button" data-library-lesson="${escapeHtml(lessonKey(firstLink.lesson))}" data-library-layer="${escapeHtml(firstLink.layer)}">Naar les</button>` : `<a href="${escapeHtml(studioUrlForMarker(row.project, row.markerId))}">Bewerk</a>`}
          <button type="button" class="danger" data-library-delete="${escapeHtml(row.deckId)}" data-library-marker="${escapeHtml(row.markerId)}" data-library-title="${escapeHtml(row.title)}">Verwijderen</button>
        </div>
      </article>
    `;
  }).join('');
  bindPresentationLibrary();
}

function bindPresentationLibrary() {
  for (const button of els.presentationLibrary.querySelectorAll('[data-library-preview-url]')) {
    button.addEventListener('click', () => openPresentationPreview(button.dataset.libraryPreviewUrl || ''));
  }
  for (const button of els.presentationLibrary.querySelectorAll('[data-library-lesson]')) {
    button.addEventListener('click', () => {
      state.selectedLayer = button.dataset.libraryLayer || state.selectedLayer;
      state.selectedLessonKey = button.dataset.libraryLesson || '';
      const lesson = selectedLesson();
      state.selectedProject = lesson?.project || state.selectedProject;
      state.expandedProject = state.selectedProject;
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

async function openPresentationPreview(url) {
  if (!els.presentationDialog || !els.dialogFrame || !url) return;
  els.presentationDialog.classList.remove('is-local-slides');
  els.dialogStage.hidden = true;
  els.dialogPrevBtn.hidden = true;
  els.dialogCounter.hidden = true;
  els.dialogNextBtn.hidden = true;
  els.dialogFrame.hidden = false;
  els.dialogFrame.src = url;
  els.presentationDialog.classList.add('is-presentation-mode');
  if (!els.presentationDialog.open) els.presentationDialog.showModal();
  try {
    await els.dialogFrame.requestFullscreen?.();
  } catch (err) {
    console.warn('Fullscreen voor presentatie-preview niet beschikbaar:', err);
  }
}

function bindDashboardProjectLinks() {
  for (const card of els.curriculumDashboard.querySelectorAll('[data-dashboard-project]')) {
    card.addEventListener('click', () => {
      state.selectedProject = card.dataset.dashboardProject || '';
      state.expandedProject = state.selectedProject;
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
      state.expandedProject = state.selectedProject;
      setMainView('studio');
    });
  }
}

function renderAll() {
  renderLayerOptions();
  renderProgressClassOptions();
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
  persistEditorFields();
  const lesson = selectedLesson();
  if (!lesson) return;
  void openPresentationPreview(presentationPreviewUrlForLesson(lesson));
}

function markSelectedLessonProgress() {
  const lesson = selectedLesson();
  if (!lesson) return;
  toggleLessonManualStatusForClass(lessonKey(lesson), selectedProgressClassForLayer(state.selectedLayer));
}

function selectNextLesson() {
  const lesson = selectedLesson();
  const next = lesson ? nextLessonAfter(lesson) : visibleLessonsForLayer(state.selectedLayer)[0];
  if (!next) return;
  state.selectedLessonKey = lessonKey(next);
  state.selectedProject = next.project || state.selectedProject;
  state.expandedProject = state.selectedProject;
  saveContext();
  renderAll();
}

function openLocalSlidesDialog(slides, startIndex = 0) {
  if (!els.presentationDialog || !slides.length) return;
  state.activeSlides = slides;
  state.activeSlideIndex = Math.max(0, Math.min(slides.length - 1, startIndex));
  if (els.dialogFrame) {
    els.dialogFrame.hidden = true;
    els.dialogFrame.src = 'about:blank';
  }
  els.dialogStage.hidden = false;
  els.dialogPrevBtn.hidden = false;
  els.dialogCounter.hidden = false;
  els.dialogNextBtn.hidden = false;
  els.presentationDialog.classList.add('is-presentation-mode', 'is-local-slides');
  if (els.dialogTitle) els.dialogTitle.textContent = 'Netschriftcheck';
  renderDialogSlide();
  if (!els.presentationDialog.open) els.presentationDialog.showModal();
}

function openSelectedNetschriftCheck() {
  const lesson = selectedLesson();
  if (!lesson) return;
  openLocalSlidesDialog([
    netschriftSlideForLesson(lesson, 'start'),
    netschriftSlideForLesson(lesson, 'end'),
  ]);
}

function netschriftSlideForLesson(lesson, phase) {
  const markerId = markerIdForLesson(lesson);
  const items = netschriftItems(lesson.project, markerId);
  const fallback = 'Leg vast wat je vandaag maakt, leert of verbetert.';
  return {
    type: `lesson-${phase}-netschrift`,
    emphasis: true,
    variant: 'netschrift',
    title: phase === 'start' ? 'Opdracht netschrift' : 'Netschriftcheck: gelukt?',
    subtitle: phase === 'start' ? 'Dit moet straks terug te vinden zijn' : 'Controleer dit voordat je afsluit',
    items: items.length ? items : [fallback],
  };
}

function nextLessonAfter(lesson) {
  const lessons = visibleLessonsForLayer(state.selectedLayer);
  const index = lessons.findIndex((candidate) => lessonKey(candidate) === lessonKey(lesson));
  return index >= 0 ? lessons[index + 1] || null : null;
}

function homeworkSlideForLesson(lesson) {
  const markerId = markerIdForLesson(lesson);
  const metaItems = lessonStructureMeta(lesson.project, markerId)?.homework?.items;
  const explicitItems = cleanListItems(metaItems);
  if (explicitItems.length) {
    return {
      type: 'homework-preview',
      emphasis: true,
      variant: 'homework',
      title: 'Schrijf in je agenda',
      subtitle: 'Huiswerk voor de volgende keer',
      items: explicitItems,
    };
  }

  const nextLesson = nextLessonAfter(lesson);
  const homework = String(nextLesson?.homework || '').trim();
  if (!homework) return null;
  return {
    type: 'homework-preview',
    emphasis: true,
    variant: 'homework',
    title: 'Schrijf in je agenda',
    subtitle: `Huiswerk voor ${nextLesson.lesson || nextLesson.project || 'de volgende les'}`,
    items: parseList(homework),
  };
}

function renderableSlidesForLesson(lesson) {
  const slides = slidesForLesson(lesson);
  return assembleRenderableLessonSlides(slides, {
    startSlide: netschriftSlideForLesson(lesson, 'start'),
    endSlide: netschriftSlideForLesson(lesson, 'end'),
    homeworkSlide: homeworkSlideForLesson(lesson),
  });
}

function dialogSlideClass(slide) {
  const type = String(slide.type || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const classes = ['dialog-slide'];
  if (type) classes.push(`is-${type}`);
  if (slide.emphasis) classes.push('is-emphasis');
  if (slide.variant) classes.push(`is-${slide.variant}`);
  if (slide.image) classes.push('has-media');
  if (slide.layout) classes.push(`layout-${slide.layout}`);
  return classes.join(' ');
}

function slideMediaHtml(slide) {
  const src = String(slide.image || '').trim();
  if (!src || /^javascript:/i.test(src)) return '';
  const alt = String(slide.imageAlt || slide.caption || slide.title || '').trim();
  const caption = String(slide.caption || '').trim();
  const source = String(slide.source || '').trim();
  return `
    <figure class="dialog-slide-media">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">
      ${caption || source ? `<figcaption>${escapeHtml([caption, source].filter(Boolean).join(' · '))}</figcaption>` : ''}
    </figure>
  `;
}

function dialogSlideTextHtml(slide) {
  const quote = String(slide.quote || '').trim();
  const subtitle = String(slide.subtitle || '').trim();
  const items = Array.isArray(slide.items) ? slide.items : [];
  if (slide.type === 'quote' || quote) {
    return `
      <div class="dialog-slide-copy">
        ${slide.kicker ? `<p class="dialog-slide-kicker">${escapeHtml(slide.kicker)}</p>` : ''}
        ${slide.title ? `<h2>${escapeHtml(slide.title)}</h2>` : ''}
        <blockquote>${escapeHtml(quote || subtitle || slide.title)}</blockquote>
        ${slide.attribution ? `<p class="dialog-slide-attribution">${escapeHtml(slide.attribution)}</p>` : ''}
      </div>
    `;
  }
  const listTag = slide.type === 'steps' ? 'ol' : 'ul';
  const listClass = slide.type === 'compare' ? ' class="dialog-slide-compare"' : '';
  return `
    <div class="dialog-slide-copy">
      ${slide.kicker ? `<p class="dialog-slide-kicker">${escapeHtml(slide.kicker)}</p>` : ''}
      <h2>${escapeHtml(slide.title || 'Presentatie')}</h2>
      ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      ${items.length ? `<${listTag}${listClass}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${listTag}>` : ''}
    </div>
  `;
}

function renderDialogSlide() {
  const slides = state.activeSlides;
  const slide = normalizeSlide(slides[state.activeSlideIndex] || {});
  const media = slideMediaHtml(slide);
  els.dialogStage.innerHTML = `
    <article class="${dialogSlideClass(slide)}">
      ${slide.layout === 'image-left' ? media : ''}
      ${dialogSlideTextHtml(slide)}
      ${slide.layout !== 'image-left' ? media : ''}
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

function slideSnippetText(type) {
  const lesson = selectedLesson();
  const title = String(lesson?.lesson || 'Nieuwe les').trim();
  const project = String(lesson?.project || 'Project').trim();
  const snippets = {
    title: `[title] ${title}\nsubtitle: ${project}`,
    bullets: '[bullets] Kern\n- Eerste punt\n- Tweede punt',
    visual: `[visual] ${title}\nsubtitle: Kijk eerst goed. Wat valt op?\nimage: https://voorbeeld.nl/beeld.jpg\ncaption: Korte context bij het beeld\nsource: Bron of maker\nlayout: image-right`,
    quote: '[quote] Citaat\nquote: Plaats hier een korte, scherpe zin uit de bron.\nattribution: Naam of bron\nvariant: source',
    compare: '[compare] Vergelijking\nsubtitle: Wat verandert er?\n- Links: situatie, tekst of beeld A\n- Rechts: situatie, tekst of beeld B',
    task: '[task] Aan het werk\nsubtitle: Werk rustig en zichtbaar\n- Stap 1\n- Stap 2',
    netschrift: '[netschrift]\n- Wat moet aan het einde van deze les in het netschrift staan?',
    homework: '[huiswerk]\n- Wat moeten leerlingen voor de volgende les doen of meenemen?',
    metadata: '[metadata]\nvaardigheden: \nkerndoelen: \nsubkerndoelen: ',
  };
  return snippets[type] || snippets.bullets;
}

function insertSlideSnippet(type) {
  const textarea = els.slidesTextarea;
  if (!textarea) return;
  const snippet = slideSnippetText(type);
  const value = textarea.value || '';
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  const before = value.slice(0, start).replace(/\s*$/, '');
  const after = value.slice(end).replace(/^\s*/, '');
  const separatorBefore = before ? '\n---\n' : '';
  const separatorAfter = after ? '\n---\n' : '';
  textarea.value = `${before}${separatorBefore}${snippet}${separatorAfter}${after}`;
  const cursor = `${before}${separatorBefore}${snippet}`.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function boot() {
  try {
    const [planningRaw, classRaw, agendaRaw, kerndoelenDoc] = await Promise.all([
      fetchCentralStudioDoc(),
      fetchJson(CLASSES_URL).catch(() => ({})),
      fetchJson(AGENDA_URL).catch(() => ({ entries: [] })),
      loadKerndoelenDoc(KERNDOELEN_URL).catch(() => null),
    ]);
    const hadDirtyStudioCache = Boolean(localStorage.getItem(STUDIO_DIRTY_KEY));
    studioDirty = hadDirtyStudioCache;
    state.doc = storedStudioDoc(planningRaw);
    ensureMentorLessonPlanning(planningRaw);
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
    state.layers = [...new Set([...classLayers, ...SPECIAL_PLANNING_LAYERS, ...docLayers])]
      .sort((a, b) => layerLabel(a).localeCompare(layerLabel(b), 'nl', { numeric: true, sensitivity: 'base' }));
    state.selectedLayer = state.layers.includes(context.selectedLayer) ? context.selectedLayer : (state.layers[0] || '3');
    state.selectedProgressClass = String(context.selectedProgressClass || '').trim();
    state.selectedProject = String(context.selectedProject || '').trim();
    state.selectedLessonKey = String(context.selectedLessonKey || '').trim();
    state.expandedProject = String(context.expandedProject || state.selectedProject || '').trim();
    state.selectedReadingClass = String(context.selectedReadingClass || '').trim();
    state.selectedTab = String(context.selectedTab || 'studio');
    state.editorTab = String(context.editorTab || 'presentation');
    if (!state.selectedProject) state.selectedProject = projectNames()[0] || '';
    if (!selectedLesson()) {
      const first = visibleLessonsForLayer(state.selectedLayer).find((lesson) => lesson.project === state.selectedProject) || visibleLessonsForLayer(state.selectedLayer)[0];
      state.selectedLessonKey = first ? lessonKey(first) : '';
      state.selectedProject = first?.project || projectNames()[0] || '';
      state.expandedProject = state.selectedProject;
    }
    renderAll();
    setMainView(state.selectedTab);
    setEditorTab(state.editorTab);
    syncUndoBaseline();
    if (hadDirtyStudioCache) scheduleSave('Lokale wijzigingen teruggezet. Online zetten...');
    else setGlobalStatus('Alles opgeslagen', 'success');
  } catch (err) {
    console.error(err);
    setGlobalStatus(`Laden mislukt: ${err?.message || err}`, 'error');
  }
}

els.tabs.forEach((tab) => tab.addEventListener('click', () => setMainView(tab.dataset.view)));
els.layerSelect.addEventListener('change', () => {
  state.selectedLayer = els.layerSelect.value;
  state.selectedProgressClass = classIdsForLayer(state.selectedLayer)[0] || normalizeClassId(state.selectedLayer);
  const first = visibleLessonsForLayer(state.selectedLayer)[0];
  state.selectedLessonKey = first ? lessonKey(first) : '';
  state.selectedProject = first?.project || projectNames()[0] || '';
  state.expandedProject = state.selectedProject;
  state.selectedReadingClass = classIdsForLayer(state.selectedLayer)[0] || '';
  saveContext();
  renderAll();
});
els.progressClassSelect?.addEventListener('change', () => {
  state.selectedProgressClass = els.progressClassSelect.value;
  saveContext();
  renderTimeline();
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
els.clearPlanningBtn.addEventListener('click', clearSelectedPlanning);
els.newProjectBtn.addEventListener('click', createProject);
els.openPresentationBtn.addEventListener('click', openSelectedPresentation);
els.openBoardPresentationBtn?.addEventListener('click', openSelectedPresentation);
els.markLessonDoneBtn?.addEventListener('click', markSelectedLessonProgress);
els.openNetschriftBtn?.addEventListener('click', openSelectedNetschriftCheck);
els.selectNextLessonBtn?.addEventListener('click', selectNextLesson);
els.unplanLessonBtn.addEventListener('click', unplanSelectedLesson);
els.deletePresentationBtn.addEventListener('click', deleteSelectedPresentation);
els.undoLastChangeBtn?.addEventListener('click', restoreLastChange);
els.retryPublishBtn.addEventListener('click', () => publishAll({ auto: false }));
els.dialogCloseBtn.addEventListener('click', () => els.presentationDialog.close());
els.presentationDialog.addEventListener('close', () => {
  els.presentationDialog.classList.remove('is-presentation-mode', 'is-local-slides');
  if (els.dialogFrame) {
    els.dialogFrame.hidden = false;
    els.dialogFrame.src = 'about:blank';
  }
  els.dialogStage.hidden = true;
  els.dialogPrevBtn.hidden = true;
  els.dialogCounter.hidden = true;
  els.dialogNextBtn.hidden = true;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
});
window.addEventListener('message', (event) => {
  if (event.source !== els.dialogFrame?.contentWindow) return;
  if (event.data?.type !== 'lesstudio:presentation-preview-close') return;
  if (els.presentationDialog?.open) els.presentationDialog.close();
});
els.dialogPrevBtn.addEventListener('click', () => stepDialog(-1));
els.dialogNextBtn.addEventListener('click', () => stepDialog(1));
document.querySelectorAll('[data-editor-tab]').forEach((button) => button.addEventListener('click', () => setEditorTab(button.dataset.editorTab)));
document.querySelectorAll('[data-slide-snippet]').forEach((button) => {
  button.addEventListener('click', () => insertSlideSnippet(button.dataset.slideSnippet));
});
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
  flushEditorToStudioCache();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushEditorToStudioCache();
});

boot();
