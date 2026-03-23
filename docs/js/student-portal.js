const CONFIG = window.STUDENT_PORTAL_CONFIG || {};
const PLANNING_URL = String(CONFIG.planningUrl || 'js/jaarplanning-live.json');
const CLASSES_URL = String(CONFIG.classesUrl || 'js/leerlingen_per_klas.json');
const AGENDA_URL = String(CONFIG.agendaUrl || 'js/zermelo-agenda-live.json');
const CURRENT_CLASS_KEY = 'student.portal.class';

const classSelect = document.getElementById('classSelect');
const jumpToCurrentWeekBtn = document.getElementById('jumpToCurrentWeekBtn');
const openNextPresentationBtn = document.getElementById('openNextPresentationBtn');
const portalMeta = document.getElementById('portalMeta');
const currentWeekTitle = document.getElementById('currentWeekTitle');
const currentWeekSummary = document.getElementById('currentWeekSummary');
const currentWeekFocus = document.getElementById('currentWeekFocus');
const homeworkSummary = document.getElementById('homeworkSummary');
const currentWeekChip = document.getElementById('currentWeekChip');
const weeksGrid = document.getElementById('weeksGrid');
const weekJumpBar = document.getElementById('weekJumpBar');
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

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  agendaEntries: [],
  classes: [],
  currentClass: '',
  currentWeek: currentIsoWeek(),
  activePresentation: null,
  activePresentationTarget: null,
  activeSlideIndex: 0,
  nextLessonTarget: null,
};

function normalizeClassId(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase();
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
  return safe;
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

function isDutchAgendaEntry(entry) {
  const text = `${entry?.summary || ''}\n${entry?.description || ''}`.toLowerCase();
  return /\bne\b|\bnetl\b/.test(text);
}

function lessonNumberForAgendaWeek(entries, selectedEntry) {
  if (!selectedEntry) return 0;
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

function formatLessonDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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

function findNextLessonForClass(classId, now = new Date()) {
  const nextAgendaEntry = state.agendaEntries.find((entry) => (
    normalizeClassId(entry.classId) === normalizeClassId(classId)
    && isDutchAgendaEntry(entry)
    && entry.start > now
  )) || null;
  if (!nextAgendaEntry) return null;

  const week = isoWeekForDate(nextAgendaEntry.start);
  const entry = getEntryForWeek(classId, week);
  if (!entry) return null;

  const lessonIndex = lessonNumberForAgendaWeek(state.agendaEntries, nextAgendaEntry);
  const lessonKey = lessonLetter(Math.min(3, lessonIndex));
  const lesson = (entry.lessons || []).find((candidate) => String(candidate.lessonKey || '').toUpperCase() === lessonKey) || null;
  if (!lesson) return null;
  const target = buildPresentationTarget(lesson);
  const resolved = resolvePresentation(target);
  return {
    entry,
    lesson,
    lessonKey,
    date: nextAgendaEntry.start,
    target,
    hasPresentation: Boolean(resolved.presentation),
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
  const escaped = escapeHtml(raw);
  return escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
  return { title, project, presentationId, markerId };
}

function resolvePresentation(target) {
  if (!target) return { presentation: null, slideIndex: 0 };
  const presentation = state.doc.presentations[target.presentationId];
  if (!presentation || typeof presentation !== 'object') return { presentation: null, slideIndex: 0 };
  const markerIndex = Number(presentation?.markers?.[target.markerId]);
  return {
    presentation,
    slideIndex: Number.isInteger(markerIndex) ? markerIndex : 0,
  };
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

function openPresentation(target) {
  const resolved = resolvePresentation(target);
  if (!resolved.presentation) return;
  state.activePresentation = resolved.presentation;
  state.activePresentationTarget = target;
  state.activeSlideIndex = resolved.slideIndex;
  dialogTitle.textContent = target.project ? `${target.project} · ${target.title}` : target.title;
  if (dialogMeta) {
    dialogMeta.textContent = target.project
      ? `${target.project} · start op lesonderdeel`
      : 'Start op lesonderdeel';
  }
  renderPresentationSlide();
  if (!presentationDialog.open) presentationDialog.showModal();
}

function stepActivePresentation(delta) {
  const presentation = state.activePresentation;
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  if (!slides.length) return;
  const nextIndex = Math.max(0, Math.min(slides.length - 1, state.activeSlideIndex + delta));
  if (nextIndex === state.activeSlideIndex) return;
  state.activeSlideIndex = nextIndex;
  renderPresentationSlide();
}

function renderPresentationSlide() {
  const presentation = state.activePresentation;
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
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
    <article class="slide-card">
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<p>${renderHtmlText(subtitle)}</p>` : ''}
      ${bullets.length ? `<ul>${bullets.map((item) => `<li>${renderHtmlText(item)}</li>`).join('')}</ul>` : ''}
    </article>
  `;

  dialogCounter.textContent = `${index + 1} / ${slides.length}`;
  dialogPrev.disabled = index <= 0;
  dialogNext.disabled = index >= slides.length - 1;
}

function renderCurrentWeek(layerEntries) {
  const currentEntry = getEntryForWeek(state.currentClass, state.currentWeek) || layerEntries[0] || null;
  const nextLesson = findNextLessonForClass(state.currentClass, new Date());
  state.nextLessonTarget = nextLesson?.hasPresentation ? nextLesson.target : null;
  if (openNextPresentationBtn) openNextPresentationBtn.disabled = !state.nextLessonTarget;
  if (!currentEntry) {
    currentWeekTitle.textContent = 'Nog geen les gevonden';
    currentWeekSummary.textContent = 'Voor deze klas staat nog geen bruikbare planning of roosterkoppeling klaar.';
    if (currentWeekChip) currentWeekChip.textContent = 'Week --';
    if (heroWeekValue) heroWeekValue.textContent = 'Nog onbekend';
    if (heroPresentationCount) heroPresentationCount.textContent = '-';
    if (heroHomeworkCount) heroHomeworkCount.textContent = '0';
    renderSummaryList(homeworkSummary, [], 'Nog geen huiswerk voor de eerstvolgende les.');
    return;
  }

  const week = parseWeek(currentEntry.week);
  const homeworkCount = nextLesson && String(nextLesson.lesson.homework || '').trim() ? 1 : 0;
  const lessonCount = Array.isArray(currentEntry.lessons) ? currentEntry.lessons.length : 0;
  currentWeekTitle.textContent = nextLesson
    ? `${nextLesson.lesson.lesson || nextLesson.lesson.project || 'Les'}`
    : 'Nog geen eerstvolgende les gevonden';
  currentWeekSummary.textContent = nextLesson
    ? `${formatLessonDate(nextLesson.date)} · klas ${state.currentClass}`
    : (lessonCount
      ? `Er staan ${lessonCount} lesmomenten in week ${String(week).padStart(2, '0')}, maar er is geen komende Zermelo-les gevonden voor klas ${state.currentClass}.`
      : `Geen vaste lesmomenten ingepland voor klas ${state.currentClass}.`);
  if (currentWeekChip) currentWeekChip.textContent = `Week ${String(week).padStart(2, '0')}`;
  if (heroWeekValue) heroWeekValue.textContent = nextLesson ? formatLessonDate(nextLesson.date) : 'Nog onbekend';
  if (heroPresentationCount) heroPresentationCount.textContent = nextLesson?.hasPresentation ? 'Klaar' : '-';
  if (heroHomeworkCount) heroHomeworkCount.textContent = String(homeworkCount);

  const homeworkRows = nextLesson && String(nextLesson.lesson.homework || '').trim()
    ? (() => {
      const homework = formatHomeworkContent(nextLesson.lesson.homework);
      return [
      `
        <p class="homework-label">Jouw huiswerk</p>
        ${homework.textHtml ? `<div class="homework-text">${homework.textHtml}</div>` : ''}
        ${homework.materialsHtml}
        ${nextLesson.hasPresentation ? '<button class="lesson-link next-lesson-link" type="button" data-next-presentation="1">Open presentatie</button>' : ''}
      `,
      ];
    })()
    : [];
  renderSummaryList(homeworkSummary, homeworkRows, 'Nog geen huiswerk voor de eerstvolgende les.');
}

function renderWeeks() {
  const entries = getEntriesForClass(state.currentClass);
  weeksGrid.replaceChildren();
  weekJumpBar?.replaceChildren();

  if (!entries.length) {
    weeksGrid.innerHTML = '<article class="empty-state">Voor deze klas zijn nog geen weken gevuld.</article>';
    return;
  }

  for (const entry of entries) {
    const week = parseWeek(entry.week);
    const article = document.createElement('article');
    article.className = 'week-card';
    article.id = `week-${week}`;
    if (week === state.currentWeek) article.classList.add('is-current');

    const lessonsHtml = (entry.lessons || []).length
      ? `<div class="lesson-stack">${entry.lessons.map((lesson) => {
        const title = String(lesson.lesson || '').trim() || 'Les zonder titel';
        const project = String(lesson.project || '').trim();
        const homework = String(lesson.homework || '').trim();
        const hasPresentation = Boolean(resolvePresentation(buildPresentationTarget(lesson)).presentation);
        return `
          <article class="lesson-card">
            <h4>${escapeHtml(title)}</h4>
            ${project ? `<p><strong>Project:</strong> ${escapeHtml(project)}</p>` : ''}
            ${homework ? `<p><strong>Huiswerk:</strong> ${richTextToHtml(homework)}</p>` : ''}
            ${hasPresentation ? `<button class="lesson-link" type="button" data-presentation='${escapeHtml(JSON.stringify(buildPresentationTarget(lesson)))}'>Open presentatie</button>` : ''}
          </article>
        `;
      }).join('')}</div>`
      : '<article class="empty-state">Geen lespresentaties ingepland in deze week.</article>';

    article.innerHTML = `
      <header class="week-card-head">
        <div>
          <p class="overview-label">Klas ${escapeHtml(state.currentClass)}</p>
          <h3>Week ${String(week).padStart(2, '0')}</h3>
        </div>
        <span class="week-badge">${(entry.lessons || []).length} lessen</span>
      </header>
      ${lessonsHtml}
    `;

    weeksGrid.appendChild(article);

    const jumpButton = document.createElement('button');
    jumpButton.type = 'button';
    jumpButton.className = `week-jump-chip${week === state.currentWeek ? ' is-current' : ''}`;
    jumpButton.textContent = `W${String(week).padStart(2, '0')}`;
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
  const entries = getEntriesForClass(state.currentClass);
  const updatedAt = String(state.doc.updatedAt || '').trim();
  const agendaStamp = state.agendaEntries.length ? 'rooster gekoppeld' : 'rooster niet geladen';
  portalMeta.textContent = updatedAt
    ? `Bijgewerkt op ${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))} · ${agendaStamp}`
    : `Planning zonder datumstempel · ${agendaStamp}`;
  renderCurrentWeek(entries);
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
    const [planningRaw, classMap, agendaRaw] = await Promise.all([
      fetchJson(PLANNING_URL),
      fetchJson(CLASSES_URL),
      fetchJson(AGENDA_URL).catch(() => ({ entries: [] })),
    ]);

    state.doc = normalizeDoc(planningRaw);
    state.agendaEntries = normalizeAgendaDoc(agendaRaw);
    state.classes = [...new Set([
      ...classesFromClassMap(classMap),
      ...state.agendaEntries.map((entry) => normalizeClassId(entry.classId)),
    ])]
      .filter(Boolean)
      .sort((left, right) => classSortKey(left).localeCompare(classSortKey(right), 'nl'));
    fillClassOptions();

    const storedClass = String(localStorage.getItem(CURRENT_CLASS_KEY) || '').trim();
    state.currentClass = state.classes.includes(storedClass) ? storedClass : (state.classes[0] || '');
    classSelect.value = state.currentClass;

    renderPortal();
  } catch (error) {
    weeksGrid.innerHTML = `<article class="empty-state">Laden mislukt: ${escapeHtml(error?.message || error)}</article>`;
    portalMeta.textContent = 'De jaarplanning kon niet worden geladen.';
  }
}

classSelect?.addEventListener('change', () => {
  state.currentClass = classSelect.value;
  localStorage.setItem(CURRENT_CLASS_KEY, state.currentClass);
  renderPortal();
});

jumpToCurrentWeekBtn?.addEventListener('click', () => {
  if (timelineDetails) timelineDetails.open = true;
  document.getElementById(`week-${state.currentWeek}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const button = event.target instanceof Element ? event.target.closest('[data-next-presentation]') : null;
  if (!button || !state.nextLessonTarget) return;
  openPresentation(state.nextLessonTarget);
});

boot();
