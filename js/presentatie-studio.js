const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const STUDIO_BACKUP_KEY = 'lespresentatie.jaarplanningStudioBackups';
const PLATFORM_REFRESH_KEY = 'lespresentatie.platformRefresh';
const BASE_SOURCE = 'js/jaarplanning-live.json';
const PUBLISH_ENDPOINT = 'api/presentatie-studio/publish';

const projectSelect = document.getElementById('projectSelect');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const exportAllBtn = document.getElementById('exportAllBtn');
const publishAllBtn = document.getElementById('publishAllBtn');
const projectTitle = document.getElementById('projectTitle');
const deckTitleInput = document.getElementById('deckTitleInput');
const deckSubtitleInput = document.getElementById('deckSubtitleInput');
const linkSelectionBtn = document.getElementById('linkSelectionBtn');
const markerBody = document.getElementById('markerBody');
const statusLine = document.getElementById('statusLine');

const AUTOSAVE_DELAY_MS = 700;

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  projects: [],
};

let autosaveTimer = null;
let activeLinkField = null;
let renderedProject = '';
let hasLocalChanges = false;

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
        localStorage.setItem(STUDIO_BACKUP_KEY, JSON.stringify(keep));
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

function signalPlatformsRefresh(result = {}) {
  localStorage.setItem(PLATFORM_REFRESH_KEY, JSON.stringify({
    updatedAt: result.updatedAt || new Date().toISOString(),
    sourceRevision: result.sourceRevision || state.doc.sourceRevision || '',
  }));
}

async function syncFromPublishedSource(result = {}) {
  try {
    const liveDoc = ensureProjectPresentations(await fetchJson(BASE_SOURCE));
    state.doc = liveDoc;
    localStorage.setItem(STUDIO_KEY, JSON.stringify(state.doc));
  } catch (err) {
    console.warn('Live bron kon na publiceren niet worden teruggelezen:', err);
  }
  signalPlatformsRefresh(result);
}

function gradeLayerFromClassId(rawClassId) {
  const cid = String(rawClassId || '').replace(/\s+/g, '').toUpperCase();
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
    flushAutoSave();
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

async function publishAll({ skipFlush = false, skipCurrentProjectSave = false } = {}) {
  if (!skipFlush) flushAutoSave();
  if (!skipCurrentProjectSave) saveProject({ auto: true });
  backupStudioDoc('voor publiceren');
  saveStudio();
  const payload = buildExportPayload();
  setButtonBusy(publishAllBtn, 'Publiceren...');
  setStatus('Publiceren naar docent- en leerlingomgeving...', 'busy');
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
    setStatus(`Gepubliceerd naar omgevingen: ${result.presentations || Object.keys(state.doc.presentations || {}).length} presentaties bijgewerkt.${autoGitMessage(result)} Refresh docent/leerling met Cmd+Shift+R als je de wijziging nog niet ziet.`, result.autoGit?.ok === false ? 'error' : 'success');
    return true;
  } catch (err) {
    console.error(err);
    resetButton(publishAllBtn);
    setStatus(`Lokaal opgeslagen, maar publiceren naar de omgevingen is mislukt: ${publishErrorMessage(err)}`, 'error');
    return false;
  } finally {
    if (publishAllBtn?.classList.contains('is-busy')) resetButton(publishAllBtn);
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
    saveProject({ auto: true, project });
  }, AUTOSAVE_DELAY_MS);
}

function flushAutoSave() {
  if (!autosaveTimer) return;
  const project = String(renderedProject || projectSelect.value || '').trim();
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (project) saveProject({ auto: true, project });
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
    tr.innerHTML = `
      <td>${row.markerId}</td>
      <td><textarea class="marker-textarea" data-marker="${row.markerId}" placeholder="[title] Intro met [linktekst](https://voorbeeld.nl)\\nsubtitle: Bekijk [bron](https://voorbeeld.nl)\\n---\\n[bullets] Kern\\n- punt 1 met [link](https://voorbeeld.nl)\\n- punt 2">${text}</textarea></td>
    `;
    markerBody.appendChild(tr);
  }

  for (const textarea of markerBody.querySelectorAll('.marker-textarea')) {
    textarea.addEventListener('input', queueAutoSave);
    textarea.addEventListener('focus', () => {
      activeLinkField = textarea;
    });
  }
  renderedProject = project;
}

function isLinkEditableField(element) {
  return element?.classList?.contains('marker-textarea')
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
  backupStudioDoc(auto ? 'voor autosave' : 'voor handmatig opslaan');

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
  if (auto) setStatus(`Automatisch lokaal opgeslagen: ${project}. Klik op Project opslaan om ook naar de omgevingen te publiceren.`, hasLocalChanges ? 'busy' : 'info');
  else setStatus(`Project lokaal opgeslagen: ${project}.`);
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
    setStatus(`Project verwijderd: ${project}.`);
    return;
  }

  renderProject();
  setStatus(`Project verwijderd: ${project}.`);
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
    if (seed) backupStudioDoc('voor laden en samenvoegen', seed);
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
deleteProjectBtn?.addEventListener('click', deleteProject);
exportAllBtn?.addEventListener('click', exportAll);
publishAllBtn?.addEventListener('click', publishAll);
linkSelectionBtn?.addEventListener('click', insertLinkForSelection);
deckTitleInput.addEventListener('input', queueAutoSave);
deckSubtitleInput.addEventListener('input', queueAutoSave);
deckTitleInput.addEventListener('focus', () => {
  activeLinkField = deckTitleInput;
});
deckSubtitleInput.addEventListener('focus', () => {
  activeLinkField = deckSubtitleInput;
});
document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
  if (!isLinkEditableField(document.activeElement)) return;
  event.preventDefault();
  activeLinkField = document.activeElement;
  insertLinkForSelection();
});

boot();
