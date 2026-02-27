import { kiesIndeling } from './indeling.js';

document.addEventListener('DOMContentLoaded', async () => {
  const indelingSelect = document.getElementById('indelingSelect');
  const klasSelect = document.getElementById('klasSelect');
  const grid = document.getElementById('plattegrond');
  const LAST_LAYOUT_KEY = 'lespresentatie.lastLayoutType';
  const PLAN_SOURCE_KEY = 'lespresentatie.jaarplanningSourceUrl';
  const PLAN_REFRESH_MS = 5 * 60 * 1000;

  const planningWeekLabelEl = document.getElementById('jaarplanningWeekLabel');
  const planningItemsEl = document.getElementById('jaarplanningItems');
  const planningStatusEl = document.getElementById('jaarplanningStatus');
  const planningLastUpdateEl = document.getElementById('jaarplanningLastUpdate');
  const planningSourceInput = document.getElementById('jaarplanningSourceInput');
  const planningSourceSaveBtn = document.getElementById('jaarplanningSourceSave');
  const planningSourceClearBtn = document.getElementById('jaarplanningSourceClear');
  const planningRefreshBtn = document.getElementById('jaarplanningRefreshBtn');

  let planningData = {};
  let planningUpdatedAt = '';
  let planningTimer = null;
  let planningSourceUrl = '';

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

  function normalizePlanEntry(entry) {
    if (Array.isArray(entry) || typeof entry === 'string') {
      return { items: coerceItems(entry), note: '' };
    }
    if (!entry || typeof entry !== 'object') {
      return { items: [], note: '' };
    }
    const items = coerceItems(
      entry.items
      ?? entry.programma
      ?? entry.program
      ?? entry.topics
      ?? entry.onderwerpen
      ?? ''
    );
    const note = String(entry.note ?? entry.opmerking ?? '').trim();
    return { items, note };
  }

  function buildPlanningIndex(raw) {
    const index = {};
    const classAliases = (classId) => {
      const cid = normalizeClassId(classId);
      if (!cid) return [];
      const aliases = new Set([cid]);
      if (/^G\d[A-Z]$/.test(cid)) aliases.add(cid.slice(1));
      if (/^\d[A-Z]$/.test(cid)) aliases.add(`G${cid}`);
      return [...aliases];
    };
    const addWeek = (classId, weekId, payload) => {
      const wid = String(weekId || '').trim().toUpperCase();
      if (!wid) return;
      for (const cid of classAliases(classId)) {
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

  function setPlanningItems(items = [], note = '') {
    if (!planningItemsEl) return;
    planningItemsEl.replaceChildren();
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

  function renderPlanning() {
    if (!planningItemsEl || !planningWeekLabelEl) return;
    const week = isoWeekInfo();
    planningWeekLabelEl.textContent = week.label;

    const classId = normalizeClassId(klasSelect?.value || '');
    const weekCandidates = [
      week.id,
      `W${String(week.weekNo).padStart(2, '0')}`,
      String(week.weekNo),
      String(week.weekNo).padStart(2, '0')
    ];
    const classWeeks = planningData[classId] || {};
    let matchedWeekKey = weekCandidates.find((key) => Boolean(classWeeks[key])) || '';
    let weekData = matchedWeekKey ? classWeeks[matchedWeekKey] : null;

    const weekNumberFromKey = (key) => {
      const text = String(key || '').toUpperCase();
      const iso = text.match(/W(\d{1,2})$/);
      if (iso) return Number(iso[1]);
      const plain = text.match(/^(\d{1,2})$/);
      if (plain) return Number(plain[1]);
      return null;
    };

    const pickFallbackWeek = () => {
      const keyed = Object.keys(classWeeks)
        .map((k) => ({ key: k, num: weekNumberFromKey(k) }))
        .filter((x) => Number.isFinite(x.num) && classWeeks[x.key]?.items?.length);
      if (!keyed.length) return null;
      const sorted = keyed.sort((a, b) => a.num - b.num);
      const next = sorted.find((x) => x.num >= week.weekNo);
      return next || sorted[0];
    };

    if (!planningSourceUrl) {
      setPlanningItems(['Koppel eerst een jaarplanning-bron in het docentpaneel.']);
      if (planningLastUpdateEl) planningLastUpdateEl.textContent = '';
      setPlanningStatus('Niet gekoppeld', 'warn');
      return;
    }

    if (!weekData || !Array.isArray(weekData.items) || !weekData.items.length) {
      const fallback = pickFallbackWeek();
      if (fallback) {
        matchedWeekKey = fallback.key;
        weekData = classWeeks[matchedWeekKey];
        planningWeekLabelEl.textContent = `Week ${fallback.num} (beschikbaar)`;
      }
    }

    if (!weekData || !Array.isArray(weekData.items) || !weekData.items.length) {
      setPlanningItems(['Geen planning gevonden voor deze klas in deze week.']);
      if (planningLastUpdateEl) {
        const stamp = planningUpdatedAt ? `Laatste sync: ${formatSyncTime(planningUpdatedAt)}` : '';
        planningLastUpdateEl.textContent = stamp;
      }
      setPlanningStatus('Geen weekitems', 'warn');
      return;
    }

    setPlanningItems(weekData.items, weekData.note);
    if (planningLastUpdateEl) {
      const stamp = planningUpdatedAt ? `Laatste sync: ${formatSyncTime(planningUpdatedAt)}` : '';
      planningLastUpdateEl.textContent = stamp;
    }
    if (matchedWeekKey && !weekCandidates.includes(matchedWeekKey)) {
      setPlanningStatus('Live gekoppeld (andere beschikbare week getoond)', 'warn');
    } else {
      setPlanningStatus('Live gekoppeld', 'ok');
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
      planningUpdatedAt = String(raw?.updatedAt || new Date().toISOString());
      renderPlanning();
    } catch (err) {
      console.error('Fout bij laden jaarplanning:', err);
      setPlanningStatus('Synchronisatie mislukt', 'error');
      setPlanningItems(['Kon de jaarplanning niet laden. Controleer de bron-URL.']);
    }
  }

  function resetPlanningTimer() {
    if (planningTimer) clearInterval(planningTimer);
    if (!planningSourceUrl) return;
    planningTimer = setInterval(fetchPlanning, PLAN_REFRESH_MS);
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
  });

  klasSelect?.addEventListener('change', renderPlanning);
  applyPlanningSource(resolvePlanningSourceUrl(), false);
});
