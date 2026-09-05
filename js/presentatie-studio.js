const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const STUDIO_BACKUP_KEY = 'lespresentatie.jaarplanningStudioBackups';
const PLATFORM_REFRESH_KEY = 'lespresentatie.platformRefresh';
const BASE_SOURCE = 'js/jaarplanning-live.json';
const PUBLISH_ENDPOINT = 'api/presentatie-studio/publish';
const MENTOR_LESSON_CLASS_ID = 'MENTORLES';
const STARTWEEK_PLANNING_WEEK = 35;
const MENTOR_STARTWEEK_PRESENTATION_ID = 'project-mentorles-1d';

const projectSelect = document.getElementById('projectSelect');
const createProjectBtn = document.getElementById('createProjectBtn');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const exportAllBtn = document.getElementById('exportAllBtn');
const publishAllBtn = document.getElementById('publishAllBtn');
const projectTitle = document.getElementById('projectTitle');
const deckTitleInput = document.getElementById('deckTitleInput');
const deckSubtitleInput = document.getElementById('deckSubtitleInput');
const linkSelectionBtn = document.getElementById('linkSelectionBtn');
const openProjectPresentationBtn = document.getElementById('openProjectPresentationBtn');
const markerBody = document.getElementById('markerBody');
const statusLine = document.getElementById('statusLine');
const studioPresentationPlayer = document.getElementById('studioPresentationPlayer');
const studioPlayerTitle = document.getElementById('studioPlayerTitle');
const studioPlayerStage = document.getElementById('studioPlayerStage');
const studioPlayerCloseBtn = document.getElementById('studioPlayerCloseBtn');
const studioPlayerPrevBtn = document.getElementById('studioPlayerPrevBtn');
const studioPlayerNextBtn = document.getElementById('studioPlayerNextBtn');
const studioPlayerCounter = document.getElementById('studioPlayerCounter');

const AUTOSAVE_DELAY_MS = 700;

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  projects: [],
};

let autosaveTimer = null;
let activeLinkField = null;
let renderedProject = '';
let hasLocalChanges = false;
let publishInFlight = false;
let publishQueuedAfterCurrent = false;
let activeStudioPresentation = { title: '', slides: [], index: 0 };
let lastStudioCacheWriteOk = true;

function setStatus(message, type = 'info') {
  statusLine.textContent = message;
  statusLine.dataset.status = type === true ? 'error' : String(type || 'info');
}

function setButtonBusy(button, label) {
  if (!button) return;
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
  button.disabled = true;
  button.classList.add('is-busy');
  button.textContent = label;
}

function setButtonDone(button, label, resetDelay = 1800) {
  if (!button) return;
  button.disabled = false;
  button.classList.remove('is-busy');
  button.classList.add('is-done');
  button.textContent = label;
  window.setTimeout(() => {
    button.classList.remove('is-done');
    button.textContent = button.dataset.defaultLabel || button.textContent;
  }, resetDelay);
}

function resetButton(button) {
  if (!button) return;
  button.disabled = false;
  button.classList.remove('is-busy', 'is-done');
  button.textContent = button.dataset.defaultLabel || button.textContent;
}

function markLocalChanges() {
  hasLocalChanges = true;
  saveProjectBtn?.classList.add('has-changes');
  publishAllBtn?.classList.add('has-changes');
}

function clearLocalChanges() {
  hasLocalChanges = false;
  saveProjectBtn?.classList.remove('has-changes');
  publishAllBtn?.classList.remove('has-changes');
}

function isStorageQuotaError(err) {
  return err?.name === 'QuotaExceededError'
    || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err?.code === 22
    || err?.code === 1014;
}

function trySetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isStorageQuotaError(err)) throw err;
  }

  try {
    localStorage.removeItem(STUDIO_BACKUP_KEY);
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isStorageQuotaError(err)) throw err;
    console.warn(`Browseropslag is vol; cache "${key}" is overgeslagen.`, err);
    if (key === STUDIO_KEY) {
      try { localStorage.removeItem(STUDIO_KEY); } catch {}
    }
    return false;
  }
}

function backupStudioDoc(reason, doc = state.doc) {
  if (!doc || typeof doc !== 'object') return;
  try {
    const backups = JSON.parse(localStorage.getItem(STUDIO_BACKUP_KEY) || '[]');
    const list = Array.isArray(backups) ? backups : [];
    list.unshift({
      createdAt: new Date().toISOString(),
      reason: String(reason || 'backup'),
      sourceRevision: String(doc.sourceRevision || ''),
      updatedAt: String(doc.updatedAt || ''),
      doc: {
        sourceRevision: String(doc.sourceRevision || ''),
        updatedAt: String(doc.updatedAt || ''),
        presentations: doc.presentations && typeof doc.presentations === 'object'
          ? structuredClone(doc.presentations)
          : {},
      },
    });
    let keep = list.slice(0, 10);
    while (keep.length) {
      try {
        trySetLocalStorage(STUDIO_BACKUP_KEY, JSON.stringify(keep));
        return;
      } catch {
        keep = keep.slice(0, -1);
      }
    }
  } catch (err) {
    console.warn('Studio-back-up kon niet worden gemaakt:', err);
  }
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

function orderedMarkerIdsWithExtras(plannedMarkerIds = [], presentation = {}) {
  const out = [];
  const seen = new Set();
  const deleted = new Set(Array.isArray(presentation?.deletedMarkerIds)
    ? presentation.deletedMarkerIds.map((markerId) => String(markerId || '').trim()).filter(Boolean)
    : []);
  for (const markerId of plannedMarkerIds) {
    const clean = String(markerId || '').trim();
    if (deleted.has(clean)) continue;
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  const decks = presentation?.markerDecks && typeof presentation.markerDecks === 'object'
    ? presentation.markerDecks
    : {};
  for (const markerId of Object.keys(decks)) {
    const clean = String(markerId || '').trim();
    if (deleted.has(clean)) continue;
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function ensureLessonMeta(presentation) {
  if (!presentation || typeof presentation !== 'object') return {};
  if (!presentation.lessonMeta || typeof presentation.lessonMeta !== 'object' || Array.isArray(presentation.lessonMeta)) {
    presentation.lessonMeta = {};
  }
  return presentation.lessonMeta;
}

function lessonMetaForMarker(presentation, markerId) {
  const meta = ensureLessonMeta(presentation);
  const key = String(markerId || '').trim();
  if (!key) return {};
  if (!meta[key] || typeof meta[key] !== 'object' || Array.isArray(meta[key])) {
    meta[key] = {};
  }
  if (!meta[key].netschrift || typeof meta[key].netschrift !== 'object' || Array.isArray(meta[key].netschrift)) {
    meta[key].netschrift = { items: [] };
  }
  if (!Array.isArray(meta[key].netschrift.items)) {
    meta[key].netschrift.items = [];
  }
  meta[key].netschrift.items = meta[key].netschrift.items
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return meta[key];
}

function netschriftItemsForMarker(presentation, markerId) {
  const key = String(markerId || '').trim();
  const items = presentation?.lessonMeta?.[key]?.netschrift?.items;
  return Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function setNetschriftItemsForMarker(presentation, markerId, items) {
  const key = String(markerId || '').trim();
  if (!key) return;
  const cleanItems = Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!cleanItems.length) {
    const existing = presentation?.lessonMeta?.[key];
    if (existing && typeof existing === 'object') {
      delete existing.netschrift;
      if (!Object.keys(existing).length) delete presentation.lessonMeta[key];
    }
    if (presentation?.lessonMeta && !Object.keys(presentation.lessonMeta).length) delete presentation.lessonMeta;
    return;
  }
  const meta = lessonMetaForMarker(presentation, key);
  meta.netschrift.items = cleanItems;
}

function moveLessonMeta(presentation, fromMarkerId, toMarkerId) {
  const meta = presentation?.lessonMeta;
  if (!meta || typeof meta !== 'object') return;
  const from = String(fromMarkerId || '').trim();
  const to = String(toMarkerId || '').trim();
  if (!from || !to || from === to || !meta[from]) return;
  meta[to] = structuredClone(meta[from]);
  delete meta[from];
}

function deleteLessonMeta(presentation, markerId) {
  const meta = presentation?.lessonMeta;
  if (!meta || typeof meta !== 'object') return;
  delete meta[String(markerId || '').trim()];
  if (!Object.keys(meta).length) delete presentation.lessonMeta;
}

function serializeNetschriftItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n');
}

function parseNetschriftItems(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean);
}

function knownProjectNames() {
  const names = [
    ...((state.doc.entries || [])
      .flatMap((entry) => Array.isArray(entry.lessons) ? entry.lessons : [])
      .filter((lesson) => !isNonRegularMarker(lesson?.project, lesson?.lesson))
      .map((lesson) => String(lesson?.project || '').trim())),
    ...Object.values(state.doc.presentations || {})
      .map((presentation) => String(presentation?.project || '').trim()),
  ].filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'nl'));
}

function uniqueMarkerIdForPresentation(presentation, title, ignoreMarkerId = '') {
  const base = lessonMarkerId(title);
  const used = new Set([
    ...Object.keys(presentation?.markers || {}),
    ...Object.keys(presentation?.markerDecks || {}),
  ]);
  if (ignoreMarkerId) used.delete(ignoreMarkerId);
  if (Array.isArray(presentation?.deletedMarkerIds)) {
    for (const markerId of presentation.deletedMarkerIds) used.delete(String(markerId || '').trim());
  }
  let markerId = base;
  let suffix = 2;
  while (used.has(markerId)) {
    markerId = `${base}-${suffix}`;
    suffix += 1;
  }
  return markerId;
}

function mergeStandalonePresentationsIntoProjects(doc) {
  const safe = normalizeDoc(doc);
  const entries = Object.entries(safe.presentations || {});
  const existingProjectNames = new Set(
    (safe.entries || [])
      .flatMap((entry) => Array.isArray(entry.lessons) ? entry.lessons : [])
      .filter((lesson) => !isNonRegularMarker(lesson?.project, lesson?.lesson))
      .map((lesson) => String(lesson?.project || '').trim())
      .filter(Boolean)
  );
  for (const [deckId, presentation] of entries) {
    const project = String(presentation?.project || '').trim();
    if (project && deckId === projectDeckId(project)) existingProjectNames.add(project);
  }

  let changed = false;
  for (const [deckId, presentation] of entries) {
    if (!presentation?.studioStandalone) continue;
    const parentProject = [...existingProjectNames].find((project) => (
      project.toLocaleLowerCase('nl-NL') === String(presentation.project || '').trim().toLocaleLowerCase('nl-NL')
    ));
    if (!parentProject || deckId === projectDeckId(parentProject)) continue;
    const parentDeckId = projectDeckId(parentProject);
    const parent = safe.presentations[parentDeckId];
    if (!parent || typeof parent !== 'object') continue;
    if (!parent.markerDecks || typeof parent.markerDecks !== 'object') parent.markerDecks = {};

    const markerDecks = presentation.markerDecks && typeof presentation.markerDecks === 'object'
      ? presentation.markerDecks
      : {};
    const orderedMarkers = Object.keys(markerDecks);
    for (const markerId of orderedMarkers) {
      if (!Array.isArray(markerDecks[markerId])) continue;
      const title = String(presentation.title || markerId).trim() || markerId;
      const targetMarkerId = parent.markerDecks[markerId]
        ? uniqueMarkerIdForPresentation(parent, title)
        : markerId;
      parent.markerDecks[targetMarkerId] = structuredClone(markerDecks[markerId]).map((slide) => {
        if (
          slide
          && typeof slide === 'object'
          && String(slide.subtitle || '').trim().toLocaleLowerCase('nl-NL') === parentProject.toLocaleLowerCase('nl-NL')
          && String(presentation.subtitle || '').trim().toLocaleLowerCase('nl-NL') === parentProject.toLocaleLowerCase('nl-NL')
        ) {
          return { ...slide, subtitle: '' };
        }
        return slide;
      });
    }
    compilePresentationFromMarkerDecks(parent, orderedMarkerIdsWithExtras(Object.keys(parent.markers || {}), parent), parentProject);
    delete safe.presentations[deckId];
    changed = true;
  }

  return { doc: safe, changed };
}

function normalizeClassId(raw) {
  const text = String(raw || '').replace(/\s+/g, '').toUpperCase();
  const prefixed = text.match(/^G([1-4][A-Z])$/);
  return prefixed ? prefixed[1] : text;
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
  const baseRevision = String(baseDoc?.sourceRevision || '').trim();
  const localRevision = String(localDoc?.sourceRevision || '').trim();
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
      const markerId = String(lesson?.presentationMarkerId || lessonMarkerId(lessonTitle)).trim();
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

  const deleted = new Set(Array.isArray(presentation.deletedMarkerIds)
    ? presentation.deletedMarkerIds.map((markerId) => String(markerId || '').trim()).filter(Boolean)
    : []);

  for (const markerId of orderedMarkers) {
    if (deleted.has(markerId)) continue;
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
    const deleted = new Set(Array.isArray(presentation.deletedMarkerIds)
      ? presentation.deletedMarkerIds.map((markerId) => String(markerId || '').trim()).filter(Boolean)
      : []);

    for (const [markerId, lessonTitle] of bundle.markers.entries()) {
      if (deleted.has(markerId)) continue;
      const existingDeck = presentation.markerDecks[markerId];
      if (Array.isArray(existingDeck) && existingDeck.length) continue;
      presentation.markerDecks[markerId] = [{
        type: 'title',
        title: lessonTitle,
        subtitle: bundle.project,
        items: [],
      }];
    }

    compilePresentationFromMarkerDecks(
      presentation,
      orderedMarkerIdsWithExtras([...bundle.markers.keys()], presentation),
      bundle.project,
    );
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
  lastStudioCacheWriteOk = trySetLocalStorage(STUDIO_KEY, JSON.stringify(state.doc));
  return lastStudioCacheWriteOk;
}

function signalPlatformsRefresh(result = {}) {
  trySetLocalStorage(PLATFORM_REFRESH_KEY, JSON.stringify({
    updatedAt: result.updatedAt || new Date().toISOString(),
    sourceRevision: result.sourceRevision || state.doc.sourceRevision || '',
  }));
}

async function syncFromPublishedSource(result = {}) {
  try {
    const liveDoc = ensureProjectPresentations(await fetchJson(BASE_SOURCE));
    state.doc = liveDoc;
    saveStudio();
  } catch (err) {
    console.warn('Live bron kon na publiceren niet worden teruggelezen:', err);
  }
  signalPlatformsRefresh(result);
}

function gradeLayerFromClassId(rawClassId) {
  const cid = normalizeClassId(rawClassId);
  const patterns = [
    /^G?([1-6])[A-Z]$/,
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
      .map((entry) => gradeLayerFromClassId(entry?.classId || ''))
      .filter(Boolean)
  )].sort((a, b) => Number(a) - Number(b));
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
    deletedMarkerIds: Array.isArray(presentation?.deletedMarkerIds)
      ? presentation.deletedMarkerIds.map((markerId) => String(markerId || '').trim()).filter(Boolean)
      : [],
  }));

  return {
    ...fullDoc,
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
    flushAutoSave({ publish: false });
    saveProject({ auto: true });
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
    setStatus(`Export gedownload: ${payload.counts.entries} planningregels, ${payload.counts.presentations} presentaties.`, 'success');
  } catch (err) {
    console.error(err);
    setStatus(`Export mislukt: ${err?.message || err}`, 'error');
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
  void publishAll({ skipFlush: true, skipCurrentProjectSave: true, auto: true });
}

async function publishAll({ skipFlush = false, skipCurrentProjectSave = false, auto = false } = {}) {
  if (publishInFlight) {
    publishQueuedAfterCurrent = true;
    setStatus('Er loopt al een publicatie. De nieuwste wijzigingen worden daarna automatisch meegenomen.', 'busy');
    return false;
  }

  publishInFlight = true;
  if (!skipFlush) flushAutoSave({ publish: false });
  if (!skipCurrentProjectSave) saveProject({ auto: true });
  backupStudioDoc('voor publiceren');
  saveStudio();
  const payload = buildExportPayload();
  setButtonBusy(publishAllBtn, auto ? 'Auto-publiceren...' : 'Publiceren...');
  setStatus(auto
    ? 'Automatisch opslaan en publiceren naar docent- en leerlingomgeving...'
    : 'Publiceren naar docent- en leerlingomgeving...', 'busy');
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
    state.doc.sourceRevision = String(result.sourceRevision || result.updatedAt || state.doc.sourceRevision || '');
    state.doc.updatedAt = String(result.updatedAt || state.doc.updatedAt || '');
    saveStudio();
    await syncFromPublishedSource(result);
    clearLocalChanges();
    setButtonDone(publishAllBtn, 'Gepubliceerd');
    setStatus(`${auto ? 'Automatisch opgeslagen en gepubliceerd' : 'Gepubliceerd naar omgevingen'}: ${result.presentations || Object.keys(state.doc.presentations || {}).length} presentaties bijgewerkt.${autoGitMessage(result)} Refresh docent/leerling met Cmd+Shift+R als je de wijziging nog niet ziet.`, result.autoGit?.ok === false ? 'error' : 'success');
    return true;
  } catch (err) {
    console.error(err);
    resetButton(publishAllBtn);
    setStatus(`${lastStudioCacheWriteOk ? 'Lokaal opgeslagen' : 'Alleen in dit tabblad bijgewerkt'}, maar publiceren naar de omgevingen is mislukt: ${publishErrorMessage(err)}`, 'error');
    return false;
  } finally {
    if (publishAllBtn?.classList.contains('is-busy')) resetButton(publishAllBtn);
    publishInFlight = false;
    if (publishQueuedAfterCurrent) {
      publishQueuedAfterCurrent = false;
      const project = String(renderedProject || projectSelect.value || '').trim();
      if (project && saveProject({ auto: true, project })) queueAutoPublish();
    }
  }
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

function markerDeckHasRealContent(deck) {
  if (!Array.isArray(deck)) return false;
  return deck.some((slide) => {
    if (!slide || typeof slide !== 'object') return false;
    const items = Array.isArray(slide.items)
      ? slide.items.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    return items.length > 0 || String(slide.type || '').trim().toLowerCase() === 'bullets';
  });
}

function markerDeckLooksPlaceholder(deck) {
  if (!Array.isArray(deck) || deck.length !== 1) return false;
  const slide = deck[0];
  if (!slide || typeof slide !== 'object') return false;
  const items = Array.isArray(slide.items)
    ? slide.items.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const title = String(slide.title || '').trim();
  const subtitle = String(slide.subtitle || '').trim();
  return !items.length
    && String(slide.type || 'title').trim().toLowerCase() !== 'bullets'
    && /^Les\s+\d+\s+V-rede:/i.test(title)
    && subtitle === 'V-rede';
}

function presentationImportVersion(presentation) {
  const value = Number(presentation?.importVersion || 0);
  return Number.isFinite(value) ? value : 0;
}

function basePresentationShouldReplaceLocal(deckId, basePres, localPres) {
  if (deckId === 'project-v-rede') return false;
  const baseDecks = basePres?.markerDecks && typeof basePres.markerDecks === 'object'
    ? basePres.markerDecks
    : {};
  const localDecks = localPres?.markerDecks && typeof localPres.markerDecks === 'object'
    ? localPres.markerDecks
    : {};
  const hasLocalOnlyDecks = Object.keys(localDecks).some((markerId) => !(markerId in baseDecks));
  if (hasLocalOnlyDecks) return false;
  const baseVersion = presentationImportVersion(basePres);
  const localVersion = presentationImportVersion(localPres);
  return baseVersion > localVersion;
}

function mergePreferRicherBase(baseDoc, storedDoc) {
  const base = ensureProjectPresentations(baseDoc);
  const stored = ensureProjectPresentations(storedDoc);
  const merged = normalizeDoc(stored);
  if (Array.isArray(base.entries) && base.entries.length) merged.entries = structuredClone(base.entries);
  if (Array.isArray(base.holidays)) merged.holidays = structuredClone(base.holidays);

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

    if (deckId !== 'project-v-rede' && (
      basePresentationShouldReplaceLocal(deckId, basePres, localPres)
      || baseCount > localCount
      || baseMarkers > localMarkers
    )) {
      merged.presentations[deckId] = structuredClone(basePres);
      continue;
    }

    const localDecks = localPres.markerDecks && typeof localPres.markerDecks === 'object'
      ? localPres.markerDecks
      : {};
    const baseDecks = basePres.markerDecks && typeof basePres.markerDecks === 'object'
      ? basePres.markerDecks
      : {};
    let replacedDeck = false;
    for (const [markerId, baseDeck] of Object.entries(baseDecks)) {
      const localDeck = localDecks[markerId];
      if (
        ((!Array.isArray(localDeck) || !localDeck.length) || markerDeckLooksPlaceholder(localDeck))
        && markerDeckHasRealContent(baseDeck)
      ) {
        localDecks[markerId] = structuredClone(baseDeck);
        replacedDeck = true;
      }
    }
    if (replacedDeck) {
      localPres.markerDecks = localDecks;
      merged.presentations[deckId] = structuredClone(localPres);
    }
  }

  return ensureProjectPresentations(merged);
}

function markerRowsForProject(projectName) {
  const deckId = projectDeckId(projectName);
  const pres = state.doc.presentations[deckId];
  if (!pres) return [];

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
  const fallbackOrder = orderedMarkerIdsWithExtras(Object.keys(pres.markers || {}), pres).sort((a, b) =>
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
    const slideIndexRaw = pres.markers[markerId];
    const idx = Number(slideIndexRaw);
    const deck = Array.isArray(pres.markerDecks?.[markerId])
      ? pres.markerDecks[markerId]
      : (Number.isInteger(idx) && pres.slides?.[idx] ? [pres.slides[idx]] : []);
    rows.push({
      markerId,
      slides: deck,
      netschriftItems: netschriftItemsForMarker(pres, markerId),
      isStandalone: !seen.has(markerId),
    });
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

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function linkedTextHtml(value) {
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
    fragments.push(`<a href="${escapeHtml(match[2])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`);
    lastIndex = match.index + match[0].length;
  }

  const tail = raw.slice(lastIndex);
  if (tail) appendAutoLinkedText(tail);
  return fragments.join('');
}

function markerOrderFromEditor(project) {
  const domOrder = [...markerBody.querySelectorAll('[data-marker-row]')]
    .map((row) => String(row.dataset.markerRow || '').trim())
    .filter(Boolean);
  return domOrder.length
    ? domOrder
    : markerRowsForProject(project).map((row) => row.markerId);
}

function draftPresentationForProject(project) {
  const deckId = projectDeckId(project);
  const source = state.doc.presentations?.[deckId];
  if (!source || typeof source !== 'object') return null;
  const pres = structuredClone(source);
  const parentProject = String(source.project || project).trim() || project;
  pres.id = deckId;
  pres.presentationType = 'project-overview';
  pres.project = parentProject;
  pres.title = String(project === renderedProject ? deckTitleInput.value : pres.title || project).trim() || project;
  pres.subtitle = String(project === renderedProject ? deckSubtitleInput.value : pres.subtitle || parentProject).trim() || parentProject;
  if (!pres.markerDecks || typeof pres.markerDecks !== 'object') pres.markerDecks = {};

  if (project === renderedProject) {
    for (const textarea of markerBody.querySelectorAll('.marker-textarea')) {
      const markerId = String(textarea.dataset.marker || '').trim();
      if (markerId) pres.markerDecks[markerId] = parseSlides(textarea.value);
    }
  }

  compilePresentationFromMarkerDecks(pres, markerOrderFromEditor(project), parentProject);
  return pres;
}

function plannedInstancesForMarker(project, markerId) {
  const out = [];
  for (const entry of state.doc.entries || []) {
    if (!Array.isArray(entry?.lessons)) continue;
    for (const lesson of entry.lessons) {
      if (String(lesson?.project || '').trim() !== project) continue;
      const lessonMarker = String(lesson?.presentationMarkerId || lessonMarkerId(lesson?.lesson || '')).trim();
      if (lessonMarker !== markerId) continue;
      out.push({
        classId: String(entry.classId || '').trim(),
        week: String(entry.week || '').trim(),
        lessonKey: String(lesson.lessonKey || '').trim().toUpperCase(),
      });
    }
  }
  return out.sort((a, b) => (
    a.classId.localeCompare(b.classId, 'nl', { numeric: true, sensitivity: 'base' })
    || Number(a.week) - Number(b.week)
    || a.lessonKey.localeCompare(b.lessonKey, 'nl')
  ));
}

function planningSummaryForMarker(project, markerId) {
  const instances = plannedInstancesForMarker(project, markerId);
  if (!instances.length) return 'Nog niet ingepland';
  const visible = instances.slice(0, 3).map((item) => `${item.classId} · W${item.week}${item.lessonKey ? ` · ${item.lessonKey}` : ''}`);
  return instances.length > visible.length
    ? `${visible.join(', ')} +${instances.length - visible.length}`
    : visible.join(', ');
}

function openStudioUrlForMarker(project, markerId) {
  const url = new URL('presentatie-studio.html', window.location.href);
  url.searchParams.set('project', project);
  url.searchParams.set('marker', markerId);
  return url.toString();
}

function markerTitle(project, markerId, slides = []) {
  const fromLesson = (state.doc.entries || [])
    .flatMap((entry) => Array.isArray(entry.lessons) ? entry.lessons : [])
    .find((lesson) => (
      String(lesson?.project || '').trim() === project
      && String(lesson?.presentationMarkerId || lessonMarkerId(lesson?.lesson || '')).trim() === markerId
    ));
  const lessonTitle = String(fromLesson?.lesson || '').trim();
  if (lessonTitle) return lessonTitle;
  const slideTitle = String(slides.find((slide) => String(slide?.title || '').trim())?.title || '').trim();
  if (slideTitle) return slideTitle;
  return markerId.replace(/^marker-/, '').replaceAll('-', ' ');
}

function slidesForStudioPlayer(presentation, markerId = '') {
  if (!markerId) return Array.isArray(presentation?.slides) ? presentation.slides : [];
  const markerDeck = Array.isArray(presentation?.markerDecks?.[markerId])
    ? presentation.markerDecks[markerId].filter((slide) => slide && typeof slide === 'object')
    : [];
  if (markerDeck.length) return markerDeck;
  const idx = Number(presentation?.markers?.[markerId]);
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  return Number.isInteger(idx) && slides[idx] ? [slides[idx]] : [];
}

function studioSlideOverflows(card) {
  if (!card) return false;
  return card.scrollHeight > card.clientHeight + 2 || card.scrollWidth > card.clientWidth + 2;
}

function fitStudioSlideText() {
  const card = studioPlayerStage?.querySelector('.studio-player-slide');
  if (!card) return;
  card.classList.remove('is-fit-compact', 'is-fit-overflow');
  card.style.setProperty('--studio-slide-scale', '1');
  const minScale = 0.68;
  let scale = 1;
  for (let i = 0; i < 10 && studioSlideOverflows(card) && scale > minScale; i += 1) {
    scale = Math.max(minScale, scale - 0.04);
    card.style.setProperty('--studio-slide-scale', scale.toFixed(2));
    if (scale <= 0.8) card.classList.add('is-fit-compact');
  }
  if (studioSlideOverflows(card)) card.classList.add('is-fit-overflow');
}

function scheduleStudioSlideFit() {
  window.requestAnimationFrame(() => fitStudioSlideText());
}

function renderStudioPlayerSlide() {
  const slides = Array.isArray(activeStudioPresentation.slides) ? activeStudioPresentation.slides : [];
  const idx = Math.max(0, Math.min(slides.length - 1, activeStudioPresentation.index || 0));
  activeStudioPresentation.index = idx;
  const slide = slides[idx] || {};
  const title = String(slide.title || activeStudioPresentation.title || 'Presentatie').trim();
  const subtitle = String(slide.subtitle || '').trim();
  const items = Array.isArray(slide.items) ? slide.items.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const type = String(slide.type || 'title').trim().toLowerCase();
  const content = type === 'bullets'
    ? `
      <h2 class="studio-player-slide-title">${linkedTextHtml(title)}</h2>
      ${subtitle ? `<p class="studio-player-slide-subtitle">${linkedTextHtml(subtitle)}</p>` : ''}
      <ul class="studio-player-bullets">${items.map((item) => `<li>${linkedTextHtml(item)}</li>`).join('')}</ul>
    `
    : `
      <h1 class="studio-player-slide-title">${linkedTextHtml(title)}</h1>
      ${subtitle ? `<p class="studio-player-slide-subtitle">${linkedTextHtml(subtitle)}</p>` : ''}
    `;

  if (studioPlayerStage) {
    studioPlayerStage.innerHTML = `<article class="studio-player-slide">${content}</article>`;
  }
  if (studioPlayerTitle) studioPlayerTitle.textContent = activeStudioPresentation.title || 'Presentatie';
  if (studioPlayerCounter) studioPlayerCounter.textContent = slides.length ? `${idx + 1} / ${slides.length}` : '0 / 0';
  if (studioPlayerPrevBtn) studioPlayerPrevBtn.disabled = idx <= 0;
  if (studioPlayerNextBtn) studioPlayerNextBtn.disabled = idx >= slides.length - 1;
  scheduleStudioSlideFit();
}

async function openStudioPresentation(markerId = '') {
  const project = String(projectSelect.value || '').trim();
  if (!project) return;
  const presentation = draftPresentationForProject(project);
  const slides = slidesForStudioPlayer(presentation, markerId);
  if (!slides.length) {
    setStatus('Geen slides gevonden om te openen.', 'error');
    return;
  }

  activeStudioPresentation = {
    title: markerId ? `${presentation.title || project} · ${markerTitle(project, markerId, slides)}` : (presentation.title || project),
    slides,
    index: 0,
  };
  if (studioPresentationPlayer) studioPresentationPlayer.hidden = false;
  document.body.classList.add('studio-presenting');
  renderStudioPlayerSlide();
  try {
    await studioPresentationPlayer?.requestFullscreen?.();
    scheduleStudioSlideFit();
  } catch (err) {
    console.warn('Fullscreen niet beschikbaar:', err);
  }
}

async function closeStudioPresentation() {
  document.body.classList.remove('studio-presenting');
  activeStudioPresentation = { title: '', slides: [], index: 0 };
  if (studioPresentationPlayer) studioPresentationPlayer.hidden = true;
  if (document.fullscreenElement === studioPresentationPlayer) {
    try {
      await document.exitFullscreen();
    } catch (err) {
      console.warn('Fullscreen afsluiten niet beschikbaar:', err);
    }
  }
}

function goToStudioSlide(delta) {
  const slides = activeStudioPresentation.slides || [];
  if (!slides.length) return;
  activeStudioPresentation.index = Math.max(0, Math.min(slides.length - 1, activeStudioPresentation.index + delta));
  renderStudioPlayerSlide();
}

const REQUIRED_V_REDE_DECK_TEXT = {
    'marker-les-3-v-rede-persoonlijk-naar-maatschappelijk': "[bullets] Les 3 V-rede: van persoonlijke scene naar stelling\nsubtitle: Doel: je onderwerp wordt een scherp maatschappelijk punt\n- Je gebruikt de scene uit les 2 als bewijs, niet als los verhaaltje\n- Je ontdekt welk patroon, welke waarde en welke verandering erbij horen\n- Aan het einde staat er een voorlopige stelling en brugalinea in je netschrift\n---\n[bullets] Aansluiting op les 2\nsubtitle: Van raken naar overtuigen\n- Les 2: je koos iets dat jou echt raakt en schreef een concrete scene\n- Vandaag: je laat zien waarom die scene meer betekent dan alleen jouw ervaring\n- Een indrukwekkende speech begint persoonlijk, maar eindigt niet bij jezelf\n---\n[bullets] Theorie: de ladder van betekenis\nsubtitle: Vijf treden voor een sterke V-rede\n- Scene: wat gebeurt er precies, waar, met wie, op welk moment?\n- Patroon: wat zie je hier vaker gebeuren?\n- Waarde: wat staat er op het spel, bijvoorbeeld vrijheid, waardigheid, rechtvaardigheid of veiligheid?\n- Stelling: wat moet het publiek anders gaan vinden?\n- Oproep: wat moet het publiek anders gaan doen?\n---\n[bullets] Theorie: geen spreekbeurt, maar betoog\nsubtitle: Je hoeft niet alles uit te leggen\n- Een spreekbeurt informeert: dit is mijn onderwerp\n- Een betoog stuurt: dit moet u anders zien\n- Een V-rede doet allebei: ze laat iets voelen en dwingt daarna tot een standpunt\n---\n[bullets] Model: van zwak naar sterk\nsubtitle: Maak het punt scherper\n- Zwak: buitensluiten is niet leuk\n- Sterker: wie elke dag alleen staat, leert langzaam dat niemand hem verwacht\n- Stelling: een klas is pas veilig als omstanders zich verantwoordelijk voelen voor wie buiten de groep valt\n---\n[bullets] Praktijk: bouw je kern\nsubtitle: Werk eerst in trefwoorden, daarna in zinnen\n- Onderstreep in je scene het detail dat het meest blijft hangen\n- Schrijf daaronder: dit laat zien dat ...\n- Maak daarna drie mogelijke stellingen en kies de scherpste\n- Testvraag: kan iemand het oneens zijn met jouw stelling? Dan is hij bruikbaar\n---\n[bullets] Netschrift: product van vandaag\nsubtitle: Dit moet aan het einde staan\n- 1. Mijn scene in een kernzin: ...\n- 2. Het patroon dat ik hierin zie: ...\n- 3. De waarde die op het spel staat: ...\n- 4. Mijn voorlopige stelling: ...\n- 5. Brugalinea van 5 tot 7 zinnen: van scene naar maatschappelijk probleem\n---\n[bullets] Korte deelronde\nsubtitle: Luisteren als kritisch publiek\n- Lees alleen je voorlopige stelling voor\n- Publiek reageert met: scherp, te algemeen of nog geen standpunt\n- Verbeter je stelling met een sterker werkwoord of concretere doelgroep",
    'marker-les-4-v-rede-hoofd-en-hart': "[bullets] Les 4 V-rede: overtuigen met hoofd, hart en geloofwaardigheid\nsubtitle: Doel: je speech krijgt retorische kracht\n- Je leert ethos, pathos en logos gebruiken zonder trucjes\n- Je maakt je stelling geloofwaardig, voelbaar en logisch\n- Aan het einde heb je drie sterke bouwstenen voor je speech in je netschrift\n---\n[bullets] Aansluiting op les 3\nsubtitle: Van stelling naar overtuigingskracht\n- Les 3 leverde je stelling en brugalinea op\n- Vandaag onderzoek je waarom het publiek jou zou geloven\n- Een indrukwekkende speech overtuigt niet met volume, maar met gekozen bewijs\n---\n[bullets] Theorie: Aristoteles in gewone taal\nsubtitle: Ethos, pathos, logos\n- Ethos: het publiek vertrouwt jouw stem, omdat je eerlijk, precies en betrokken bent\n- Pathos: het publiek voelt de urgentie door beeld, ritme en menselijke gevolgen\n- Logos: het publiek kan jouw redenering volgen en ziet waarom je conclusie klopt\n---\n[bullets] Theorie: pathos is geen melodrama\nsubtitle: Gevoel werkt pas door precisie\n- Niet: dit is superzielig en verschrikkelijk\n- Wel: laat een concreet detail zien waardoor het publiek zelf iets voelt\n- Sterk pathos vertrouwt op het beeld, niet op uitroeptekens\n---\n[bullets] Theorie: logos is meer dan een feitje\nsubtitle: Maak je redenering zichtbaar\n- Gebruik oorzaak en gevolg: als wij dit normaal vinden, dan gebeurt er ...\n- Gebruik tegenstelling: we zeggen dat ..., maar in werkelijkheid ...\n- Gebruik voorbeeld en conclusie: deze scene laat zien dat ... dus ...\n---\n[bullets] Modelzinnen\nsubtitle: Niet overschrijven, wel nadoen\n- Ethos: ik spreek hierover niet omdat ik alles weet, maar omdat ik heb gezien wat stilte doet\n- Pathos: hij lachte mee, maar zijn schouders zakten elke keer iets verder\n- Logos: als niemand reageert, wordt wegkijken langzaam de regel van de groep\n---\n[bullets] Praktijk: schrijf drie overtuigingszinnen\nsubtitle: Daarna combineren\n- Schrijf een ethoszin: waarom mag jij hierover spreken?\n- Schrijf een pathoszin: welk beeld moet blijven hangen?\n- Schrijf een logoszin: welke redenering moet het publiek snappen?\n- Kies de beste twee en verbind ze tot een alinea van 6 tot 8 zinnen\n---\n[bullets] Netschrift: product van vandaag\nsubtitle: Dit gebruik je straks in je eerste versie\n- 1. Ethoszin\n- 2. Pathoszin met concreet beeld\n- 3. Logoszin met oorzaak-gevolg of tegenstelling\n- 4. Een overtuigingsalinea waarin je persoonlijke scene en stelling samenkomen\n- 5. Markeer met E, P en L waar ethos, pathos en logos zitten",
    'marker-les-5-v-rede-bouwplan-indrukwekkende-speech': "[bullets] Les 5 V-rede: bouwplan voor een indrukwekkende speech\nsubtitle: Doel: je speech krijgt een route van binnenkomst tot slotzin\n- Je ordent je scene, stelling en overtuigingszinnen tot een heldere opbouw\n- Je leert hoe een speech spanning en richting krijgt\n- Aan het einde heb je een volledig bouwplan plus openingszin en slotzin\n---\n[bullets] Aansluiting op les 3 en 4\nsubtitle: Je materiaal ligt er al\n- Les 3: scene, patroon, waarde, stelling\n- Les 4: ethos, pathos, logos en overtuigingsalinea\n- Vandaag: je bepaalt in welke volgorde het publiek dit moet horen\n---\n[bullets] Theorie: klassieke speechopbouw\nsubtitle: Oud principe, moderne V-rede\n- Exordium: opening die aandacht en vertrouwen wint\n- Narratio: persoonlijke scene waardoor het publiek de kwestie ziet\n- Confirmatio: je stelling en sterkste argumenten\n- Peroratio: slot dat terugkeert naar het begin en oproept tot verandering\n---\n[bullets] Theorie: begin niet met je onderwerp\nsubtitle: Begin met spanning\n- Niet: mijn V-rede gaat over prestatiedruk\n- Wel: om 23.48 uur zat ik nog naar hetzelfde lege document te kijken\n- Een goede opening laat het publiek eerst kijken, daarna pas begrijpen\n---\n[bullets] Theorie: de kernzin\nsubtitle: De zin die moet blijven hangen\n- Je kernzin is kort genoeg om te onthouden\n- Hij bevat jouw standpunt, niet alleen je onderwerp\n- Hij kan terugkomen in je slot, eventueel net iets sterker geformuleerd\n---\n[bullets] Modelbouwplan\nsubtitle: Voorbeeldroute\n- Opening: een leerling doet alsof hij een bericht leest, omdat niemand naast hem komt zitten\n- Scene: wat er in de pauze gebeurt en wat niemand zegt\n- Stelling: wegkijken maakt buitensluiting normaal\n- Argumenten: veiligheid, verantwoordelijkheid van omstanders, effect van kleine keuzes\n- Slot: kijk morgen niet naar je scherm als iemand naast jou geen plek heeft\n---\n[bullets] Praktijk: maak je route\nsubtitle: Van losse zinnen naar spreektekst\n- Zet je materiaal onder zes kopjes: opening, scene, probleem, argumenten, oproep, slot\n- Kies per kopje maximaal drie kernzinnen\n- Schrap alles wat niet helpt om je publiek naar je slot te brengen\n- Schrijf opening en slot volledig uit, niet in trefwoorden\n---\n[bullets] Netschrift: product van vandaag\nsubtitle: Startpunt voor les 6\n- 1. Bouwplan met zes kopjes: opening, scene, maatschappelijk probleem, argumenten, oproep, slot\n- 2. Per kopje 2 tot 3 kernzinnen of trefwoorden\n- 3. Een openingszin die begint met beeld, spanning of tegenstelling\n- 4. Een slotzin waarin je kernzin terugkomt als oproep\n- 5. Een check: welke zin moet het publiek na afloop onthouden?"
};

function requiredVredeDeck(markerId) {
  const text = REQUIRED_V_REDE_DECK_TEXT[String(markerId || '').trim()];
  return text ? parseSlides(text) : null;
}

function deckNeedsVredeRepair(markerId, slides) {
  if (!requiredVredeDeck(markerId)) return false;
  return !Array.isArray(slides) || !slides.length || markerDeckLooksPlaceholder(slides);
}

function queueAutoSave() {
  const project = String(renderedProject || projectSelect.value || '').trim();
  if (!project) return;
  markLocalChanges();
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    if (saveProject({ auto: true, project })) queueAutoPublish();
  }, AUTOSAVE_DELAY_MS);
}

function flushAutoSave({ publish = true } = {}) {
  if (!autosaveTimer) return;
  const project = String(renderedProject || projectSelect.value || '').trim();
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (project && saveProject({ auto: true, project }) && publish) queueAutoPublish();
}

function renderProject() {
  const project = String(projectSelect.value || '').trim();
  if (!project) return;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres) return;
  const title = String(pres.title || project).trim() || project;
  const parentProject = String(pres.project || project).trim() || project;

  projectTitle.textContent = parentProject === title
    ? `Overzicht · ${title}`
    : `Overzicht · ${parentProject} · ${title}`;
  deckTitleInput.value = title;
  deckSubtitleInput.value = String(pres.subtitle || parentProject);

  const rows = markerRowsForProject(project);
  markerBody.innerHTML = '';
  let madeAutomaticRepair = false;
  for (const row of rows) {
    if (project === 'V-rede' && deckNeedsVredeRepair(row.markerId, row.slides)) {
      const required = requiredVredeDeck(row.markerId);
      if (required) {
        if (!madeAutomaticRepair) backupStudioDoc('voor automatische V-rede-reparatie');
        madeAutomaticRepair = true;
        row.slides = required;
        pres.markerDecks[row.markerId] = structuredClone(required);
      }
    }
    const tr = document.createElement('tr');
    const text = serializeSlides(row.slides)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const netschriftText = serializeNetschriftItems(row.netschriftItems)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    tr.draggable = true;
    tr.dataset.markerRow = row.markerId;
    tr.innerHTML = `
      <td>
        <div class="marker-actions">
          <button type="button" class="marker-move-btn" data-move-marker="${row.markerId}" data-direction="-1" title="Omhoog">↑</button>
          <button type="button" class="marker-move-btn" data-move-marker="${row.markerId}" data-direction="1" title="Omlaag">↓</button>
          <button type="button" class="marker-open-btn" data-open-marker="${row.markerId}">Open</button>
          <button type="button" class="marker-open-btn" data-rename-marker="${row.markerId}">Naam wijzigen</button>
          <button type="button" class="marker-open-btn" data-plan-marker="${row.markerId}">Inplannen</button>
          <button type="button" class="marker-open-btn" data-unplan-marker="${row.markerId}">Uit planning</button>
          <button type="button" class="marker-delete-btn" data-delete-marker="${row.markerId}">Verwijderen</button>
        </div>
        <p class="marker-title">${escapeHtml(markerTitle(project, row.markerId, row.slides))}</p>
        <span class="marker-id">${row.markerId}</span>
        <p class="marker-planning">${escapeHtml(planningSummaryForMarker(project, row.markerId))}</p>
      </td>
      <td><textarea class="marker-textarea" data-marker="${row.markerId}" placeholder="[title] Intro met [linktekst](https://voorbeeld.nl)\\nsubtitle: Bekijk [bron](https://voorbeeld.nl)\\n---\\n[bullets] Kern\\n- punt 1 met [link](https://voorbeeld.nl)\\n- punt 2">${text}</textarea></td>
      <td><textarea class="netschrift-textarea" data-netschrift-marker="${row.markerId}" placeholder="Wat moet na deze les in het netschrift staan?\\nBijvoorbeeld:\\n- Drie inzichten uit het artikel\\n- Antwoord op de onderzoeksvraag">${netschriftText}</textarea></td>
    `;
    markerBody.appendChild(tr);
  }

  setupMarkerRowOrdering();

  for (const button of markerBody.querySelectorAll('[data-open-marker]')) {
    button.addEventListener('click', () => {
      openStudioPresentation(String(button.dataset.openMarker || ''));
    });
  }
  for (const button of markerBody.querySelectorAll('[data-rename-marker]')) {
    button.addEventListener('click', () => {
      renameMarker(String(button.dataset.renameMarker || ''));
    });
  }
  for (const button of markerBody.querySelectorAll('[data-delete-marker]')) {
    button.addEventListener('click', () => {
      deleteMarker(String(button.dataset.deleteMarker || ''));
    });
  }
  for (const button of markerBody.querySelectorAll('[data-move-marker]')) {
    button.addEventListener('click', () => {
      moveMarkerRow(String(button.dataset.moveMarker || ''), Number(button.dataset.direction || 0));
    });
  }
  for (const button of markerBody.querySelectorAll('[data-plan-marker]')) {
    button.addEventListener('click', () => {
      planMarker(String(button.dataset.planMarker || ''));
    });
  }
  for (const button of markerBody.querySelectorAll('[data-unplan-marker]')) {
    button.addEventListener('click', () => {
      unplanMarker(String(button.dataset.unplanMarker || ''));
    });
  }

  for (const textarea of markerBody.querySelectorAll('.marker-textarea, .netschrift-textarea')) {
    textarea.addEventListener('input', queueAutoSave);
    textarea.addEventListener('focus', () => {
      activeLinkField = textarea;
    });
  }
  renderedProject = project;
}

function setupMarkerRowOrdering() {
  let draggedMarkerId = '';
  for (const row of markerBody.querySelectorAll('[data-marker-row]')) {
    row.addEventListener('dragstart', (event) => {
      draggedMarkerId = String(row.dataset.markerRow || '');
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedMarkerId);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      for (const item of markerBody.querySelectorAll('[data-marker-row]')) item.classList.remove('is-drop-before', 'is-drop-after');
      draggedMarkerId = '';
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      const isAfter = event.clientY > rect.top + rect.height / 2;
      row.classList.toggle('is-drop-before', !isAfter);
      row.classList.toggle('is-drop-after', isAfter);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('is-drop-before', 'is-drop-after');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const sourceId = event.dataTransfer.getData('text/plain') || draggedMarkerId;
      const targetId = String(row.dataset.markerRow || '');
      if (!sourceId || !targetId || sourceId === targetId) return;
      const rect = row.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      reorderMarkerRows(sourceId, targetId, insertAfter);
    });
  }
}

function persistMarkerOrderFromDom() {
  const project = String(projectSelect.value || '').trim();
  if (!project || !saveProject({ auto: true, project })) return;
  markLocalChanges();
  setStatus(`Volgorde aangepast voor ${project}. Automatisch opslaan en publiceren start.`, 'success');
  queueAutoPublish();
}

function reorderMarkerRows(sourceMarkerId, targetMarkerId, insertAfter = false) {
  const source = markerBody.querySelector(`[data-marker-row="${CSS.escape(sourceMarkerId)}"]`);
  const target = markerBody.querySelector(`[data-marker-row="${CSS.escape(targetMarkerId)}"]`);
  if (!source || !target || source === target) return;
  markerBody.insertBefore(source, insertAfter ? target.nextSibling : target);
  persistMarkerOrderFromDom();
}

function moveMarkerRow(markerId, direction) {
  const row = markerBody.querySelector(`[data-marker-row="${CSS.escape(markerId)}"]`);
  if (!row || !direction) return;
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) markerBody.insertBefore(row, sibling);
  else markerBody.insertBefore(sibling, row);
  persistMarkerOrderFromDom();
}

function markerIsLinkedToPlanning(project, markerId) {
  for (const entry of state.doc.entries || []) {
    if (!Array.isArray(entry?.lessons)) continue;
    for (const lesson of entry.lessons) {
      if (String(lesson?.project || '').trim() !== project) continue;
      const lessonMarker = String(lesson?.presentationMarkerId || lessonMarkerId(lesson?.lesson || '')).trim();
      if (lessonMarker === markerId) return true;
    }
  }
  return false;
}

function findOrCreatePlanningEntry(classId, week) {
  const normalizedClassId = normalizeClassId(classId);
  const cleanWeek = String(week || '').trim();
  let entry = (state.doc.entries || []).find((row) => (
    normalizeClassId(row?.classId) === normalizedClassId
    && String(row?.week || '').trim() === cleanWeek
  ));
  if (!entry) {
    entry = { classId: normalizedClassId, week: cleanWeek, lessons: [], items: [] };
    state.doc.entries.push(entry);
  }
  if (!Array.isArray(entry.lessons)) entry.lessons = [];
  if (!Array.isArray(entry.items)) entry.items = [];
  return entry;
}

function cleanupEmptyPlanningEntries() {
  state.doc.entries = (state.doc.entries || []).filter((entry) => {
    const hasLessons = Array.isArray(entry?.lessons) && entry.lessons.length > 0;
    const hasItems = Array.isArray(entry?.items) && entry.items.length > 0;
    const hasNote = Boolean(String(entry?.note || '').trim());
    return hasLessons || hasItems || hasNote;
  });
}

function planMarker(markerId) {
  flushAutoSave({ publish: false });
  const project = String(projectSelect.value || '').trim();
  if (!project || !markerId) return;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres || typeof pres !== 'object') return;
  saveProject({ auto: true, project });

  const currentName = markerTitle(project, markerId, pres.markerDecks?.[markerId] || []);
  const knownLayers = [...new Set((state.doc.entries || [])
    .map((entry) => normalizeClassId(entry?.classId))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' }));
  const rawClassId = window.prompt(
    `Plan "${currentName}" voor welke jaarlaag of klas?`,
    knownLayers.find((value) => /^[1-6]$/.test(value)) || knownLayers[0] || '3',
  );
  if (rawClassId === null) return;
  const classId = normalizeClassId(rawClassId);
  if (!classId) {
    setStatus('Inplannen afgebroken: kies een jaarlaag of klas.', 'error');
    return;
  }

  const rawWeek = window.prompt('In welke week?', String(STARTWEEK_PLANNING_WEEK + 1));
  if (rawWeek === null) return;
  const week = String(rawWeek || '').replace(/^W/i, '').trim();
  if (!/^\d{1,2}$/.test(week)) {
    setStatus('Inplannen afgebroken: gebruik een weeknummer, bijvoorbeeld 36.', 'error');
    return;
  }

  const rawSlot = window.prompt('Welke lespositie in die week? Kies A, B of C.', 'A');
  if (rawSlot === null) return;
  const lessonKey = String(rawSlot || '').trim().toUpperCase();
  if (!['A', 'B', 'C'].includes(lessonKey)) {
    setStatus('Inplannen afgebroken: kies A, B of C.', 'error');
    return;
  }

  const entry = findOrCreatePlanningEntry(classId, week);
  const existing = entry.lessons.find((lesson) => String(lesson?.lessonKey || '').trim().toUpperCase() === lessonKey);
  if (existing) {
    const confirmed = window.confirm(`Week ${week}, les ${lessonKey} bevat al "${existing.lesson || existing.project}". Vervangen door "${currentName}"?`);
    if (!confirmed) return;
  }

  backupStudioDoc('voor presentatie inplannen');
  const plannedLesson = {
    lessonKey,
    project,
    lesson: currentName,
    presentationId: deckId,
    presentationMarkerId: markerId,
    preserveLessonKey: true,
  };
  entry.lessons = [
    ...entry.lessons.filter((lesson) => String(lesson?.lessonKey || '').trim().toUpperCase() !== lessonKey),
    plannedLesson,
  ].sort((left, right) => String(left.lessonKey || '').localeCompare(String(right.lessonKey || '')));
  saveStudio();
  renderProject();
  markLocalChanges();
  setStatus(`"${currentName}" ingepland voor ${classId}, week ${week}, les ${lessonKey}. Publiceren start automatisch.`, 'success');
  queueAutoPublish();
}

function unplanMarker(markerId) {
  flushAutoSave({ publish: false });
  const project = String(projectSelect.value || '').trim();
  if (!project || !markerId) return;
  const instances = plannedInstancesForMarker(project, markerId);
  if (!instances.length) {
    setStatus('Deze presentatie staat nog niet in de jaarplanning.', 'info');
    return;
  }
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  const currentName = markerTitle(project, markerId, pres?.markerDecks?.[markerId] || []);
  const confirmed = window.confirm(`"${currentName}" uit de jaarplanning halen? De presentatie zelf blijft bewaard.`);
  if (!confirmed) return;

  backupStudioDoc('voor presentatie uitplannen');
  for (const entry of state.doc.entries || []) {
    if (!Array.isArray(entry?.lessons)) continue;
    entry.lessons = entry.lessons.filter((lesson) => {
      if (String(lesson?.project || '').trim() !== project) return true;
      const lessonMarker = String(lesson?.presentationMarkerId || lessonMarkerId(lesson?.lesson || '')).trim();
      return lessonMarker !== markerId;
    });
  }
  cleanupEmptyPlanningEntries();
  saveStudio();
  renderProject();
  markLocalChanges();
  setStatus(`"${currentName}" uit de jaarplanning gehaald. Publiceren start automatisch.`, 'success');
  queueAutoPublish();
}

function deleteMarker(markerId) {
  flushAutoSave({ publish: false });
  const project = String(projectSelect.value || '').trim();
  if (!project || !markerId) return;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres || typeof pres !== 'object') return;
  saveProject({ auto: true, project });
  const isLinkedToPlanning = markerIsLinkedToPlanning(project, markerId);
  const currentName = markerTitle(project, markerId, pres.markerDecks?.[markerId] || []);
  const confirmed = window.confirm(isLinkedToPlanning
    ? `Presentatie "${currentName}" verwijderen uit project "${project}"? De les blijft in de jaarplanning staan.`
    : `Losse presentatie "${currentName}" verwijderen uit project "${project}"?`);
  if (!confirmed) return;

  backupStudioDoc(isLinkedToPlanning ? 'voor lespresentatie verwijderen' : 'voor losse presentatie verwijderen');
  if (!Array.isArray(pres.deletedMarkerIds)) pres.deletedMarkerIds = [];
  if (!pres.deletedMarkerIds.includes(markerId)) pres.deletedMarkerIds.push(markerId);
  if (pres.markerDecks && typeof pres.markerDecks === 'object') delete pres.markerDecks[markerId];
  if (pres.markers && typeof pres.markers === 'object') delete pres.markers[markerId];
  deleteLessonMeta(pres, markerId);
  const markerOrder = orderedMarkerIdsWithExtras(
    markerRowsForProject(project).map((row) => row.markerId).filter((id) => id !== markerId),
    pres,
  );
  compilePresentationFromMarkerDecks(pres, markerOrder, String(pres.project || project).trim() || project);
  renderProject();
  markLocalChanges();
  setStatus(`Presentatie "${currentName}" verwijderd en automatisch opgeslagen. Publiceren start automatisch.`, 'success');
  if (saveProject({ auto: true, project })) queueAutoPublish();
}

function renameMarker(markerId) {
  flushAutoSave({ publish: false });
  const project = String(projectSelect.value || '').trim();
  if (!project || !markerId) return;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres || typeof pres !== 'object') return;
  if (!pres.markerDecks || typeof pres.markerDecks !== 'object') pres.markerDecks = {};

  saveProject({ auto: true, project });
  const currentDeck = Array.isArray(pres.markerDecks[markerId])
    ? structuredClone(pres.markerDecks[markerId])
    : [];
  const currentName = markerTitle(project, markerId, currentDeck);
  const rawName = window.prompt('Nieuwe naam voor deze presentatie:', currentName);
  if (rawName === null) return;
  const newName = String(rawName || '').trim();
  if (!newName) {
    setStatus('Naam wijzigen afgebroken: de naam mag niet leeg zijn.', 'error');
    return;
  }

  const newMarkerId = uniqueMarkerIdForPresentation(pres, newName, markerId);
  const markerOrder = markerOrderFromEditor(project).map((id) => (id === markerId ? newMarkerId : id));
  backupStudioDoc('voor markernaam wijzigen');

  const renamedDeck = currentDeck.length ? currentDeck : [{
    type: 'title',
    title: newName,
    subtitle: '',
    items: [],
  }];
  if (renamedDeck[0] && typeof renamedDeck[0] === 'object') {
    renamedDeck[0].title = newName;
  }

  delete pres.markerDecks[markerId];
  moveLessonMeta(pres, markerId, newMarkerId);
  if (Array.isArray(pres.deletedMarkerIds)) {
    pres.deletedMarkerIds = pres.deletedMarkerIds.filter((id) => String(id || '').trim() !== newMarkerId);
  }
  pres.markerDecks[newMarkerId] = renamedDeck;

  for (const entry of state.doc.entries || []) {
    if (!Array.isArray(entry?.lessons)) continue;
    for (const lesson of entry.lessons) {
      if (String(lesson?.project || '').trim() !== project) continue;
      const lessonMarker = String(lesson?.presentationMarkerId || lessonMarkerId(lesson?.lesson || '')).trim();
      if (lessonMarker !== markerId) continue;
      lesson.presentationMarkerId = newMarkerId;
      lesson.lesson = newName;
    }
  }

  compilePresentationFromMarkerDecks(pres, [...new Set(markerOrder)], String(pres.project || project).trim() || project);
  renderProject();
  markLocalChanges();
  saveStudio();
  setStatus(`Naam gewijzigd naar "${newName}". Automatisch opgeslagen en publiceren start automatisch.`, 'success');
  if (saveProject({ auto: true, project })) queueAutoPublish();
  const newTextarea = [...markerBody.querySelectorAll('.marker-textarea')]
    .find((textarea) => String(textarea.dataset.marker || '') === newMarkerId);
  newTextarea?.focus();
}

function createProject() {
  flushAutoSave({ publish: false });
  const rawTitle = window.prompt('Titel voor de nieuwe presentatie:', 'Nieuwe presentatie');
  if (rawTitle === null) return;
  const title = String(rawTitle || '').trim() || 'Nieuwe presentatie';
  const currentSelection = String(projectSelect.value || '').trim();
  const currentPresentation = state.doc.presentations?.[projectDeckId(currentSelection)];
  const existingProjects = knownProjectNames()
    .filter((project) => {
      const presentation = state.doc.presentations?.[projectDeckId(project)];
      const storedProject = String(presentation?.project || project).trim();
      return presentation
        && !presentation.studioStandalone
        && storedProject.toLocaleLowerCase('nl-NL') === project.toLocaleLowerCase('nl-NL');
    });
  if (!existingProjects.length) {
    setStatus('Nieuwe presentatie kan niet worden aangemaakt: er is nog geen bestaand project om hem onder te hangen.', 'error');
    return;
  }
  const defaultProjectRaw = String(currentPresentation?.project || currentSelection).trim();
  const defaultProject = existingProjects.find((project) => (
    project.toLocaleLowerCase('nl-NL') === defaultProjectRaw.toLocaleLowerCase('nl-NL')
  )) || existingProjects[0];
  const projectPrompt = [
    'Bij welk project hoort deze presentatie?',
    existingProjects.length ? `Bestaande projecten: ${existingProjects.slice(0, 16).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const rawProject = window.prompt(projectPrompt, defaultProject || existingProjects[0]);
  if (rawProject === null) return;
  const parentProject = existingProjects.find((project) => (
    project.toLocaleLowerCase('nl-NL') === String(rawProject || '').trim().toLocaleLowerCase('nl-NL')
  )) || '';
  if (!parentProject) {
    setStatus(`Geen bestaand project gevonden met de naam "${String(rawProject || '').trim()}". Kies een project uit de lijst.`, 'error');
    return;
  }
  const deckId = projectDeckId(parentProject);
  const presentation = state.doc.presentations[deckId];
  if (!presentation || typeof presentation !== 'object') {
    setStatus(`Project "${parentProject}" heeft nog geen presentatiedata om deze presentatie in te delen.`, 'error');
    return;
  }
  backupStudioDoc('voor nieuwe presentatie');
  if (!presentation.markerDecks || typeof presentation.markerDecks !== 'object') presentation.markerDecks = {};
  const targetMarkerId = uniqueMarkerIdForPresentation(presentation, title);
  if (Array.isArray(presentation.deletedMarkerIds)) {
    presentation.deletedMarkerIds = presentation.deletedMarkerIds.filter((id) => String(id || '').trim() !== targetMarkerId);
  }

  presentation.markerDecks[targetMarkerId] = [{
    type: 'title',
    title,
    subtitle: '',
    items: [],
  }];
  presentation.id = deckId;
  presentation.presentationType = 'project-overview';
  presentation.project = parentProject;
  const markerOrder = orderedMarkerIdsWithExtras(
    [...markerRowsForProject(parentProject).map((row) => row.markerId), targetMarkerId],
    presentation,
  );
  compilePresentationFromMarkerDecks(presentation, markerOrder, parentProject);

  fillProjects(state.doc);
  projectSelect.value = parentProject;
  renderProject();
  markLocalChanges();
  setStatus(`Nieuwe presentatie "${title}" toegevoegd aan project "${parentProject}" en automatisch opgeslagen. Publiceren start automatisch.`, 'success');
  if (saveProject({ auto: true, project: parentProject })) {
    queueAutoPublish();
  } else {
    saveStudio();
  }
  const newTextarea = [...markerBody.querySelectorAll('.marker-textarea')]
    .find((textarea) => String(textarea.dataset.marker || '') === targetMarkerId);
  newTextarea?.focus();
}

function isLinkEditableField(element) {
  return element?.classList?.contains('marker-textarea')
    || element?.classList?.contains('netschrift-textarea')
    || element === deckTitleInput
    || element === deckSubtitleInput;
}

function activeLinkEditableField() {
  return activeLinkField && document.body.contains(activeLinkField)
    ? activeLinkField
    : isLinkEditableField(document.activeElement)
      ? document.activeElement
      : null;
}

function insertLinkForSelection() {
  const field = activeLinkEditableField();
  if (!field) {
    setStatus('Selecteer eerst tekst in titel, subtitel of een slide-tekstvak.', true);
    return;
  }
  const url = String(window.prompt('URL voor deze link:', 'https://') || '').trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    setStatus('Gebruik een volledige URL die begint met http:// of https://.', true);
    return;
  }

  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const selected = field.value.slice(start, end) || 'linktekst';
  const replacement = `[${selected}](${url})`;
  field.setRangeText(replacement, start, end, 'select');
  field.focus();
  activeLinkField = field;
  queueAutoSave();
  setStatus('Link ingevoegd. Het project wordt automatisch opgeslagen.');
}

function saveProject({ auto = false, project: forcedProject = '' } = {}) {
  const project = String(forcedProject || projectSelect.value || '').trim();
  if (!project) return false;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres) return false;
  const parentProject = String(pres.project || project).trim() || project;
  backupStudioDoc(auto ? 'voor autosave' : 'voor handmatig opslaan');

  pres.title = String(deckTitleInput.value || '').trim() || project;
  pres.subtitle = String(deckSubtitleInput.value || '').trim() || parentProject;
  pres.project = parentProject;
  if (pres.studioStandalone && !String(pres.studioSelectionName || '').trim()) {
    pres.studioSelectionName = project;
  }

  for (const textarea of markerBody.querySelectorAll('.marker-textarea')) {
    const markerId = String(textarea.dataset.marker || '');
    if (!markerId) continue;
    pres.markerDecks[markerId] = parseSlides(textarea.value);
  }
  for (const textarea of markerBody.querySelectorAll('.netschrift-textarea')) {
    const markerId = String(textarea.dataset.netschriftMarker || '');
    if (!markerId) continue;
    setNetschriftItemsForMarker(pres, markerId, parseNetschriftItems(textarea.value));
  }

  const markerOrder = orderedMarkerIdsWithExtras(markerRowsForProject(project).map((row) => row.markerId), pres);
  compilePresentationFromMarkerDecks(pres, markerOrder, parentProject);

  saveStudio();
  if (auto) {
    setStatus(
      lastStudioCacheWriteOk
        ? `Automatisch lokaal opgeslagen: ${project}. Publiceren naar de omgevingen start automatisch.`
        : `Browsercache is vol; ${project} wordt vanuit dit tabblad gepubliceerd.`,
      hasLocalChanges ? 'busy' : 'info',
    );
  } else {
    setStatus(lastStudioCacheWriteOk
      ? `Project lokaal opgeslagen: ${project}.`
      : `Browsercache is vol; ${project} wordt vanuit dit tabblad gepubliceerd.`);
  }
  return true;
}

function deleteProject() {
  const project = String(projectSelect.value || '').trim();
  if (!project) return;
  const confirmed = window.confirm(`Project "${project}" verwijderen uit de Presentatiestudio en jaarplanning?`);
  if (!confirmed) return;

  const deckId = projectDeckId(project);
  for (const entry of state.doc.entries || []) {
    if (!Array.isArray(entry?.lessons)) continue;
    entry.lessons = entry.lessons.filter((lesson) => String(lesson?.project || '').trim() !== project);
  }
  state.doc.entries = (state.doc.entries || []).filter((entry) => {
    const hasLessons = Array.isArray(entry?.lessons) && entry.lessons.length > 0;
    const hasItems = Array.isArray(entry?.items) && entry.items.length > 0;
    const hasNote = Boolean(String(entry?.note || '').trim());
    return hasLessons || hasItems || hasNote;
  });

  if (state.doc.presentations && typeof state.doc.presentations === 'object') {
    delete state.doc.presentations[deckId];
  }

  fillProjects(state.doc);
  const nextProject = state.projects[0] || '';
  projectSelect.value = nextProject;
  saveStudio();

  if (!nextProject) {
    projectTitle.textContent = 'Overzichtspresentatie';
    deckTitleInput.value = '';
    deckSubtitleInput.value = '';
    markerBody.innerHTML = '';
    markLocalChanges();
    setStatus(`Project verwijderd: ${project}. Automatisch opgeslagen en publiceren start automatisch.`);
    queueAutoPublish();
    return;
  }

  renderProject();
  markLocalChanges();
  setStatus(`Project verwijderd: ${project}. Automatisch opgeslagen en publiceren start automatisch.`);
  queueAutoPublish();
}

function fillProjects(doc) {
  const plannedProjects = (doc.entries || [])
    .flatMap((entry) => Array.isArray(entry.lessons) ? entry.lessons : [])
    .filter((lesson) => !isNonRegularMarker(lesson?.project, lesson?.lesson))
    .map((lesson) => String(lesson?.project || '').trim())
    .filter(Boolean);
  const presentationProjects = Object.entries(doc.presentations || {})
    .map(([deckId, presentation]) => {
      const project = String(presentation?.project || presentation?.title || '').trim();
      const hasMarkerDecks = presentation?.markerDecks && typeof presentation.markerDecks === 'object';
      return project && hasMarkerDecks && deckId === projectDeckId(project) ? project : '';
    })
    .filter(Boolean);
  const projects = [...new Set([...plannedProjects, ...presentationProjects])]
    .sort((a, b) => a.localeCompare(b, 'nl'));
  state.projects = projects;
  projectSelect.innerHTML = '';
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = project;
    option.textContent = project;
    projectSelect.appendChild(option);
  }
}

function applyInitialSelectionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestedProject = String(params.get('project') || '').trim();
  if (requestedProject) {
    const matchedProject = state.projects.find((project) => (
      project.toLocaleLowerCase('nl-NL') === requestedProject.toLocaleLowerCase('nl-NL')
    ));
    if (matchedProject) projectSelect.value = matchedProject;
  }
}

function focusInitialMarkerFromUrl() {
  const markerId = String(new URLSearchParams(window.location.search).get('marker') || '').trim();
  if (!markerId) return;
  const row = markerBody.querySelector(`[data-marker-row="${CSS.escape(markerId)}"]`);
  if (!row) return;
  row.classList.add('is-selected');
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.querySelector('.marker-textarea')?.focus();
}

async function boot() {
  try {
    const baseRaw = await fetchJson(BASE_SOURCE);
    const fromStorage = localStorage.getItem(STUDIO_KEY);
    let seed = fromStorage ? JSON.parse(fromStorage) : null;
    if (seed && !hasMentorStartweekPlanning(ensureProjectPresentations(seed))) {
      backupStudioDoc('oude cache zonder mentorstartweek genegeerd', seed);
      localStorage.removeItem(STUDIO_KEY);
      seed = null;
    } else if (seed) {
      backupStudioDoc('voor laden en samenvoegen', seed);
    }
    state.doc = seed
      ? mergePreferRicherBase(baseRaw, seed)
      : ensureProjectPresentations(baseRaw);
    const standaloneMerge = mergeStandalonePresentationsIntoProjects(state.doc);
    state.doc = standaloneMerge.doc;
    if (standaloneMerge.changed) markLocalChanges();
    fillProjects(state.doc);
    if (state.projects.length) projectSelect.value = state.projects[0];
    applyInitialSelectionFromUrl();
    saveStudio();
    renderProject();
    focusInitialMarkerFromUrl();
    setStatus(standaloneMerge.changed
      ? 'Presentatiestudio klaar. Losse presentaties zijn teruggezet onder hun gekozen project.'
      : 'Presentatiestudio klaar. Meerdere slides per les-marker actief.');
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij laden: ${err?.message || err}`, true);
  }
}

projectSelect.addEventListener('change', () => {
  flushAutoSave();
  renderProject();
});
saveProjectBtn.addEventListener('click', async (event) => {
  event.preventDefault();
  setButtonBusy(saveProjectBtn, 'Opslaan...');
  try {
    const saved = saveProject({ auto: false });
    if (!saved) {
      setStatus('Opslaan mislukt: geen project geselecteerd.', 'error');
      resetButton(saveProjectBtn);
      return;
    }
    setStatus(`Project lokaal opgeslagen. Publiceren naar omgevingen...`, 'busy');
    const published = await publishAll({ skipFlush: true, skipCurrentProjectSave: true });
    if (published) {
      setButtonDone(saveProjectBtn, 'Opgeslagen + gepubliceerd');
    } else {
      resetButton(saveProjectBtn);
    }
  } catch (err) {
    console.error(err);
    setStatus(`Opslaan mislukt: ${err?.message || err}`, 'error');
    resetButton(saveProjectBtn);
  } finally {
    if (saveProjectBtn?.classList.contains('is-busy')) resetButton(saveProjectBtn);
  }
});
createProjectBtn?.addEventListener('click', createProject);
deleteProjectBtn?.addEventListener('click', deleteProject);
exportAllBtn?.addEventListener('click', exportAll);
publishAllBtn?.addEventListener('click', publishAll);
linkSelectionBtn?.addEventListener('click', insertLinkForSelection);
openProjectPresentationBtn?.addEventListener('click', () => openStudioPresentation());
studioPlayerCloseBtn?.addEventListener('click', () => closeStudioPresentation());
studioPlayerPrevBtn?.addEventListener('click', () => goToStudioSlide(-1));
studioPlayerNextBtn?.addEventListener('click', () => goToStudioSlide(1));
deckTitleInput.addEventListener('input', queueAutoSave);
deckSubtitleInput.addEventListener('input', queueAutoSave);
deckTitleInput.addEventListener('focus', () => {
  activeLinkField = deckTitleInput;
});
deckSubtitleInput.addEventListener('focus', () => {
  activeLinkField = deckSubtitleInput;
});
document.addEventListener('keydown', (event) => {
  if (!studioPresentationPlayer?.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeStudioPresentation();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToStudioSlide(-1);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      goToStudioSlide(1);
      return;
    }
  }
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
  if (!isLinkEditableField(document.activeElement)) return;
  event.preventDefault();
  activeLinkField = document.activeElement;
  insertLinkForSelection();
});
window.addEventListener('resize', () => {
  if (!studioPresentationPlayer?.hidden) scheduleStudioSlideFit();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !studioPresentationPlayer?.hidden) {
    document.body.classList.remove('studio-presenting');
  }
  if (!studioPresentationPlayer?.hidden) scheduleStudioSlideFit();
});

boot();
