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
      project: bundle.project,
      slides: [],
      markers: {},
    };
    presentation.id = deckId;
    presentation.presentationType = 'project-overview';
    presentation.project = bundle.project;
    if (!Array.isArray(presentation.slides)) presentation.slides = [];
    if (!presentation.markers || typeof presentation.markers !== 'object') presentation.markers = {};
    if (!presentation.slides.length) {
      presentation.slides.push({ type: 'title', title: bundle.project, subtitle: bundle.project });
    }
    for (const [markerId, lessonTitle] of bundle.markers.entries()) {
      if (Number.isInteger(presentation.markers[markerId])) continue;
      presentation.slides.push({ type: 'title', title: lessonTitle, subtitle: bundle.project });
      presentation.markers[markerId] = presentation.slides.length - 1;
    }
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
    const slide = Number.isInteger(idx) ? pres.slides?.[idx] : null;
    rows.push({
      markerId,
      slideIndex: Number.isInteger(idx) ? idx : 0,
      title: String(slide?.title || '').trim(),
      subtitle: String(slide?.subtitle || '').trim(),
    });
  }
  rows.sort((a, b) => a.markerId.localeCompare(b.markerId));
  return rows;
}

function renderProject() {
  const project = String(projectSelect.value || '').trim();
  if (!project) return;
  const deckId = projectDeckId(project);
  const pres = state.doc.presentations[deckId];
  if (!pres) return;

  projectTitle.textContent = `Overzicht · ${project}`;
  deckTitleInput.value = String(pres.title || project);
  const titleSlide = Array.isArray(pres.slides) ? pres.slides[0] : null;
  deckSubtitleInput.value = String(titleSlide?.subtitle || project);

  const rows = markerRowsForProject(project);
  markerBody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.markerId}</td>
      <td><input class="marker-input" data-marker="${row.markerId}" data-field="title" value="${row.title.replace(/"/g, '&quot;')}" /></td>
      <td><input class="marker-input" data-marker="${row.markerId}" data-field="subtitle" value="${row.subtitle.replace(/"/g, '&quot;')}" /></td>
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
  if (!Array.isArray(pres.slides) || !pres.slides.length) {
    pres.slides = [{ type: 'title', title: pres.title, subtitle: project }];
  }
  pres.slides[0] = {
    ...(pres.slides[0] || {}),
    type: String(pres.slides[0]?.type || 'title'),
    title: pres.title,
    subtitle: String(deckSubtitleInput.value || '').trim() || project,
  };

  for (const input of markerBody.querySelectorAll('.marker-input')) {
    const markerId = String(input.dataset.marker || '');
    const field = String(input.dataset.field || '');
    const idx = Number(pres.markers?.[markerId]);
    if (!markerId || !Number.isInteger(idx) || !pres.slides[idx]) continue;
    if (field === 'title') pres.slides[idx].title = String(input.value || '').trim();
    if (field === 'subtitle') pres.slides[idx].subtitle = String(input.value || '').trim();
  }

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
    setStatus('Presentatiestudio klaar.');
  } catch (err) {
    console.error(err);
    setStatus(`Fout bij laden: ${err?.message || err}`, true);
  }
}

projectSelect.addEventListener('change', renderProject);
saveProjectBtn.addEventListener('click', saveProject);

boot();
