const CONFIG = window.STUDENT_PORTAL_CONFIG || {};
const PLANNING_URL = String(CONFIG.planningUrl || 'js/jaarplanning-live.json');
const CLASSES_URL = String(CONFIG.classesUrl || 'js/leerlingen_per_klas.json');
const CURRENT_LAYER_KEY = 'student.portal.layer';

const layerSelect = document.getElementById('layerSelect');
const jumpToCurrentWeekBtn = document.getElementById('jumpToCurrentWeekBtn');
const portalMeta = document.getElementById('portalMeta');
const currentWeekTitle = document.getElementById('currentWeekTitle');
const currentWeekSummary = document.getElementById('currentWeekSummary');
const currentWeekFocus = document.getElementById('currentWeekFocus');
const homeworkSummary = document.getElementById('homeworkSummary');
const itemsSummary = document.getElementById('itemsSummary');
const weeksGrid = document.getElementById('weeksGrid');
const heroWeekValue = document.getElementById('heroWeekValue');
const heroPresentationCount = document.getElementById('heroPresentationCount');
const heroHomeworkCount = document.getElementById('heroHomeworkCount');
const presentationDialog = document.getElementById('presentationDialog');
const dialogTitle = document.getElementById('dialogTitle');
const dialogStage = document.getElementById('dialogStage');
const dialogPrev = document.getElementById('dialogPrev');
const dialogNext = document.getElementById('dialogNext');
const dialogCounter = document.getElementById('dialogCounter');

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  layers: [],
  currentLayer: '',
  currentWeek: currentIsoWeek(),
  activePresentation: null,
  activeSlideIndex: 0,
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

function collapseToYearLayerDoc(doc) {
  const safe = normalizeDoc(doc);
  const merged = new Map();

  for (const entry of safe.entries) {
    const layer = gradeLayerFromClassId(entry.classId);
    const week = parseWeek(entry.week);
    if (!layer || !week) continue;

    const key = `${layer}-${week}`;
    if (!merged.has(key)) {
      merged.set(key, { classId: layer, week: String(week), lessons: [], items: [], notes: [] });
    }

    const bucket = merged.get(key);
    for (const lesson of entry.lessons) {
      const fingerprint = JSON.stringify(lesson || {});
      if (!bucket.lessons.some((candidate) => JSON.stringify(candidate || {}) === fingerprint)) {
        bucket.lessons.push(lesson);
      }
    }
    for (const item of entry.items) {
      if (!bucket.items.includes(item)) bucket.items.push(item);
    }
    if (entry.note && !bucket.notes.includes(entry.note)) bucket.notes.push(entry.note);
  }

  safe.entries = [...merged.values()]
    .map((entry) => ({
      classId: entry.classId,
      week: entry.week,
      lessons: entry.lessons.sort((left, right) => String(left.lessonKey || '').localeCompare(String(right.lessonKey || ''))),
      items: entry.items,
      note: entry.notes.join(' | '),
    }))
    .sort((left, right) => Number(left.classId) - Number(right.classId) || parseWeek(left.week) - parseWeek(right.week));

  return safe;
}

function layersFromClassMap(classMap = {}) {
  return [...new Set(Object.keys(classMap).map((cid) => gradeLayerFromClassId(cid)).filter(Boolean))].sort();
}

function getEntriesForLayer(layer) {
  return state.doc.entries
    .filter((entry) => entry.classId === layer)
    .sort((left, right) => parseWeek(left.week) - parseWeek(right.week));
}

function getEntryForWeek(layer, week) {
  return getEntriesForLayer(layer).find((entry) => parseWeek(entry.week) === week) || null;
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
  return escapeHtml(raw).replaceAll('\n', '<br />');
}

function richTextToHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const escaped = escapeHtml(raw);
  return escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
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
  state.activeSlideIndex = resolved.slideIndex;
  dialogTitle.textContent = target.project ? `${target.project} · ${target.title}` : target.title;
  renderPresentationSlide();
  if (!presentationDialog.open) presentationDialog.showModal();
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

  dialogStage.innerHTML = `
    <article class="slide-card">
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<p>${renderHtmlText(subtitle)}</p>` : ''}
      ${bullets.length ? `<ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    </article>
  `;

  dialogCounter.textContent = `${index + 1} / ${slides.length}`;
  dialogPrev.disabled = index <= 0;
  dialogNext.disabled = index >= slides.length - 1;
}

function renderCurrentWeek(layerEntries) {
  const currentEntry = getEntryForWeek(state.currentLayer, state.currentWeek) || layerEntries[0] || null;
  if (!currentEntry) {
    currentWeekTitle.textContent = 'Nog geen planning';
    currentWeekSummary.textContent = 'Voor deze jaarlaag staat nog geen planning klaar.';
    if (currentWeekFocus) currentWeekFocus.textContent = 'Nog geen focuspunt beschikbaar';
    if (heroWeekValue) heroWeekValue.textContent = 'Week --';
    if (heroPresentationCount) heroPresentationCount.textContent = '0';
    if (heroHomeworkCount) heroHomeworkCount.textContent = '0';
    renderSummaryList(homeworkSummary, [], 'Nog geen huiswerk toegevoegd.');
    renderSummaryList(itemsSummary, [], 'Nog geen notities toegevoegd.');
    return;
  }

  const week = parseWeek(currentEntry.week);
  const homeworkCount = (currentEntry.lessons || []).filter((lesson) => String(lesson.homework || '').trim()).length;
  const presentationCount = (currentEntry.lessons || []).filter((lesson) => resolvePresentation(buildPresentationTarget(lesson)).presentation).length;
  currentWeekTitle.textContent = `Week ${String(week).padStart(2, '0')}`;
  const lessonCount = Array.isArray(currentEntry.lessons) ? currentEntry.lessons.length : 0;
  currentWeekSummary.textContent = lessonCount
    ? `${lessonCount} lesmomenten gepland voor jaarlaag ${state.currentLayer}.`
    : `Geen vaste lesmomenten ingepland voor jaarlaag ${state.currentLayer}.`;
  if (currentWeekFocus) {
    currentWeekFocus.textContent = homeworkCount
      ? `${homeworkCount} huiswerkitem${homeworkCount === 1 ? '' : 's'} om af te ronden`
      : 'Rustige week: geen huiswerk gemarkeerd';
  }
  if (heroWeekValue) heroWeekValue.textContent = `Week ${String(week).padStart(2, '0')}`;
  if (heroPresentationCount) heroPresentationCount.textContent = String(presentationCount);
  if (heroHomeworkCount) heroHomeworkCount.textContent = String(homeworkCount);

  const homeworkRows = (currentEntry.lessons || [])
    .filter((lesson) => String(lesson.homework || '').trim())
    .map((lesson) => `<strong>${escapeHtml(lesson.lessonKey || 'Les')}</strong><span>${richTextToHtml(lesson.homework)}</span>`);
  const itemRows = [
    ...((currentEntry.items || []).map((item) => `<span>${richTextToHtml(item)}</span>`)),
    ...(currentEntry.note ? [`<span>${richTextToHtml(currentEntry.note)}</span>`] : []),
  ];

  renderSummaryList(homeworkSummary, homeworkRows, 'Nog geen huiswerk toegevoegd.');
  renderSummaryList(itemsSummary, itemRows, 'Nog geen extra notities toegevoegd.');
}

function renderWeeks() {
  const entries = getEntriesForLayer(state.currentLayer);
  weeksGrid.replaceChildren();

  if (!entries.length) {
    weeksGrid.innerHTML = '<article class="empty-state">Voor deze jaarlaag zijn nog geen weken gevuld.</article>';
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
            <p class="lesson-slot">Les ${escapeHtml(lesson.lessonKey || '')}</p>
            <h4>${escapeHtml(title)}</h4>
            ${project ? `<p><strong>Project:</strong> ${escapeHtml(project)}</p>` : ''}
            ${homework ? `<p><strong>Huiswerk:</strong> ${richTextToHtml(homework)}</p>` : ''}
            ${hasPresentation ? `<button class="lesson-link" type="button" data-presentation='${escapeHtml(JSON.stringify(buildPresentationTarget(lesson)))}'>Open presentatie</button>` : ''}
          </article>
        `;
      }).join('')}</div>`
      : '<article class="empty-state">Geen lespresentaties ingepland in deze week.</article>';

    const items = [...(entry.items || []), ...(entry.note ? [entry.note] : [])];
    const infoHtml = items.length
      ? `<div class="info-stack">${items.map((item) => `<p class="item-pill">${richTextToHtml(item)}</p>`).join('')}</div>`
      : '';

    article.innerHTML = `
      <header class="week-card-head">
        <div>
          <p class="overview-label">Jaarlaag ${escapeHtml(state.currentLayer)}</p>
          <h3>Week ${String(week).padStart(2, '0')}</h3>
        </div>
        <span class="week-badge">${(entry.lessons || []).length} lessen</span>
      </header>
      ${lessonsHtml}
      ${infoHtml}
    `;

    weeksGrid.appendChild(article);
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
  const entries = getEntriesForLayer(state.currentLayer);
  const updatedAt = String(state.doc.updatedAt || '').trim();
  portalMeta.textContent = updatedAt
    ? `Bijgewerkt op ${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}`
    : 'Planning zonder datumstempel';
  renderCurrentWeek(entries);
  renderWeeks();
}

function fillLayerOptions() {
  layerSelect.innerHTML = '';
  for (const layer of state.layers) {
    const option = document.createElement('option');
    option.value = layer;
    option.textContent = `Jaarlaag ${layer}`;
    layerSelect.appendChild(option);
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
    const [planningRaw, classMap] = await Promise.all([
      fetchJson(PLANNING_URL),
      fetchJson(CLASSES_URL),
    ]);

    state.doc = collapseToYearLayerDoc(planningRaw);
    state.layers = [...new Set([...layersFromClassMap(classMap), ...state.doc.entries.map((entry) => entry.classId)])].sort();
    fillLayerOptions();

    const storedLayer = String(localStorage.getItem(CURRENT_LAYER_KEY) || '').trim();
    state.currentLayer = state.layers.includes(storedLayer) ? storedLayer : (state.layers[0] || '');
    layerSelect.value = state.currentLayer;

    renderPortal();
  } catch (error) {
    weeksGrid.innerHTML = `<article class="empty-state">Laden mislukt: ${escapeHtml(error?.message || error)}</article>`;
    portalMeta.textContent = 'De jaarplanning kon niet worden geladen.';
  }
}

layerSelect?.addEventListener('change', () => {
  state.currentLayer = layerSelect.value;
  localStorage.setItem(CURRENT_LAYER_KEY, state.currentLayer);
  renderPortal();
});

jumpToCurrentWeekBtn?.addEventListener('click', () => {
  document.getElementById(`week-${state.currentWeek}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

dialogPrev?.addEventListener('click', () => {
  state.activeSlideIndex -= 1;
  renderPresentationSlide();
});

dialogNext?.addEventListener('click', () => {
  state.activeSlideIndex += 1;
  renderPresentationSlide();
});

presentationDialog?.addEventListener('close', () => {
  state.activePresentation = null;
  state.activeSlideIndex = 0;
});

boot();
