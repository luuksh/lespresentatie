const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const BASE_SOURCE = 'js/jaarplanning-live-20260308.json';

const projectSelect = document.getElementById('projectSelect');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const projectTitle = document.getElementById('projectTitle');
const deckTitleInput = document.getElementById('deckTitleInput');
const deckSubtitleInput = document.getElementById('deckSubtitleInput');
const markerBody = document.getElementById('markerBody');
const statusLine = document.getElementById('statusLine');

const AUTOSAVE_DELAY_MS = 700;

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  projects: [],
};

let autosaveTimer = null;

function setStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.style.color = isError ? '#9f1d1d' : '#2c4f7c';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function projectDeckId(name) {
  return `project-${slugify(name)}`;
}

function lessonMarkerId(lessonName) {
  return `marker-${slugify(lessonName)}`;
}

function isNonRegularMarker(projectName, lessonTitle = '') {
  const project = String(projectName || '').trim();
  if (!project) return false;
  const normalized = project.toLocaleLowerCase('nl-NL');
  if ([
    'herfstvakantie',
    'kerstvakantie',
    'meivakantie',
    'voorjaarsvakantie',
    'zomervakantie',
  ].includes(normalized)) return true;
  return normalized.startsWith('cgu-week') || normalized.startsWith('cgu week');
}

function normalizeDoc(raw) {
  const doc = (raw && typeof raw === 'object') ? structuredClone(raw) : {};
  if (!Array.isArray(doc.entries)) doc.entries = [];
  if (!doc.presentations || typeof doc.presentations !== 'object') doc.presentations = {};
  doc.sourceRevision = String(doc.sourceRevision || '').trim();
  return doc;
}

function parseDocTimestamp(doc) {
  const raw = String(doc?.updatedAt || '').trim();
  if (!raw) return 0;
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? stamp : 0;
}

function baseShouldReplaceLocal(baseDoc, localDoc) {
  const baseRevision = String(baseDoc?.sourceRevision || '').trim();
  const localRevision = String(localDoc?.sourceRevision || '').trim();
  if (baseRevision && localRevision && baseRevision !== localRevision) return true;
  if (baseRevision && !localRevision) return true;
  const baseStamp = parseDocTimestamp(baseDoc);
  const localStamp = parseDocTimestamp(localDoc);
  if (!baseStamp || !localStamp) return false;
  return baseStamp > localStamp;
}

function collectProjectMarkers(doc) {
  const out = {};
  for (const entry of doc.entries || []) {
    if (!Array.isArray(entry?.lessons)) continue;
    for (const lesson of entry.lessons) {
      const project = String(lesson?.project || '').trim();
      const lessonTitle = String(lesson?.lesson || '').trim();
      if (isNonRegularMarker(project, lessonTitle)) continue;
      if (!project || !lessonTitle) continue;
      const deckId = projectDeckId(project);
      const markerId = lessonMarkerId(lessonTitle);
      lesson.presentationId = deckId;
      lesson.presentationMarkerId = markerId;
      if (!out[deckId]) out[deckId] = { project, markers: new Map() };
      if (!out[deckId].markers.has(markerId)) out[deckId].markers.set(markerId, lessonTitle);
    }
  }
  return out;
}

function compilePresentationFromMarkerDecks(presentation, orderedMarkers, projectName) {
  const titleSlide = {
    type: 'title',
    title: String(presentation.title || projectName).trim() || projectName,
    subtitle: String(presentation.subtitle || projectName).trim() || projectName,
    showProjectLogo: true,
  };
  const slides = [titleSlide];
  const markers = {};

  for (const markerId of orderedMarkers) {
    const deck = Array.isArray(presentation.markerDecks?.[markerId])
      ? presentation.markerDecks[markerId].filter((slide) => slide && typeof slide === 'object')
      : [];
    if (!deck.length) continue;
    markers[markerId] = slides.length;
    for (const slide of deck) {
      slides.push({
        type: String(slide.type || 'title').toLowerCase() === 'bullets' ? 'bullets' : 'title',
        title: String(slide.title || '').trim(),
        subtitle: String(slide.subtitle || '').trim(),
        showProjectLogo: Boolean(slide.showProjectLogo),
        items: Array.isArray(slide.items)
          ? slide.items.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
      });
    }
  }

  presentation.slides = slides;
  presentation.markers = markers;
}

function ensureProjectPresentations(doc) {
  const safe = normalizeDoc(doc);
  const bundles = collectProjectMarkers(safe);

  for (const [deckId, bundle] of Object.entries(bundles)) {
    const current = safe.presentations[deckId] && typeof safe.presentations[deckId] === 'object'
      ? safe.presentations[deckId]
      : null;
    const presentation = current || {
      id: deckId,
      presentationType: 'project-overview',
      title: bundle.project,
      subtitle: bundle.project,
      project: bundle.project,
      markerDecks: {},
      slides: [],
      markers: {},
    };

    presentation.id = deckId;
    presentation.presentationType = 'project-overview';
    presentation.project = bundle.project;
    presentation.title = String(presentation.title || bundle.project).trim() || bundle.project;
    presentation.subtitle = String(presentation.subtitle || bundle.project).trim() || bundle.project;
    if (!presentation.markerDecks || typeof presentation.markerDecks !== 'object') {
      presentation.markerDecks = {};
    }

    for (const [markerId, lessonTitle] of bundle.markers.entries()) {
      const existingDeck = presentation.markerDecks[markerId];
      if (Array.isArray(existingDeck) && existingDeck.length) continue;
      presentation.markerDecks[markerId] = [{
        type: 'title',
        title: lessonTitle,
        subtitle: bundle.project,
        items: [],
      }];
    }

    compilePresentationFromMarkerDecks(presentation, [...bundle.markers.keys()], bundle.project);
    safe.presentations[deckId] = presentation;
  }

  return safe;
}

async function fetchJson(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set('_t', String(Date.now()));
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function saveStudio() {
  state.doc.updatedAt = new Date().toISOString();
  localStorage.setItem(STUDIO_KEY, JSON.stringify(state.doc));
}

function markerDeckSlideCount(presentation) {
  const decks = presentation?.markerDecks;
  if (!decks || typeof decks !== 'object') return 0;
  let total = 0;
  for (const deck of Object.values(decks)) {
    if (Array.isArray(deck)) total += deck.length;
  }
  return total;
}

function presentationImportVersion(presentation) {
  const value = Number(presentation?.importVersion || 0);
  return Number.isFinite(value) ? value : 0;
}

function mergePreferRicherBase(baseDoc, storedDoc) {
  const base = ensureProjectPresentations(baseDoc);
  const stored = ensureProjectPresentations(storedDoc);
  if (baseShouldReplaceLocal(base, stored)) {
    return base;
  }
  const merged = normalizeDoc(stored);

  if (!merged.presentations || typeof merged.presentations !== 'object') {
    merged.presentations = {};
  }

  for (const [deckId, basePres] of Object.entries(base.presentations || {})) {
    const localPres = merged.presentations[deckId];
    if (!localPres || typeof localPres !== 'object') {
      merged.presentations[deckId] = structuredClone(basePres);
      continue;
    }

    const baseCount = markerDeckSlideCount(basePres);
    const localCount = markerDeckSlideCount(localPres);
    const baseMarkers = Object.keys(basePres.markers || {}).length;
    const localMarkers = Object.keys(localPres.markers || {}).length;
    const baseVersion = presentationImportVersion(basePres);
    const localVersion = presentationImportVersion(localPres);

    if (
      baseVersion > localVersion
      || baseCount > localCount
      || baseMarkers > localMarkers
    ) {
      merged.presentations[deckId] = structuredClone(basePres);
    }
  }

  return ensureProjectPresentations(merged);
}

function markerRowsForProject(projectName) {
  const deckId = projectDeckId(projectName);
  const pres = state.doc.presentations[deckId];
  if (!pres || !pres.markers) return [];

  const markerLessonTitle = new Map();
  const orderedMarkerIds = [];
  const seen = new Set();
  for (const entry of state.doc.entries || []) {
    for (const lesson of entry?.lessons || []) {
      if (String(lesson?.project || '').trim() !== projectName) continue;
      const lessonTitle = String(lesson?.lesson || '').trim();
      const markerId = String(lesson?.presentationMarkerId || lessonMarkerId(lessonTitle)).trim();
      if (!markerId || seen.has(markerId)) continue;
      seen.add(markerId);
      if (lessonTitle && !markerLessonTitle.has(markerId)) {
        markerLessonTitle.set(markerId, lessonTitle);
      }
      orderedMarkerIds.push(markerId);
    }
  }

  function lessonNumberFor(markerId) {
    const title = String(markerLessonTitle.get(markerId) || '').trim();
    const titleMatch = title.match(/\bles\s*([0-9]+)\b/i);
    if (titleMatch) return Number(titleMatch[1]);
    const markerMatch = String(markerId).match(/(?:^|-)les-([0-9]+)(?:-|$)/i);
    if (markerMatch) return Number(markerMatch[1]);
    return Number.POSITIVE_INFINITY;
  }

  const rows = [];
  const fallbackOrder = Object.keys(pres.markers || {}).sort((a, b) =>
    a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' })
  );
  const baseOrder = orderedMarkerIds.length ? [...orderedMarkerIds] : [...fallbackOrder];
  for (const markerId of fallbackOrder) {
    if (!seen.has(markerId)) baseOrder.push(markerId);
  }
  const markerOrder = baseOrder.sort((a, b) => {
    const aNum = lessonNumberFor(a);
    const bNum = lessonNumberFor(b);
    if (aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' });
  });

  for (const markerId of markerOrder) {
    if (!(markerId in (pres.markers || {}))) continue;
    const slideIndexRaw = pres.markers[markerId];
    const idx = Number(slideIndexRaw);
    const deck = Array.isArray(pres.markerDecks?.[markerId])
      ? pres.markerDecks[markerId]
      : (Number.isInteger(idx) && pres.slides?.[idx] ? [pres.slides[idx]] : []);
    rows.push({ markerId, slides: deck });
  }
  return rows;
}

function serializeSlides(slides) {
  const parts = [];
  const safeSlides = Array.isArray(slides) ? slides : [];
  for (const slide of safeSlides) {
    const type = String(slide?.type || 'title').toLowerCase() === 'bullets' ? 'bullets' : 'title';
    const title = String(slide?.title || '').trim();
    const subtitle = String(slide?.subtitle || '').trim();
    const items = Array.isArray(slide?.items) ? slide.items.map((x) => String(x || '').trim()).filter(Boolean) : [];

    const lines = [`[${type}] ${title}`.trim()];
    if (subtitle) lines.push(`subtitle: ${subtitle}`);
    for (const item of items) lines.push(`- ${item}`);
    parts.push(lines.join('\n'));
  }
  return parts.join('\n---\n');
}

function parseSlides(text) {
  const chunks = String(text || '')
    .split(/\n\s*---\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const slides = [];

  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;

    let type = 'title';
    let title = '';
    let subtitle = '';
    const items = [];

    const head = lines[0].match(/^\[(title|bullets)\]\s*(.*)$/i);
    if (head) {
      type = head[1].toLowerCase() === 'bullets' ? 'bullets' : 'title';
      title = String(head[2] || '').trim();
    } else {
      title = lines[0];
    }

    for (const line of lines.slice(1)) {
      const sub = line.match(/^subtitle\s*:\s*(.*)$/i);
      if (sub) {
        subtitle = String(sub[1] || '').trim();
        continue;
      }
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        items.push(String(bullet[1] || '').trim());
      }
    }

    const slide = { type, title, subtitle, items };
    if (slide.type === 'title') delete slide.items;
    slides.push(slide);
  }

  if (!slides.length) {
    return [{ type: 'title', title: 'Nieuwe slide', subtitle: '', items: [] }];
  }
  return slides;
}

function queueAutoSave() {
  const project = String(projectSelect.value || '').trim();
  if (!project) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    saveProject({ auto: true });
  }, AUTOSAVE_DELAY_MS);
}

function renderProject() {
  const project = String(projectSelect.value || '').trim();
  if (!project) return;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres) return;

  projectTitle.textContent = `Overzicht · ${project}`;
  deckTitleInput.value = String(pres.title || project);
  deckSubtitleInput.value = String(pres.subtitle || project);

  const rows = markerRowsForProject(project);
  markerBody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    const text = serializeSlides(row.slides)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    tr.innerHTML = `
      <td>${row.markerId}</td>
      <td><textarea class="marker-textarea" data-marker="${row.markerId}" placeholder="[title] Intro\\nsubtitle: ...\\n---\\n[bullets] Kern\\n- punt 1\\n- punt 2">${text}</textarea></td>
    `;
    markerBody.appendChild(tr);
  }

  for (const textarea of markerBody.querySelectorAll('.marker-textarea')) {
    textarea.addEventListener('input', queueAutoSave);
  }
}

function saveProject({ auto = false } = {}) {
  const project = String(projectSelect.value || '').trim();
  if (!project) return;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres) return;

  pres.title = String(deckTitleInput.value || '').trim() || project;
  pres.subtitle = String(deckSubtitleInput.value || '').trim() || project;

  for (const textarea of markerBody.querySelectorAll('.marker-textarea')) {
    const markerId = String(textarea.dataset.marker || '');
    if (!markerId) continue;
    pres.markerDecks[markerId] = parseSlides(textarea.value);
  }

  const markerOrder = markerRowsForProject(project).map((row) => row.markerId);
  compilePresentationFromMarkerDecks(pres, markerOrder, project);

  saveStudio();
  if (auto) setStatus(`Automatisch opgeslagen: ${project}.`);
  else setStatus(`Project opgeslagen: ${project}.`);
}

function fillProjects(doc) {
  const projects = [...new Set(
    (doc.entries || [])
      .flatMap((entry) => Array.isArray(entry.lessons) ? entry.lessons : [])
      .filter((lesson) => !isNonRegularMarker(lesson?.project, lesson?.lesson))
      .map((lesson) => String(lesson?.project || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'nl'));
  state.projects = projects;
  projectSelect.innerHTML = '';
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = project;
    option.textContent = project;
    projectSelect.appendChild(option);
  }
}

async function boot() {
  try {
    const baseRaw = await fetchJson(BASE_SOURCE);
    const fromStorage = localStorage.getItem(STUDIO_KEY);
    const seed = fromStorage ? JSON.parse(fromStorage) : null;
    state.doc = seed
      ? mergePreferRicherBase(baseRaw, seed)
      : ensureProjectPresentations(baseRaw);
    fillProjects(state.doc);
    if (state.projects.length) projectSelect.value = state.projects[0];
    saveStudio();
    renderProject();
    setStatus('Presentatiestudio klaar. Meerdere slides per les-marker actief.');
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij laden: ${err?.message || err}`, true);
  }
}

projectSelect.addEventListener('change', renderProject);
saveProjectBtn.addEventListener('click', () => saveProject({ auto: false }));
deckTitleInput.addEventListener('input', queueAutoSave);
deckSubtitleInput.addEventListener('input', queueAutoSave);

boot();
