// js/indeling.js
const MODULE_VERSION = '20260223-05';
const SAVED_LAYOUTS_KEY = 'lespresentatie.savedlayouts.v1';

const modules = {
  h216:               () => import(`./h216.js?v=${MODULE_VERSION}`).then(m => m.h216Indeling),
  u008:               () => import(`./u008.js?v=${MODULE_VERSION}`).then(m => m.u008Indeling),
  drievierdrie:       () => import(`./drievierdrie-v2.js?v=${MODULE_VERSION}`).then(m => m.drieVierDrieIndeling),
  groepjes:           () => import(`./groepjes.js?v=${MODULE_VERSION}`).then(m => m.groepjesIndeling),
  drietallen:         () => import(`./drietallen.js?v=${MODULE_VERSION}`).then(m => m.drietallenIndeling),
  vijftallen:         () => import(`./vijftallen.js?v=${MODULE_VERSION}`).then(m => m.vijftallenIndeling),
  presentatievolgorde:() => import(`./presentatievolgorde.js?v=${MODULE_VERSION}`).then(m => m.presentatievolgordeIndeling),
};

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function laadLeerlingen(klasnaam = 'G1D') {
  try {
    const res = await fetch('js/leerlingen_per_klas.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Netwerkfout bij ophalen JSON');

    const data = await res.json();
    const lijst = data[klasnaam];
    if (!Array.isArray(lijst)) throw new Error(`Klas ${klasnaam} niet gevonden of onjuist formaat`);
    return lijst;
  } catch (err) {
    console.error('Fout bij laden leerlingen:', err);
    return [];
  }
}

export async function kiesIndeling(type = 'h216', klasnaam = 'G1D') {
  const leerlingen = await laadLeerlingen(klasnaam);
  const shuffled = shuffleInPlace([...leerlingen]);
  const moduleLader = modules[type] || modules.h216;

  try {
    const indeling = await moduleLader();
    if (typeof indeling !== 'function') throw new Error('Module bevat geen exporteerbare functie');
    indeling(shuffled);
  } catch (err) {
    console.error(`Fout bij toepassen van indeling "${type}":`, err);
    const fallback = await modules.h216();
    fallback(shuffled);
  }
}

if (typeof window !== 'undefined') {
  window.kiesIndeling = kiesIndeling;
}

function topicElements() {
  return Array.from(document.querySelectorAll('#plattegrond [data-topic-key]'));
}

function dateElements() {
  return Array.from(document.querySelectorAll('#plattegrond [data-date-key]'));
}

function setTopicChipValue(chip, value) {
  const text = String(value || '').trim();
  chip.dataset.topic = text;
  chip.classList.toggle('is-empty', !text);
  chip.textContent = text || '+ onderwerp';
}

function formatDateLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long'
  }).format(d);
}

function setDateChipValue(chip, value) {
  const raw = String(value || '').trim();
  chip.dataset.date = raw;
  chip.classList.toggle('is-empty', !raw);
  chip.textContent = raw ? formatDateLabel(raw) : '+ datum';
}

function readGroupTopics() {
  return topicElements()
    .map(el => ({
      key: el.dataset.topicKey || '',
      topic: (el.dataset.topic || '').trim()
    }))
    .filter(item => item.key && item.topic);
}

function readGroupDates() {
  return dateElements()
    .map(el => ({
      key: el.dataset.dateKey || '',
      date: (el.dataset.date || '').trim()
    }))
    .filter(item => item.key && item.date);
}

function applyGroupTopics(topics = []) {
  if (!Array.isArray(topics) || !topics.length) return;
  const map = new Map(topics.map(t => [String(t.key || ''), String(t.topic || '')]));
  topicElements().forEach(el => {
    const next = map.get(String(el.dataset.topicKey || ''));
    if (next != null) setTopicChipValue(el, next);
  });
}

function applyGroupDates(dates = []) {
  if (!Array.isArray(dates) || !dates.length) return;
  const map = new Map(dates.map(t => [String(t.key || ''), String(t.date || '')]));
  dateElements().forEach(el => {
    const next = map.get(String(el.dataset.dateKey || ''));
    if (next != null) setDateChipValue(el, next);
  });
}

function beginTopicEdit(chip) {
  if (!chip || chip.classList.contains('editing')) return;
  const current = String(chip.dataset.topic || '');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'topic-edit-input';
  input.value = current;
  input.placeholder = 'Onderwerp...';

  chip.classList.add('editing');
  chip.replaceChildren(input);
  input.focus();
  input.select();

  const cancel = () => {
    chip.classList.remove('editing');
    setTopicChipValue(chip, current);
  };

  const commit = () => {
    chip.classList.remove('editing');
    setTopicChipValue(chip, input.value);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener('blur', commit, { once: true });
}

function beginDateEdit(chip) {
  if (!chip || chip.classList.contains('editing')) return;
  const current = String(chip.dataset.date || '');
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'topic-edit-input date-edit-input';
  input.value = current;

  chip.classList.add('editing');
  chip.replaceChildren(input);
  input.focus();
  if (typeof input.showPicker === 'function') {
    try { input.showPicker(); } catch (_) { /* no-op */ }
  }

  const cancel = () => {
    chip.classList.remove('editing');
    setDateChipValue(chip, current);
  };

  const commit = () => {
    chip.classList.remove('editing');
    setDateChipValue(chip, input.value);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  input.addEventListener('change', commit);
  input.addEventListener('blur', commit, { once: true });
}

function initTopicEditing() {
  const grid = document.getElementById('plattegrond');
  if (!grid || grid.dataset.topicEditorInit === '1') return;
  grid.dataset.topicEditorInit = '1';

  grid.addEventListener('click', (e) => {
    const dateChip = e.target.closest('[data-date-key]');
    if (dateChip && grid.contains(dateChip)) {
      beginDateEdit(dateChip);
      return;
    }

    const chip = e.target.closest('[data-topic-key]');
    if (!chip || !grid.contains(chip)) return;
    beginTopicEdit(chip);
  });

  grid.addEventListener('keydown', (e) => {
    const dateChip = e.target.closest('[data-date-key]');
    if (dateChip && grid.contains(dateChip)) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        beginDateEdit(dateChip);
      }
      return;
    }

    const chip = e.target.closest('[data-topic-key]');
    if (!chip || !grid.contains(chip)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      beginTopicEdit(chip);
    }
  });
}

function getCurrentClassId() {
  const klasSel = document.getElementById('klasSelect');
  return klasSel?.value || localStorage.getItem('lastClassId') || 'onbekend';
}

function getCurrentType() {
  const typeSel = document.getElementById('indelingSelect');
  return typeSel?.value || 'h216';
}

function getLayoutSelect() {
  return document.getElementById('savedLayoutSelect');
}

function isGroupLayoutType(type = getCurrentType()) {
  return type === 'groepjes' || type === 'drietallen' || type === 'vijftallen' || type === 'presentatievolgorde';
}

function agendaDateLabel(raw) {
  const value = String(raw || '').trim();
  if (!value) return '(geen datum)';
  return `${formatDateLabel(value)} (${value})`;
}

function buildGroupAgendaOverview() {
  const type = getCurrentType();
  if (!isGroupLayoutType(type)) {
    return {
      ok: false,
      text: '',
      reason: 'Dit overzicht werkt voor Drietallen, Viertallen, Vijftallen en Volgorde.'
    };
  }

  const isVolgorde = type === 'presentatievolgorde';
  const groups = isVolgorde
    ? Array.from(document.querySelectorAll('#plattegrond .presentatie-item'))
    : Array.from(document.querySelectorAll('#plattegrond .groepje'));

  if (!groups.length) {
    return {
      ok: false,
      text: '',
      reason: isVolgorde
        ? 'Geen volgorde-items gevonden op de huidige plattegrond.'
        : 'Geen groepjes gevonden op de huidige plattegrond.'
    };
  }

  const lines = [
    `Klas: ${getCurrentClassId()}`,
    `Indeling: ${type}`,
    ''
  ];

  groups.forEach((group, idx) => {
    const topic = (group.querySelector('[data-topic-key]')?.dataset.topic || '').trim();
    const rawDate = (group.querySelector('[data-date-key]')?.dataset.date || '').trim();
    const students = isVolgorde
      ? Array.from(group.querySelectorAll('.naam'))
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean)
      : Array.from(group.querySelectorAll('.tafel'))
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean);

    lines.push(isVolgorde ? `Volgorde ${idx + 1}` : `Groep ${idx + 1}`);
    lines.push(`Titel: ${topic || '(geen titel)'}`);
    lines.push(`Datum: ${agendaDateLabel(rawDate)}`);
    lines.push(isVolgorde ? `Leerling: ${students.join(', ') || '-'}` : `Leerlingen: ${students.join(', ') || '-'}`);
    lines.push('');
  });

  return { ok: true, text: lines.join('\n').trim() };
}

async function copyToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      // fallback below
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const copied = document.execCommand('copy');
    ta.remove();
    return copied;
  } catch (_) {
    return false;
  }
}

function getOverviewModalElements() {
  return {
    modal: document.getElementById('groupOverviewModal'),
    text: document.getElementById('groupOverviewText'),
    btnCopy: document.getElementById('btnGroupOverviewCopy'),
    btnClose: document.getElementById('btnGroupOverviewClose')
  };
}

function openOverviewModal(text) {
  const { modal, text: textEl } = getOverviewModalElements();
  if (!modal || !textEl) return;
  textEl.value = String(text || '');
  modal.hidden = false;
  modal.classList.add('is-open');
  textEl.focus();
  textEl.select();
}

function closeOverviewModal() {
  const { modal } = getOverviewModalElements();
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.hidden = true;
}

function initOverviewModal() {
  const { modal, text, btnCopy, btnClose } = getOverviewModalElements();
  if (!modal || !text || modal.dataset.init === '1') return;
  modal.classList.remove('is-open');
  modal.hidden = true;
  modal.dataset.init = '1';

  btnClose?.addEventListener('click', closeOverviewModal);
  btnCopy?.addEventListener('click', async () => {
    const copied = await copyToClipboard(text.value);
    if (copied) {
      alert('Groepsoverzicht gekopieerd naar klembord.');
      return;
    }
    window.prompt('Kopieer dit groepsoverzicht voor je ELO-agenda:', text.value);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeOverviewModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeOverviewModal();
  });
}

function updateGroupOverviewButtons(buttons = []) {
  const show = isGroupLayoutType(getCurrentType());
  buttons.forEach((btn) => {
    if (!btn) return;
    btn.hidden = !show;
  });
}

function readSavedLayouts() {
  try {
    const raw = localStorage.getItem(SAVED_LAYOUTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { version: 1, classes: {} };
    if (!parsed.classes || typeof parsed.classes !== 'object') parsed.classes = {};
    return parsed;
  } catch {
    return { version: 1, classes: {} };
  }
}

function writeSavedLayouts(store) {
  try {
    localStorage.setItem(SAVED_LAYOUTS_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('Opslaan mislukt:', err);
  }
}

function getCurrentArrangement() {
  const type = getCurrentType();
  const klasId = getCurrentClassId();
  const grid = document.getElementById('plattegrond');
  const domSnapshot = grid?.innerHTML || '';

  if (type === 'presentatievolgorde') {
    const items = Array.from(document.querySelectorAll('#plattegrond .presentatie-item .naam'))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean);
    return {
      type,
      klasId,
      savedAt: new Date().toISOString(),
      order: items,
      seats: [],
      domSnapshot,
      groupTopics: readGroupTopics(),
      groupDates: readGroupDates()
    };
  }

  const seats = Array.from(document.querySelectorAll('#plattegrond .tafel')).map((el, i) => ({
    seatId: el.dataset.seatId ?? String(i),
    studentId: (el.textContent || '').trim()
  }));

  return {
    type,
    klasId,
    savedAt: new Date().toISOString(),
    seats,
    order: [],
    domSnapshot,
    groupTopics: readGroupTopics(),
    groupDates: readGroupDates()
  };
}

function ensureClassStore(store, classId) {
  if (!store.classes[classId]) {
    store.classes[classId] = { layouts: {}, selected: '' };
  }
  if (!store.classes[classId].layouts || typeof store.classes[classId].layouts !== 'object') {
    store.classes[classId].layouts = {};
  }
  return store.classes[classId];
}

function refillSavedLayoutSelect() {
  const select = getLayoutSelect();
  if (!select) return;

  const classId = getCurrentClassId();
  const store = readSavedLayouts();
  const cls = ensureClassStore(store, classId);
  const names = Object.keys(cls.layouts).sort((a, b) => a.localeCompare(b, 'nl'));

  select.innerHTML = '';
  names.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (!names.length) return;
  if (cls.selected && names.includes(cls.selected)) {
    select.value = cls.selected;
  } else {
    select.value = names[0];
    cls.selected = names[0];
    writeSavedLayouts(store);
  }
}

function projectArrangementToCurrentGrid(payload) {
  const grid = document.getElementById('plattegrond');
  const type = payload?.type || getCurrentType();

  if (!grid || !payload) return;

  if (typeof payload.domSnapshot === 'string' && payload.domSnapshot.trim()) {
    grid.innerHTML = payload.domSnapshot;
    applyGroupTopics(payload.groupTopics || []);
    applyGroupDates(payload.groupDates || []);
    return;
  }

  if (type === 'presentatievolgorde') {
    if (Array.isArray(payload.order) && payload.order.length) {
      grid.innerHTML = '';
      const ol = document.createElement('ol');
      ol.className = 'presentatie-lijst';
      payload.order.forEach((naam, idx) => {
        const li = document.createElement('li');
        li.className = 'presentatie-item';
        li.dataset.groupId = `volg${idx + 1}`;

        const topic = document.createElement('div');
        topic.className = 'presentatie-topic topic-chip is-empty';
        topic.dataset.topicKey = li.dataset.groupId;
        topic.dataset.topic = '';
        topic.tabIndex = 0;
        topic.textContent = '+ onderwerp';

        const date = document.createElement('div');
        date.className = 'presentatie-date date-chip is-empty';
        date.dataset.dateKey = li.dataset.groupId;
        date.dataset.date = '';
        date.tabIndex = 0;
        date.textContent = '+ datum';

        const meta = document.createElement('div');
        meta.className = 'presentatie-meta';
        meta.appendChild(topic);
        meta.appendChild(date);

        const nr = document.createElement('span');
        nr.className = 'nr';
        nr.textContent = idx + 1;

        const nm = document.createElement('span');
        nm.className = 'naam';
        nm.textContent = naam;

        li.appendChild(meta);
        li.appendChild(nr);
        li.appendChild(nm);
        ol.appendChild(li);
      });
      grid.appendChild(ol);
    }

    applyGroupTopics(payload.groupTopics || []);
    applyGroupDates(payload.groupDates || []);
    return;
  }

  const seatsEls = Array.from(document.querySelectorAll('#plattegrond .tafel'));
  const byIdx = new Map(seatsEls.map((el, i) => [i, el]));
  const byId = new Map(seatsEls.map((el, i) => [(el.dataset.seatId ?? `__idx_${i}`), el]));

  (payload.seats || []).forEach((item, i) => {
    const key = (item.seatId != null && byId.has(String(item.seatId)))
      ? String(item.seatId)
      : `__idx_${i}`;
    const el = byId.get(key) || byIdx.get(i);
    if (el) el.textContent = item.studentId || '';
  });

  applyGroupTopics(payload.groupTopics || []);
  applyGroupDates(payload.groupDates || []);
}

function waitForRendered(type, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('indeling:rendered', onRendered);
      clearTimeout(timer);
      resolve();
    };

    const onRendered = (evt) => {
      const renderedType = evt?.detail?.type;
      if (!type || renderedType === type) finish();
    };

    const timer = setTimeout(finish, timeoutMs);
    window.addEventListener('indeling:rendered', onRendered);
  });
}

async function applyArrangement(payload) {
  const typeSel = document.getElementById('indelingSelect');

  if (Array.isArray(payload)) {
    payload = { type: typeSel?.value || 'h216', seats: payload, order: [] };
  }

  const targetType = payload?.type || getCurrentType();
  const currentType = getCurrentType();

  if (targetType !== currentType && typeSel) {
    typeSel.value = targetType;
    typeSel.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForRendered(targetType);
  }

  projectArrangementToCurrentGrid(payload);
}

function saveCurrentLayoutAs(name) {
  const classId = getCurrentClassId();
  const arrangement = getCurrentArrangement();
  if (!name || !arrangement) return;

  const store = readSavedLayouts();
  const cls = ensureClassStore(store, classId);
  cls.layouts[name] = arrangement;
  cls.selected = name;
  writeSavedLayouts(store);
  refillSavedLayoutSelect();
}

async function loadSelectedLayout() {
  const select = getLayoutSelect();
  if (!select || !select.value) {
    alert('Kies eerst een opgeslagen plattegrond.');
    return;
  }

  const classId = getCurrentClassId();
  const store = readSavedLayouts();
  const cls = ensureClassStore(store, classId);
  const payload = cls.layouts[select.value];
  if (!payload) {
    alert('Plattegrond niet gevonden.');
    return;
  }

  cls.selected = select.value;
  writeSavedLayouts(store);
  await applyArrangement(payload);
}

function deleteSelectedLayout() {
  const select = getLayoutSelect();
  if (!select || !select.value) {
    alert('Kies eerst een opgeslagen plattegrond.');
    return;
  }

  const classId = getCurrentClassId();
  const store = readSavedLayouts();
  const cls = ensureClassStore(store, classId);
  const name = select.value;

  if (!cls.layouts[name]) return;
  delete cls.layouts[name];
  if (cls.selected === name) cls.selected = '';
  writeSavedLayouts(store);
  refillSavedLayoutSelect();
}

(function initLayoutLibraryUI() {
  const klasSel = document.getElementById('klasSelect');
  const typeSel = document.getElementById('indelingSelect');
  const btnSave = document.getElementById('btnLayoutSave');
  const btnLoad = document.getElementById('btnLayoutLoad');
  const btnDelete = document.getElementById('btnLayoutDelete');
  const btnGroupOverviewOpen = Array.from(document.querySelectorAll('[data-action="group-overview-open"]'));
  const select = getLayoutSelect();
  const plattegrond = document.getElementById('plattegrond');
  if (!klasSel || !select || !plattegrond) return;

  initTopicEditing();
  initOverviewModal();

  btnSave?.addEventListener('click', () => {
    const existing = select.value || '';
    const name = prompt('Naam voor deze plattegrond:', existing);
    if (!name) return;

    const classId = getCurrentClassId();
    const store = readSavedLayouts();
    const cls = ensureClassStore(store, classId);
    if (cls.layouts[name] && !confirm(`Plattegrond "${name}" overschrijven?`)) return;
    saveCurrentLayoutAs(name);
  });

  btnLoad?.addEventListener('click', () => {
    void loadSelectedLayout();
  });

  btnDelete?.addEventListener('click', () => {
    const name = select.value || '';
    if (!name) return;
    if (!confirm(`Plattegrond "${name}" verwijderen?`)) return;
    deleteSelectedLayout();
  });

  btnGroupOverviewOpen.forEach((btn) => btn.addEventListener('click', () => {
    const overview = buildGroupAgendaOverview();
    if (!overview.ok) {
      alert(overview.reason);
      return;
    }
    openOverviewModal(overview.text);
  }));

  typeSel?.addEventListener('change', () => {
    setTimeout(() => updateGroupOverviewButtons(btnGroupOverviewOpen), 0);
  });

  select.addEventListener('change', () => {
    const classId = getCurrentClassId();
    const store = readSavedLayouts();
    const cls = ensureClassStore(store, classId);
    cls.selected = select.value || '';
    writeSavedLayouts(store);
  });

  klasSel.addEventListener('change', () => {
    if (klasSel.value) localStorage.setItem('lastClassId', klasSel.value);
    setTimeout(refillSavedLayoutSelect, 40);
  });

  window.addEventListener('indeling:rendered', () => {
    refillSavedLayoutSelect();
    updateGroupOverviewButtons(btnGroupOverviewOpen);
  });
  updateGroupOverviewButtons(btnGroupOverviewOpen);
  refillSavedLayoutSelect();
})();
