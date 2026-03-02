import { kiesIndeling } from './indeling.js';

document.addEventListener('DOMContentLoaded', async () => {
  const indelingSelect = document.getElementById('indelingSelect');
  const klasSelect = document.getElementById('klasSelect');
  const grid = document.getElementById('plattegrond');
  const LAST_LAYOUT_KEY = 'lespresentatie.lastLayoutType';
  const PLAN_SOURCE_KEY = 'lespresentatie.jaarplanningSourceUrl';
  const AGENDA_SOURCE_KEY = 'lespresentatie.agendaSourceUrl';
  const PLAN_REFRESH_MS = 5 * 60 * 1000;

  const planningWeekLabelEl = document.getElementById('jaarplanningWeekLabel');
  const planningItemsEl = document.getElementById('jaarplanningItems');
  const planningStatusEl = document.getElementById('jaarplanningStatus');
  const planningLastUpdateEl = document.getElementById('jaarplanningLastUpdate');
  const planningSourceInput = document.getElementById('jaarplanningSourceInput');
  const planningSourceSaveBtn = document.getElementById('jaarplanningSourceSave');
  const planningSourceClearBtn = document.getElementById('jaarplanningSourceClear');
  const planningRefreshBtn = document.getElementById('jaarplanningRefreshBtn');
  const agendaSourceInput = document.getElementById('agendaSourceInput');
  const agendaSourceSaveBtn = document.getElementById('agendaSourceSave');
  const agendaSourceClearBtn = document.getElementById('agendaSourceClear');
  const agendaDebugBtn = document.getElementById('agendaDebugBtn');
  const agendaDebugOutput = document.getElementById('agendaDebugOutput');

  let planningData = {};
  let planningUpdatedAt = '';
  let planningFetchedAt = '';
  let planningTimer = null;
  let planningSourceUrl = '';
  let agendaTimer = null;
  let agendaSourceUrl = '';
  let agendaEntries = [];
  let agendaFetchedAt = '';
  let agendaLastFetchStatus = '';
  let agendaLastContentType = '';
  let agendaLastError = '';
  let activeAgendaClassId = '';
  let activeAgendaEntry = null;
  let selectedLessonIndex = 0;

  try {
    const res = await fetch('js/leerlingen_per_klas.json', { cache: 'no-cache' });
    const klassen = await res.json();

    klasSelect.innerHTML = '';
    for (const klas of Object.keys(klassen)) {
      const option = document.createElement('option');
      option.value = klas;
      option.textContent = `Klas ${klas}`;
      klasSelect.appendChild(option);
    }

    const lastClass = localStorage.getItem('lastClassId');
    if (lastClass && [...klasSelect.options].some((o) => o.value === lastClass)) {
      klasSelect.value = lastClass;
    } else if ([...klasSelect.options].some((o) => o.value === 'G1D')) {
      klasSelect.value = 'G1D';
    } else if (klasSelect.options.length) {
      klasSelect.selectedIndex = 0;
    }

    if (klasSelect.value) localStorage.setItem('lastClassId', klasSelect.value);
  } catch (err) {
    console.error('Fout bij laden van klassen:', err);
    klasSelect.innerHTML = '<option>Fout bij laden</option>';
  }

  const hasTypeOption = (value) => [...indelingSelect.options].some((o) => o.value === value);
  const lastType = localStorage.getItem(LAST_LAYOUT_KEY);
  if (lastType && hasTypeOption(lastType)) {
    indelingSelect.value = lastType;
  }

  function dispatchRendered(type) {
    window.dispatchEvent(new CustomEvent('indeling:rendered', {
      detail: { type, timestamp: Date.now() }
    }));
  }

  function laadIndeling() {
    const kleuren = {
      h216: '#007bff',
      u008: '#28a745',
      drievierdrie: '#0e9aa7',
      groepjes: '#e83e8c',
      drietallen: '#ff9800',
      vijftallen: '#9b59b6'
    };

    const achtergronden = {
      h216: '#eef2f7',
      u008: '#eaf7ef',
      drievierdrie: '#e7f8fa',
      groepjes: '#fdf2f7',
      drietallen: '#fff5e6',
      vijftallen: '#f3ecfb'
    };

    const type = indelingSelect.value;

    document.documentElement.style.setProperty('--primaire-kleur', kleuren[type] || '#007bff');
    document.documentElement.style.setProperty('--hover-kleur', kleuren[type] || '#005fc1');
    document.documentElement.style.setProperty('--achtergrond', achtergronden[type] || '#eef2f7');

    grid.classList.remove('groepjes-layout');
    if (type === 'groepjes') grid.classList.add('groepjes-layout');

    grid.style.opacity = 0;
    setTimeout(async () => {
      grid.innerHTML = '';
      await kiesIndeling(type, klasSelect.value);
      setTimeout(() => {
        grid.style.opacity = 1;
        dispatchRendered(type);
      }, 0);
    }, 200);
  }

  indelingSelect.addEventListener('change', () => {
    if (indelingSelect.value) localStorage.setItem(LAST_LAYOUT_KEY, indelingSelect.value);
    laadIndeling();
  });

  klasSelect.addEventListener('change', () => {
    if (klasSelect.value) localStorage.setItem('lastClassId', klasSelect.value);
    laadIndeling();
  });

  if (!indelingSelect.value) indelingSelect.value = 'h216';
  localStorage.setItem(LAST_LAYOUT_KEY, indelingSelect.value);
  laadIndeling();

  function normalizeClassId(value) {
    return String(value || '').replace(/\s+/g, '').toUpperCase();
  }

  function classIdAliases(classId) {
    const cid = normalizeClassId(classId);
    if (!cid) return [];
    const aliases = new Set([cid]);
    if (/^G\d[A-Z]$/.test(cid)) aliases.add(cid.slice(1));
    if (/^\d[A-Z]$/.test(cid)) aliases.add(`G${cid}`);
    const dotted = cid.match(/^(\d)\.(\d+)$/);
    if (dotted) aliases.add(`${dotted[1]}G${dotted[2]}`);
    const gym = cid.match(/^(\d)G(\d+)$/);
    if (gym) aliases.add(`${gym[1]}.${gym[2]}`);
    return [...aliases];
  }

  function isoWeekInfo(date = new Date()) {
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = local.getDay() || 7;
    const monday = new Date(local);
    monday.setDate(local.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const utc = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
    const utcDay = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - utcDay);
    const isoYear = utc.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    const id = `${isoYear}-W${String(weekNo).padStart(2, '0')}`;

    const fmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
    const label = `Week ${weekNo} (${fmt.format(monday)} t/m ${fmt.format(sunday)})`;
    return { id, weekNo, label };
  }

  function coerceItems(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    const text = String(value || '').trim();
    if (!text) return [];
    return text.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  function normalizeLessonRow(row) {
    if (typeof row === 'string') {
      const lesson = row.trim();
      return lesson ? { project: '', lesson, url: '', lessonKey: '' } : null;
    }
    if (!row || typeof row !== 'object') return null;
    const project = String(row.project ?? row.thema ?? '').trim();
    const lesson = String(row.lesson ?? row.les ?? row.title ?? '').trim();
    const url = String(row.url ?? row.link ?? '').trim();
    const lessonKey = String(row.lessonKey ?? row.slot ?? row.lesKey ?? row.key ?? '').trim().toUpperCase();
    if (!project && !lesson) return null;
    return { project, lesson, url, lessonKey };
  }

  function coerceLessons(value) {
    if (Array.isArray(value)) {
      return value.map(normalizeLessonRow).filter(Boolean);
    }
    if (!value || typeof value !== 'object') return [];

    const direct = normalizeLessonRow(value);
    if (direct) return [direct];

    const slots = ['a', 'b', 'c', 'A', 'B', 'C', '1', '2', '3']
      .map((key) => normalizeLessonRow(value[key]))
      .filter(Boolean);
    return slots;
  }

  function normalizePlanEntry(entry) {
    if (Array.isArray(entry) || typeof entry === 'string') {
      return { lessons: [], items: coerceItems(entry), note: '' };
    }
    if (!entry || typeof entry !== 'object') {
      return { lessons: [], items: [], note: '' };
    }
    const lessons = coerceLessons(entry.lessons ?? entry.programmaItems ?? []);
    const items = coerceItems(
      entry.items
      ?? entry.programma
      ?? entry.program
      ?? entry.topics
      ?? entry.onderwerpen
      ?? ''
    );
    const note = String(entry.note ?? entry.opmerking ?? '').trim();
    return { lessons, items, note };
  }

  function mergePlanEntries(...entries) {
    const merged = { lessons: [], items: [], note: '' };
    const seenLessons = new Set();
    const seenItems = new Set();
    const notes = [];

    for (const entry of entries) {
      const normalized = normalizePlanEntry(entry);
      for (const lesson of normalized.lessons) {
        const key = JSON.stringify(lesson);
        if (seenLessons.has(key)) continue;
        seenLessons.add(key);
        merged.lessons.push(lesson);
      }
      for (const item of normalized.items) {
        if (seenItems.has(item)) continue;
        seenItems.add(item);
        merged.items.push(item);
      }
      if (normalized.note && !notes.includes(normalized.note)) {
        notes.push(normalized.note);
      }
    }

    if (notes.length) merged.note = notes.join(' | ');
    return merged;
  }

  function buildPlanningIndex(raw) {
    const index = {};
    const addWeek = (classId, weekId, payload) => {
      const wid = String(weekId || '').trim().toUpperCase();
      if (!wid) return;
      for (const cid of classIdAliases(classId)) {
        if (!index[cid]) index[cid] = {};
        index[cid][wid] = normalizePlanEntry(payload);
      }
    };

    if (raw?.classes && typeof raw.classes === 'object') {
      for (const [classId, classData] of Object.entries(raw.classes)) {
        if (!classData || typeof classData !== 'object') continue;
        for (const [weekId, payload] of Object.entries(classData)) {
          addWeek(classId, weekId, payload);
        }
      }
    }

    const rows = Array.isArray(raw?.weeks)
      ? raw.weeks
      : Array.isArray(raw?.entries)
        ? raw.entries
        : [];
    for (const row of rows) {
      const classId = row?.classId ?? row?.klas ?? row?.class ?? '';
      const weekId = row?.week ?? row?.weekId ?? row?.weeknummer ?? '';
      addWeek(classId, weekId, row);
    }

    return index;
  }

  function parseDateTime(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'number') {
      const numericDate = new Date(value);
      return Number.isNaN(numericDate.getTime()) ? null : numericDate;
    }
    const text = String(value).trim();
    if (!text) return null;
    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) return direct;
    const normalized = text
      .replace(/\./g, '-')
      .replace(' ', 'T')
      .replace(/(\+\d{2})(\d{2})$/, '$1:$2');
    const retry = new Date(normalized);
    return Number.isNaN(retry.getTime()) ? null : retry;
  }

  function pickClassId(value) {
    if (Array.isArray(value)) {
      for (const candidate of value) {
        const found = pickClassId(candidate);
        if (found) return found;
      }
      return '';
    }
    if (value && typeof value === 'object') {
      return pickClassId(value.code ?? value.name ?? value.id ?? value.classId ?? '');
    }
    const raw = normalizeClassId(value);
    if (!raw) return '';
    const tokens = raw.split(/[,;/+]/).map((part) => part.trim()).filter(Boolean);
    return tokens[0] || raw;
  }

  function tokenizeClassText(value) {
    return normalizeClassId(value)
      .split(/[^A-Z0-9.]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function inferClassIdFromText(value) {
    const tokens = tokenizeClassText(value);
    if (!tokens.length || !klasSelect?.options?.length) return '';
    const tokenSet = new Set(tokens);
    for (const option of [...klasSelect.options]) {
      const canonical = normalizeClassId(option.value);
      const aliases = classIdAliases(canonical);
      if (aliases.some((alias) => tokenSet.has(normalizeClassId(alias)))) {
        return canonical;
      }
    }
    return '';
  }

  function flattenAgendaRows(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw || typeof raw !== 'object') return [];
    const candidates = [raw.entries, raw.appointments, raw.items, raw.data, raw.response?.data];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  }

  function extractRoomFromText(value) {
    const text = String(value || '').toUpperCase();
    if (!text) return '';
    const patterns = [
      /\b([A-Z]\d{3})\b/,
      /\b([A-Z]_[A-Z0-9_]+)\b/,
      /\b([A-Z]{2,3}\d{2,3})\b/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return '';
  }

  function agendaRoomLabel(entry) {
    if (!entry) return '';
    if (entry.room) return String(entry.room).toUpperCase();
    const raw = entry.raw || {};
    const room = extractRoomFromText(
      `${raw.location || raw.LOCATION || raw.room || raw.lokaal || ''}\n${raw.summary || raw.SUMMARY || ''}\n${raw.description || raw.DESCRIPTION || ''}`
    );
    return room || '';
  }

  function normalizeAgendaEntry(row) {
    if (!row || typeof row !== 'object') return null;
    const explicitClass = pickClassId(
      row.classId
      ?? row.klas
      ?? row.class
      ?? row.group
      ?? row.groups
      ?? row.studentGroup
      ?? row.studentGroups
      ?? row.branch
      ?? ''
    );
    const inferredClass = inferClassIdFromText(
      `${row.summary || ''}\n${row.description || ''}\n${row.location || ''}\n${row.categories || ''}`
    );
    const classId = explicitClass || inferredClass;
    const start = parseDateTime(
      row.start
      ?? row.startTime
      ?? row.startDateTime
      ?? row.begin
      ?? row.beginTime
      ?? row.startDate
      ?? row.beginDateTime
      ?? ''
    );
    const end = parseDateTime(
      row.end
      ?? row.endTime
      ?? row.endDateTime
      ?? row.einde
      ?? row.finish
      ?? row.endDate
      ?? ''
    );
    const room = extractRoomFromText(
      `${row.location || row.room || row.lokaal || ''}\n${row.summary || ''}\n${row.description || ''}`
    );
    if (!classId || !start || !end) return null;
    return { classId: normalizeClassId(classId), start, end, room, raw: row };
  }

  function decodeIcsText(value) {
    return String(value || '')
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  function unfoldIcsLines(text) {
    const lines = String(text || '').split(/\r?\n/);
    const unfolded = [];
    for (const line of lines) {
      if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length) {
        unfolded[unfolded.length - 1] += line.slice(1);
      } else {
        unfolded.push(line);
      }
    }
    return unfolded;
  }

  function parseIcsDateValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateOnly) {
      const [, y, m, d] = dateOnly;
      return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    }

    const dateTime = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
    if (!dateTime) return null;
    const [, y, m, d, hh, mm, ss = '00', isUtc] = dateTime;
    if (isUtc) {
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    }
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  function extractClassIdFromText(value) {
    const text = normalizeClassId(value);
    if (!text) return '';
    const patterns = [
      /\bG\d[A-Z]\b/,
      /\b\d[A-Z]\b/,
      /\b\dG\d+\b/,
      /\b\d\.\d+\b/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return '';
  }

  function parseIcsEvents(text) {
    const lines = unfoldIcsLines(text);
    const events = [];
    let current = null;

    for (const line of lines) {
      if (!line) continue;
      if (line === 'BEGIN:VEVENT') {
        current = {};
        continue;
      }
      if (line === 'END:VEVENT') {
        if (current) events.push(current);
        current = null;
        continue;
      }
      if (!current) continue;

      const splitIndex = line.indexOf(':');
      if (splitIndex < 0) continue;
      const left = line.slice(0, splitIndex);
      const right = line.slice(splitIndex + 1);
      const key = left.split(';')[0].toUpperCase();
      const value = decodeIcsText(right);
      if (!key) continue;
      if (current[key]) current[key] = `${current[key]}\n${value}`;
      else current[key] = value;
    }

    return events
      .map((event) => {
        const classId = pickClassId(event['X-CLASS'])
          || inferClassIdFromText(
            `${event.SUMMARY || ''}\n${event.DESCRIPTION || ''}\n${event.CATEGORIES || ''}\n${event.LOCATION || ''}`
          )
          || extractClassIdFromText(event.SUMMARY)
          || extractClassIdFromText(event.DESCRIPTION)
          || extractClassIdFromText(event.CATEGORIES)
          || extractClassIdFromText(event.LOCATION)
          || '';
        const start = parseIcsDateValue(event.DTSTART);
        const end = parseIcsDateValue(event.DTEND);
        const room = extractRoomFromText(
          `${event.LOCATION || ''}\n${event.SUMMARY || ''}\n${event.DESCRIPTION || ''}`
        );
        if (!classId || !start || !end) return null;
        return { classId: normalizeClassId(classId), start, end, room, raw: event };
      })
      .filter(Boolean);
  }

  function parseAgendaPayload(rawText, contentType = '') {
    const ct = String(contentType || '').toLowerCase();
    const text = String(rawText || '').trim();
    if (!text) return [];

    if (ct.includes('text/calendar') || text.includes('BEGIN:VCALENDAR')) {
      return parseIcsEvents(text);
    }

    try {
      const raw = JSON.parse(text);
      return flattenAgendaRows(raw)
        .map(normalizeAgendaEntry)
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function isSameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function findAgendaEntryForCurrentOrLast(entries, now = new Date()) {
    const sorted = [...entries].sort((a, b) => a.start - b.start);
    if (!sorted.length) return null;

    // 1) Class that is currently being taught right now.
    const activeNow = sorted.find((entry) => now >= entry.start && now <= entry.end);
    if (activeNow) return activeNow;

    // 2) If no active class now, prefer the next upcoming class.
    const upcoming = sorted.find((entry) => entry.start >= now);
    if (upcoming) return upcoming;

    // 3) Final fallback: most recently finished class.
    const past = sorted.filter((entry) => entry.end <= now);
    if (past.length) return past[past.length - 1];
    return null;
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

  function lessonNumberForWeek(entries, selectedEntry) {
    if (!selectedEntry) return 0;
    const { monday, sunday } = getWeekBounds(selectedEntry.start);
    const inWeek = entries
      .filter((entry) => entry.classId === selectedEntry.classId && entry.start >= monday && entry.start <= sunday)
      .sort((a, b) => a.start - b.start);
    const index = inWeek.findIndex((entry) => entry.start.getTime() === selectedEntry.start.getTime());
    return index >= 0 ? index + 1 : 0;
  }

  function lessonNumberForClassToday(entries, classId, now = new Date()) {
    const cid = normalizeClassId(classId);
    if (!cid) return 0;
    const classEntries = entries.filter((entry) => entry.classId === cid);
    const selected = findAgendaEntryForCurrentOrLast(classEntries, now);
    return lessonNumberForWeek(entries, selected);
  }

  function resolveAgendaSourceUrl() {
    const fromStorage = String(localStorage.getItem(AGENDA_SOURCE_KEY) || '').trim();
    const fromWindow = String(window.APP_CONFIG?.agendaSourceUrl || '').trim();
    const legacyBlockedZermelo = fromStorage.includes('zportal.nl/api/v3/ical');
    if (legacyBlockedZermelo && fromWindow) return fromWindow;
    if (fromStorage) return fromStorage;
    return fromWindow;
  }

  function selectClassFromAgenda(classId) {
    const normalized = normalizeClassId(classId);
    if (!normalized || !klasSelect) return false;
    const aliases = classIdAliases(normalized);
    const matchingValue = [...klasSelect.options].find((option) => aliases.includes(normalizeClassId(option.value)))?.value;
    if (!matchingValue) return false;
    if (klasSelect.value !== matchingValue) {
      klasSelect.value = matchingValue;
      klasSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (matchingValue) {
      localStorage.setItem('lastClassId', matchingValue);
    }
    return true;
  }

  function resolvePlanningSourceUrl() {
    const fromStorage = String(localStorage.getItem(PLAN_SOURCE_KEY) || '').trim();
    if (fromStorage) return fromStorage;
    const fromWindow = String(window.APP_CONFIG?.jaarplanningSourceUrl || '').trim();
    return fromWindow;
  }

  function formatSyncTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('nl-NL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function setPlanningStatus(message, state = 'info') {
    if (!planningStatusEl) return;
    planningStatusEl.textContent = message;
    planningStatusEl.dataset.state = state;
  }

  function setPlanningItems(items = [], note = '', lessons = []) {
    if (!planningItemsEl) return;
    planningItemsEl.replaceChildren();
    for (const lesson of lessons) {
      const li = document.createElement('li');
      li.className = 'jaarplanning-lesson-item';

      const projectLine = document.createElement('p');
      projectLine.className = 'jaarplanning-project';
      projectLine.textContent = lesson.project ? `Project: ${lesson.project}` : 'Project: -';
      li.appendChild(projectLine);

      const lessonLine = document.createElement('p');
      lessonLine.className = 'jaarplanning-lesson';
      const prefix = document.createElement('span');
      prefix.textContent = 'Les: ';
      lessonLine.appendChild(prefix);
      if (lesson.url) {
        const link = document.createElement('a');
        link.href = lesson.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = lesson.lesson || lesson.url;
        lessonLine.appendChild(link);
      } else {
        const text = document.createElement('span');
        text.textContent = lesson.lesson || '-';
        lessonLine.appendChild(text);
      }
      li.appendChild(lessonLine);

      planningItemsEl.appendChild(li);
    }
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = item;
      planningItemsEl.appendChild(li);
    }
    if (note) {
      const noteLi = document.createElement('li');
      noteLi.className = 'jaarplanning-note';
      noteLi.textContent = `Opmerking: ${note}`;
      planningItemsEl.appendChild(noteLi);
    }
  }

  function lessonLetter(index) {
    if (index === 1) return 'A';
    if (index === 2) return 'B';
    if (index === 3) return 'C';
    return String(index);
  }

  function formatAgendaDebug(entries = [], now = new Date()) {
    const classId = normalizeClassId(klasSelect?.value || '');
    const classEntries = entries
      .filter((entry) => entry.classId === classId)
      .sort((a, b) => a.start - b.start);
    const todayEntries = classEntries.filter((entry) => isSameLocalDay(entry.start, now));
    const activeNow = classEntries.find((entry) => now >= entry.start && now <= entry.end);
    const nextEntry = classEntries.find((entry) => entry.start >= now);
    const pastEntries = classEntries.filter((entry) => entry.end <= now);
    const chosenReason = activeNow
      ? 'lopende les nu'
      : nextEntry
        ? 'eerstvolgende les'
        : pastEntries.length
          ? 'laatste afgelopen les'
          : '-';
    const todayBest = findAgendaEntryForCurrentOrLast(classEntries, now);
    const todayIndex = lessonNumberForWeek(entries, todayBest);
    const selectedRoom = agendaRoomLabel(todayBest);
    const header = [
      `nu: ${now.toLocaleString('nl-NL')}`,
      `geselecteerde klas: ${classId || '-'}`,
      `agenda bron: ${agendaSourceUrl || '(niet ingesteld)'}`,
      `laatste fetch: ${agendaLastFetchStatus || '-'}`,
      `content-type: ${agendaLastContentType || '-'}`,
      `laatste fout: ${agendaLastError || '-'}`,
      `gevonden agenda-events totaal: ${entries.length}`,
      `events voor klas ${classId || '-'}: ${classEntries.length}`,
      `events vandaag voor klas ${classId || '-'}: ${todayEntries.length}`,
      `lopende les nu: ${activeNow ? 'ja' : 'nee'}`,
      `geselecteerd op basis van: ${chosenReason}`,
      `geselecteerd lokaal: ${selectedRoom || '-'}`,
      `lesnummer deze week: ${todayIndex || 0} (${todayIndex ? lessonLetter(Math.min(todayIndex, 3)) : '-'})`
    ];
    if (!entries.length) {
      return `${header.join('\n')}\n\nGeen agenda-events gelezen.`;
    }
    const lines = classEntries.map((entry, i) => {
      const weekIndex = lessonNumberForWeek(entries, entry);
      const date = entry.start.toLocaleDateString('nl-NL', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const from = entry.start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      const to = entry.end.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      const mark = todayBest && entry.start.getTime() === todayBest.start.getTime() ? ' <== geselecteerd' : '';
      return `${i + 1}. ${date} ${from}-${to} | klas=${entry.classId} | weekles=${weekIndex}${weekIndex ? ` (${lessonLetter(Math.min(weekIndex, 3))})` : ''}${mark}`;
    });
    return `${header.join('\n')}\n\n${lines.join('\n')}`;
  }

  function selectLessonsForToday(lessons, lessonIndex, strictMatch = false) {
    if (!Array.isArray(lessons) || !lessons.length) return [];
    if (!Number.isInteger(lessonIndex) || lessonIndex <= 0) {
      return strictMatch ? [] : lessons;
    }
    const mappedIndex = Math.min(3, lessonIndex);
    const mappedKey = lessonLetter(mappedIndex);

    const keyedLessons = lessons.filter((l) => String(l?.lessonKey || '').trim());
    if (keyedLessons.length) {
      const keyedMatch = keyedLessons.find((l) => String(l.lessonKey || '').toUpperCase() === mappedKey);
      if (keyedMatch) return [keyedMatch];
      return strictMatch ? [] : keyedLessons;
    }

    const idx = Math.max(0, Math.min(lessons.length - 1, mappedIndex - 1));
    return [lessons[idx]];
  }

  function renderPlanning() {
    if (!planningItemsEl || !planningWeekLabelEl) return;
    const week = isoWeekInfo();
    planningWeekLabelEl.textContent = `Programma vandaag · ${week.label}`;

    const classId = normalizeClassId(klasSelect?.value || '');
    const weekCandidates = [
      week.id,
      `W${String(week.weekNo).padStart(2, '0')}`,
      String(week.weekNo),
      String(week.weekNo).padStart(2, '0')
    ];
    const classWeeks = planningData[classId] || {};
    const allWeeks = planningData.ALL || {};
    const classWeekKey = weekCandidates.find((key) => Boolean(classWeeks[key])) || '';
    const allWeekKey = weekCandidates.find((key) => Boolean(allWeeks[key])) || '';
    const weekData = (classWeekKey || allWeekKey)
      ? mergePlanEntries(allWeekKey ? allWeeks[allWeekKey] : null, classWeekKey ? classWeeks[classWeekKey] : null)
      : null;

    if (!planningSourceUrl) {
      setPlanningItems(['Koppel eerst een jaarplanning-bron in het docentpaneel.']);
      if (planningLastUpdateEl) planningLastUpdateEl.textContent = '';
      setPlanningStatus('Niet gekoppeld', 'warn');
      return;
    }

    const lessonSelection = selectLessonsForToday(weekData?.lessons || [], selectedLessonIndex, Boolean(agendaSourceUrl));
    const hasLessons = lessonSelection.length > 0;
    const showWeekItems = !agendaSourceUrl;
    const hasItems = showWeekItems && Array.isArray(weekData?.items) && weekData.items.length > 0;

    if (!weekData || (!hasLessons && !hasItems)) {
      setPlanningItems(['Geen planning gevonden voor deze klas in deze week.']);
      if (planningLastUpdateEl) {
        const syncStamp = planningFetchedAt ? `Laatste sync: ${formatSyncTime(planningFetchedAt)}` : '';
        const sourceStamp = planningUpdatedAt ? `Bron bijgewerkt: ${formatSyncTime(planningUpdatedAt)}` : '';
        planningLastUpdateEl.textContent = [syncStamp, sourceStamp].filter(Boolean).join(' · ');
      }
      setPlanningStatus('Geen weekitems', 'warn');
      return;
    }

    setPlanningItems(showWeekItems ? weekData.items : [], weekData.note, lessonSelection);
    if (planningLastUpdateEl) {
      const syncStamp = planningFetchedAt ? `Laatste sync: ${formatSyncTime(planningFetchedAt)}` : '';
      const sourceStamp = planningUpdatedAt ? `Bron bijgewerkt: ${formatSyncTime(planningUpdatedAt)}` : '';
      const agendaStamp = agendaFetchedAt ? `Agenda sync: ${formatSyncTime(agendaFetchedAt)}` : '';
      planningLastUpdateEl.textContent = [syncStamp, sourceStamp, agendaStamp].filter(Boolean).join(' · ');
    }
    if (agendaSourceUrl && activeAgendaEntry) {
      const room = agendaRoomLabel(activeAgendaEntry);
      setPlanningStatus(room ? `Live gekoppeld · Lokaal ${room}` : 'Live gekoppeld · Lokaal onbekend', 'ok');
    } else if (agendaSourceUrl) {
      setPlanningStatus('Live gekoppeld · Agenda gevonden, maar geen lesmatch voor vandaag', 'warn');
    } else {
      setPlanningStatus('Agenda niet gekoppeld · toon weekprogramma', 'info');
    }
  }

  async function fetchPlanning() {
    if (!planningSourceUrl) {
      renderPlanning();
      return;
    }
    try {
      setPlanningStatus('Synchroniseren...', 'info');
      const url = new URL(planningSourceUrl, window.location.href);
      url.searchParams.set('_t', String(Date.now()));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      planningData = buildPlanningIndex(raw);
      planningFetchedAt = new Date().toISOString();
      planningUpdatedAt = String(raw?.updatedAt || '');
      renderPlanning();
    } catch (err) {
      console.error('Fout bij laden jaarplanning:', err);
      setPlanningStatus('Synchronisatie mislukt', 'error');
      setPlanningItems(['Kon de jaarplanning niet laden. Controleer de bron-URL.']);
    }
  }

  async function fetchAgenda() {
    if (!agendaSourceUrl) {
      agendaEntries = [];
      agendaLastFetchStatus = 'niet uitgevoerd (geen agenda-URL)';
      agendaLastContentType = '';
      agendaLastError = '';
      activeAgendaClassId = '';
      activeAgendaEntry = null;
      selectedLessonIndex = lessonNumberForClassToday(agendaEntries, klasSelect?.value || '');
      if (agendaDebugOutput && agendaDebugOutput.style.display !== 'none') {
        agendaDebugOutput.value = formatAgendaDebug(agendaEntries, new Date());
      }
      renderPlanning();
      return;
    }
    try {
      const url = new URL(agendaSourceUrl, window.location.href);
      url.searchParams.set('_t', String(Date.now()));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawText = await res.text();
      const contentType = res.headers.get('content-type') || '';
      agendaEntries = parseAgendaPayload(rawText, contentType)
        .sort((a, b) => a.start - b.start);
      agendaFetchedAt = new Date().toISOString();
      agendaLastFetchStatus = `ok (${res.status})`;
      agendaLastContentType = contentType || '-';
      agendaLastError = '';

      const bestEntry = findAgendaEntryForCurrentOrLast(agendaEntries, new Date());
      activeAgendaClassId = normalizeClassId(bestEntry?.classId || '');
      activeAgendaEntry = bestEntry || null;
      selectedLessonIndex = lessonNumberForWeek(agendaEntries, bestEntry);

      if (activeAgendaClassId) {
        selectClassFromAgenda(activeAgendaClassId);
      } else {
        activeAgendaEntry = findAgendaEntryForCurrentOrLast(
          agendaEntries.filter((entry) => entry.classId === normalizeClassId(klasSelect?.value || '')),
          new Date()
        );
        selectedLessonIndex = lessonNumberForClassToday(agendaEntries, klasSelect?.value || '');
      }
      if (agendaDebugOutput && agendaDebugOutput.style.display !== 'none') {
        agendaDebugOutput.value = formatAgendaDebug(agendaEntries, new Date());
      }
      renderPlanning();
    } catch (err) {
      console.error('Fout bij laden agenda:', err);
      agendaEntries = [];
      agendaFetchedAt = '';
      agendaLastFetchStatus = 'mislukt';
      agendaLastContentType = '';
      agendaLastError = err?.message ? String(err.message) : String(err);
      activeAgendaClassId = '';
      activeAgendaEntry = null;
      selectedLessonIndex = lessonNumberForClassToday(agendaEntries, klasSelect?.value || '');
      if (agendaDebugOutput && agendaDebugOutput.style.display !== 'none') {
        agendaDebugOutput.value = formatAgendaDebug(agendaEntries, new Date());
      }
      renderPlanning();
    }
  }

  function resetPlanningTimer() {
    if (planningTimer) clearInterval(planningTimer);
    if (!planningSourceUrl) return;
    planningTimer = setInterval(fetchPlanning, PLAN_REFRESH_MS);
  }

  function resetAgendaTimer() {
    if (agendaTimer) clearInterval(agendaTimer);
    if (!agendaSourceUrl) return;
    agendaTimer = setInterval(fetchAgenda, PLAN_REFRESH_MS);
  }

  function applyPlanningSource(url, persist = true) {
    planningSourceUrl = String(url || '').trim();
    if (planningSourceInput) planningSourceInput.value = planningSourceUrl;
    if (persist) {
      if (planningSourceUrl) localStorage.setItem(PLAN_SOURCE_KEY, planningSourceUrl);
      else localStorage.removeItem(PLAN_SOURCE_KEY);
    }
    resetPlanningTimer();
    fetchPlanning();
  }

  function applyAgendaSource(url, persist = true) {
    agendaSourceUrl = String(url || '').trim();
    if (agendaSourceInput) agendaSourceInput.value = agendaSourceUrl;
    if (persist) {
      if (agendaSourceUrl) localStorage.setItem(AGENDA_SOURCE_KEY, agendaSourceUrl);
      else localStorage.removeItem(AGENDA_SOURCE_KEY);
    }
    resetAgendaTimer();
    fetchAgenda();
  }

  planningSourceSaveBtn?.addEventListener('click', () => {
    applyPlanningSource(planningSourceInput?.value || '', true);
  });

  planningSourceInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyPlanningSource(planningSourceInput.value, true);
    }
  });

  planningSourceClearBtn?.addEventListener('click', () => {
    applyPlanningSource('', true);
  });

  planningRefreshBtn?.addEventListener('click', () => {
    fetchPlanning();
    fetchAgenda();
  });

  agendaSourceSaveBtn?.addEventListener('click', () => {
    applyAgendaSource(agendaSourceInput?.value || '', true);
  });

  agendaSourceInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyAgendaSource(agendaSourceInput.value, true);
    }
  });

  agendaSourceClearBtn?.addEventListener('click', () => {
    applyAgendaSource('', true);
  });

  agendaDebugBtn?.addEventListener('click', () => {
    if (!agendaDebugOutput) return;
    agendaDebugOutput.style.display = 'block';
    agendaDebugOutput.value = formatAgendaDebug(agendaEntries, new Date());
  });

  klasSelect?.addEventListener('change', () => {
    activeAgendaEntry = findAgendaEntryForCurrentOrLast(
      agendaEntries.filter((entry) => entry.classId === normalizeClassId(klasSelect.value)),
      new Date()
    );
    selectedLessonIndex = lessonNumberForClassToday(agendaEntries, klasSelect.value);
    if (agendaDebugOutput && agendaDebugOutput.style.display !== 'none') {
      agendaDebugOutput.value = formatAgendaDebug(agendaEntries, new Date());
    }
    renderPlanning();
  });
  applyPlanningSource(resolvePlanningSourceUrl(), false);
  applyAgendaSource(resolveAgendaSourceUrl(), false);
});
