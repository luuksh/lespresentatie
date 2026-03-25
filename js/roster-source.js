(function initRosterSource() {
  const LIVE_PATH = 'js/zermelo-leerlingen-live.json';
  const FALLBACK_PATH = 'js/leerlingen_per_klas.json';
  let rosterPromise = null;

  function normalizeName(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function numberToLetter(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 26) return '';
    return String.fromCharCode(64 + n);
  }

  function letterToNumber(value) {
    const ch = String(value || '').trim().toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return '';
    return String(ch.charCodeAt(0) - 64);
  }

  function normalizeClassId(value) {
    const raw = String(value || '').replace(/\s+/g, '').toUpperCase();
    if (!raw) return '';

    const netl = raw.match(/^NETL(\d+)$/);
    if (netl) {
      const letter = numberToLetter(netl[1]);
      return letter ? `G4${letter}` : raw;
    }

    const dotNetl = raw.match(/^G(\d)\.NETL(\d+)$/);
    if (dotNetl) {
      const letter = numberToLetter(dotNetl[2]);
      return letter ? `G${dotNetl[1]}${letter}` : raw;
    }

    if (/^G[1-6][A-Z]$/.test(raw)) return raw;

    const legacy = raw.match(/^([1-6])G(\d+)$/);
    if (legacy) {
      const letter = numberToLetter(legacy[2]);
      return letter ? `G${legacy[1]}${letter}` : raw;
    }

    return raw;
  }

  function classIdAliases(value) {
    const normalized = normalizeClassId(value);
    if (!normalized) return [];
    const aliases = new Set([normalized]);

    const modern = normalized.match(/^G([1-6])([A-Z])$/);
    if (modern) {
      const number = letterToNumber(modern[2]);
      if (number) aliases.add(`${modern[1]}G${number}`);
    }

    return [...aliases];
  }

  function uniqueNames(values) {
    const seen = new Set();
    const out = [];
    for (const value of Array.isArray(values) ? values : []) {
      const name = normalizeName(value);
      if (!name) continue;
      const key = name.toLocaleLowerCase('nl-NL');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }

  function studentsFromValue(value) {
    if (Array.isArray(value)) {
      return uniqueNames(
        value.map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            return item.name || item.fullName || item.displayName || item.studentName || item.student;
          }
          return '';
        })
      );
    }

    if (value && typeof value === 'object') {
      const direct = value.students || value.names || value.roster || value.items || value.users;
      if (Array.isArray(direct)) return studentsFromValue(direct);
    }

    return [];
  }

  function mergeClassLists(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.entries(source).forEach(([rawClassId, value]) => {
      const label = String(rawClassId || '').replace(/\s+/g, '').toUpperCase();
      const students = studentsFromValue(value);
      if (!label || !students.length) return;
      target[label] = students;
    });
    return target;
  }

  function classMapFromRows(rows) {
    const out = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== 'object') continue;
      const classId = normalizeClassId(
        row.classId || row.class || row.group || row.groupName || row.roster || row.code
      );
      if (!classId) continue;
      const students = studentsFromValue(row.students || row.names || row.roster || row.items || row.users);
      if (students.length) {
        out[classId] = students;
        continue;
      }
      const name = normalizeName(
        row.studentName || row.name || row.fullName || row.displayName || row.student
      );
      if (!name) continue;
      if (!out[classId]) out[classId] = [];
      out[classId].push(name);
    }
    Object.keys(out).forEach((key) => {
      out[key] = uniqueNames(out[key]);
    });
    return out;
  }

  function payloadToClassMap(payload) {
    if (!payload || typeof payload !== 'object') return {};

    if (Array.isArray(payload)) {
      return classMapFromRows(payload);
    }

    if (payload.classes && typeof payload.classes === 'object') {
      return mergeClassLists({}, payload.classes);
    }

    if (Array.isArray(payload.entries)) {
      return classMapFromRows(payload.entries);
    }

    if (Array.isArray(payload.data)) {
      return classMapFromRows(payload.data);
    }

    if (payload.response && Array.isArray(payload.response.data)) {
      return classMapFromRows(payload.response.data);
    }

    return mergeClassLists({}, payload);
  }

  async function fetchJson(path) {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function mergeRosters(base, overlay) {
    return {
      ...base,
      ...overlay
    };
  }

  async function loadRosterData() {
    if (!rosterPromise) {
      rosterPromise = Promise.all([
        fetchJson(FALLBACK_PATH),
        fetchJson(LIVE_PATH)
      ]).then(([fallbackPayload, livePayload]) => {
        const fallback = payloadToClassMap(fallbackPayload);
        const live = payloadToClassMap(livePayload);
        return mergeRosters(fallback, live);
      });
    }
    return rosterPromise;
  }

  async function loadStudentsForClass(classId) {
    const roster = await loadRosterData();
    const aliases = new Set(classIdAliases(classId));
    for (const [rawClassId, students] of Object.entries(roster || {})) {
      if (!aliases.has(normalizeClassId(rawClassId))) continue;
      if (Array.isArray(students) && students.length) return students.slice();
    }
    return [];
  }

  async function listClassIds() {
    const roster = await loadRosterData();
    const grouped = new Map();

    Object.keys(roster || {}).forEach((rawClassId) => {
      const normalized = normalizeClassId(rawClassId);
      if (!normalized) return;
      if (!grouped.has(normalized)) grouped.set(normalized, []);
      grouped.get(normalized).push(rawClassId);
    });

    const preferred = [];
    grouped.forEach((labels) => {
      const legacy = labels.find((label) => /^[1-6]G\d+$/.test(label));
      preferred.push(legacy || labels[0]);
    });

    return preferred.sort((a, b) => a.localeCompare(b, 'nl-NL', { numeric: true, sensitivity: 'base' }));
  }

  async function hasLiveRosterForClass(classId) {
    const livePayload = await fetchJson(LIVE_PATH);
    const liveRoster = payloadToClassMap(livePayload);
    const aliases = new Set(classIdAliases(classId));
    for (const rawClassId of Object.keys(liveRoster || {})) {
      if (aliases.has(normalizeClassId(rawClassId))) return true;
    }
    return false;
  }

  window.__rosterSource = {
    LIVE_PATH,
    FALLBACK_PATH,
    normalizeClassId,
    classIdAliases,
    listClassIds,
    loadRosterData,
    loadStudentsForClass,
    hasLiveRosterForClass
  };
})();
