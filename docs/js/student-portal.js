import { buildProjectSnapshot, loadKerndoelenDoc, slugifyProject } from './kerndoelen-data.js';

const CONFIG = window.STUDENT_PORTAL_CONFIG || {};
const PLANNING_URL = String(CONFIG.planningUrl || 'js/jaarplanning-live.json');
const CLASSES_URL = String(CONFIG.classesUrl || 'js/leerlingen_per_klas.json');
const AGENDA_URL = String(CONFIG.agendaUrl || 'js/zermelo-agenda-live.json');
const KERNDOELEN_URL = String(CONFIG.kerndoelenUrl || 'data/kerndoelen/kerndoelen-map.json');
const USE_LOCAL_STUDIO_DRAFT = CONFIG.useLocalStudioDraft === true;
const CURRENT_CLASS_KEY = 'student.portal.class';
const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const PLATFORM_REFRESH_KEY = 'lespresentatie.platformRefresh';

const classSelect = document.getElementById('classSelect');
const jumpToCurrentWeekBtn = document.getElementById('jumpToCurrentWeekBtn');
const openNextPresentationBtn = document.getElementById('openNextPresentationBtn');
const portalMeta = document.getElementById('portalMeta');
const currentWeekTitle = document.getElementById('currentWeekTitle');
const currentWeekSummary = document.getElementById('currentWeekSummary');
const currentWeekFocus = document.getElementById('currentWeekFocus');
const homeworkSummary = document.getElementById('homeworkSummary');
const projectSummary = document.getElementById('projectSummary');
const projectRubricTitle = document.getElementById('projectRubricTitle');
const projectRubricMeta = document.getElementById('projectRubricMeta');
const projectRubricSummary = document.getElementById('projectRubricSummary');
const projectRubricSkills = document.getElementById('projectRubricSkills');
const projectRubricLabels = document.getElementById('projectRubricLabels');
const currentWeekChip = document.getElementById('currentWeekChip');
const weeksGrid = document.getElementById('weeksGrid');
const weekJumpBar = document.getElementById('weekJumpBar');
const submissionMoments = document.getElementById('submissionMoments');
const timelineDetails = document.getElementById('timelineDetails');
const heroWeekValue = document.getElementById('heroWeekValue');
const heroPresentationCount = document.getElementById('heroPresentationCount');
const heroHomeworkCount = document.getElementById('heroHomeworkCount');
const presentationDialog = document.getElementById('presentationDialog');
const dialogTitle = document.getElementById('dialogTitle');
const dialogMeta = document.getElementById('dialogMeta');
const dialogStage = document.getElementById('dialogStage');
const dialogPrev = document.getElementById('dialogPrev');
const dialogNext = document.getElementById('dialogNext');
const dialogCounter = document.getElementById('dialogCounter');
const netschriftDialog = document.getElementById('netschriftDialog');
const netschriftDialogMeta = document.getElementById('netschriftDialogMeta');
const netschriftDialogBody = document.getElementById('netschriftDialogBody');
const posterDialog = document.getElementById('posterDialog');
const posterDialogMeta = document.getElementById('posterDialogMeta');
const posterDialogBody = document.getElementById('posterDialogBody');

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  kerndoelenDoc: null,
  agendaEntries: [],
  classes: [],
  currentClass: '',
  currentWeek: currentIsoWeek(),
  activePresentation: null,
  activePresentationTarget: null,
  activeSlideIndex: 0,
  nextLessonTarget: null,
  nextLessonAnchorId: null,
};

const UNTITLED_PROJECT_LABEL = 'Losse lessen';
const NETSCHRIFT_SUBMISSION_PREFIX = 'INLEVERMOMENT_NETSCHRIFT:';
const PROJECT_ORDER_BY_GRADE = {
  1: [
    'Heel veel lezen',
    'Netschrift',
    'Droomschool',
    'Verweggers',
    'Taaltopia',
    'Spiegeldicht',
    'Nutspot',
    'Klasfeed',
  ],
  3: [
    'Heel veel lezen',
    'Netschrift',
    'Grenzen van Literatuur',
    'Faalfestival',
    'V-rede',
  ],
  4: [
    'Heel veel lezen',
    'Netschrift',
    'Persoonlijkheid',
    'Technologie',
    'Renaissance',
    'Schrijfstijl',
    'De krater / De eerlijke vinder',
    'Onder de Paramariboom',
    'Invloed',
    'Taalmakers',
  ],
};
const CURRENT_PROGRESS_ANCHORS = [
  { grade: '1', project: 'Taaltopia', lessonNumber: 6, anchorDate: '2026-05-28', useProjectOnFirstLesson: true },
  { classIds: ['G3E', '3E'], project: 'V-rede', lessonNumber: 3, anchorDate: '2026-05-28', useProjectOnFirstLesson: true },
  { grade: '3', project: 'V-rede', lessonNumber: 3, anchorDate: '2026-05-22' },
  { classIds: ['G4D', '4G4', '4.4'], project: 'Invloed', lessonNumber: 8, anchorDate: '2026-05-28' },
  { classIds: ['G4E', '4G5', '4.5'], project: 'Invloed', lessonNumber: 8, anchorDate: '2026-05-28' },
];
const READING_LESSON_EXCEPTIONS = [
  { classIds: ['G4D', '4G4', '4.4'], date: '2026-05-28', lessonNumber: 1 },
  { classIds: ['G4E', '4G5', '4.5'], date: '2026-05-28', lessonNumber: 2 },
  { classIds: ['G1D', '1D', 'G3B', '3B', 'G3E', '3E', 'G3F', '3F', 'G3G', '3G', 'G4E', '4G5', '4.5'], date: '2026-06-01', lessonNumber: 1 },
];
const LESSON_SLOT_INDEX = { A: 1, B: 2, C: 3 };
const BASE_SCHEDULE = {
  G1D: [
    { slot: 'A', day: 1, start: '09:00', end: '09:45', room: 'H215' },
    { slot: 'B', day: 4, start: '09:00', end: '09:45', room: 'H216' },
    { slot: 'C', day: 5, start: '14:20', end: '15:05', room: 'H215' },
  ],
  G3B: [
    { slot: 'A', day: 1, start: '14:40', end: '15:25', room: 'H215' },
    { slot: 'B', day: 5, start: '08:15', end: '09:00', room: 'H215' },
  ],
  G3E: [
    { slot: 'A', day: 1, start: '12:50', end: '13:35', room: 'H215' },
    { slot: 'B', day: 4, start: '08:15', end: '09:00', room: 'H216' },
  ],
  G3F: [
    { slot: 'A', day: 1, start: '10:50', end: '11:35', room: 'H215' },
    { slot: 'B', day: 5, start: '13:35', end: '14:20', room: 'H215' },
  ],
  G3G: [
    { slot: 'A', day: 1, start: '13:35', end: '14:20', room: 'H215' },
    { slot: 'B', day: 5, start: '09:45', end: '10:30', room: 'H215' },
  ],
  G4D: [
    { slot: 'A', day: 4, start: '12:50', end: '13:35', room: 'H216' },
    { slot: 'B', day: 5, start: '10:50', end: '11:35', room: 'H215' },
    { slot: 'C', day: 5, start: '11:35', end: '12:20', room: 'H215' },
  ],
  G4E: [
    { slot: 'A', day: 1, start: '09:45', end: '10:30', room: 'H215' },
    { slot: 'B', day: 4, start: '10:50', end: '11:35', room: 'H216' },
    { slot: 'C', day: 4, start: '11:35', end: '12:20', room: 'H216' },
  ],
};
const READING_PROJECT_NAME = 'heel veel lezen';
const PROTECTED_START_PROJECTS = new Set(['heel veel lezen', 'netschrift']);
const POSTER_PRESENTATION_PROJECTS = new Set([
  'faalfestival',
  'renaissance',
  'taalmakers',
  'droomschool',
  'taaltopia',
]);
const STANDARD_READING_LESSON = {
  project: 'Heel veel lezen',
  lesson: 'Heel veel lezen',
  lessonKey: 'READ',
  presentationId: '',
  presentationMarkerId: '',
  homework: 'leesboek en schoolpasje mee',
  isStandardReadingLesson: true,
};

function normalizeClassId(raw) {
  const cid = String(raw || '').replace(/\s+/g, '').toUpperCase();
  if (cid === '5G3') return '';
  if (cid === '4G4' || cid === '4.4') return 'G4D';
  if (cid === '4G5' || cid === '4.5') return 'G4E';
  return cid;
}

function gradeLayerFromClassId(rawClassId) {
  const cid = normalizeClassId(rawClassId);
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

function parseWeek(weekRaw) {
  const cleaned = String(weekRaw || '').trim().toUpperCase();
  if (!cleaned) return NaN;
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  const prefixed = cleaned.match(/^W(\d{1,2})$/);
  if (prefixed) return Number(prefixed[1]);
  const iso = cleaned.match(/^\d{4}-W(\d{1,2})$/);
  return iso ? Number(iso[1]) : NaN;
}

function academicWeekOrder(weekRaw) {
  const week = parseWeek(weekRaw);
  if (!Number.isFinite(week)) return Number.POSITIVE_INFINITY;
  return week >= 32 ? week - 32 : week + 21;
}

function currentIsoWeek() {
  const now = new Date();
  const local = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
}

function isoWeekForDate(date) {
  const value = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  if (Number.isNaN(value.getTime())) return NaN;
  const local = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
}

function normalizeDoc(raw) {
  const safe = raw && typeof raw === 'object' ? structuredClone(raw) : {};
  if (!Array.isArray(safe.entries)) safe.entries = [];
  if (!Array.isArray(safe.holidays)) safe.holidays = [];
  if (!Array.isArray(safe.schoolCalendar)) safe.schoolCalendar = [];
  if (!safe.presentations || typeof safe.presentations !== 'object') safe.presentations = {};
  safe.entries = safe.entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      classId: normalizeClassId(entry.classId),
      week: String(entry.week || '').trim(),
      lessons: Array.isArray(entry.lessons) ? entry.lessons : [],
      items: Array.isArray(entry.items) ? entry.items.map((item) => String(item).trim()).filter(Boolean) : [],
      note: String(entry.note || '').trim(),
    }))
    .filter((entry) => entry.classId && entry.week);
  safe.holidays = safe.holidays
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      title: String(entry.title || '').trim(),
      startDate: String(entry.startDate || '').trim(),
      endDate: String(entry.endDate || '').trim(),
    }))
    .filter((entry) => entry.startDate && entry.endDate);
  safe.schoolCalendar = safe.schoolCalendar
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      title: String(entry.title || '').trim(),
      scope: String(entry.scope || '').trim(),
      grade: String(entry.grade || '').trim(),
      startDate: String(entry.startDate || '').trim(),
      endDate: String(entry.endDate || '').trim(),
      impact: String(entry.impact || '').trim(),
      signals: Array.isArray(entry.signals) ? entry.signals.map((signal) => String(signal || '').trim()).filter(Boolean) : [],
    }))
    .filter((entry) => entry.startDate && entry.endDate);
  return safe;
}

function parseDocTimestamp(doc) {
  const stamp = Date.parse(String(doc?.updatedAt || '').trim());
  return Number.isFinite(stamp) ? stamp : 0;
}

function loadStudioDocFromStorage() {
  if (!USE_LOCAL_STUDIO_DRAFT) return null;
  const raw = String(localStorage.getItem(STUDIO_KEY) || '').trim();
  if (!raw) return null;
  try {
    return normalizeDoc(JSON.parse(raw));
  } catch {
    return null;
  }
}

function preferFreshStudioDoc(baseDoc) {
  const studioDoc = loadStudioDocFromStorage();
  if (!studioDoc) return normalizeDoc(baseDoc);
  const baseStamp = parseDocTimestamp(baseDoc);
  const studioStamp = parseDocTimestamp(studioDoc);
  return studioStamp && (!baseStamp || studioStamp >= baseStamp)
    ? studioDoc
    : normalizeDoc(baseDoc);
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

function classesFromClassMap(classMap = {}) {
  return Object.keys(classMap).map((cid) => normalizeClassId(cid)).filter(Boolean);
}

function lessonLetter(index) {
  return ['A', 'B', 'C'][Math.max(0, Math.min(2, index - 1))] || '';
}

function letterToIndex(value) {
  const letter = String(value || '').trim().toUpperCase();
  const code = letter.charCodeAt(0);
  if (!letter || code < 65 || code > 90) return 0;
  return code - 64;
}

function indexToLetter(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 26) return '';
  return String.fromCharCode(64 + number);
}

function getWeekBounds(date = new Date()) {
  const day = date.getDay() || 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function agendaEntrySlotSignature(entry) {
  if (!entry?.start || !entry?.end) return '';
  const start = entry.start instanceof Date ? entry.start : new Date(entry.start);
  const end = entry.end instanceof Date ? entry.end : new Date(entry.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const day = (start.getDay() || 7) - 1;
  const duration = end.getTime() - start.getTime();
  return `${day}-${start.getHours()}:${start.getMinutes()}-${duration}`;
}

function minutesFromTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function baseScheduleForClass(classId) {
  for (const alias of classPlanningAliases(classId)) {
    if (BASE_SCHEDULE[alias]) return BASE_SCHEDULE[alias].map((slot) => ({ ...slot }));
  }
  return [];
}

function baseScheduleSlotByDayTime(classId, day, minutes) {
  if (!Number.isFinite(day) || !Number.isFinite(minutes)) return null;
  return baseScheduleForClass(classId).find((slot) => (
    Number(slot.day) === day
    && minutesFromTime(slot.start) === minutes
  )) || null;
}

function baseScheduleSlotForEntry(entry) {
  if (!entry?.start) return null;
  const start = entry.start instanceof Date ? entry.start : new Date(entry.start);
  if (Number.isNaN(start.getTime())) return null;
  const weekday = start.getDay() || 7;
  const minutes = start.getHours() * 60 + start.getMinutes();
  return baseScheduleSlotByDayTime(entry.classId, weekday, minutes);
}

function isDutchAgendaEntry(entry) {
  const text = `${entry?.summary || ''}\n${entry?.description || ''}`.toLowerCase();
  return /\bne\b|\bnetl\b/.test(text);
}

function parseDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekBoundsForWeekNumber(week) {
  const weekNumber = Number(week);
  if (!Number.isInteger(weekNumber)) return null;
  const monday = isoWeekMonday(academicIsoYearForWeek(weekNumber), weekNumber);
  if (!monday) return null;
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function academicIsoYearForWeek(weekRaw) {
  const week = parseWeek(weekRaw);
  const currentWeek = currentIsoWeek();
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(week) || !Number.isFinite(currentWeek)) return currentYear;
  if (currentWeek < 32 && week >= 32) return currentYear - 1;
  if (currentWeek >= 32 && week < 32) return currentYear + 1;
  return currentYear;
}

function formatDeadlineDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!(startA instanceof Date) || !(endA instanceof Date) || !(startB instanceof Date) || !(endB instanceof Date)) return false;
  return startA <= endB && startB <= endA;
}

function gradeMatchesCalendarEntry(classId, entry) {
  const grade = String(gradeLayerFromClassId(classId) || '').trim();
  const normalizedGrade = String(entry?.grade || '').trim().toUpperCase();
  const normalizedScope = String(entry?.scope || '').trim().toUpperCase();
  const accepted = new Set(['ALL', 'AL']);
  if (grade) {
    accepted.add(grade.toUpperCase());
    accepted.add(`G${grade}`.toUpperCase());
  }
  return accepted.has(normalizedGrade) || accepted.has(normalizedScope);
}

function textSignalsNoLessons(value) {
  const text = String(value || '').toLowerCase();
  return (
    text.includes('geen reguliere lessen')
    || text.includes('geen lessen')
    || text.includes('vakantie')
    || text.includes('vrije dag')
    || text.includes('studiedag')
    || text.includes('personeelsdag')
    || text.includes('cgu-week')
    || text.includes('cguweek')
  );
}

function weekHasPlannedException(classId, week) {
  const bounds = weekBoundsForWeekNumber(week);
  if (!bounds) return false;
  const entry = getEntryForWeek(classId, week);
  if (entry) {
    if (textSignalsNoLessons(entry.note)) return true;
    if ((entry.items || []).some((item) => textSignalsNoLessons(item))) return true;
  }

  if ((state.doc.holidays || []).some((holiday) => {
    const start = parseDateOnly(holiday.startDate);
    const end = parseDateOnly(holiday.endDate);
    return start && end && rangesOverlap(bounds.monday, bounds.sunday, start, end);
  })) {
    return true;
  }

  return (state.doc.schoolCalendar || []).some((calendarEntry) => {
    if (!gradeMatchesCalendarEntry(classId, calendarEntry)) return false;
    const start = parseDateOnly(calendarEntry.startDate);
    const end = parseDateOnly(calendarEntry.endDate);
    if (!start || !end || !rangesOverlap(bounds.monday, bounds.sunday, start, end)) return false;
    const signals = [calendarEntry.impact, ...(calendarEntry.signals || []), calendarEntry.title]
      .map((value) => String(value || '').toLowerCase());
    return signals.some((value) => (
      value.includes('no_lessons')
      || value.includes('vakantie')
      || value.includes('vrije dag')
      || value.includes('studiedag')
      || value.includes('personeelsdag')
      || value.includes('cgu')
    ));
  });
}

function inferAgendaLessonSlots(entries, classId) {
  const bySlot = new Map();
  const weeklyLessons = new Map();

  for (const entry of entries) {
    if (!(entry.classId === classId && isDutchAgendaEntry(entry))) continue;
    const week = isoWeekForDate(entry.start);
    const key = String(week);
    if (!weeklyLessons.has(key)) weeklyLessons.set(key, []);
    weeklyLessons.get(key).push(entry);
  }

  for (const lessonEntries of weeklyLessons.values()) {
    const ordered = [...lessonEntries].sort((left, right) => left.start - right.start);
    const week = isoWeekForDate(ordered[0]?.start);
    if (weekHasPlannedException(classId, week)) continue;
    ordered.forEach((entry, index) => {
      const signature = agendaEntrySlotSignature(entry);
      if (!signature) return;
      if (!bySlot.has(index)) bySlot.set(index, new Map());
      const bucket = bySlot.get(index);
      const current = bucket.get(signature);
      bucket.set(signature, {
        signature,
        count: (current?.count || 0) + 1,
        day: (entry.start.getDay() || 7) - 1,
        hour: entry.start.getHours(),
        minute: entry.start.getMinutes(),
        duration: entry.end.getTime() - entry.start.getTime(),
      });
    });
  }

  const resolved = [];
  for (const [slotIndex, variants] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) {
    const best = [...variants.values()].sort((left, right) => (
      right.count - left.count
      || left.day - right.day
      || left.hour - right.hour
      || left.minute - right.minute
    ))[0];
    resolved[slotIndex] = best || null;
  }
  return resolved.filter(Boolean);
}

function lessonNumberForAgendaWeek(entries, selectedEntry) {
  if (!selectedEntry) return 0;
  const baseSlot = baseScheduleSlotForEntry(selectedEntry);
  if (baseSlot?.slot && LESSON_SLOT_INDEX[baseSlot.slot]) {
    return LESSON_SLOT_INDEX[baseSlot.slot];
  }
  const signature = agendaEntrySlotSignature(selectedEntry);
  if (signature) {
    const slotPattern = inferAgendaLessonSlots(entries, selectedEntry.classId);
    const slotIndex = slotPattern.findIndex((item) => item.signature === signature);
    if (slotIndex >= 0) return slotIndex + 1;
  }
  const { monday, sunday } = getWeekBounds(selectedEntry.start);
  const inWeek = entries
    .filter((entry) => (
      entry.classId === selectedEntry.classId
      && isDutchAgendaEntry(entry)
      && entry.start >= monday
      && entry.start <= sunday
    ))
    .sort((left, right) => left.start - right.start);
  const index = inWeek.findIndex((entry) => entry.start.getTime() === selectedEntry.start.getTime());
  return index >= 0 ? index + 1 : 0;
}

function findAgendaEntryForCurrentOrNext(entries, now = new Date()) {
  const sorted = [...entries].sort((left, right) => left.start - right.start);
  if (!sorted.length) return null;
  return sorted.find((entry) => entry.start <= now && entry.end >= now)
    || sorted.find((entry) => entry.start >= now)
    || sorted.filter((entry) => entry.end <= now).at(-1)
    || null;
}

function formatLessonDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function formatLessonDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function normalizePlanEntry(entry) {
  return {
    lessons: Array.isArray(entry?.lessons) ? entry.lessons : [],
    items: Array.isArray(entry?.items) ? entry.items : [],
    note: String(entry?.note || '').trim(),
  };
}

function mergePlanEntries(...entries) {
  const merged = { lessons: [], items: [], note: '' };
  const seenLessons = new Set();
  const seenItems = new Set();
  const notes = [];

  for (const entry of entries) {
    const normalized = normalizePlanEntry(entry);
    for (const lesson of normalized.lessons) {
      const key = JSON.stringify(lesson || {});
      if (seenLessons.has(key)) continue;
      seenLessons.add(key);
      merged.lessons.push(lesson);
    }
    for (const item of normalized.items) {
      if (seenItems.has(item)) continue;
      seenItems.add(item);
      merged.items.push(item);
    }
    if (normalized.note && !notes.includes(normalized.note)) notes.push(normalized.note);
  }

  merged.lessons.sort((left, right) => String(left.lessonKey || '').localeCompare(String(right.lessonKey || '')));
  if (notes.length) merged.note = notes.join(' | ');
  return merged;
}

function classPlanningAliases(rawClassId) {
  const cid = normalizeClassId(rawClassId);
  const aliases = [];
  const push = (value) => {
    const normalized = normalizeClassId(value);
    if (normalized && !aliases.includes(normalized)) aliases.push(normalized);
  };
  push(cid);

  const lowerGradeLetter = cid.match(/^G([1-3])([A-Z])$/);
  if (lowerGradeLetter) push(`${lowerGradeLetter[1]}${lowerGradeLetter[2]}`);

  const lowerGradePlain = cid.match(/^([1-3])([A-Z])$/);
  if (lowerGradePlain) push(`G${lowerGradePlain[1]}${lowerGradePlain[2]}`);

  const upperGradeGroup = cid.match(/^([45])G(\d+)$/);
  if (upperGradeGroup) push(`${upperGradeGroup[1]}.${upperGradeGroup[2]}`);

  const upperGradePlanning = cid.match(/^([45])\.(\d+)$/);
  if (upperGradePlanning) {
    push(`${upperGradePlanning[1]}G${upperGradePlanning[2]}`);
    if (upperGradePlanning[1] === '4') {
      const letter = indexToLetter(Number(upperGradePlanning[2]));
      if (letter) push(`G4${letter}`);
    }
  }

  const upperGradeLetter = cid.match(/^G4([A-Z])$/);
  if (upperGradeLetter) {
    const idx = letterToIndex(upperGradeLetter[1]);
    if (idx) {
      push(`4G${idx}`);
      push(`4.${idx}`);
    }
  }
  if (cid === 'G4D') {
    push('4G4');
    push('4.4');
  }
  if (cid === 'G4E') {
    push('4G5');
    push('4.5');
  }

  return aliases;
}

function classSortKey(rawClassId) {
  const cid = normalizeClassId(rawClassId);
  const grade = Number(gradeLayerFromClassId(cid) || 99);
  const suffix = cid.replace(/^G?[1-6]/, '').replace(/^[45]G/, '');
  return `${String(grade).padStart(2, '0')}-${suffix}-${cid}`;
}

function getEntriesForClass(classId) {
  const aliases = classPlanningAliases(classId);
  const grade = gradeLayerFromClassId(classId);
  const gradeAliases = [`G${grade}`, grade].map((value) => normalizeClassId(value)).filter(Boolean);
  const weeks = new Set();

  for (const entry of state.doc.entries) {
    if ([...aliases, ...gradeAliases, 'ALL'].includes(entry.classId)) {
      weeks.add(String(entry.week));
    }
  }

  return [...weeks]
    .map((week) => getEntryForWeek(classId, week))
    .filter(Boolean)
    .sort((left, right) => parseWeek(left.week) - parseWeek(right.week));
}

function getEntryForWeek(classId, week) {
  const aliases = classPlanningAliases(classId);
  const grade = gradeLayerFromClassId(classId);
  const gradeAliases = [`G${grade}`, grade].map((value) => normalizeClassId(value)).filter(Boolean);
  const byId = (ids) => state.doc.entries.filter((entry) => ids.includes(entry.classId) && parseWeek(entry.week) === Number(week));
  const allEntries = byId(['ALL']);
  const gradeEntries = byId(gradeAliases);
  const classEntries = byId(aliases);
  const merged = mergePlanEntries(...allEntries, ...gradeEntries, ...classEntries);
  if (!merged.lessons.length && !merged.items.length && !merged.note) return null;
  return { classId: normalizeClassId(classId), week: String(week), ...merged };
}

function isNetschriftSubmissionItem(item) {
  return String(item || '').trim().startsWith(NETSCHRIFT_SUBMISSION_PREFIX);
}

function cleanNetschriftSubmissionItem(item) {
  return String(item || '').trim().replace(NETSCHRIFT_SUBMISSION_PREFIX, '').trim();
}

function submissionTimelineStatus(week) {
  const weekOrder = academicWeekOrder(week);
  const currentOrder = academicWeekOrder(state.currentWeek);
  if (!Number.isFinite(weekOrder) || !Number.isFinite(currentOrder)) {
    return { state: 'future', label: 'Nog te doen', icon: '○' };
  }
  if (weekOrder < currentOrder) return { state: 'done', label: 'Ingeleverd', icon: '✓' };
  if (weekOrder === currentOrder) return { state: 'active', label: 'Deze week inleveren', icon: '!' };
  return { state: 'future', label: 'Komt eraan', icon: '○' };
}

function submissionDeadlineDate(classId, week) {
  const weekNumber = parseWeek(week);
  if (!Number.isFinite(weekNumber)) return null;
  const agendaOptions = getAgendaLessonsForWeek(classId, weekNumber)
    .filter((entry) => {
      const date = entry.start instanceof Date ? entry.start : new Date(entry.start);
      if (Number.isNaN(date.getTime())) return false;
      const day = date.getDay() || 7;
      return day === 4 || day === 5;
    })
    .sort((left, right) => left.start - right.start);
  const agendaDeadline = agendaOptions[agendaOptions.length - 1]?.start || null;
  if (agendaDeadline) return agendaDeadline instanceof Date ? agendaDeadline : new Date(agendaDeadline);

  const monday = isoWeekMonday(academicIsoYearForWeek(weekNumber), weekNumber);
  if (!monday) return null;
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return friday;
}

function getNetschriftSubmissionMomentsForClass(classId) {
  return getEntriesForClass(classId)
    .flatMap((entry) => (entry.items || [])
      .filter(isNetschriftSubmissionItem)
      .map((item) => ({
        week: String(entry.week),
        text: cleanNetschriftSubmissionItem(item),
        ...submissionTimelineStatus(entry.week),
      })))
    .sort((left, right) => academicWeekOrder(left.week) - academicWeekOrder(right.week))
    .map((moment, index) => {
      const deadline = submissionDeadlineDate(classId, moment.week);
      const deadlineLabel = formatDeadlineDate(deadline);
      return {
        ...moment,
        number: index + 1,
        deadline,
        deadlineLabel,
      };
    });
}

function getNextNetschriftSubmissionMoment(classId) {
  return getNetschriftSubmissionMomentsForClass(classId)
    .find((moment) => moment.state !== 'done') || null;
}

function agendaMatchesClass(entry, classId) {
  const agendaClassId = normalizeClassId(entry?.classId);
  if (!agendaClassId) return false;
  return classPlanningAliases(classId).includes(agendaClassId);
}

function getAgendaLessonsForWeek(classId, week) {
  const weekNumber = Number(week);
  return state.agendaEntries
    .filter((entry) => (
      agendaMatchesClass(entry, classId)
      && isDutchAgendaEntry(entry)
      && isoWeekForDate(entry.start) === weekNumber
    ))
    .sort((left, right) => left.start - right.start);
}

function getScheduledLessonForWeek(classId, week, lessonKey) {
  const lessons = getAgendaLessonsForWeek(classId, week);
  const slotIndex = ['A', 'B', 'C'].indexOf(String(lessonKey || '').trim().toUpperCase());
  if (slotIndex < 0) return null;
  const slotPattern = inferAgendaLessonSlots(state.agendaEntries, normalizeClassId(classId));
  const expectedSignature = slotPattern[slotIndex]?.signature || '';
  if (expectedSignature) {
    const matchedLesson = lessons.find((entry) => agendaEntrySlotSignature(entry) === expectedSignature) || null;
    if (matchedLesson) return matchedLesson;
  }
  return lessons[slotIndex] || null;
}

function inferScheduledLessonForWeek(classId, week, lessonKey) {
  const slotIndex = ['A', 'B', 'C'].indexOf(String(lessonKey || '').trim().toUpperCase());
  if (slotIndex < 0) return null;
  const pattern = inferAgendaLessonSlots(state.agendaEntries, classId)[slotIndex];
  if (!pattern) return null;

  const weekNumber = Number(week);
  if (!Number.isFinite(weekNumber)) return null;
  const year = new Date().getFullYear();
  const monday = isoWeekMonday(year, weekNumber);
  if (!monday) return null;

  const start = new Date(monday);
  const dayOffset = Number(pattern.day || 0);
  start.setDate(monday.getDate() + dayOffset);
  start.setHours(pattern.hour, pattern.minute, 0, 0);
  const end = new Date(start.getTime() + pattern.duration);

  return {
    classId: normalizeClassId(classId),
    start,
    end,
    inferred: true,
  };
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

function sameMinute(valueA, valueB) {
  return Math.abs(valueA.getTime() - valueB.getTime()) < 60000;
}

function getPairedBlockAgendaEntry(classId, firstEntry) {
  if (!firstEntry) return null;
  return state.agendaEntries.find((entry) => (
    entry !== firstEntry
    && agendaMatchesClass(entry, classId)
    && isDutchAgendaEntry(entry)
    && sameMinute(entry.start, firstEntry.end)
  )) || null;
}

function lessonIdentity(lesson) {
  return `${parseWeek(lesson?.week)}__${String(lesson?.lessonKey || '').trim().toUpperCase()}`;
}

function findLessonIndexByIdentity(lessons, targetLesson) {
  const targetIdentity = lessonIdentity(targetLesson);
  return lessons.findIndex((lesson) => lessonIdentity(lesson) === targetIdentity);
}

function getAgendaEntriesForClass(classId) {
  return state.agendaEntries
    .filter((entry) => (
      agendaMatchesClass(entry, classId)
      && isDutchAgendaEntry(entry)
    ))
    .sort((left, right) => left.start - right.start);
}

function agendaEntryWeekKey(entry) {
  const date = entry?.start instanceof Date ? entry.start : new Date(entry?.start || '');
  if (Number.isNaN(date.getTime())) return '';
  return String(isoWeekForDate(date));
}

function isSameAgendaEntry(left, right) {
  if (!left || !right) return false;
  const leftStart = left.start instanceof Date ? left.start : new Date(left.start || '');
  const rightStart = right.start instanceof Date ? right.start : new Date(right.start || '');
  return !Number.isNaN(leftStart.getTime())
    && !Number.isNaN(rightStart.getTime())
    && leftStart.getTime() === rightStart.getTime()
    && normalizeClassId(left.classId) === normalizeClassId(right.classId);
}

function isLastDutchAgendaEntryOfWeek(classId, agendaEntry, agendaEntries = getAgendaEntriesForClass(classId)) {
  if (!agendaEntry) return false;
  const weekKey = agendaEntryWeekKey(agendaEntry);
  if (!weekKey) return false;
  const weekEntries = agendaEntries
    .filter((entry) => agendaEntryWeekKey(entry) === weekKey)
    .sort((left, right) => left.start - right.start);
  const lastEntry = weekEntries[weekEntries.length - 1] || null;
  return isSameAgendaEntry(lastEntry, agendaEntry);
}

function protectedStartLessonCount(lessons) {
  let count = 0;
  for (const lesson of lessons) {
    const project = String(lesson?.project || '').trim().toLocaleLowerCase('nl-NL');
    if (!PROTECTED_START_PROJECTS.has(project)) break;
    count += 1;
  }
  return count;
}

function projectAnchorIndexFromAgenda(classId, lessons, agendaEntries, now = new Date()) {
  const protectedCount = protectedStartLessonCount(lessons);
  let projectIndex = 0;

  for (const agendaEntry of agendaEntries) {
    const end = agendaEntry.end instanceof Date ? agendaEntry.end : new Date(agendaEntry.end || agendaEntry.start);
    if (Number.isNaN(end.getTime()) || end >= now) continue;
    if (projectIndex < protectedCount) {
      projectIndex += 1;
    } else if (isLastDutchAgendaEntryOfWeek(classId, agendaEntry, agendaEntries)) {
      projectIndex += 1;
    }
    if (projectIndex >= lessons.length) return lessons.length;
  }

  return Math.min(projectIndex, lessons.length);
}

function shouldUseProjectLessonForAgendaEntry(classId, agendaEntry, anchorIndex, agendaEntries, lessons) {
  if (!agendaEntry) return true;
  if (anchorIndex < protectedStartLessonCount(lessons)) return true;
  return isLastDutchAgendaEntryOfWeek(classId, agendaEntry, agendaEntries);
}

function getCurrentProgressAnchor(classId) {
  const normalizedClassId = normalizeClassId(classId);
  const classAliases = classPlanningAliases(normalizedClassId);
  const grade = gradeLayerFromClassId(normalizedClassId);
  return CURRENT_PROGRESS_ANCHORS.find((anchor) => {
    const classIds = Array.isArray(anchor.classIds)
      ? anchor.classIds.map((value) => normalizeClassId(value))
      : [];
    if (classIds.some((value) => classAliases.includes(value))) return true;
    return String(anchor.grade || '') === grade;
  }) || null;
}

function lessonNumberFromTitle(value) {
  const match = String(value || '').trim().match(/^(?:les\s*)?\D*(\d+)/i);
  return match ? Number(match[1]) : NaN;
}

function localDateRange(dateText) {
  const match = String(dateText || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isReadingLessonException(classId, agendaEntry, agendaEntries = getAgendaEntriesForClass(classId)) {
  if (!agendaEntry?.start) return false;
  const date = localDateKey(agendaEntry.start);
  const lessonNumber = lessonNumberForAgendaWeek(agendaEntries, agendaEntry);
  const aliases = classPlanningAliases(classId);
  return READING_LESSON_EXCEPTIONS.some((exception) => {
    const classIds = Array.isArray(exception.classIds)
      ? exception.classIds.map((value) => normalizeClassId(value))
      : [];
    return String(exception.date || '') === date
      && Number(exception.lessonNumber) === lessonNumber
      && classIds.some((value) => aliases.includes(value));
  });
}

function progressAnchorUsesProjectForAgendaEntry(classId, anchor, agendaEntries, agendaEntry) {
  if (isReadingLessonException(classId, agendaEntry, agendaEntries)) return false;
  if (!agendaEntry) return false;
  if (anchor.useProjectOnFirstLesson) return true;
  if (lessonNumberForAgendaWeek(agendaEntries, agendaEntry) <= 1) return false;
  if (Array.isArray(anchor.classIds) && anchor.classIds.length && !isLastDutchAgendaEntryOfWeek(classId, agendaEntry, agendaEntries)) {
    return false;
  }
  return true;
}

function progressAnchorAgendaOffset(classId, anchor, agendaEntries, targetEntry, now = new Date()) {
  const anchorRange = localDateRange(anchor.anchorDate);
  if (!anchorRange) return 0;
  const classEntries = agendaEntries
    .filter((entry) => entry?.start && entry.start >= anchorRange.start)
    .sort((left, right) => left.start - right.start);
  const anchorEntryIndex = classEntries.findIndex((entry) => (
    entry.start >= anchorRange.start
    && progressAnchorUsesProjectForAgendaEntry(classId, anchor, agendaEntries, entry)
  ));
  if (anchorEntryIndex < 0) return 0;
  const targetIndex = targetEntry
    ? classEntries.findIndex((entry) => isSameAgendaEntry(entry, targetEntry))
    : -1;
  if (targetIndex > anchorEntryIndex) return targetIndex - anchorEntryIndex;
  if (targetIndex >= 0) return 0;
  return classEntries.filter((entry, index) => {
    const end = entry.end instanceof Date ? entry.end : new Date(entry.end || entry.start);
    return index >= anchorEntryIndex && !Number.isNaN(end.getTime()) && end < now;
  }).length;
}

function findProgressAnchorLesson(classId, agendaEntries, targetEntry, now = new Date()) {
  const anchor = getCurrentProgressAnchor(classId);
  if (!anchor) return null;
  const projectName = String(anchor.project || '').trim().toLocaleLowerCase('nl-NL');
  const targetLessonNumbers = (Array.isArray(anchor.lessonNumbers) ? anchor.lessonNumbers : [anchor.lessonNumber])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!projectName || !targetLessonNumbers.length) return null;

  const orderedLessons = getProjectOrderedLessonsForClass(classId)
    .filter((candidate) => String(candidate.project || '').trim().toLocaleLowerCase('nl-NL') !== READING_PROJECT_NAME);
  const anchorIndexes = targetLessonNumbers
    .map((lessonNumber) => orderedLessons.findIndex((candidate) => (
      String(candidate.project || '').trim().toLocaleLowerCase('nl-NL') === projectName
      && lessonNumberFromTitle(candidate.lesson) === lessonNumber
    )))
    .filter((index) => index >= 0);
  if (!orderedLessons.length || !anchorIndexes.length) return null;

  const bundleSize = anchorIndexes.length;
  const offset = progressAnchorAgendaOffset(classId, anchor, agendaEntries, targetEntry, now);
  const startIndex = Math.min(...anchorIndexes) + (offset <= 0 ? 0 : bundleSize + offset - 1);
  const lesson = orderedLessons[startIndex] || null;
  if (!lesson) return null;
  const lessonKey = String(lesson.lessonKey || '').trim().toUpperCase();
  const entry = getEntryForWeek(classId, lesson.week);
  if (!entry || !lessonKey) return null;
  return { entry, lesson, lessonKey, anchor, bundleSize };
}

function getClassProgressAnchor(classId, now = new Date()) {
  const lessons = getProjectOrderedLessonsForClass(classId);
  if (!lessons.length) return null;

  const agendaEntries = getAgendaEntriesForClass(classId);
  const selectedEntry = findAgendaEntryForCurrentOrNext(agendaEntries, now);
  const anchorLesson = findProgressAnchorLesson(classId, agendaEntries, selectedEntry, now);
  if (anchorLesson) {
    return {
      doneAll: false,
      source: 'anchor',
      anchorIndex: findLessonIndexByIdentity(lessons, anchorLesson.lesson),
      agendaEntry: selectedEntry,
      useProjectLessonForAgendaEntry: Boolean(anchorLesson.anchor?.useProjectOnFirstLesson)
        || lessonNumberForAgendaWeek(agendaEntries, selectedEntry) > 1,
      ...anchorLesson,
    };
  }

  const anchorIndex = projectAnchorIndexFromAgenda(classId, lessons, agendaEntries, now);

  if (anchorIndex >= lessons.length) {
    return { doneAll: true, anchorIndex, agendaEntry: selectedEntry };
  }

  const lesson = lessons[anchorIndex];
  const lessonKey = String(lesson.lessonKey || '').trim().toUpperCase();
  const entry = getEntryForWeek(classId, lesson.week);
  if (!entry || !lessonKey) return null;
  return {
    doneAll: false,
    source: 'zermelo',
    anchorIndex,
    agendaEntry: selectedEntry,
    useProjectLessonForAgendaEntry: shouldUseProjectLessonForAgendaEntry(classId, selectedEntry, anchorIndex, agendaEntries, lessons),
    entry,
    lesson,
    lessonKey,
  };
}

function findNextLessonForClass(classId, now = new Date()) {
  const progressAnchor = getClassProgressAnchor(classId, now);
  if (progressAnchor?.doneAll) return null;
  const nextAgendaEntry = progressAnchor?.agendaEntry || null;
  const fallbackLessons = getProjectOrderedLessonsForClass(classId);
  const fallbackLesson = fallbackLessons.find((candidate) => (
    progressAnchor
      ? findLessonIndexByIdentity(fallbackLessons, candidate) >= progressAnchor.anchorIndex
      : getLessonTimelineStatus(classId, candidate, now).state !== 'done'
  ))
    || fallbackLessons[0]
    || null;
  const useStandardReadingLesson = Boolean(
    nextAgendaEntry
    && progressAnchor
    && (
      !progressAnchor.useProjectLessonForAgendaEntry
      || isReadingLessonException(classId, nextAgendaEntry, getAgendaEntriesForClass(classId))
    )
  );
  if (!nextAgendaEntry) {
    if (!fallbackLesson) return null;
    const fallbackEntry = getEntryForWeek(classId, fallbackLesson.week);
    const fallbackLessonKey = String(fallbackLesson.lessonKey || '').trim().toUpperCase();
    if (!fallbackEntry || !fallbackLessonKey) return null;
    const target = buildPresentationTarget({
      classId,
      week: String(fallbackEntry.week),
      lessonKey: fallbackLessonKey,
      ...fallbackLesson,
    });
    const resolved = resolvePresentation(target);
    return {
      entry: fallbackEntry,
      lesson: fallbackLesson,
      lessonKey: fallbackLessonKey,
      date: null,
      pairedLesson: null,
      pairedLessonKey: '',
      pairedDate: null,
      isBlockHour: false,
      target,
      hasPresentation: Boolean(resolved.presentation),
      hasAgendaDate: false,
      progressSource: progressAnchor?.source || 'fallback',
    };
  }

  const entry = progressAnchor?.entry || null;
  const lessonKey = progressAnchor?.lessonKey || '';
  const lesson = progressAnchor?.lesson || null;
  const resolvedEntry = entry || (fallbackLesson ? getEntryForWeek(classId, fallbackLesson.week) : null);
  const resolvedLesson = useStandardReadingLesson
    ? { ...STANDARD_READING_LESSON, week: String(resolvedEntry?.week || isoWeekForDate(nextAgendaEntry.start)) }
    : (lesson || fallbackLesson);
  const resolvedLessonKey = useStandardReadingLesson
    ? STANDARD_READING_LESSON.lessonKey
    : (lesson ? lessonKey : String(fallbackLesson?.lessonKey || '').trim().toUpperCase());
  if (!resolvedEntry || !resolvedLesson || !resolvedLessonKey) return null;
  const target = buildPresentationTarget({
    classId,
    week: String(resolvedEntry.week),
    lessonKey: resolvedLessonKey,
    ...resolvedLesson,
    scheduledDate: nextAgendaEntry.start.toISOString(),
  });
  const resolved = useStandardReadingLesson ? { presentation: null } : resolvePresentation(target);
  const pairedAgendaEntry = getPairedBlockAgendaEntry(classId, nextAgendaEntry);
  const pairedUsesProjectLesson = pairedAgendaEntry
    ? !isReadingLessonException(classId, pairedAgendaEntry, getAgendaEntriesForClass(classId))
      && shouldUseProjectLessonForAgendaEntry(classId, pairedAgendaEntry, progressAnchor?.anchorIndex ?? 0, getAgendaEntriesForClass(classId), fallbackLessons)
    : false;
  const pairedProjectIndex = (progressAnchor?.anchorIndex ?? fallbackLessons.findIndex((candidate) => candidate === resolvedLesson))
    + (useStandardReadingLesson ? 0 : 1);
  const pairedLesson = pairedAgendaEntry && pairedUsesProjectLesson
    ? fallbackLessons[pairedProjectIndex] || null
    : pairedAgendaEntry
      ? { ...STANDARD_READING_LESSON, week: String(resolvedEntry.week) }
      : null;
  const pairedLessonKey = pairedLesson?.isStandardReadingLesson
    ? STANDARD_READING_LESSON.lessonKey
    : String(pairedLesson?.lessonKey || '').trim().toUpperCase();
  const pairedTarget = pairedLesson
    ? buildPresentationTarget({
      classId,
      week: String(resolvedEntry.week),
      lessonKey: pairedLessonKey,
      ...pairedLesson,
      scheduledDate: pairedAgendaEntry?.start?.toISOString?.() || '',
    })
    : null;
  return {
    entry: resolvedEntry,
    lesson: resolvedLesson,
    lessonKey: resolvedLessonKey,
    date: nextAgendaEntry.start,
    pairedLesson,
    pairedLessonKey,
    pairedDate: pairedAgendaEntry?.start || null,
    isBlockHour: Boolean(pairedAgendaEntry && pairedLesson),
    pairedTarget,
    target,
    hasPresentation: Boolean(resolved.presentation),
    hasAgendaDate: true,
    progressSource: useStandardReadingLesson ? 'reading' : (progressAnchor?.source || 'zermelo'),
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderHtmlText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return richTextToHtml(raw).replaceAll('\n', '<br />');
}

function richTextToHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const urlPattern = /(https?:\/\/[^\s<]+)/g;
  const fragments = [];
  let lastIndex = 0;
  let match = null;
  const appendAutoLinkedText = (text) => {
    let tailIndex = 0;
    let urlMatch = null;
    while ((urlMatch = urlPattern.exec(text))) {
      if (urlMatch.index > tailIndex) {
        fragments.push(escapeHtml(text.slice(tailIndex, urlMatch.index)));
      }
      const href = escapeHtml(urlMatch[1]);
      fragments.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`);
      tailIndex = urlMatch.index + urlMatch[0].length;
    }
    if (tailIndex < text.length) {
      fragments.push(escapeHtml(text.slice(tailIndex)));
    }
  };

  while ((match = markdownPattern.exec(raw))) {
    if (match.index > lastIndex) {
      appendAutoLinkedText(raw.slice(lastIndex, match.index));
    }
    const label = escapeHtml(match[1]);
    const href = escapeHtml(match[2]);
    fragments.push(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    lastIndex = match.index + match[0].length;
  }
  appendAutoLinkedText(raw.slice(lastIndex));
  return fragments.join('');
}

function formatHomeworkContent(value) {
  const raw = String(value || '').trim();
  const materials = [];
  let text = raw;
  const materialPatterns = [
    {
      pattern: /(?:^|[\s.])netschrift en pen mee(?:[\s.]|$)/i,
      label: 'Netschrift en pen mee',
    },
    {
      pattern: /(?:^|[\s.])leesboek en schoolpasje mee(?:[\s.]|$)/i,
      label: 'Leesboek en schoolpasje mee',
    },
  ];

  for (const item of materialPatterns) {
    if (item.pattern.test(text)) {
      materials.push(item.label);
      text = text.replace(item.pattern, ' ').trim();
    }
  }

  text = text.replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ').trim();
  return {
    textHtml: text ? richTextToHtml(text) : '',
    materialsHtml: materials.length
      ? `<div class="homework-materials"><p class="homework-materials-label">Materialen:</p><div class="homework-material-list">${materials.map((label) => `<span class="homework-material">${escapeHtml(label)}</span>`).join('')}</div></div>`
      : '',
  };
}

function parseHomeworkForSlide(value) {
  const raw = String(value || '').trim();
  if (!raw) return { text: '', materials: [] };
  const materials = [];
  let text = raw;
  const materialPatterns = [
    {
      pattern: /(?:^|[\s.])netschrift en pen mee(?:[\s.]|$)/i,
      label: 'Netschrift en pen mee',
    },
    {
      pattern: /(?:^|[\s.])leesboek en schoolpasje mee(?:[\s.]|$)/i,
      label: 'Leesboek en schoolpasje mee',
    },
  ];

  for (const item of materialPatterns) {
    if (item.pattern.test(text)) {
      materials.push(item.label);
      text = text.replace(item.pattern, ' ').trim();
    }
  }

  text = text.replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ').trim();
  return { text, materials };
}

function projectDeckId(project) {
  return `project-${String(project || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

function lessonMarkerId(title) {
  return `marker-${projectDeckId(title)}`;
}

function buildPresentationTarget(lesson) {
  const title = String(lesson?.lesson || '').trim();
  const project = String(lesson?.project || '').trim();
  const presentationId = String(lesson?.presentationId || '').trim() || projectDeckId(project);
  const markerId = String(lesson?.presentationMarkerId || '').trim() || lessonMarkerId(title);
  const scheduledDate = lesson?.scheduledDate ? new Date(lesson.scheduledDate) : null;
  return {
    classId: normalizeClassId(lesson?.classId || state.currentClass),
    week: String(lesson?.week || '').trim(),
    lessonKey: String(lesson?.lessonKey || '').trim().toUpperCase(),
    title,
    project,
    presentationId,
    markerId,
    scheduledDate: scheduledDate && !Number.isNaN(scheduledDate.getTime())
      ? scheduledDate.toISOString()
      : '',
  };
}

function buildPresentationUrl(target) {
  const url = new URL(window.location.href);
  url.searchParams.set('presentation', JSON.stringify(target || {}));
  url.hash = '';
  return url.toString();
}

function presentationTargetFromLocation() {
  const raw = new URLSearchParams(window.location.search).get('presentation');
  if (!raw) return null;
  try {
    const target = JSON.parse(raw);
    return target && typeof target === 'object' ? target : null;
  } catch {
    return null;
  }
}

function resolvePresentation(target) {
  if (!target || !state.doc.presentations || typeof state.doc.presentations !== 'object') {
    return { presentation: null, slideIndex: 0, markerId: '' };
  }

  const candidatePresentationIds = [];
  const pushPresentationId = (value) => {
    const id = String(value || '').trim();
    if (id && !candidatePresentationIds.includes(id)) candidatePresentationIds.push(id);
  };
  pushPresentationId(target.presentationId);
  pushPresentationId(target.project ? projectDeckId(target.project) : '');

  if (target.project) {
    const byProjectName = Object.values(state.doc.presentations).find((presentation) => (
      presentation
      && typeof presentation === 'object'
      && String(presentation.presentationType || '').trim() === 'project-overview'
      && String(presentation.project || '').trim() === String(target.project || '').trim()
    ));
    pushPresentationId(byProjectName?.id);
  }

  const candidateMarkerIds = [];
  const pushMarkerId = (value) => {
    const id = String(value || '').trim();
    if (id && !candidateMarkerIds.includes(id)) candidateMarkerIds.push(id);
  };
  pushMarkerId(target.markerId);
  pushMarkerId(target.title ? lessonMarkerId(target.title) : '');

  for (const presentationId of candidatePresentationIds) {
    const presentation = state.doc.presentations[presentationId];
    if (!presentation || typeof presentation !== 'object') continue;
    const markerId = candidateMarkerIds.find((id) => (
      presentation.markers
      && typeof presentation.markers === 'object'
      && Object.prototype.hasOwnProperty.call(presentation.markers, id)
    )) || '';
    const markerIndex = Number(markerId ? presentation.markers[markerId] : NaN);
    return {
      presentation,
      slideIndex: Number.isInteger(markerIndex) ? markerIndex : 0,
      markerId,
    };
  }

  return { presentation: null, slideIndex: 0, markerId: '' };
}

function getLessonOrderValue(lessonKey) {
  const index = ['A', 'B', 'C', 'D'].indexOf(String(lessonKey || '').trim().toUpperCase());
  return index >= 0 ? index : 99;
}

function getOrderedLessonsForClass(classId) {
  return getEntriesForClass(classId)
    .flatMap((entry) => (entry.lessons || []).map((lesson) => ({
      classId: normalizeClassId(classId),
      week: String(entry.week),
      ...lesson,
    })))
    .filter((lesson) => String(lesson.lessonKey || '').trim())
    .sort((left, right) => {
      const weekDelta = parseWeek(left.week) - parseWeek(right.week);
      if (weekDelta !== 0) return weekDelta;
      return getLessonOrderValue(left.lessonKey) - getLessonOrderValue(right.lessonKey);
    });
}

function projectGroupId(classId, project, index) {
  const slug = projectDeckId(project || `project-${index + 1}`).replace(/^project-/, '') || `project-${index + 1}`;
  return `project-${normalizeClassId(classId)}-${slug}`;
}

function getProjectGroupsForClass(classId) {
  const groups = [];
  const byProject = new Map();

  for (const lesson of getOrderedLessonsForClass(classId)) {
    const project = String(lesson.project || '').trim() || UNTITLED_PROJECT_LABEL;
    const key = project.toLocaleLowerCase('nl-NL');
    if (!byProject.has(key)) {
      const group = {
        project,
        lessons: [],
        firstWeek: String(lesson.week || '').trim(),
      };
      byProject.set(key, group);
      groups.push(group);
    }
    byProject.get(key).lessons.push(lesson);
  }

  const normalizedClassId = normalizeClassId(classId);
  const gradeOrder = PROJECT_ORDER_BY_GRADE[gradeLayerFromClassId(normalizedClassId)] || [];
  const rankByProject = new Map(gradeOrder.map((project, index) => [project.toLocaleLowerCase('nl-NL'), index]));

  return groups
    .map((group, index) => ({
    ...group,
    id: projectGroupId(classId, group.project, index),
    sourceOrder: index,
  }))
    .sort((left, right) => {
      const leftRank = rankByProject.has(left.project.toLocaleLowerCase('nl-NL'))
        ? rankByProject.get(left.project.toLocaleLowerCase('nl-NL'))
        : 999 + left.sourceOrder;
      const rightRank = rankByProject.has(right.project.toLocaleLowerCase('nl-NL'))
        ? rankByProject.get(right.project.toLocaleLowerCase('nl-NL'))
        : 999 + right.sourceOrder;
      return leftRank - rightRank || left.sourceOrder - right.sourceOrder;
    })
    .map((group, index) => ({
      ...group,
      order: index + 1,
    }));
}

function firstPresentationTargetForGroup(group) {
  const lesson = (group?.lessons || []).find((candidate) => {
    const target = buildPresentationTarget(candidate);
    return Boolean(resolvePresentation(target).presentation);
  }) || null;
  return lesson ? buildPresentationTarget(lesson) : null;
}

function getLessonTimelineStatus(classId, lesson, now = new Date()) {
  const week = String(lesson?.week || '').trim();
  const lessonKey = String(lesson?.lessonKey || '').trim().toUpperCase();
  const progressAnchor = getClassProgressAnchor(classId, now);
  if (progressAnchor) {
    const orderedLessons = getProjectOrderedLessonsForClass(classId);
    const lessonIndex = findLessonIndexByIdentity(orderedLessons, { week, lessonKey });
    const nextLessonIndex = progressAnchor.doneAll ? orderedLessons.length : progressAnchor.anchorIndex;
    if (lessonIndex >= 0) {
      if (lessonIndex < nextLessonIndex) return { state: 'done', label: 'Afgerond', icon: '✓' };
      if (lessonIndex === nextLessonIndex && !progressAnchor.doneAll) {
        const start = progressAnchor.agendaEntry?.start instanceof Date ? progressAnchor.agendaEntry.start : new Date(progressAnchor.agendaEntry?.start || '');
        const end = progressAnchor.agendaEntry?.end instanceof Date ? progressAnchor.agendaEntry.end : new Date(progressAnchor.agendaEntry?.end || progressAnchor.agendaEntry?.start || '');
        if (!Number.isNaN(start.getTime()) && start <= now && (!Number.isNaN(end.getTime()) ? end >= now : true)) {
          return { state: 'active', label: 'Bezig', icon: '•' };
        }
        return { state: 'active', label: 'Eerstvolgende', icon: '•' };
      }
      return { state: 'future', label: 'Nog te doen', icon: '○' };
    }
  }

  const scheduledLesson = getScheduledLessonForWeek(classId, week, lessonKey)
    || inferScheduledLessonForWeek(classId, week, lessonKey)
    || null;

  if (scheduledLesson?.start) {
    const start = scheduledLesson.start instanceof Date ? scheduledLesson.start : new Date(scheduledLesson.start);
    const end = scheduledLesson.end instanceof Date ? scheduledLesson.end : new Date(scheduledLesson.end || scheduledLesson.start);
    if (!Number.isNaN(start.getTime())) {
      if (!Number.isNaN(end.getTime()) && end < now) return { state: 'done', label: 'Afgerond', icon: '✓' };
      if (start <= now && (!Number.isNaN(end.getTime()) ? end >= now : true)) return { state: 'active', label: 'Bezig', icon: '•' };
      if (start < now) return { state: 'done', label: 'Afgerond', icon: '✓' };
      return { state: 'future', label: 'Nog te doen', icon: '○' };
    }
  }

  const weekNumber = parseWeek(week);
  if (Number.isFinite(weekNumber)) {
    const lessonOrder = academicWeekOrder(weekNumber);
    const currentOrder = academicWeekOrder(state.currentWeek);
    if (lessonOrder < currentOrder) return { state: 'done', label: 'Afgerond', icon: '✓' };
    if (lessonOrder === currentOrder) return { state: 'active', label: 'Deze week', icon: '•' };
  }
  return { state: 'future', label: 'Nog te doen', icon: '○' };
}

function projectTimelineState(group) {
  const statuses = (group?.lessons || []).map((lesson) => getLessonTimelineStatus(state.currentClass, lesson).state);
  if (!statuses.length) return 'future';
  if (statuses.every((status) => status === 'done')) return 'done';
  if (statuses.some((status) => status === 'done' || status === 'active')) return 'active';
  return 'future';
}

function projectTimelineLabel(stateValue) {
  if (stateValue === 'done') return 'Afgerond';
  if (stateValue === 'active') return 'Bezig';
  return 'Nog te doen';
}

function timelineStatusIcon(stateValue) {
  if (stateValue === 'done') return '✓';
  if (stateValue === 'active') return '•';
  return '○';
}

function getProjectOrderedLessonsForClass(classId) {
  return getProjectGroupsForClass(classId).flatMap((group) => group.lessons);
}

function getLessonIndexForTarget(classId, week, lessonKey) {
  const lessons = getOrderedLessonsForClass(classId);
  const index = lessons.findIndex((lesson) => (
    normalizeClassId(lesson.classId) === classId
    && String(lesson.week) === week
    && String(lesson.lessonKey || '').trim().toUpperCase() === lessonKey
  ));
  return { lessons, index };
}

function stripLessonPrefix(value) {
  return String(value || '')
    .replace(/^les\s*\d+[:\s-]*/i, '')
    .replace(/^[a-z]+\s+\d+[:\s-]*/i, '')
    .trim();
}

function inferAssessmentType(...texts) {
  const haystack = texts.join('\n').toLowerCase();
  if (!haystack.trim()) return 'Eindmoment';
  if (/toetsmodus|toets|beoordeelbaar|inleveren|ingeleverd|inlevercheck/.test(haystack)) return 'Toets of inleveropdracht';
  if (/pitch/.test(haystack) && /jury|jurering|vragen van de jury/.test(haystack)) return 'Pitch voor de jury';
  if (/pitch/.test(haystack)) return 'Pitch';
  if (/posterpresentatie|posterpresentaties/.test(haystack)) return 'Posterpresentatie';
  if (/presentatie|presentaties|presenteren|mini-presentatie/.test(haystack)) return 'Presentatie';
  if (/jury|jurering|juryuitslag|juryberaad/.test(haystack)) return 'Jurybeoordeling';
  if (/reflectie|evaluatie|terugblik/.test(haystack)) return 'Presentatie en reflectie';
  return 'Eindmoment';
}

function getProjectAssessment(projectLessons) {
  const explicit = [...projectLessons]
    .reverse()
    .map((lesson) => String(lesson?.assessment || '').trim())
    .find(Boolean);
  return explicit || '';
}

function getProjectAssessmentMedium(project) {
  const key = String(project || '').trim().toLocaleLowerCase('nl-NL');
  if (POSTER_PRESENTATION_PROJECTS.has(key)) {
    return {
      type: 'poster-presentation',
      label: 'Poster + presentatie',
      description: 'Je eindproduct is een poster en een presentatie.',
    };
  }
  return {
    type: 'netschrift',
    label: 'Netschrift',
    description: 'Je eindbeoordeling loopt via je netschrift.',
  };
}

function normalizedProjectKey(project) {
  return String(project || '').trim().toLocaleLowerCase('nl-NL');
}

function lessonNumberFromAnyTitle(value) {
  const raw = String(value || '').trim();
  const explicit = raw.match(/(?:^|\s)les\s*(\d+)/i);
  if (explicit) return Number(explicit[1]);
  const leading = raw.match(/^\D*(\d+)/);
  return leading ? Number(leading[1]) : NaN;
}

function lessonDeliverable(project, lessonTitle = '') {
  const key = normalizedProjectKey(project);
  const title = String(lessonTitle || '').trim();
  const text = `${key} ${title}`.toLocaleLowerCase('nl-NL');
  const number = lessonNumberFromAnyTitle(title);

  if (key === 'taaltopia') {
    const fields = [
      'Naam, wereld en doelgroep',
      'Klanken en schrift',
      'Woorden en betekenissen',
      'Grammaticaregels',
      'Voorbeeldgesprek',
      'Creatief extra en presentatiehoek',
    ];
    const field = fields[Math.max(0, Math.min(fields.length - 1, number - 1))] || fields[0];
    if (number === 1) return 'Posterindeling met 6 vaste vakken: 1. Naam, wereld en doelgroep, 2. Klanken en schrift, 3. Woorden en betekenissen, 4. Grammaticaregels, 5. Voorbeeldgesprek, 6. Creatief extra en presentatiehoek. Vak 1 is gevuld met taalnaam, wereld/doelgroep en eerste ontwerpkeuzes.';
    if (number >= 2 && number <= 6) return `Vak ${number} (${field}) is gevuld met uitgewerkte voorbeelden die op de poster kunnen blijven staan.`;
  }

  if (key === 'droomschool') {
    if (number === 1) return 'Poster/presentatie heeft een titel en eerste vak: wat is jullie droomschool en voor wie is die bedoeld?';
    if (number === 2) return 'Vak realiteitscheck is gevuld: wat kan echt, wat is lastig, en welke keuze maken jullie daarom?';
    if (number === 3) return 'Vak projectplan is gevuld met doel, doelgroep, taken en planning.';
    if (number === 4) return 'Vak projectbeschrijving is gevuld: locatie, regels, lessen/activiteiten en waarom dit beter is dan nu.';
    if (number === 5) return 'Presentatiehoek is gevuld met pitchzinnen, rolverdeling en minimaal drie sterke argumenten.';
    if (number === 6) return 'Poster/presentatie is compleet en bevat een korte reflectie: sterkste keuze, beste argument en wat jullie zouden verbeteren.';
  }

  if (key === 'faalfestival') {
    if (/intro/.test(text) || number === 1) return 'Poster heeft titel Faalfestival, gekozen middeleeuwse tekst/figuur en eerste uitleg wat falen in dit verhaal betekent.';
    if (/letterkunde|middeleeuwen/.test(text) || number === 2) return 'Poster heeft vak context: middeleeuwen, genre/tekst, belangrijke begrippen en wat de klas moet weten.';
    if (/boeken|initiaal/.test(text) || number === 3) return 'Poster heeft boek/tekstvak plus initiaal of beeldmotief dat bij de faalervaring past.';
    if (/informatieblok/.test(text) || number === 4) return 'Poster heeft informatieblok met kerninformatie, bron/tekstbewijs en duidelijke tussenkopjes.';
    if (/eigenschappen|levensles/.test(text) || number === 5) return 'Poster heeft karaktereigenschappen en levensles: wat leert het personage door falen?';
    if (/fragment|faalervaring|hertaling/.test(text) || number === 6) return 'Poster heeft gekozen fragment of faalervaring met hertaling en uitleg waarom dit de kern van het falen laat zien.';
    if (/creatieve verwerking/.test(text) || number === 7) return 'Poster heeft creatieve verwerking: beeld, vorm of tekstkeuze die het falen zichtbaar maakt.';
    if (/poster afmaken/.test(text) || number === 8) return 'Poster is inhoudelijk compleet: titel, context, fragment/hertaling, levensles, creatieve verwerking en bronnen staan erop.';
    if (/posterpresentaties|presentatie/.test(text) || number >= 9) return 'Poster is presentatieklaar met spreekvolgorde, kernzinnen en een korte reflectie op feedback.';
  }

  if (key === 'taalmakers') {
    if (number === 1) return 'Poster/presentatie heeft projectidee, doelgroep, groepstaakverdeling en eerste schets van het taalproduct.';
    if (number === 2) return 'Poster/presentatie heeft projectvoorstel: probleem/vraag, leerdoelen, planning en criteria voor succes.';
    if (number === 3) return 'Poster/presentatie heeft eerste prototype of voorbeeld plus feedbackronde met minimaal twee verbeterpunten.';
    if (number === 4) return 'Poster/presentatie heeft verbeterde tussenstand: wat is aangepast, wat werkt nu beter en wat moet nog af?';
    if (number === 5) return 'Poster/presentatie is compleet met eindproduct, gastenboek/reacties en reflectie op wat jullie taalproduct laat zien.';
  }

  if (key === 'renaissance') {
    if (/overzicht|intro/.test(text) || number === 1) return 'Poster heeft titel Renaissance en vak met kenmerken: mensbeeld, kunst/wetenschap, klassieke oudheid en vernieuwing.';
    if (/bron|tekst|beeld/.test(text) || number === 2) return 'Poster heeft bron- of beeldanalyse met concrete renaissancekenmerken gemarkeerd.';
    if (/vergelijk|middeleeuwen/.test(text) || number === 3) return 'Poster heeft vergelijking middeleeuwen-renaissance met minimaal drie verschillen en voorbeelden.';
    if (/present|afrond|poster/.test(text) || number >= 4) return 'Poster is presentatieklaar met kernboodschap, voorbeelden, taakverdeling en reflectie.';
  }

  if (key === 'v-rede') {
    if (number === 1) return 'Netschrift bevat wat een V-rede is, welke voorbeeldzin indruk maakte en drie eerste probleemzinnen over iets dat moet veranderen.';
    if (number === 2) return 'Netschrift bevat een onrecht of probleem dat jou persoonlijk raakt, waarom het oneerlijk voelt en waarom anderen dit ook moeten zien.';
    if (number === 3) return 'Netschrift bevat je persoonlijke voorbeeld en de maatschappelijke verbreding: wie heeft hier nog meer last van en wat moet anders?';
    if (number === 4) return 'Netschrift bevat een persoonlijke voorbeeldzin, een emotionele zin, een logische argumentzin en de combinatie die het meest overtuigt.';
    if (number === 5) return 'Netschrift bevat je bouwplan: openingsbeeld, persoonlijk verhaal, maatschappelijk probleem, kernboodschap, oproep en slotzin.';
    if (number === 6) return 'Netschrift bevat je eerste volledige V-rede met opening, persoonlijk verhaal, maatschappelijke verbreding, argumenten, oproep en slot.';
    if (number === 7) return 'Netschrift bevat feedback, een herschreven opening of slot, drie krachtigere zinnen en een voordracht-tip voor jezelf.';
    if (number === 8) return 'Netschrift bevat presentatie-aantekeningen: complimenten, tips en zinnen die indruk maakten tijdens presentaties deel 1.';
    if (number === 9) return 'Netschrift bevat je eindreflectie: wat raakte je publiek, welke tip kreeg je en wat neem je mee?';
  }

  if (key === 'invloed') {
    if (number === 1) return 'Netschrift bevat framingdefinitie, twee voorbeelden van sturende taal en eigen uitleg hoe taal invloed heeft.';
    if (number === 2) return 'Netschrift bevat kenmerken van complottheorieen/wantrouwen en gemarkeerde voorbeelden uit de gelezen tekst.';
    if (number === 3) return 'Netschrift bevat analyse van populisme, media en volkswil met minimaal twee citaten of voorbeelden.';
    if (number === 4) return 'Netschrift bevat drogredenen/denkfouten met naam, uitleg en eigen voorbeeld.';
    if (number === 5) return 'Netschrift bevat kleine woordjes en subtiele manipulatie: voorbeelden, effect en verbeterde formuleringen.';
    if (number === 6) return 'Netschrift bevat schrijfplan, gekozen frame, kernargumenten en spiekbrief voor de eindopdracht.';
    if (number === 7) return 'Netschrift bevat toetsvoorbereiding en voortgang: wat staat vast, wat moet nog af, welke bron/zin gebruik je?';
    if (number === 8) return 'Netschrift bevat eindcontrole en reflectie bij de ingeleverde tekst.';
  }

  if (key === 'de krater / de eerlijke vinder') {
    return 'Netschrift bevat het vervolg op het einde van het verhaal: korte aanloop, vervolgverhaal, passende slotzin en korte reflectie op je keuzes.';
  }

  if (key === 'onder de paramariboom') {
    return 'Netschrift bevat de vier hoofdvragen/thema’s van de laatste dia, met ongeveer twee bladzijden uitwerking per hoofdvraag/thema en concrete voorbeelden uit het boek.';
  }

  if (key === 'grenzen van literatuur') {
    if (number === 1) return 'Netschrift bevat een beschrijving van een ruimte of landschap met alle vijf zintuigen: zien, ruiken, horen, proeven en voelen.';
    if (number === 2) return 'Netschrift bevat een spannende uitbreiding van de ruimtebeschrijving die abrupt eindigt met een cliffhanger.';
    if (number === 3) return 'Netschrift bevat een korte flashback uit het verleden van de ik-persoon die door de ruimte loopt.';
    if (number === 4) return 'Netschrift bevat een beschrijving van de hoofdpersoon, bijvoorbeeld als kort interview met minimaal zes vragen en antwoorden.';
    if (number === 5) return 'Netschrift bevat een aangewezen motief dat meerdere keren terugkomt in het verhaal, zoals een voorwerp, kleur, sfeer of handeling.';
    if (number === 6) return 'Netschrift bevat je leesvoorkeur: beste boek ooit, waaraan een goed boek moet voldoen en welke boeken je niet leuk vindt.';
    if (number === 7) return 'Netschrift bevat alle onderdelen samen als een geheel: ruimte, cliffhanger, flashback, hoofdpersoon, motief en leesvoorkeur.';
    if (number === 8) return 'Netschrift bevat feedback, een verbeterde versie met verzorgde zinnen en spelling, plus korte reflectie op wat werkte, wat je verbeterde en welk onderdeel bij jou past.';
  }

  if (key === 'verweggers') {
    if (number === 1) return 'Netschrift bevat begrippen migratie en cultuur plus eerste eigen/familievragen.';
    if (number === 2) return 'Netschrift bevat migratiegeschiedenis van je familie of gekozen persoon met tijdlijnvragen.';
    if (number === 3) return 'Netschrift bevat socratisch gesprek: standpunt, argumenten en een gedachte die veranderde.';
    if (number === 4) return 'Netschrift bevat stamboomonderzoek: namen, verbanden, plaatsen en open onderzoeksvragen.';
    if (number === 5) return 'Netschrift bevat stamboomposter-plan: selectie, volgorde en verhaal bij de gegevens.';
    if (number === 6) return 'Netschrift bevat presentatievoorbereiding en reflectie op wat migratie betekent in jouw verhaal.';
  }

  if (key === 'klasfeed') {
    if (number === 1) return 'Netschrift bevat rubriekidee, doelgroep en afspraken voor de klasfeed.';
    if (number === 2) return 'Netschrift bevat voorbereiding: onderwerp, taak, bron/personen en planning.';
    if (number === 3) return 'Netschrift bevat eerste tekstversie met kop, kern en slot.';
    if (number === 4) return 'Netschrift bevat aanvullingen en feedbackverwerking.';
    if (number === 5) return 'Netschrift bevat opmaakkeuzes en controle op leesbaarheid.';
    if (number === 6) return 'Netschrift bevat afrondcheck: wat is af, wat mist, wie controleert?';
    if (number === 7) return 'Netschrift bevat printcheck en laatste verbeterpunten.';
    if (number === 8) return 'Netschrift bevat presentatiepunten en reflectie op de klasfeed.';
  }

  if (key === 'technologie') {
    if (number === 1) return 'Netschrift bevat jouw relatie met technologie: voorbeelden, voordelen, risico’s en eerste stelling.';
    if (number === 2) return 'Netschrift bevat socialmedia-analyse: gedrag, effect, algoritme/prikkel en eigen voorbeeld.';
    if (number === 3) return 'Netschrift bevat standpunt over technologie met argumenten en tegenargument.';
    if (number === 4) return 'Netschrift bevat conclusie over technologie en identiteit met bewijs uit de lessen.';
  }

  if (key === 'persoonlijkheid') {
    if (number === 1) return 'Netschrift bevat eerste persoonlijkheidsbeschrijving met voorbeelden van gedrag en taal.';
    if (number === 2) return 'Netschrift bevat Big Five-profiel met scores/inschatting, voorbeelden en reflectie.';
  }

  if (key === 'spiegeldicht') {
    if (/kiezen/.test(text)) return 'Netschrift bevat gekozen gedicht, eerste indruk en waarom dit gedicht bij jou past.';
    if (/analyse/.test(text)) return 'Netschrift bevat analyse van vorm, beeldspraak, thema en opvallende regels.';
    if (/reactiegedicht/.test(text)) return 'Netschrift bevat eigen reactiegedicht plus uitleg welke keuzes uit het origineel terugkomen.';
    if (/present/.test(text)) return 'Netschrift bevat presentatiepunten en reflectie op je eigen gedicht.';
  }

  if (key === 'nutspot') {
    if (/interviewdag/.test(text)) return 'Netschrift bevat interviewvragen, antwoorden en opvallende citaten.';
    if (/interview-uitwerking/.test(text)) return 'Netschrift bevat uitgewerkte interviewtekst met structuur en gekozen citaten.';
    if (/herschrijven|presenteren/.test(text)) return 'Netschrift bevat herschreven versie, feedbackverwerking en presentatiepunten.';
  }

  if (key === 'netschrift') return 'Netschrift bevat bijgewerkte inhoud, verbeterde spelling en feedback/feedforward-punten.';
  if (key === 'heel veel lezen') return 'Netschrift bevat leeslog: datum, boek, gelezen bladzijden en een korte leesreactie of vraag.';

  return 'Netschrift bevat concreet bewijs van de opdracht van vandaag: aantekeningen, uitgewerkt voorbeeld, feedback of reflectie.';
}

function getLessonBuildTargets(project, lessonTitle = '') {
  const medium = getProjectAssessmentMedium(project);
  const deliverable = lessonDeliverable(project, lessonTitle);
  if (medium.type === 'poster-presentation') {
    return {
      medium,
      deliverable,
    };
  }
  return {
    medium,
    deliverable,
  };
}

function splitAssessmentText(value) {
  const raw = String(value || '').trim();
  if (!raw) return { label: '', details: '' };
  const separatorIndex = raw.indexOf(':');
  if (separatorIndex < 0) return { label: raw, details: '' };
  return {
    label: raw.slice(0, separatorIndex).trim(),
    details: raw.slice(separatorIndex + 1).trim(),
  };
}

function getProjectOverviewPresentation(project) {
  const presentationId = projectDeckId(project);
  const presentation = state.doc.presentations[presentationId];
  return presentation && typeof presentation === 'object' ? presentation : null;
}

function getProjectCulmination(classId, project) {
  const normalizedClassId = normalizeClassId(classId);
  const projectName = String(project || '').trim();
  if (!normalizedClassId || !projectName) return null;

  const projectLessons = getOrderedLessonsForClass(normalizedClassId)
    .filter((lesson) => String(lesson.project || '').trim() === projectName);
  if (!projectLessons.length) return null;

  const finalAssessmentLesson = [...projectLessons]
    .reverse()
    .find((lesson) => String(lesson?.assessment || '').trim()) || projectLessons[projectLessons.length - 1];
  const scheduledLesson = getScheduledLessonForWeek(normalizedClassId, finalAssessmentLesson.week, finalAssessmentLesson.lessonKey)
    || null;
  const overviewPresentation = getProjectOverviewPresentation(projectName);
  const overviewText = overviewPresentation
    ? JSON.stringify(overviewPresentation)
    : '';
  const explicitAssessment = getProjectAssessment(projectLessons);
  const finalLessonTitle = String(finalAssessmentLesson.lesson || '').trim();
  const assessmentText = explicitAssessment || inferAssessmentType(finalLessonTitle, overviewText);
  const parsedAssessment = splitAssessmentText(assessmentText);
  const assessmentMedium = getProjectAssessmentMedium(projectName);

  return {
    project: projectName,
    assessmentType: parsedAssessment.label || assessmentText,
    assessmentDetails: parsedAssessment.details,
    assessmentMedium,
    finalLessonTitle: stripLessonPrefix(finalLessonTitle) || finalLessonTitle,
    explicitAssessment,
    week: String(finalAssessmentLesson.week || '').trim(),
    lessonKey: String(finalAssessmentLesson.lessonKey || '').trim().toUpperCase(),
    date: scheduledLesson?.start || null,
  };
}

function isAssessmentLesson(classId, lesson) {
  const project = String(lesson?.project || '').trim();
  const lessonKey = String(lesson?.lessonKey || '').trim().toUpperCase();
  const week = String(lesson?.week || '').trim();
  if (!project || !lessonKey || !week) return false;
  const culmination = getProjectCulmination(classId, project);
  if (!culmination) return false;
  return culmination.week === week && culmination.lessonKey === lessonKey;
}

function getHomeworkPreviewSlide(target) {
  const classId = normalizeClassId(target?.classId || state.currentClass);
  const week = String(target?.week || '').trim();
  const lessonKey = String(target?.lessonKey || '').trim().toUpperCase();
  if (!classId || !week || !lessonKey) return null;

  const { lessons, index } = getLessonIndexForTarget(classId, week, lessonKey);
  if (index < 0) return null;

  const nextLesson = lessons[index + 1] || null;
  if (!nextLesson) return null;
  const homework = String(nextLesson.homework || '').trim();
  if (!homework) return null;

  const parsed = parseHomeworkForSlide(homework);
  const scheduledLesson = getScheduledLessonForWeek(classId, nextLesson.week, nextLesson.lessonKey)
    || null;
  const items = [];
  if (parsed.text) items.push(parsed.text);
  for (const material of parsed.materials) items.push(`Materiaal: ${material}`);

  return {
    type: 'homework-preview',
    title: `Huiswerk voor ${nextLesson.lesson || nextLesson.project || 'de volgende les'}`,
    subtitle: scheduledLesson?.start
      ? `${formatLessonDate(scheduledLesson.start)}`
      : 'Voor de volgende les',
    items,
  };
}

function lessonBuildSlide(phase, target) {
  const project = String(target?.project || '').trim();
  const title = String(target?.title || '').trim();
  if (!project && !title) return null;
  const buildTargets = getLessonBuildTargets(project, title);
  const isStart = phase === 'start';
  const mediumName = buildTargets.medium.type === 'poster-presentation' ? 'poster' : 'netschrift';
  return {
    type: `lesson-${phase}-evidence`,
    emphasis: true,
    title: `Deze les toegevoegd aan je ${mediumName}`,
    subtitle: '',
    items: [buildTargets.deliverable],
  };
}

function slideIndexForMarker(presentation, markerId) {
  const raw = Number(presentation?.markers?.[markerId]);
  if (!Number.isInteger(raw)) return 0;
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  if (raw > 0 && raw <= slides.length) return raw - 1;
  return Math.max(0, Math.min(slides.length - 1, raw));
}

function nextMarkerIndexForTarget(presentation, target) {
  const markers = presentation?.markers;
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  if (!markers || typeof markers !== 'object' || !slides.length || !target?.markerId) return slides.length;
  const start = slideIndexForMarker(presentation, target.markerId);
  const laterIndexes = Object.entries(markers)
    .filter(([markerId]) => markerId !== target.markerId)
    .map(([, value]) => {
      const raw = Number(value);
      if (!Number.isInteger(raw)) return NaN;
      return raw > 0 && raw <= slides.length ? raw - 1 : raw;
    })
    .filter((index) => Number.isInteger(index) && index > start)
    .sort((left, right) => left - right);
  return laterIndexes[0] ?? slides.length;
}

function getLessonPresentationSlides(presentation, target) {
  const markerDeck = Array.isArray(presentation?.markerDecks?.[target?.markerId])
    ? presentation.markerDecks[target.markerId].filter((slide) => slide && typeof slide === 'object')
    : [];
  if (markerDeck.some((slide) => (
    (Array.isArray(slide.items) && slide.items.some((item) => String(item || '').trim()))
    || String(slide.type || '').trim().toLowerCase() === 'bullets'
  ))) {
    return markerDeck;
  }

  const sourceSlides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  if (!sourceSlides.length) return [];
  if (!target?.markerId) return [...sourceSlides];
  const start = slideIndexForMarker(presentation, target.markerId);
  const end = nextMarkerIndexForTarget(presentation, target);
  return sourceSlides.slice(start, Math.max(start + 1, end));
}

function getRenderableSlides(presentation, target) {
  const lessonSlides = getLessonPresentationSlides(presentation, target);
  const startSlide = lessonBuildSlide('start', target);
  const endSlide = lessonBuildSlide('end', target);
  const slides = [
    ...(startSlide ? [startSlide] : []),
    ...lessonSlides,
    ...(endSlide ? [endSlide] : []),
  ];
  const homeworkPreviewSlide = getHomeworkPreviewSlide(target);
  if (homeworkPreviewSlide) slides.push(homeworkPreviewSlide);
  return slides;
}

function renderSummaryList(container, rows, emptyText) {
  if (!container) return;
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'item-pill';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  for (const row of rows) {
    const item = document.createElement('article');
    item.className = 'stack-item';
    item.innerHTML = row;
    container.appendChild(item);
  }
}

function uniqueLessonsByIdentity(lessons) {
  const seen = new Set();
  return lessons.filter((lesson) => {
    const key = `${normalizedProjectKey(lesson?.project)}__${lessonIdentity(lesson)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueLessonsByChecklistIdentity(lessons) {
  const seen = new Set();
  return lessons.filter((lesson) => {
    const projectKey = normalizedProjectKey(lesson?.project);
    const markerKey = String(lesson?.presentationMarkerId || '').trim();
    const titleKey = String(lesson?.lesson || '').trim().toLocaleLowerCase('nl-NL');
    const presentationKey = String(lesson?.presentationId || '').trim();
    const key = markerKey
      ? `${projectKey}__marker__${markerKey}`
      : `${projectKey}__lesson__${presentationKey}__${titleKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function lessonChecklistItem(lesson) {
  const project = String(lesson?.project || '').trim();
  const title = String(lesson?.lesson || project || 'Les').trim();
  const target = buildPresentationTarget(lesson);
  const hasPresentation = Boolean(resolvePresentation(target).presentation);
  return {
    project,
    title,
    text: lessonDeliverable(project, title),
    status: getLessonTimelineStatus(state.currentClass, lesson),
    target,
    hasPresentation,
  };
}

function isBridgeClass(classId) {
  return gradeLayerFromClassId(classId) === '1';
}

function bridgeClassNetschriftChecklist(classId) {
  const normalizedClassId = normalizeClassId(classId);
  const doneStatus = { state: 'done', label: 'Onderdeel', icon: '✓' };
  const feedbackTarget = buildPresentationTarget({
    classId: normalizedClassId,
    project: 'Netschrift',
    lesson: 'Feedback-en-forward-opdracht',
    presentationId: 'netschrift-feedback-en-forward-opdracht',
  });
  return [
    {
      project: 'Netschrift',
      title: 'Feedback-en-forward-opdracht',
      text: 'feedback en feedforward verwerken bij je werk.',
      status: doneStatus,
      target: feedbackTarget,
      hasPresentation: Boolean(resolvePresentation(feedbackTarget).presentation),
    },
    {
      project: 'Escaperoom Yde',
      title: 'Project Escaperoom Yde',
      text: 'de creatieve schrijfopdracht.',
      status: doneStatus,
      target: null,
      hasPresentation: false,
    },
    {
      project: 'Verweggers',
      title: 'Verweggers',
      text: 'het verhaal over je familie met alle aantekeningen erbij.',
      status: doneStatus,
      target: null,
      hasPresentation: false,
    },
  ];
}

function getNetschriftChecklistForClass(classId) {
  if (isBridgeClass(classId)) return bridgeClassNetschriftChecklist(classId);
  return uniqueLessonsByChecklistIdentity(getProjectOrderedLessonsForClass(classId))
    .filter((lesson) => (
      normalizedProjectKey(lesson.project) !== READING_PROJECT_NAME
      && getProjectAssessmentMedium(lesson.project).type === 'netschrift'
    ))
    .map(lessonChecklistItem)
    .filter((item) => item.status.state === 'done' || item.status.state === 'active');
}

function getPosterChecklistForProject(classId, project) {
  const projectKey = normalizedProjectKey(project);
  if (!projectKey || getProjectAssessmentMedium(project).type !== 'poster-presentation') return [];
  const lessons = getProjectGroupsForClass(classId)
    .find((group) => normalizedProjectKey(group.project) === projectKey)
    ?.lessons || [];
  return uniqueLessonsByIdentity(lessons).map(lessonChecklistItem);
}

function stripNetschriftPrefix(value) {
  return String(value || '')
    .replace(/^netschrift bevat\s+/i, '')
    .trim();
}

function renderChecklist(items, options = {}) {
  if (!items.length) {
    return '<p class="overview-empty">Nog geen onderdelen gevonden.</p>';
  }
  const intro = String(options.intro || '').trim();
  const formatText = typeof options.formatText === 'function' ? options.formatText : (value) => value;
  return `
    ${intro ? `<p class="overview-intro">${escapeHtml(intro)}</p>` : ''}
    <ol class="overview-checklist">
      ${items.map((item) => `
        <li>
          <p class="overview-checklist-title">
            <span class="lesson-status-icon" aria-hidden="true">${escapeHtml(item.status.icon || '•')}</span>
            ${item.hasPresentation
              ? `<a class="overview-lesson-link" href="${escapeHtml(buildPresentationUrl(item.target))}" data-overview-presentation='${escapeHtml(JSON.stringify(item.target))}'>${escapeHtml(item.title)}</a>`
              : `<span>${escapeHtml(item.title)}</span>`}
          </p>
          <p>${escapeHtml(formatText(item.text))}</p>
        </li>
      `).join('')}
    </ol>
  `;
}

function openNetschriftOverview() {
  if (!netschriftDialog || !netschriftDialogBody) return;
  const items = getNetschriftChecklistForClass(state.currentClass);
  if (netschriftDialogMeta) {
    netschriftDialogMeta.textContent = isBridgeClass(state.currentClass)
      ? `Klas ${state.currentClass} · ${items.length} onderdelen`
      : items.length
      ? `Klas ${state.currentClass} · ${items.length} lessen tot nu toe`
      : `Klas ${state.currentClass} · nog geen netschriftlessen afgerond`;
  }
  netschriftDialogBody.innerHTML = renderChecklist(items, {
    intro: 'Je netschrift bevat in ieder geval de volgende onderdelen:',
    formatText: stripNetschriftPrefix,
  });
  if (!netschriftDialog.open) netschriftDialog.showModal();
}

function openPosterOverview(project) {
  if (!posterDialog || !posterDialogBody) return;
  const projectName = String(project || '').trim();
  const items = getPosterChecklistForProject(state.currentClass, projectName);
  if (posterDialogMeta) {
    posterDialogMeta.textContent = items.length
      ? `${projectName} · ${items.length} posteronderdelen`
      : `${projectName || 'Project'} · nog geen posteronderdelen gevonden`;
  }
  posterDialogBody.innerHTML = renderChecklist(items, {
    intro: 'Je poster bevat in ieder geval de volgende onderdelen:',
  });
  if (!posterDialog.open) posterDialog.showModal();
}

function submissionAlertHtml(nextSubmissionMoment) {
  const deadlineText = nextSubmissionMoment.deadlineLabel
    ? `Uiterlijk inleveren: ${nextSubmissionMoment.deadlineLabel}.`
    : '';
  return `
    <div class="submission-alert is-${escapeHtml(nextSubmissionMoment.state)}">
      <p class="submission-alert-label">
        <span class="submission-alert-icon" aria-hidden="true">${escapeHtml(nextSubmissionMoment.icon)}</span>
        <span>Volgende netschrift inlevermoment</span>
      </p>
      ${deadlineText ? `<p class="submission-alert-deadline">${escapeHtml(deadlineText)}</p>` : ''}
      <p class="submission-alert-text">${escapeHtml(nextSubmissionMoment.text)}</p>
      <button class="submission-overview-link" type="button" data-open-netschrift-overview="1">Bekijk wat er in je netschrift moet</button>
    </div>
  `;
}

function netschriftOverviewShortcutHtml() {
  const items = getNetschriftChecklistForClass(state.currentClass);
  if (!items.length) return '';
  return `
    <div class="submission-alert is-active">
      <p class="submission-alert-label">
        <span class="submission-alert-icon" aria-hidden="true">✓</span>
        <span>Netschriftlijst</span>
      </p>
      <p class="submission-alert-text">${escapeHtml(items.length)} onderdelen die in je netschrift moeten staan.</p>
      <button class="submission-overview-link" type="button" data-open-netschrift-overview="1">Bekijk wat er in je netschrift moet</button>
    </div>
  `;
}

function netschriftProjectSummaryHtml() {
  const items = getNetschriftChecklistForClass(state.currentClass);
  if (!items.length) return '';
  return `
    <p class="homework-label">Netschrift</p>
    <div class="project-focus-card">
      <p class="project-focus-name">Alles wat in je netschrift moet staan</p>
      <p class="project-focus-lesson">${escapeHtml(items.length)} onderdelen in het netschrift-overzicht.</p>
      <button class="project-overview-link" type="button" data-open-netschrift-overview="1">Bekijk wat er in je netschrift moet</button>
    </div>
  `;
}

function buildProjectSummaryRows(projectGroup) {
  const project = String(projectGroup?.project || '').trim();
  const netschriftRow = netschriftProjectSummaryHtml();
  if (!project) return [netschriftRow].filter(Boolean);
  const medium = getProjectAssessmentMedium(project);
  if (medium.type !== 'poster-presentation') {
    return [
      netschriftRow,
      `
        <p class="homework-label">Poster</p>
        <div class="project-focus-card">
          <p class="project-focus-name">Geen poster voor het project waar we nu mee bezig zijn.</p>
          <p class="project-focus-lesson">Project: ${escapeHtml(project)}</p>
        </div>
      `,
    ].filter(Boolean);
  }

  const posterItems = getPosterChecklistForProject(state.currentClass, project);
  return [
    netschriftRow,
    `
      <p class="homework-label">Poster</p>
      <div class="project-focus-card">
        <p class="project-focus-name">Alles op de poster van dit project</p>
        <p class="project-focus-lesson">Project: ${escapeHtml(project)}</p>
        <p class="project-focus-lesson">${escapeHtml(posterItems.length)} onderdelen in het poster-overzicht.</p>
        <button class="project-overview-link" type="button" data-open-poster-overview="${escapeHtml(project)}">Bekijk wat er op je poster moet</button>
      </div>
    `,
  ].filter(Boolean);
}

function renderRubricChips(container, values, emptyText, className = 'rubric-chip') {
  if (!container) return;
  container.replaceChildren();
  if (!values.length) {
    const pill = document.createElement('p');
    pill.className = `${className} ${className}-empty`;
    pill.textContent = emptyText;
    container.appendChild(pill);
    return;
  }

  for (const value of values) {
    const pill = document.createElement('p');
    pill.className = className;
    pill.textContent = value;
    container.appendChild(pill);
  }
}

function renderProjectRubric(projectSource) {
  if (!projectRubricTitle || !projectRubricMeta || !projectRubricSummary || !projectRubricSkills || !projectRubricLabels) return;
  const projectName = String(projectSource?.project || projectSource?.lesson?.project || '').trim();
  if (!projectName || !state.kerndoelenDoc) {
    projectRubricTitle.textContent = 'Nog geen project gekoppeld';
    projectRubricMeta.textContent = 'Zodra er een project is gevonden, verschijnen hier de beoordelingsaccenten.';
    projectRubricSummary.textContent = 'Nog geen vaardigheidskaart beschikbaar.';
    renderRubricChips(projectRubricSkills, [], 'Nog geen vaardigheden');
    renderRubricChips(projectRubricLabels, [], 'Nog geen labels', 'rubric-label-pill');
    return;
  }

  const snapshot = buildProjectSnapshot(state.kerndoelenDoc, slugifyProject(projectName));
  if (!snapshot) {
    projectRubricTitle.textContent = projectName;
    projectRubricMeta.textContent = 'Voor dit project staat nog geen kerndoelenkaart in het systeem.';
    projectRubricSummary.textContent = 'Voeg dit project toe in de kerndoelenstudio om vaardigheden en labels zichtbaar te maken.';
    renderRubricChips(projectRubricSkills, [], 'Nog geen vaardigheden');
    renderRubricChips(projectRubricLabels, [], 'Nog geen labels', 'rubric-label-pill');
    return;
  }

  const focusLabels = snapshot.focusRecords.map((record) => record.label).filter(Boolean);
  projectRubricTitle.textContent = projectName;
  projectRubricMeta.textContent = `${snapshot.skills.length} vaardigheden · ${focusLabels.length} labels voor eindbeoordeling`;
  projectRubricSummary.textContent = snapshot.project.studentFacingDescription
    || snapshot.project.assessmentSummary
    || 'Tijdens dit project zie je hier op welke vaardigheden en labels de eindbeoordeling vooral steunt.';
  renderRubricChips(projectRubricSkills, snapshot.skills, 'Nog geen eindvaardigheden');
  renderRubricChips(projectRubricLabels, focusLabels, 'Nog geen eindlabels', 'rubric-label-pill');
}

function openPresentation(target) {
  const resolved = resolvePresentation(target);
  if (!resolved.presentation) return;
  state.activePresentation = resolved.presentation;
  state.activePresentationTarget = resolved.markerId
    ? { ...target, markerId: resolved.markerId }
    : target;
  state.activeSlideIndex = 0;
  dialogTitle.textContent = target.project ? `${target.project} · ${target.title}` : target.title;
  if (dialogMeta) {
    const parts = [];
    if (target.project) parts.push(target.project);
    if (target.scheduledDate) parts.push(formatLessonDateTime(target.scheduledDate));
    parts.push('start op lesonderdeel');
    dialogMeta.textContent = parts.join(' · ');
  }
  renderPresentationSlide();
  if (!presentationDialog.open) presentationDialog.showModal();
}

function openPresentationFromLocation() {
  const target = presentationTargetFromLocation();
  if (!target) return;
  const classId = normalizeClassId(target.classId || '');
  if (classId && state.classes.includes(classId)) {
    state.currentClass = classId;
    classSelect.value = classId;
    localStorage.setItem(CURRENT_CLASS_KEY, classId);
    renderPortal();
  }
  openPresentation(target);
}

function stepActivePresentation(delta) {
  const presentation = state.activePresentation;
  const slides = getRenderableSlides(presentation, state.activePresentationTarget);
  if (!slides.length) return;
  const nextIndex = Math.max(0, Math.min(slides.length - 1, state.activeSlideIndex + delta));
  if (nextIndex === state.activeSlideIndex) return;
  state.activeSlideIndex = nextIndex;
  renderPresentationSlide();
}

function renderPresentationSlide() {
  const presentation = state.activePresentation;
  const slides = getRenderableSlides(presentation, state.activePresentationTarget);
  if (!slides.length) {
    dialogStage.innerHTML = '<article class="empty-state">Geen presentatie-inhoud gevonden.</article>';
    dialogCounter.textContent = '0 / 0';
    dialogPrev.disabled = true;
    dialogNext.disabled = true;
    return;
  }

  const index = Math.max(0, Math.min(slides.length - 1, state.activeSlideIndex));
  state.activeSlideIndex = index;
  const slide = slides[index] || {};
  const title = String(slide.title || presentation.title || 'Presentatie').trim();
  const subtitle = String(slide.subtitle || presentation.subtitle || presentation.project || '').trim();
  const bullets = Array.isArray(slide.items) ? slide.items.filter(Boolean) : [];
  if (dialogMeta) {
    const targetTitle = String(state.activePresentationTarget?.title || '').trim();
    dialogMeta.textContent = targetTitle
      ? `${targetTitle} · slide ${index + 1} van ${slides.length}`
      : `Slide ${index + 1} van ${slides.length}`;
  }

  dialogStage.innerHTML = `
    <article class="slide-card${slide.emphasis ? ' slide-card-emphasis' : ''}">
      <h3>${renderHtmlText(title)}</h3>
      ${subtitle ? `<p>${renderHtmlText(subtitle)}</p>` : ''}
      ${bullets.length ? `<ul>${bullets.map((item) => `<li>${renderHtmlText(item)}</li>`).join('')}</ul>` : ''}
    </article>
  `;

  dialogCounter.textContent = `${index + 1} / ${slides.length}`;
  dialogPrev.disabled = index <= 0;
  dialogNext.disabled = index >= slides.length - 1;
}

function renderCurrentWeek(projectGroups) {
  const nextLesson = findNextLessonForClass(state.currentClass, new Date());
  state.nextLessonTarget = nextLesson?.hasPresentation ? nextLesson.target : null;
  state.nextLessonAnchorId = nextLesson
    ? `lesson-${normalizeClassId(state.currentClass)}-${parseWeek(nextLesson.entry?.week)}-${String(nextLesson.lessonKey || '').toUpperCase()}`
    : null;
  if (openNextPresentationBtn) openNextPresentationBtn.disabled = !state.nextLessonTarget;
  if (!nextLesson) {
    const nextSubmissionMoment = getNextNetschriftSubmissionMoment(state.currentClass);
    currentWeekTitle.textContent = 'Nog geen eerstvolgende les gevonden';
    currentWeekSummary.textContent = 'Voor deze klas staat nog geen bruikbare koppeling tussen planning en Zermelo klaar.';
    if (currentWeekChip) currentWeekChip.textContent = `${projectGroups.length} projecten`;
    if (heroWeekValue) heroWeekValue.textContent = 'Nog onbekend';
    if (heroPresentationCount) heroPresentationCount.textContent = '-';
    if (heroHomeworkCount) heroHomeworkCount.textContent = nextSubmissionMoment ? '1' : '0';
    renderSummaryList(homeworkSummary, nextSubmissionMoment ? [submissionAlertHtml(nextSubmissionMoment)] : [], 'Nog geen huiswerk voor de eerstvolgende les.');
    renderSummaryList(projectSummary, [], 'Nog geen projectinformatie voor de eerstvolgende les.');
    renderProjectRubric(null);
    return;
  }

  const pairedLessons = [
    nextLesson.lesson,
    nextLesson.isBlockHour ? nextLesson.pairedLesson : null,
  ].filter(Boolean);
  const homeworkLessons = pairedLessons
    .filter((lesson) => String(lesson.homework || '').trim())
    .slice(0, 3);
  const nextSubmissionMoment = getNextNetschriftSubmissionMoment(state.currentClass);
  const homeworkCount = homeworkLessons.length + (nextSubmissionMoment ? 1 : 0);
  currentWeekTitle.textContent = nextLesson.lesson.lesson || nextLesson.lesson.project || 'Les';
  const lessonModeLabel = nextLesson.progressSource === 'reading'
    ? 'Standaard leesles'
    : (nextLesson.lesson.project || 'Project');
  currentWeekSummary.textContent = nextLesson.date
    ? `${formatLessonDate(nextLesson.date)} · klas ${state.currentClass} · ${lessonModeLabel}`
    : `${nextLesson.progressSource === 'anchor' ? 'Actuele stand uit jaarplanning' : 'Nog geen aanstaande Zermelo-les gekoppeld'} · klas ${state.currentClass} · ${lessonModeLabel}`;
  if (currentWeekChip) currentWeekChip.textContent = `${projectGroups.length} projecten`;
  if (heroWeekValue) heroWeekValue.textContent = nextLesson.date
    ? formatLessonDate(nextLesson.date)
    : (nextLesson.progressSource === 'anchor' ? 'Actuele stand' : 'Nog geen Zermelo-les');
  if (heroPresentationCount) heroPresentationCount.textContent = nextLesson.hasPresentation ? 'Klaar' : '-';
  if (heroHomeworkCount) heroHomeworkCount.textContent = String(homeworkCount);

  const submissionRows = nextSubmissionMoment
    ? [submissionAlertHtml(nextSubmissionMoment)]
    : [netschriftOverviewShortcutHtml()].filter(Boolean);
  const lessonHomeworkRows = homeworkLessons.length
    ? homeworkLessons.map((lesson, index) => {
      const homework = formatHomeworkContent(lesson.homework);
      const date = index === 0 ? nextLesson.date : nextLesson.pairedDate;
      return `
        <p class="homework-label">${escapeHtml(lesson.lesson || lesson.project || 'Les')}</p>
        ${date ? `<p class="lesson-date">${escapeHtml(formatLessonDate(date))}</p>` : ''}
        ${homework.textHtml ? `<div class="homework-text">${homework.textHtml}</div>` : ''}
        ${homework.materialsHtml}
        ${nextLesson.hasPresentation && index === 0 ? '<button class="lesson-link next-lesson-link" type="button" data-next-presentation="1">Open presentatie</button>' : ''}
      `;
    })
    : [];
  const homeworkRows = [...lessonHomeworkRows, ...submissionRows];
  const projectRows = buildProjectSummaryRows({ project: nextLesson.lesson.project });
  renderSummaryList(homeworkSummary, homeworkRows, 'Nog geen huiswerk voor de eerstvolgende les.');
  renderSummaryList(projectSummary, projectRows, 'Nog geen projectinformatie voor de eerstvolgende les.');
  renderProjectRubric(nextLesson);
}

function renderWeeks() {
  const projectGroups = getProjectGroupsForClass(state.currentClass);
  weeksGrid.replaceChildren();
  weekJumpBar?.replaceChildren();
  submissionMoments?.replaceChildren();

  const submissionCards = getNetschriftSubmissionMomentsForClass(state.currentClass);
  if (submissionMoments && submissionCards.length) {
    submissionMoments.innerHTML = `
      <header class="submission-moments-head">
        <div>
          <p class="overview-label">Netschrift</p>
          <h3>Inlevermomenten</h3>
        </div>
        <p>Drie vaste momenten waarop je netschrift zichtbaar bijgewerkt moet zijn.</p>
      </header>
      <div class="submission-card-list">
        ${submissionCards.map((moment) => `
          <article class="submission-card is-${escapeHtml(moment.state)}">
            <p class="submission-status">
              <span class="submission-status-icon" aria-hidden="true">${escapeHtml(moment.icon)}</span>
              <span>${escapeHtml(moment.label)}</span>
            </p>
            <h4>Inlevermoment ${escapeHtml(moment.number)}</h4>
            ${moment.deadlineLabel ? `<p class="submission-card-deadline">Uiterlijk ${escapeHtml(moment.deadlineLabel)}</p>` : ''}
            <p>${escapeHtml(moment.text)}</p>
          </article>
        `).join('')}
      </div>
    `;
  }

  if (!projectGroups.length) {
    weeksGrid.innerHTML = '<article class="empty-state">Voor deze klas zijn nog geen projecten gevuld.</article>';
    return;
  }

  for (const group of projectGroups) {
    const projectStatus = projectTimelineState(group);
    const article = document.createElement('article');
    article.className = `week-card is-${projectStatus}`;
    article.id = group.id;
    if (group.order === 1) article.classList.add('is-current');

    const lessonsHtml = group.lessons.length
      ? `<div class="lesson-stack">${group.lessons.map((lesson) => {
        const title = String(lesson.lesson || '').trim() || 'Les zonder titel';
        const project = String(lesson.project || '').trim();
        const homework = String(lesson.homework || '').trim();
        const lessonKey = String(lesson.lessonKey || '').trim().toUpperCase();
        const isAssessment = isAssessmentLesson(state.currentClass, {
          week: String(lesson.week),
          lessonKey,
          ...lesson,
        });
        const timelineStatus = getLessonTimelineStatus(state.currentClass, lesson);
        const culmination = isAssessment ? getProjectCulmination(state.currentClass, project) : null;
        const lessonAnchorId = `lesson-${normalizeClassId(state.currentClass)}-${parseWeek(lesson.week)}-${lessonKey}`;
        const target = buildPresentationTarget({
          classId: state.currentClass,
          week: String(lesson.week),
          lessonKey,
          ...lesson,
        });
        const hasPresentation = Boolean(resolvePresentation(target).presentation);
        return `
          <article class="lesson-card is-${escapeHtml(timelineStatus.state)}${isAssessment ? ' is-assessment' : ''}" id="${escapeHtml(lessonAnchorId)}">
            <p class="lesson-status lesson-status-${escapeHtml(timelineStatus.state)}">
              <span class="lesson-status-icon" aria-hidden="true">${escapeHtml(timelineStatus.icon)}</span>
              <span>${escapeHtml(timelineStatus.label)}</span>
            </p>
            ${isAssessment ? `<p class="assessment-chip">Eindbeoordeling${culmination?.assessmentType ? ` · ${escapeHtml(culmination.assessmentType)}` : ''}</p>` : ''}
            <h4>${escapeHtml(title)}</h4>
            ${project ? `<p><strong>Project:</strong> ${escapeHtml(project)}</p>` : ''}
            ${isAssessment && culmination?.assessmentType ? `<p><strong>Beoordeling:</strong> ${escapeHtml(culmination.assessmentType)}</p>` : ''}
            ${isAssessment && culmination?.assessmentMedium?.label ? `<p><strong>Medium:</strong> ${escapeHtml(culmination.assessmentMedium.label)}</p>` : ''}
            ${homework ? `<p><strong>Huiswerk:</strong> ${richTextToHtml(homework)}</p>` : ''}
            ${hasPresentation ? `<button class="lesson-link" type="button" data-presentation='${escapeHtml(JSON.stringify(target))}'>Open presentatie</button>` : ''}
          </article>
        `;
      }).join('')}</div>`
      : '<article class="empty-state">Geen lespresentaties ingepland in dit project.</article>';

    article.innerHTML = `
      <header class="week-card-head">
        <div>
          <p class="overview-label">Klas ${escapeHtml(state.currentClass)}</p>
          <h3>${escapeHtml(group.project)}</h3>
        </div>
        <div class="week-card-badges">
          <span class="project-progress-badge project-progress-${escapeHtml(projectStatus)}">
            <span class="project-progress-icon" aria-hidden="true">${escapeHtml(timelineStatusIcon(projectStatus))}</span>
            <span>${escapeHtml(projectTimelineLabel(projectStatus))}</span>
          </span>
          <span class="week-badge">Project ${group.order} · ${group.lessons.length} lessen</span>
        </div>
      </header>
      ${lessonsHtml}
    `;

    weeksGrid.appendChild(article);

    const jumpButton = document.createElement('button');
    jumpButton.type = 'button';
    jumpButton.className = `week-jump-chip${group.order === 1 ? ' is-current' : ''}`;
    jumpButton.textContent = group.project;
    jumpButton.addEventListener('click', () => {
      article.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    weekJumpBar?.appendChild(jumpButton);
  }

  for (const button of weeksGrid.querySelectorAll('[data-presentation]')) {
    button.addEventListener('click', () => {
      const payload = button.getAttribute('data-presentation');
      if (!payload) return;
      openPresentation(JSON.parse(payload));
    });
  }
}

function renderPortal() {
  const projectGroups = getProjectGroupsForClass(state.currentClass);
  const updatedAt = String(state.doc.updatedAt || '').trim();
  const agendaStamp = state.agendaEntries.length ? 'rooster gekoppeld' : 'rooster niet geladen';
  portalMeta.textContent = updatedAt
    ? `Bijgewerkt op ${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))} · ${projectGroups.length} projecten`
    : `Projectplanning zonder datumstempel · ${agendaStamp}`;
  renderCurrentWeek(projectGroups);
  renderWeeks();
}

function fillClassOptions() {
  classSelect.innerHTML = '';
  for (const classId of state.classes) {
    const option = document.createElement('option');
    option.value = classId;
    option.textContent = `Klas ${classId}`;
    classSelect.appendChild(option);
  }
}

async function fetchJson(url) {
  const resolved = new URL(url, window.location.href);
  resolved.searchParams.set('_t', String(Date.now()));
  const response = await fetch(resolved.toString(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function boot() {
  try {
    const [planningRaw, classMap, agendaRaw, kerndoelenRaw] = await Promise.all([
      fetchJson(PLANNING_URL),
      fetchJson(CLASSES_URL),
      fetchJson(AGENDA_URL).catch(() => ({ entries: [] })),
      loadKerndoelenDoc(KERNDOELEN_URL).catch(() => null),
    ]);

    state.doc = preferFreshStudioDoc(planningRaw);
    state.agendaEntries = normalizeAgendaDoc(agendaRaw);
    state.kerndoelenDoc = kerndoelenRaw;
    state.classes = [...new Set([
      ...classesFromClassMap(classMap),
      ...state.agendaEntries.map((entry) => normalizeClassId(entry.classId)),
    ])]
      .filter(Boolean)
      .sort((left, right) => classSortKey(left).localeCompare(classSortKey(right), 'nl'));
    fillClassOptions();

    const storedClass = normalizeClassId(localStorage.getItem(CURRENT_CLASS_KEY) || '');
    state.currentClass = state.classes.includes(storedClass) ? storedClass : (state.classes[0] || '');
    classSelect.value = state.currentClass;

    renderPortal();
    openPresentationFromLocation();
  } catch (error) {
    weeksGrid.innerHTML = `<article class="empty-state">Laden mislukt: ${escapeHtml(error?.message || error)}</article>`;
    portalMeta.textContent = 'De jaarplanning kon niet worden geladen.';
  }
}

async function refreshPlanningFromPublishedSource() {
  try {
    state.doc = normalizeDoc(await fetchJson(PLANNING_URL));
    renderPortal();
  } catch (err) {
    console.warn('Jaarplanning kon niet opnieuw worden geladen:', err);
  }
}

classSelect?.addEventListener('change', () => {
  state.currentClass = classSelect.value;
  localStorage.setItem(CURRENT_CLASS_KEY, state.currentClass);
  renderPortal();
});

window.addEventListener('storage', (event) => {
  if (event.key === PLATFORM_REFRESH_KEY) {
    refreshPlanningFromPublishedSource();
    return;
  }
  if (!USE_LOCAL_STUDIO_DRAFT) return;
  if (event.key !== STUDIO_KEY) return;
  const studioDoc = loadStudioDocFromStorage();
  if (!studioDoc) return;
  if (parseDocTimestamp(studioDoc) < parseDocTimestamp(state.doc)) return;
  state.doc = studioDoc;
  renderPortal();
});

jumpToCurrentWeekBtn?.addEventListener('click', () => {
  if (timelineDetails) timelineDetails.open = true;
  const targetEl = [
    state.nextLessonAnchorId ? document.getElementById(state.nextLessonAnchorId) : null,
    weeksGrid?.querySelector('.week-card.is-current'),
    weeksGrid?.querySelector('.week-card.is-active'),
    weeksGrid?.querySelector('.week-card'),
    timelineDetails,
  ].find(Boolean);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
});

openNextPresentationBtn?.addEventListener('click', () => {
  if (!state.nextLessonTarget) return;
  openPresentation(state.nextLessonTarget);
});

dialogPrev?.addEventListener('click', () => {
  stepActivePresentation(-1);
});

dialogNext?.addEventListener('click', () => {
  stepActivePresentation(1);
});

presentationDialog?.addEventListener('close', () => {
  state.activePresentation = null;
  state.activePresentationTarget = null;
  state.activeSlideIndex = 0;
});

document.addEventListener('keydown', (event) => {
  if (!presentationDialog?.open || !state.activePresentation) return;
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    stepActivePresentation(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    stepActivePresentation(1);
  }
});

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const netschriftButton = target?.closest('[data-open-netschrift-overview]');
  if (netschriftButton) {
    event.preventDefault();
    openNetschriftOverview();
    return;
  }

  const posterButton = target?.closest('[data-open-poster-overview]');
  if (posterButton) {
    event.preventDefault();
    openPosterOverview(posterButton.getAttribute('data-open-poster-overview'));
    return;
  }

  const overviewPresentationButton = target?.closest('[data-overview-presentation]');
  if (overviewPresentationButton) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const payload = overviewPresentationButton.getAttribute('data-overview-presentation');
    if (!payload) return;
    netschriftDialog?.close();
    posterDialog?.close();
    openPresentation(JSON.parse(payload));
    return;
  }

  const button = target?.closest('[data-next-presentation]');
  if (!button || !state.nextLessonTarget) return;
  openPresentation(state.nextLessonTarget);
});

boot();
