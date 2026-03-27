// js/indeling.js
const MODULE_VERSION = '20260227-01';
const SAVED_LAYOUTS_KEY = 'lespresentatie.savedlayouts.v1';
const TEMP_LAYOUT_HISTORY_KEY = 'lespresentatie.templayouthistory.v1';
const TEMP_LAYOUT_HISTORY_TTL_MS = 3 * 60 * 60 * 1000;
const TEMP_LAYOUT_HISTORY_LIMIT = 18;

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
    const rosterSource = window.__rosterSource;
    if (rosterSource?.loadStudentsForClass) {
      const lijst = await rosterSource.loadStudentsForClass(klasnaam);
      if (Array.isArray(lijst) && lijst.length) return lijst;
    }
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

function getRecentLayoutSelect() {
  return document.getElementById('recentLayoutSelect');
}

function isGroupLayoutType(type = getCurrentType()) {
  return type === 'groepjes' || type === 'drietallen' || type === 'vijftallen' || type === 'presentatievolgorde';
}

function layoutTypeLabel(type) {
  const labels = {
    h216: 'Busopstelling',
    u008: '3-3-2',
    drievierdrie: '3-4-3',
    groepjes: 'Viertallen',
    drietallen: 'Drietallen',
    vijftallen: 'Vijftallen',
    presentatievolgorde: 'Volgorde'
  };
  return labels[String(type || '').trim()] || String(type || '').trim() || 'Onbekend';
}

function agendaDateLabel(raw) {
  const value = String(raw || '').trim();
  if (!value) return '(geen datum)';
  return formatDateLabel(value);
}

function getSelectedLayoutTitle() {
  const select = getLayoutSelect();
  return String(select?.value || '').trim();
}

function normalizeProjectName(value) {
  return String(value || '').trim().toLocaleLowerCase('nl-NL');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function todayIsoDateLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeToIsoDate(rawValue, fallbackYear = new Date().getFullYear()) {
  const raw = String(rawValue || '').trim().toLowerCase();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const ddmmyyyy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const day = String(Number(ddmmyyyy[1])).padStart(2, '0');
    const month = String(Number(ddmmyyyy[2])).padStart(2, '0');
    return `${ddmmyyyy[3]}-${month}-${day}`;
  }

  const ddmm = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (ddmm) {
    const day = String(Number(ddmm[1])).padStart(2, '0');
    const month = String(Number(ddmm[2])).padStart(2, '0');
    return `${fallbackYear}-${month}-${day}`;
  }

  const monthIndex = {
    januari: 1,
    februari: 2,
    maart: 3,
    april: 4,
    mei: 5,
    juni: 6,
    juli: 7,
    augustus: 8,
    september: 9,
    oktober: 10,
    november: 11,
    december: 12
  };

  const nlText = raw.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (nlText) {
    const day = String(Number(nlText[1])).padStart(2, '0');
    const month = monthIndex[nlText[2]];
    if (month) {
      const year = nlText[3] ? Number(nlText[3]) : fallbackYear;
      return `${year}-${String(month).padStart(2, '0')}-${day}`;
    }
  }

  return '';
}

function collectTodayPresentationsFromSnapshot(projectName, payload, todayIso) {
  const snapshot = String(payload?.domSnapshot || '').trim();
  if (!snapshot) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="snapshotRoot">${snapshot}</div>`, 'text/html');
  const root = doc.getElementById('snapshotRoot');
  if (!root) return [];

  const result = [];
  const fallbackYear = Number(todayIso.split('-')[0]) || new Date().getFullYear();
  const items = Array.from(root.querySelectorAll('.groepje, .presentatie-item'));
  items.forEach((item) => {
    const dateEl = item.querySelector('[data-date-key]');
    const rawDate = String(dateEl?.dataset?.date || dateEl?.textContent || '').trim();
    if (normalizeToIsoDate(rawDate, fallbackYear) !== todayIso) return;

    const topic = String(item.querySelector('[data-topic-key]')?.dataset?.topic || '').trim();
    const students = item.classList.contains('presentatie-item')
      ? Array.from(item.querySelectorAll('.naam'))
        .map((el) => String(el.textContent || '').trim())
        .filter((name) => name && name !== '-')
      : Array.from(item.querySelectorAll('.tafel'))
        .map((el) => String(el.textContent || '').trim())
        .filter((name) => name && name !== '-');

    result.push({
      project: projectName,
      topic,
      students
    });
  });

  return result;
}

function collectTodayPresentationsFromPayload(projectName, payload, todayIso) {
  const type = String(payload?.type || '');
  const topicMap = new Map((payload?.groupTopics || []).map((item) => [
    String(item?.key || ''),
    String(item?.topic || '').trim()
  ]));
  const dateMap = new Map((payload?.groupDates || []).map((item) => [
    String(item?.key || ''),
    String(item?.date || '').trim()
  ]));
  const result = [];
  const fallbackYear = Number(todayIso.split('-')[0]) || new Date().getFullYear();

  if (type === 'presentatievolgorde') {
    const order = Array.isArray(payload?.order) ? payload.order : [];
    order.forEach((name, idx) => {
      const key = `volg${idx + 1}`;
      if (normalizeToIsoDate(dateMap.get(key), fallbackYear) !== todayIso) return;
      const student = String(name || '').trim();
      result.push({
        project: projectName,
        topic: topicMap.get(key) || '',
        students: student && student !== '-' ? [student] : []
      });
    });
    return result;
  }

  const seats = Array.isArray(payload?.seats) ? payload.seats : [];
  const studentsByGroup = new Map();
  seats.forEach((seat) => {
    const rawSeatId = String(seat?.seatId || '').trim();
    const groupKey = rawSeatId.includes('-') ? rawSeatId.split('-')[0] : '';
    if (!groupKey) return;
    const name = String(seat?.studentId || '').trim();
    if (!name || name === '-') return;
    if (!studentsByGroup.has(groupKey)) studentsByGroup.set(groupKey, []);
    studentsByGroup.get(groupKey).push(name);
  });

  dateMap.forEach((rawDate, key) => {
    if (!key || normalizeToIsoDate(rawDate, fallbackYear) !== todayIso) return;
    result.push({
      project: projectName,
      topic: topicMap.get(key) || '',
      students: studentsByGroup.get(key) || []
    });
  });

  return result;
}

function collectTodayPresentationsForClass(classId, todayIso = todayIsoDateLocal()) {
  const store = readSavedLayouts();
  const layouts = store?.classes?.[classId]?.layouts;
  if (!layouts || typeof layouts !== 'object') return [];

  const rows = [];
  Object.entries(layouts).forEach(([projectName, payload]) => {
    if (!payload || typeof payload !== 'object') return;
    const fromSnapshot = collectTodayPresentationsFromSnapshot(projectName, payload, todayIso);
    if (fromSnapshot.length) {
      rows.push(...fromSnapshot);
      return;
    }
    rows.push(...collectTodayPresentationsFromPayload(projectName, payload, todayIso));
  });
  return rows;
}

function renderPresentationNotice() {
  const notice = document.getElementById('presentationNotice');
  if (!notice) return;

  const classId = getCurrentClassId();
  const todayIso = todayIsoDateLocal();
  const rows = collectTodayPresentationsForClass(classId, todayIso);

  if (!rows.length) {
    notice.hidden = true;
    notice.innerHTML = '';
    return;
  }

  const listItems = rows.map((row) => {
    const topic = row.topic || '(geen onderwerp)';
    const students = row.students.length ? row.students.join(', ') : '-';
    return `<li class="presentation-notice-item"><strong>Project:</strong> ${escapeHtml(row.project)} · <strong>Onderwerp:</strong> ${escapeHtml(topic)} · <strong>Leerlingen:</strong> ${escapeHtml(students)}</li>`;
  }).join('');

  notice.innerHTML = `
    <p class="presentation-notice-title">Presentaties vandaag (${escapeHtml(formatDateLabel(todayIso))})</p>
    <ul class="presentation-notice-list">${listItems}</ul>
  `;
  notice.hidden = false;
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
    `Project: ${getSelectedLayoutTitle() || '(geen opgeslagen plattegrond geselecteerd)'}`,
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

function parseSavedAtMs(value) {
  const ms = Date.parse(String(value || '').trim());
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeTempHistoryStore(store) {
  const normalized = store && typeof store === 'object' ? store : {};
  const now = Date.now();
  const cutoff = now - TEMP_LAYOUT_HISTORY_TTL_MS;
  const items = Array.isArray(normalized.items) ? normalized.items : [];
  normalized.version = 1;
  normalized.items = items
    .filter((item) => item && typeof item === 'object')
    .filter((item) => parseSavedAtMs(item.savedAt) >= cutoff)
    .sort((a, b) => parseSavedAtMs(b.savedAt) - parseSavedAtMs(a.savedAt))
    .slice(0, TEMP_LAYOUT_HISTORY_LIMIT);
  return normalized;
}

function readTempLayoutHistory() {
  try {
    const raw = localStorage.getItem(TEMP_LAYOUT_HISTORY_KEY);
    return normalizeTempHistoryStore(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeTempHistoryStore(null);
  }
}

function writeTempLayoutHistory(store) {
  try {
    localStorage.setItem(TEMP_LAYOUT_HISTORY_KEY, JSON.stringify(normalizeTempHistoryStore(store)));
  } catch (err) {
    console.warn('Tijdelijke historie opslaan mislukt:', err);
  }
}

function arrangementHistoryFingerprint(arrangement) {
  if (!arrangement || typeof arrangement !== 'object') return '';
  return JSON.stringify({
    type: arrangement.type || '',
    klasId: arrangement.klasId || '',
    seats: Array.isArray(arrangement.seats) ? arrangement.seats : [],
    order: Array.isArray(arrangement.order) ? arrangement.order : [],
    domSnapshot: String(arrangement.domSnapshot || ''),
    groupTopics: Array.isArray(arrangement.groupTopics) ? arrangement.groupTopics : [],
    groupDates: Array.isArray(arrangement.groupDates) ? arrangement.groupDates : []
  });
}

function recentHistoryLabel(item) {
  const savedAt = parseSavedAtMs(item?.savedAt);
  const timeLabel = savedAt
    ? new Intl.DateTimeFormat('nl-NL', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(savedAt))
    : 'onbekend tijdstip';
  const typeLabel = layoutTypeLabel(item?.type || item?.arrangement?.type);
  const sourceLabel = String(item?.layoutName || '').trim();
  return sourceLabel
    ? `${timeLabel} · ${typeLabel} · ${sourceLabel}`
    : `${timeLabel} · ${typeLabel}`;
}

function refillRecentLayoutSelect() {
  const select = getRecentLayoutSelect();
  if (!select) return;

  const classId = getCurrentClassId();
  const store = readTempLayoutHistory();
  const items = store.items.filter((item) => String(item?.classId || '') === classId);

  select.innerHTML = '';

  if (!items.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Geen snapshots van de laatste 3 uur';
    select.appendChild(opt);
    select.value = '';
    return;
  }

  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = String(item.id || '');
    opt.textContent = recentHistoryLabel(item);
    select.appendChild(opt);
  });

  select.selectedIndex = 0;
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

function persistTemporaryHistorySnapshot({ source = 'auto', layoutName = '' } = {}) {
  const arrangement = getCurrentArrangement();
  if (!arrangement) return;

  const classId = getCurrentClassId();
  const store = readTempLayoutHistory();
  const items = Array.isArray(store.items) ? store.items.slice() : [];
  const savedAt = new Date().toISOString();
  arrangement.savedAt = savedAt;

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    classId,
    type: arrangement.type,
    savedAt,
    source: String(source || 'auto'),
    layoutName: String(layoutName || getSelectedLayoutTitle() || '').trim(),
    arrangement
  };

  const fingerprint = arrangementHistoryFingerprint(arrangement);
  let skippedLatestDuplicate = false;
  const deduped = items.filter((item) => {
    if (skippedLatestDuplicate) return true;
    if (String(item?.classId || '') !== classId) return true;
    if (arrangementHistoryFingerprint(item?.arrangement) !== fingerprint) return true;
    skippedLatestDuplicate = true;
    return false;
  });

  store.items = [entry, ...deduped];
  writeTempLayoutHistory(store);
  refillRecentLayoutSelect();
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

function findLayoutNameForProject(cls, projectName) {
  const wanted = normalizeProjectName(projectName);
  if (!wanted || !cls?.layouts || typeof cls.layouts !== 'object') return '';
  return Object.keys(cls.layouts).find((name) => normalizeProjectName(name) === wanted) || '';
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

function fixedLayoutExpectedSeatCount(type) {
  const counts = {
    h216: 30,
    u008: 30,
    drievierdrie: 30,
  };
  return counts[String(type || '').trim()] || 0;
}

function hasValidStructuredArrangement(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const type = String(payload.type || '').trim() || getCurrentType();
  const seats = Array.isArray(payload.seats) ? payload.seats : [];
  const order = Array.isArray(payload.order) ? payload.order : [];
  const expectedSeatCount = fixedLayoutExpectedSeatCount(type);

  if (expectedSeatCount) {
    if (seats.length !== expectedSeatCount) return false;
    const seatIds = seats
      .map((item) => String(item?.seatId || '').trim())
      .filter(Boolean);
    return seatIds.length === expectedSeatCount && new Set(seatIds).size === expectedSeatCount;
  }

  if (type === 'presentatievolgorde') return order.length > 0;
  return seats.length > 0 || order.length > 0;
}

function projectArrangementToCurrentGrid(payload) {
  const grid = document.getElementById('plattegrond');
  const type = payload?.type || getCurrentType();
  const seats = Array.isArray(payload?.seats) ? payload.seats : [];
  const order = Array.isArray(payload?.order) ? payload.order : [];

  if (!grid || !payload) return;

  const hasStructuredSeatData = type !== 'presentatievolgorde' && hasValidStructuredArrangement({ ...payload, seats, order });
  const hasStructuredOrderData = type === 'presentatievolgorde' && order.length > 0;

  if (!hasStructuredSeatData && !hasStructuredOrderData && typeof payload.domSnapshot === 'string' && payload.domSnapshot.trim()) {
    grid.innerHTML = payload.domSnapshot;
    applyGroupTopics(payload.groupTopics || []);
    applyGroupDates(payload.groupDates || []);
    return;
  }

  if (type === 'presentatievolgorde') {
    if (order.length) {
      grid.innerHTML = '';
      const ol = document.createElement('ol');
      ol.className = 'presentatie-lijst';
      order.forEach((naam, idx) => {
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

  seats.forEach((item, i) => {
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
  const shouldRebuildBeforeApply = (
    Array.isArray(payload?.seats) && payload.seats.length
  ) || (
    targetType === 'presentatievolgorde' && Array.isArray(payload?.order) && payload.order.length
  );

  if ((targetType !== currentType || shouldRebuildBeforeApply) && typeSel) {
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
  renderPresentationNotice();
}

function currentProjectSuggestions() {
  const detail = window.__planningProjectContext || {};
  const projects = Array.isArray(detail.projects) ? detail.projects : [];
  const current = String(detail.primaryProject || '').trim();
  const suggestions = [];
  if (current) suggestions.push(current);
  for (const project of projects) {
    const text = String(project || '').trim();
    if (text && !suggestions.includes(text)) suggestions.push(text);
  }
  const selected = getSelectedLayoutTitle();
  if (selected && !suggestions.includes(selected)) suggestions.push(selected);
  return suggestions;
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
  if (!hasValidStructuredArrangement(payload)) {
    alert('Deze opgeslagen plattegrond is ongeldig of beschadigd. Sla hem opnieuw op.');
    return;
  }

  cls.selected = select.value;
  writeSavedLayouts(store);
  await applyArrangement(payload);
  persistTemporaryHistorySnapshot({ source: 'saved-layout-load', layoutName: select.value });
}

async function loadSelectedRecentLayout() {
  const select = getRecentLayoutSelect();
  if (!select || !select.value) {
    alert('Geen tijdelijk opgeslagen moment beschikbaar.');
    return;
  }

  const classId = getCurrentClassId();
  const store = readTempLayoutHistory();
  const payload = store.items.find((item) => String(item?.id || '') === String(select.value) && String(item?.classId || '') === classId);
  if (!payload?.arrangement) {
    alert('Dit tijdelijke moment is niet meer beschikbaar.');
    refillRecentLayoutSelect();
    return;
  }

  await applyArrangement(payload.arrangement);
  persistTemporaryHistorySnapshot({
    source: 'history-load',
    layoutName: payload.layoutName || recentHistoryLabel(payload)
  });
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
  renderPresentationNotice();
}

async function autoApplyLayoutForProject(projectName, classId = getCurrentClassId()) {
  void projectName;
  void classId;
  return false;
}

function applyDefaultBusLayout() {
  const typeSel = document.getElementById('indelingSelect');
  const currentType = getCurrentType();
  if (!typeSel || currentType === 'h216') return;
  typeSel.value = 'h216';
  typeSel.dispatchEvent(new Event('change', { bubbles: true }));
}

(function initLayoutLibraryUI() {
  const klasSel = document.getElementById('klasSelect');
  const typeSel = document.getElementById('indelingSelect');
  const btnSave = document.getElementById('btnLayoutSave');
  const btnLoad = document.getElementById('btnLayoutLoad');
  const btnDelete = document.getElementById('btnLayoutDelete');
  const btnRecentLoad = document.getElementById('btnRecentLayoutLoad');
  const btnGroupOverviewOpen = Array.from(document.querySelectorAll('[data-action="group-overview-open"]'));
  const select = getLayoutSelect();
  const plattegrond = document.getElementById('plattegrond');
  let recentSnapshotTimer = null;
  if (!klasSel || !select || !plattegrond) return;

  initTopicEditing();
  initOverviewModal();

  btnSave?.addEventListener('click', () => {
    const suggestions = currentProjectSuggestions();
    const suggestedProject = suggestions[0] || '';
    const promptText = suggestions.length > 1
      ? `Aan welk project moet deze plattegrond gekoppeld worden?\nSuggesties: ${suggestions.join(', ')}`
      : 'Aan welk project moet deze plattegrond gekoppeld worden?';
    const name = prompt(promptText, suggestedProject);
    const projectName = String(name || '').trim();
    if (!projectName) return;

    const classId = getCurrentClassId();
    const store = readSavedLayouts();
    const cls = ensureClassStore(store, classId);
    const existingName = findLayoutNameForProject(cls, projectName);
    if (existingName && !confirm(`Er bestaat al een plattegrond voor project "${existingName}". Overschrijven?`)) return;
    const targetName = existingName || projectName;
    saveCurrentLayoutAs(targetName);
    void autoApplyLayoutForProject(targetName, classId);
  });

  btnLoad?.addEventListener('click', () => {
    void loadSelectedLayout();
  });

  btnRecentLoad?.addEventListener('click', () => {
    void loadSelectedRecentLayout();
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
    setTimeout(refillRecentLayoutSelect, 40);
    setTimeout(renderPresentationNotice, 40);
  });

  window.addEventListener('planning:project-context', (event) => {
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    window.__planningProjectContext = detail;
    const classId = String(detail.classId || '').trim() || getCurrentClassId();
    const primaryProject = String(detail.primaryProject || '').trim();
    if (!primaryProject) {
      window.__autoAppliedProjectLayoutKey = '';
      applyDefaultBusLayout();
      return;
    }
    void autoApplyLayoutForProject(primaryProject, classId).then((applied) => {
      if (!applied) {
        window.__autoAppliedProjectLayoutKey = '';
        applyDefaultBusLayout();
      }
    });
  });

  window.addEventListener('indeling:rendered', () => {
    refillSavedLayoutSelect();
    if (recentSnapshotTimer) clearTimeout(recentSnapshotTimer);
    recentSnapshotTimer = setTimeout(() => {
      persistTemporaryHistorySnapshot({ source: 'render' });
    }, 300);
    refillRecentLayoutSelect();
    updateGroupOverviewButtons(btnGroupOverviewOpen);
    renderPresentationNotice();
  });

  window.addEventListener('beforeunload', () => {
    persistTemporaryHistorySnapshot({ source: 'beforeunload' });
  });

  updateGroupOverviewButtons(btnGroupOverviewOpen);
  refillSavedLayoutSelect();
  refillRecentLayoutSelect();
  renderPresentationNotice();
})();
