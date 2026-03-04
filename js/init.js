import { kiesIndeling } from './indeling.js';

document.addEventListener('DOMContentLoaded', async () => {
  const indelingSelect = document.getElementById('indelingSelect');
  const klasSelect = document.getElementById('klasSelect');
  const grid = document.getElementById('plattegrond');
  const LAST_LAYOUT_KEY = 'lespresentatie.lastLayoutType';
  const PLAN_STUDIO_KEY = 'lespresentatie.jaarplanningStudioData';
  const AGENDA_SOURCE_KEY = 'lespresentatie.agendaSourceUrl';
  const PLAN_REFRESH_MS = 5 * 60 * 1000;

  const planningWeekLabelEl = document.getElementById('jaarplanningWeekLabel');
  const planningItemsEl = document.getElementById('jaarplanningItems');
  const planningStatusEl = document.getElementById('jaarplanningStatus');
  const planningLastUpdateEl = document.getElementById('jaarplanningLastUpdate');
  const planningStudioClassSelect = document.getElementById('jaarplanningStudioClassSelect');
  const planningStudioWeekInput = document.getElementById('jaarplanningStudioWeekInput');
  const planningEditorLessons = document.getElementById('jaarplanningEditorLessons');
  const planningEditorMeta = document.getElementById('jaarplanningEditorMeta');
  const planningEditorItems = document.getElementById('jaarplanningEditorItems');
  const planningEditorNote = document.getElementById('jaarplanningEditorNote');
  const planningEditorSaveBtn = document.getElementById('jaarplanningEditorSave');
  const planningEditorClearBtn = document.getElementById('jaarplanningEditorClear');
  const planningStudioResetBtn = document.getElementById('jaarplanningStudioReset');
  const planningEditorFileStatus = document.getElementById('jaarplanningEditorFileStatus');
  const planningRefreshBtn = document.getElementById('jaarplanningRefreshBtn');
  const agendaSourceInput = document.getElementById('agendaSourceInput');
  const agendaSourceSaveBtn = document.getElementById('agendaSourceSave');
  const agendaSourceClearBtn = document.getElementById('agendaSourceClear');
  const agendaDebugBtn = document.getElementById('agendaDebugBtn');
  const agendaDebugOutput = document.getElementById('agendaDebugOutput');
  const plattegrondFrame = document.getElementById('plattegrondFrame');
  const presentationEmbedTitle = document.getElementById('presentationEmbedTitle');
  const presentationEmbedFrame = document.getElementById('presentationEmbedFrame');
  const presentationEmbedFallback = document.getElementById('presentationEmbedFallback');
  const presentationOpenBtn = document.getElementById('presentationOpenBtn');
  const presentationBackBtn = document.getElementById('presentationBackBtn');
  const presentationFullscreenBtn = document.getElementById('presentationFullscreenBtn');
  const presentationInternal = document.getElementById('presentationInternal');
  const presentationInternalStage = document.getElementById('presentationInternalStage');
  const presentationPrevBtn = document.getElementById('presentationPrevBtn');
  const presentationNextBtn = document.getElementById('presentationNextBtn');
  const presentationSlideCounter = document.getElementById('presentationSlideCounter');

  let planningData = {};
  let planningPresentations = {};
  let planningUpdatedAt = '';
  let planningFetchedAt = '';
  let planningTimer = null;
  let planningStudio = null;
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
  let clockMarkerTimer = null;
  let isPresentationOpen = false;
  let activePresentation = null;
  let activeSlideIndex = 0;

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
    refreshPlanningEditor();
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

  function currentWeekCandidates(date = new Date()) {
    const week = isoWeekInfo(date);
    return {
      week,
      keys: [
        week.id,
        `W${String(week.weekNo).padStart(2, '0')}`,
        String(week.weekNo),
        String(week.weekNo).padStart(2, '0')
      ]
    };
  }

  function getStudioEntry(classId, weekKeys = []) {
    const aliases = classIdAliases(classId);
    for (const alias of aliases) {
      for (const wk of weekKeys) {
        const weeks = planningData[normalizeClassId(alias)] || {};
        const match = weeks[String(wk || '').trim().toUpperCase()];
        if (match) return match;
      }
    }
    return null;
  }

  function coerceItems(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    const text = String(value || '').trim();
    if (!text) return [];
    return text.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';
  }

  function projectDeckId(projectName) {
    return `project-${slugify(projectName)}`;
  }

  function lessonMarkerId(lessonName) {
    return `marker-${slugify(lessonName)}`;
  }

  function ensureProjectOverviewPresentations(doc) {
    const safeDoc = normalizeStudioDoc(doc);
    if (!safeDoc.presentations || typeof safeDoc.presentations !== 'object') {
      safeDoc.presentations = {};
    }

    const projectMarkers = {};
    for (const entry of safeDoc.entries || []) {
      if (!entry || typeof entry !== 'object') continue;
      if (!Array.isArray(entry.lessons)) continue;
      for (const lesson of entry.lessons) {
        if (!lesson || typeof lesson !== 'object') continue;
        const project = String(lesson.project || '').trim();
        const lessonTitle = String(lesson.lesson || '').trim();
        if (!project || !lessonTitle) continue;

        const deckId = projectDeckId(project);
        const markerId = lessonMarkerId(lessonTitle);
        lesson.presentationId = deckId;
        lesson.presentationMarkerId = markerId;

        if (!projectMarkers[deckId]) {
          projectMarkers[deckId] = { project, markers: new Map() };
        }
        if (!projectMarkers[deckId].markers.has(markerId)) {
          projectMarkers[deckId].markers.set(markerId, lessonTitle);
        }
      }
    }

    for (const [deckId, bundle] of Object.entries(projectMarkers)) {
      const existing = safeDoc.presentations[deckId] && typeof safeDoc.presentations[deckId] === 'object'
        ? safeDoc.presentations[deckId]
        : null;
      const presentation = existing || {
        id: deckId,
        presentationType: 'project-overview',
        title: bundle.project,
        project: bundle.project,
        slides: [],
        markers: {},
        markerDecks: {},
      };
      presentation.id = deckId;
      presentation.presentationType = 'project-overview';
      presentation.project = bundle.project;
      presentation.title = String(presentation.title || bundle.project).trim() || bundle.project;
      if (!Array.isArray(presentation.slides)) presentation.slides = [];
      if (!presentation.markers || typeof presentation.markers !== 'object') presentation.markers = {};
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
        }];
      }

      const titleSlide = {
        type: 'title',
        title: presentation.title,
        subtitle: bundle.project,
      };
      const rebuiltSlides = [titleSlide];
      const rebuiltMarkers = {};
      for (const markerId of bundle.markers.keys()) {
        const markerSlides = Array.isArray(presentation.markerDecks[markerId])
          ? presentation.markerDecks[markerId].filter((slide) => slide && typeof slide === 'object')
          : [];
        if (!markerSlides.length) continue;
        rebuiltMarkers[markerId] = rebuiltSlides.length;
        for (const slide of markerSlides) {
          rebuiltSlides.push({
            type: String(slide.type || 'title').toLowerCase() === 'bullets' ? 'bullets' : 'title',
            title: String(slide.title || '').trim(),
            subtitle: String(slide.subtitle || '').trim(),
            items: Array.isArray(slide.items)
              ? slide.items.map((item) => String(item || '').trim()).filter(Boolean)
              : [],
          });
        }
      }

      presentation.slides = rebuiltSlides;
      presentation.markers = rebuiltMarkers;
      safeDoc.presentations[deckId] = presentation;
    }
    return safeDoc;
  }

  function normalizeLessonRow(row) {
    if (typeof row === 'string') {
      const lesson = row.trim();
      return lesson ? {
        project: '', lesson, lessonKey: ''
      } : null;
    }
    if (!row || typeof row !== 'object') return null;
    const project = String(row.project ?? row.thema ?? '').trim();
    const lesson = String(row.lesson ?? row.les ?? row.title ?? '').trim();
    const presentationId = String(
      row.presentationId
      ?? row.presentation_id
      ?? row.deckId
      ?? row.deck_id
      ?? ''
    ).trim();
    const presentationMarkerId = String(
      row.presentationMarkerId
      ?? row.presentation_marker_id
      ?? row.markerId
      ?? row.marker_id
      ?? ''
    ).trim();
    const lessonKey = String(row.lessonKey ?? row.slot ?? row.lesKey ?? row.key ?? '').trim().toUpperCase();
    if (!project && !lesson) return null;
    return { project, lesson, presentationId, presentationMarkerId, lessonKey };
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

  function findAgendaEntryForCurrentOrNext(entries, now = new Date()) {
    const sorted = [...entries].sort((a, b) => a.start - b.start);
    if (!sorted.length) return null;
    const activeNow = sorted.find((entry) => now >= entry.start && now <= entry.end);
    if (activeNow) return activeNow;
    return sorted.find((entry) => entry.start >= now) || null;
  }

  function updateClockMarkerTarget(now = new Date()) {
    const classId = normalizeClassId(klasSelect?.value || '');
    const classEntries = classId
      ? agendaEntries.filter((entry) => entry.classId === classId)
      : [];
    const target = findAgendaEntryForCurrentOrNext(classEntries, now);
    const mode = target
      ? (now >= target.start && now <= target.end ? 'current' : 'next')
      : 'none';

    window.dispatchEvent(new CustomEvent('agenda:clock-marker-update', {
      detail: {
        classId,
        mode,
        start: target ? target.start.toISOString() : '',
        end: target ? target.end.toISOString() : ''
      }
    }));
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

  function defaultPlanningSourceUrl() {
    return String(window.APP_CONFIG?.jaarplanningSourceUrl || 'js/jaarplanning-live.json').trim();
  }

  function gradeLayerFromClassId(rawClassId) {
    const cid = normalizeClassId(rawClassId);
    if (!cid) return '';
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

  function collapseToYearLayerDoc(doc) {
    const source = normalizeStudioDoc(doc);
    const merged = new Map();

    for (const entry of source.entries || []) {
      const grade = gradeLayerFromClassId(entry.classId);
      if (!grade) continue;
      const week = String(entry.week || '').trim();
      if (!week) continue;
      const key = `${grade}__${week}`;
      if (!merged.has(key)) {
        merged.set(key, { classId: grade, week, lessons: [], items: [], notes: [] });
      }
      const bucket = merged.get(key);
      for (const lesson of Array.isArray(entry.lessons) ? entry.lessons : []) {
        const fingerprint = JSON.stringify(lesson || {});
        if (!bucket.lessons.some((it) => JSON.stringify(it || {}) === fingerprint)) {
          bucket.lessons.push(lesson);
        }
      }
      for (const item of Array.isArray(entry.items) ? entry.items : []) {
        const text = String(item || '').trim();
        if (text && !bucket.items.includes(text)) bucket.items.push(text);
      }
      const note = String(entry.note || '').trim();
      if (note && !bucket.notes.includes(note)) bucket.notes.push(note);
    }

    const entries = [...merged.values()].map((row) => {
      const out = {
        classId: row.classId,
        week: row.week,
        lessons: row.lessons,
        items: row.items,
      };
      if (row.notes.length) out.note = row.notes.join(' | ');
      return out;
    });

    return {
      ...source,
      entries,
      updatedAt: source.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeStudioDoc(raw) {
    const doc = (raw && typeof raw === 'object') ? structuredClone(raw) : {};
    if (!Array.isArray(doc.entries)) doc.entries = [];
    if (!doc.presentations || typeof doc.presentations !== 'object') doc.presentations = {};
    return doc;
  }

  function loadPlanningStudioFromStorage() {
    const raw = String(localStorage.getItem(PLAN_STUDIO_KEY) || '').trim();
    if (!raw) return null;
    try {
      return normalizeStudioDoc(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function savePlanningStudioToStorage() {
    if (!planningStudio) return;
    localStorage.setItem(PLAN_STUDIO_KEY, JSON.stringify(planningStudio));
  }

  function rebuildPlanningFromStudio() {
    const doc = ensureProjectOverviewPresentations(collapseToYearLayerDoc(planningStudio || {}));
    planningStudio = doc;
    planningData = buildPlanningIndex(doc);
    planningPresentations = doc.presentations || {};
    planningFetchedAt = new Date().toISOString();
    planningUpdatedAt = String(doc.updatedAt || planningFetchedAt);
  }

  function buildPresentationTarget(lesson) {
    const title = String(lesson?.lesson || '').trim() || 'Presentatie';
    const project = String(lesson?.project || '').trim();
    const presentationId = String(lesson?.presentationId || '').trim();
    const markerId = String(lesson?.presentationMarkerId || '').trim();
    return { title, project, presentationId, markerId };
  }

  function renderInternalSlide() {
    if (!presentationInternalStage || !activePresentation) return;
    const slides = Array.isArray(activePresentation.slides) ? activePresentation.slides : [];
    if (!slides.length) {
      presentationInternalStage.innerHTML = '<p class="presentation-slide-subtitle">Geen slides gevonden.</p>';
      if (presentationSlideCounter) presentationSlideCounter.textContent = '0 / 0';
      return;
    }
    const idx = Math.max(0, Math.min(slides.length - 1, activeSlideIndex));
    activeSlideIndex = idx;
    const slide = slides[idx] || {};

    if (slide.type === 'bullets') {
      const title = String(slide.title || '').trim() || activePresentation.title || 'Slide';
      const items = Array.isArray(slide.items) ? slide.items : [];
      presentationInternalStage.innerHTML = `
        <h2 class="presentation-slide-title">${title}</h2>
        <ul class="presentation-slide-bullets">
          ${items.map((item) => `<li>${String(item || '').trim()}</li>`).join('')}
        </ul>
      `;
    } else {
      const title = String(slide.title || activePresentation.title || 'Presentatie').trim();
      const subtitle = String(slide.subtitle || activePresentation.project || '').trim();
      presentationInternalStage.innerHTML = `
        <h1 class="presentation-slide-title">${title}</h1>
        ${subtitle ? `<p class="presentation-slide-subtitle">${subtitle}</p>` : ''}
      `;
    }

    if (presentationSlideCounter) presentationSlideCounter.textContent = `${idx + 1} / ${slides.length}`;
    if (presentationPrevBtn) presentationPrevBtn.disabled = idx <= 0;
    if (presentationNextBtn) presentationNextBtn.disabled = idx >= slides.length - 1;
  }

  function applyPresentationTarget(target) {
    if (!target) return;
    const titleText = target.project
      ? `${target.project} · ${target.title}`
      : target.title;
    if (presentationEmbedTitle) presentationEmbedTitle.textContent = titleText;

    const internal = target.presentationId ? planningPresentations[target.presentationId] : null;
    if (internal) {
      activePresentation = internal;
      const markerIdx = Number(internal?.markers?.[target.markerId]);
      activeSlideIndex = Number.isInteger(markerIdx) ? markerIdx : 0;
      if (presentationInternal) presentationInternal.hidden = false;
      if (presentationEmbedFrame) presentationEmbedFrame.hidden = true;
      if (presentationEmbedFallback) presentationEmbedFallback.hidden = true;
      renderInternalSlide();
      return;
    }

    activePresentation = null;
    activeSlideIndex = 0;
    if (presentationInternal) presentationInternal.hidden = true;
    if (presentationEmbedFrame) presentationEmbedFrame.removeAttribute('src');
    if (presentationEmbedFrame) presentationEmbedFrame.hidden = true;
    if (presentationEmbedFallback) presentationEmbedFallback.hidden = false;
    if (presentationOpenBtn) presentationOpenBtn.hidden = true;
  }

  function openPresentationPanel(target) {
    if (!plattegrondFrame || !target) return;
    applyPresentationTarget(target);
    plattegrondFrame.classList.add('is-flipped');
    isPresentationOpen = true;
  }

  function closePresentationPanel() {
    if (!plattegrondFrame) return;
    plattegrondFrame.classList.remove('is-flipped');
    isPresentationOpen = false;
  }

  async function togglePresentationFullscreen() {
    const target = presentationEmbedFrame || plattegrondFrame;
    if (!target) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen niet beschikbaar:', err);
    }
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

  function setPlanningStatus(message, state = 'info', options = {}) {
    if (!planningStatusEl) return;
    planningStatusEl.dataset.state = state;
    planningStatusEl.classList.toggle('has-room-badge', Boolean(options.room));
    planningStatusEl.replaceChildren();

    if (options.room) {
      if (message) {
        const prefix = document.createElement('span');
        prefix.className = 'jaarplanning-status-prefix';
        prefix.textContent = `${message} `;
        planningStatusEl.appendChild(prefix);
      }

      const badge = document.createElement('span');
      badge.className = 'jaarplanning-room-badge';
      badge.textContent = String(options.room).toUpperCase();
      planningStatusEl.appendChild(badge);
      return;
    }

    planningStatusEl.textContent = message;
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
      if (lesson.presentationId && planningPresentations[lesson.presentationId]) {
        const link = document.createElement('a');
        const target = buildPresentationTarget(lesson);
        link.href = '#';
        link.textContent = lesson.lesson || 'Open interne presentatie';
        link.addEventListener('click', (event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          openPresentationPanel(target);
        });
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

    if (isPresentationOpen) {
      const firstLesson = lessons.find((lesson) => Boolean(lesson.presentationId && planningPresentations[lesson.presentationId]));
      if (firstLesson) {
        openPresentationPanel(buildPresentationTarget(firstLesson));
      } else {
        closePresentationPanel();
      }
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
    const now = new Date();
    const isActiveLessonNow = Boolean(
      activeAgendaEntry
      && now >= activeAgendaEntry.start
      && now <= activeAgendaEntry.end
    );
    const planAnchorDate = (agendaSourceUrl && activeAgendaEntry?.start)
      ? activeAgendaEntry.start
      : now;
    const weekInfo = currentWeekCandidates(planAnchorDate);
    const week = weekInfo.week;
    const title = (agendaSourceUrl && activeAgendaEntry && !isActiveLessonNow)
      ? 'Programma volgende les'
      : 'Programma vandaag';
    planningWeekLabelEl.textContent = `${title} · ${week.label}`;

    const classId = normalizeClassId(klasSelect?.value || '');
    const gradeId = gradeLayerFromClassId(classId);
    const weekCandidates = weekInfo.keys;
    const classWeeks = planningData[classId] || {};
    const gradeWeeks = planningData[gradeId] || {};
    const allWeeks = planningData.ALL || {};
    const classWeekKey = weekCandidates.find((key) => Boolean(classWeeks[key])) || '';
    const gradeWeekKey = weekCandidates.find((key) => Boolean(gradeWeeks[key])) || '';
    const allWeekKey = weekCandidates.find((key) => Boolean(allWeeks[key])) || '';
    const weekData = (classWeekKey || gradeWeekKey || allWeekKey)
      ? mergePlanEntries(
        allWeekKey ? allWeeks[allWeekKey] : null,
        gradeWeekKey ? gradeWeeks[gradeWeekKey] : null,
        classWeekKey ? classWeeks[classWeekKey] : null,
      )
      : null;

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
      refreshPlanningEditor();
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
      if (room) {
        setPlanningStatus('', 'ok', { room });
      } else {
        setPlanningStatus('Live gekoppeld · Lokaal onbekend', 'ok');
      }
    } else if (agendaSourceUrl) {
      setPlanningStatus('Live gekoppeld · Agenda gevonden, maar geen lesmatch voor vandaag', 'warn');
    } else {
      setPlanningStatus('Agenda niet gekoppeld · toon weekprogramma', 'info');
    }
    refreshPlanningEditor();
  }

  async function fetchPlanning() {
    if (planningStudio) {
      renderPlanning();
      return;
    }
    try {
      setPlanningStatus('Synchroniseren...', 'info');
      const url = new URL(defaultPlanningSourceUrl(), window.location.href);
      url.searchParams.set('_t', String(Date.now()));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = normalizeStudioDoc(await res.json());
      planningStudio = raw;
      savePlanningStudioToStorage();
      rebuildPlanningFromStudio();
      renderPlanning();
    } catch (err) {
      console.error('Fout bij laden jaarplanning:', err);
      setPlanningStatus('Synchronisatie mislukt', 'error');
      setPlanningItems(['Kon de interne jaarplanning niet laden.']);
      refreshPlanningEditor();
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
      updateClockMarkerTarget(new Date());
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
      updateClockMarkerTarget(new Date());
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
      updateClockMarkerTarget(new Date());
    }
  }

  function resetPlanningTimer() {
    if (planningTimer) clearInterval(planningTimer);
    planningTimer = setInterval(fetchPlanning, PLAN_REFRESH_MS);
  }

  function resetAgendaTimer() {
    if (agendaTimer) clearInterval(agendaTimer);
    if (!agendaSourceUrl) return;
    agendaTimer = setInterval(fetchAgenda, PLAN_REFRESH_MS);
  }

  function setEditorFileStatus(message, isError = false) {
    if (!planningEditorFileStatus) return;
    planningEditorFileStatus.textContent = message;
    planningEditorFileStatus.style.color = isError ? '#9f1d1d' : '';
  }

  function canonicalClassId(rawClassId) {
    const normalized = normalizeClassId(rawClassId);
    const prefixed = normalized.match(/^G([1-4][A-Z])$/);
    if (prefixed) return prefixed[1];
    return normalized;
  }

  function studioWeekCandidates(weekNo) {
    const week = String(Math.max(1, Math.min(53, Number(weekNo) || 1)));
    const padded = String(Number(week)).padStart(2, '0');
    const isoYear = isoWeekInfo().id.split('-W')[0];
    return [week, padded, `W${padded}`, `${isoYear}-W${padded}`];
  }

  function studioContext() {
    const fallbackWeek = isoWeekInfo().weekNo;
    const weekNo = Math.max(1, Math.min(53, Number(planningStudioWeekInput?.value || fallbackWeek) || fallbackWeek));
    const classId = canonicalClassId(planningStudioClassSelect?.value || klasSelect?.value || '');
    return { classId, weekNo, weekKeys: studioWeekCandidates(weekNo) };
  }

  function parseLessonsFromEditor() {
    const lines = String(planningEditorLessons?.value || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const out = [];
    for (const line of lines) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 3) {
        const [slot, project, lesson] = parts;
        const row = { project, lesson };
        if (/^[ABC]$/i.test(slot)) row.lessonKey = slot.toUpperCase();
        if (project || lesson) out.push(row);
      } else if (parts.length === 2) {
        const [project, lesson] = parts;
        if (project || lesson) out.push({ project, lesson });
      } else if (parts.length === 1) {
        out.push({ project: parts[0], lesson: '' });
      }
    }
    return out;
  }

  function editorPayload() {
    return {
      lessons: parseLessonsFromEditor(),
      items: String(planningEditorItems?.value || '').split('\n').map((l) => l.trim()).filter(Boolean),
      note: String(planningEditorNote?.value || '').trim(),
    };
  }

  function upsertStudioEntry() {
    if (!planningStudio) planningStudio = normalizeStudioDoc({});
    if (!Array.isArray(planningStudio.entries)) planningStudio.entries = [];
    const { classId, weekNo, weekKeys } = studioContext();
    if (!classId) return null;

    let target = planningStudio.entries.find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      if (normalizeClassId(entry.classId) !== normalizeClassId(classId)) return false;
      return weekKeys.includes(String(entry.week || '').trim().toUpperCase());
    });
    if (!target) {
      target = { classId, week: String(weekNo), lessons: [], items: [] };
      planningStudio.entries.push(target);
    }

    const payload = editorPayload();
    target.classId = classId;
    target.week = String(weekNo);
    target.lessons = payload.lessons;
    target.items = payload.items;
    if (payload.note) target.note = payload.note;
    else delete target.note;

    planningStudio.updatedAt = new Date().toISOString();
    savePlanningStudioToStorage();
    rebuildPlanningFromStudio();
    return { classId, weekNo };
  }

  function clearStudioEntry() {
    if (!planningStudio || !Array.isArray(planningStudio.entries)) return null;
    const { classId, weekNo, weekKeys } = studioContext();
    if (!classId) return null;
    planningStudio.entries = planningStudio.entries.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      if (normalizeClassId(entry.classId) !== normalizeClassId(classId)) return true;
      return !weekKeys.includes(String(entry.week || '').trim().toUpperCase());
    });
    planningStudio.updatedAt = new Date().toISOString();
    savePlanningStudioToStorage();
    rebuildPlanningFromStudio();
    return { classId, weekNo };
  }

  function fillStudioClassOptions() {
    if (!planningStudioClassSelect) return;
    const set = new Set();
    for (const option of [...(klasSelect?.options || [])]) {
      const c = canonicalClassId(option.value);
      if (c) set.add(c);
    }
    for (const entry of planningStudio?.entries || []) {
      const c = canonicalClassId(entry?.classId || '');
      if (c) set.add(c);
    }
    const options = [...set].sort();
    planningStudioClassSelect.innerHTML = '';
    for (const c of options) {
      const option = document.createElement('option');
      option.value = c;
      option.textContent = c;
      planningStudioClassSelect.appendChild(option);
    }
    if (options.length && !planningStudioClassSelect.value) {
      planningStudioClassSelect.value = canonicalClassId(klasSelect?.value || '') || options[0];
    }
  }

  function formatLessonsForEditor(lessons = []) {
    return lessons.map((lesson) => {
      const slot = String(lesson?.lessonKey || '').trim().toUpperCase();
      const project = String(lesson?.project || '').trim();
      const rowLesson = String(lesson?.lesson || '').trim();
      return slot ? `${slot} | ${project} | ${rowLesson}` : `${project} | ${rowLesson}`;
    }).join('\n');
  }

  function refreshPlanningEditor() {
    if (!planningEditorMeta || !planningEditorItems || !planningEditorNote || !planningEditorLessons) return;
    fillStudioClassOptions();
    const { classId, weekNo, weekKeys } = studioContext();
    if (planningStudioWeekInput && !planningStudioWeekInput.value) {
      planningStudioWeekInput.value = String(weekNo);
    }
    if (!classId) {
      planningEditorMeta.textContent = 'Geen klas geselecteerd.';
      planningEditorLessons.value = '';
      planningEditorItems.value = '';
      planningEditorNote.value = '';
      return;
    }
    const entry = getStudioEntry(classId, weekKeys) || { lessons: [], items: [], note: '' };
    planningEditorMeta.textContent = `Studio · klas ${classId} · week ${weekNo}`;
    planningEditorLessons.value = formatLessonsForEditor(entry.lessons || []);
    planningEditorItems.value = (entry.items || []).join('\n');
    planningEditorNote.value = String(entry.note || '');
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

  planningEditorSaveBtn?.addEventListener('click', () => {
    const updated = upsertStudioEntry();
    if (!updated) return;
    renderPlanning();
    setEditorFileStatus(`Studio opgeslagen: ${updated.classId} week ${updated.weekNo}.`);
  });

  planningEditorClearBtn?.addEventListener('click', () => {
    const cleared = clearStudioEntry();
    if (!cleared) return;
    renderPlanning();
    setEditorFileStatus(`Studio-week leeggemaakt: ${cleared.classId} week ${cleared.weekNo}.`);
  });

  planningStudioClassSelect?.addEventListener('change', () => {
    refreshPlanningEditor();
  });

  planningStudioWeekInput?.addEventListener('input', () => {
    refreshPlanningEditor();
  });

  planningStudioResetBtn?.addEventListener('click', async () => {
    localStorage.removeItem(PLAN_STUDIO_KEY);
    planningStudio = null;
    await fetchPlanning();
    renderPlanning();
    setEditorFileStatus('Studio teruggezet naar interne basisplanning.');
  });

  planningRefreshBtn?.addEventListener('click', () => {
    fetchPlanning();
    fetchAgenda();
  });

  presentationBackBtn?.addEventListener('click', () => {
    closePresentationPanel();
  });
  presentationFullscreenBtn?.addEventListener('click', () => {
    togglePresentationFullscreen();
  });
  presentationPrevBtn?.addEventListener('click', () => {
    if (!activePresentation) return;
    activeSlideIndex = Math.max(0, activeSlideIndex - 1);
    renderInternalSlide();
  });
  presentationNextBtn?.addEventListener('click', () => {
    if (!activePresentation) return;
    const total = Array.isArray(activePresentation.slides) ? activePresentation.slides.length : 0;
    activeSlideIndex = Math.min(Math.max(0, total - 1), activeSlideIndex + 1);
    renderInternalSlide();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isPresentationOpen) {
      closePresentationPanel();
    }
    if (isPresentationOpen && activePresentation) {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        activeSlideIndex = Math.max(0, activeSlideIndex - 1);
        renderInternalSlide();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        const total = Array.isArray(activePresentation.slides) ? activePresentation.slides.length : 0;
        activeSlideIndex = Math.min(Math.max(0, total - 1), activeSlideIndex + 1);
        renderInternalSlide();
      }
    }
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
    if (planningStudioClassSelect) {
      planningStudioClassSelect.value = canonicalClassId(klasSelect.value);
    }
    renderPlanning();
    updateClockMarkerTarget(new Date());
  });

  planningStudio = loadPlanningStudioFromStorage();
  if (planningStudio) {
    rebuildPlanningFromStudio();
  } else {
    await fetchPlanning();
  }
  if (planningStudioWeekInput) planningStudioWeekInput.value = String(isoWeekInfo().weekNo);
  if (planningStudioClassSelect) planningStudioClassSelect.value = canonicalClassId(klasSelect?.value || '');
  setEditorFileStatus('Jaarplanning Studio actief (intern).');
  resetPlanningTimer();
  renderPlanning();

  applyAgendaSource(resolveAgendaSourceUrl(), false);
  window.addEventListener('storage', (event) => {
    if (event.key !== PLAN_STUDIO_KEY) return;
    const latest = loadPlanningStudioFromStorage();
    if (!latest) return;
    planningStudio = latest;
    rebuildPlanningFromStudio();
    renderPlanning();
  });
  if (clockMarkerTimer) clearInterval(clockMarkerTimer);
  clockMarkerTimer = setInterval(() => updateClockMarkerTarget(new Date()), 30 * 1000);
  updateClockMarkerTarget(new Date());
});
