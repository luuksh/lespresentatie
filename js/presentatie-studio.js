const STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
const BASE_SOURCE = 'js/jaarplanning-live.json';

const projectSelect = document.getElementById('projectSelect');
const saveProjectBtn = document.getElementById('saveProjectBtn');
const projectTitle = document.getElementById('projectTitle');
const deckTitleInput = document.getElementById('deckTitleInput');
const deckSubtitleInput = document.getElementById('deckSubtitleInput');
const markerBody = document.getElementById('markerBody');
const statusLine = document.getElementById('statusLine');

const state = {
  doc: { entries: [], presentations: {}, updatedAt: '' },
  projects: [],
};

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

function normalizeDoc(raw) {
  const doc = (raw && typeof raw === 'object') ? structuredClone(raw) : {};
  if (!Array.isArray(doc.entries)) doc.entries = [];
  if (!doc.presentations || typeof doc.presentations !== 'object') doc.presentations = {};
  return doc;
}

function collectProjectMarkers(doc) {
  const out = {};
  for (const entry of doc.entries || []) {
    if (!Array.isArray(entry?.lessons)) continue;
    for (const lesson of entry.lessons) {
      const project = String(lesson?.project || '').trim();
      const lessonTitle = String(lesson?.lesson || '').trim();
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

function markerRowsForProject(projectName) {
  const deckId = projectDeckId(projectName);
  const pres = state.doc.presentations[deckId];
  if (!pres || !pres.markers) return [];

  const rows = [];
  for (const [markerId, slideIndexRaw] of Object.entries(pres.markers)) {
    const idx = Number(slideIndexRaw);
    const deck = Array.isArray(pres.markerDecks?.[markerId])
      ? pres.markerDecks[markerId]
      : (Number.isInteger(idx) && pres.slides?.[idx] ? [pres.slides[idx]] : []);
    rows.push({ markerId, slides: deck });
  }
  rows.sort((a, b) => a.markerId.localeCompare(b.markerId));
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
}

function saveProject() {
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

  const markerOrder = Object.keys(pres.markers || {}).sort((a, b) => a.localeCompare(b));
  compilePresentationFromMarkerDecks(pres, markerOrder, project);

  saveStudio();
  setStatus(`Project opgeslagen: ${project}.`);
}

function fillProjects(doc) {
  const projects = [...new Set(
    (doc.entries || [])
      .flatMap((entry) => Array.isArray(entry.lessons) ? entry.lessons : [])
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
    const seed = fromStorage ? JSON.parse(fromStorage) : baseRaw;
    state.doc = ensureProjectPresentations(seed);
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
saveProjectBtn.addEventListener('click', saveProject);

boot();
