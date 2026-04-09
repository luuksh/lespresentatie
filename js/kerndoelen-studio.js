import {
  buildProjectSnapshot,
  clearStoredKerndoelenDoc,
  loadKerndoelenDoc,
  recomputeKerndoelenStats,
  saveStoredKerndoelenDoc,
  slugifyProject,
} from './kerndoelen-data.js';

const DATA_URL = 'data/kerndoelen/kerndoelen-map.json';

const projectSelect = document.getElementById('projectSelect');
const projectStats = document.getElementById('projectStats');
const sourceLine = document.getElementById('sourceLine');
const projectTitle = document.getElementById('projectTitle');
const projectMeta = document.getElementById('projectMeta');
const assessmentSummaryInput = document.getElementById('assessmentSummaryInput');
const studentDescriptionInput = document.getElementById('studentDescriptionInput');
const teacherNotesInput = document.getElementById('teacherNotesInput');
const magisterNoteInput = document.getElementById('magisterNoteInput');
const skillsChips = document.getElementById('skillsChips');
const goalsChips = document.getElementById('goalsChips');
const skillRationale = document.getElementById('skillRationale');
const sourceBasis = document.getElementById('sourceBasis');
const recordSearchInput = document.getElementById('recordSearchInput');
const recordsBody = document.getElementById('recordsBody');
const saveDocBtn = document.getElementById('saveDocBtn');
const exportDocBtn = document.getElementById('exportDocBtn');
const exportWorkbookBtn = document.getElementById('exportWorkbookBtn');
const exportReportBtn = document.getElementById('exportReportBtn');
const resetDocBtn = document.getElementById('resetDocBtn');

const state = {
  doc: null,
  selectedProjectId: '',
  search: '',
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function statusLabel(status) {
  if (status === 'focus') return 'Eindbeoordeling';
  if (status === 'support') return 'Ondersteunend';
  return 'Niet gekoppeld';
}

function renderChips(container, values, emptyText) {
  container.replaceChildren();
  if (!values.length) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = emptyText;
    container.appendChild(chip);
    return;
  }
  for (const value of values) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = value;
    container.appendChild(chip);
  }
}

function currentProject() {
  return state.doc?.projects?.find((project) => project.id === state.selectedProjectId) || null;
}

function updateProjectField(field, value) {
  const project = currentProject();
  if (!project) return;
  project[field] = String(value || '').trim();
  state.doc = recomputeKerndoelenStats(state.doc);
}

function renderProjectSelect() {
  projectSelect.replaceChildren();
  for (const project of state.doc?.projects || []) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    projectSelect.appendChild(option);
  }
  projectSelect.value = state.selectedProjectId;
}

function renderStats(snapshot) {
  const project = snapshot?.project || currentProject();
  const stats = [
    { label: 'Eindlabels', value: project?.stats?.focus || 0 },
    { label: 'Ondersteunend', value: project?.stats?.support || 0 },
    { label: 'Vaardigheden', value: snapshot?.skills?.length || 0 },
    { label: 'Rijen totaal', value: snapshot?.records?.length || 0 },
  ];
  projectStats.innerHTML = stats.map((item) => `
    <article class="stat-card">
      <p class="stat-value">${escapeHtml(item.value)}</p>
      <p class="stat-label">${escapeHtml(item.label)}</p>
    </article>
  `).join('');
}

function filteredRecords(snapshot) {
  const query = state.search.trim().toLowerCase();
  if (!query) return snapshot.records;
  return snapshot.records.filter((record) => (
    [
      record.label,
      record.subgoalCode,
      record.subgoal,
      record.kerndoel,
      record.magisterSkill,
      record.phase,
      record.note,
    ].join('\n').toLowerCase().includes(query)
  ));
}

function renderRecords(snapshot) {
  const rows = filteredRecords(snapshot);
  if (!rows.length) {
    recordsBody.innerHTML = '<tr><td colspan="6">Geen labels gevonden voor dit filter.</td></tr>';
    return;
  }
  recordsBody.innerHTML = rows.map((record) => {
    const status = record.projects?.[snapshot.project.id] || '';
    return `
      <tr>
        <td>
          <select class="record-select" data-record-id="${escapeHtml(record.id)}">
            <option value=""${status ? '' : ' selected'}>Niet gekoppeld</option>
            <option value="support"${status === 'support' ? ' selected' : ''}>Ondersteunend</option>
            <option value="focus"${status === 'focus' ? ' selected' : ''}>Eindbeoordeling</option>
          </select>
          <div class="status-pill ${status === 'focus' ? 'status-pill-focus' : status === 'support' ? 'status-pill-support' : 'status-pill-empty'}">${escapeHtml(statusLabel(status))}</div>
        </td>
        <td><strong>${escapeHtml(record.label)}</strong></td>
        <td>${escapeHtml(`${record.subgoalCode} · ${record.subgoal}`)}</td>
        <td>${escapeHtml(record.magisterSkill || 'Onbekend')}</td>
        <td>${escapeHtml(record.phase || '-')}</td>
        <td>${escapeHtml(record.note || '-')}</td>
      </tr>
    `;
  }).join('');
}

function renderEditor() {
  const snapshot = buildProjectSnapshot(state.doc, state.selectedProjectId);
  const project = snapshot?.project;
  if (!project || !snapshot) return;

  projectTitle.textContent = project.name;
  projectMeta.textContent = `${snapshot.focusRecords.length} eindlabels · ${snapshot.supportRecords.length} ondersteunende labels`;
  assessmentSummaryInput.value = project.assessmentSummary || '';
  studentDescriptionInput.value = project.studentFacingDescription || '';
  teacherNotesInput.value = project.teacherNotes || '';
  magisterNoteInput.value = project.magisterNote || '';
  renderStats(snapshot);
  renderChips(skillsChips, snapshot.skills, 'Nog geen eindvaardigheden');
  renderChips(goalsChips, snapshot.goals, 'Nog geen subkerndoelen');
  if (skillRationale) {
    skillRationale.textContent = project.skillRationale
      || 'Deze projectvaardigheden zijn nog niet inhoudelijk onderbouwd.';
  }
  if (sourceBasis) {
    sourceBasis.textContent = project.sourceBasis
      ? `Bron voor koppeling: ${project.sourceBasis}`
      : 'Nog geen bronnotitie voor deze projectkoppeling.';
  }
  renderRecords(snapshot);
}

function exportDoc() {
  const payload = JSON.stringify(recomputeKerndoelenStats(state.doc), null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([`${payload}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kerndoelen-projecten-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function timestampStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function projectRowsForExport(doc) {
  return (doc?.projects || []).map((project) => {
    const snapshot = buildProjectSnapshot(doc, project.id);
    return {
      project,
      snapshot,
    };
  });
}

function projectMarker(status) {
  if (status === 'focus') return 'X';
  if (status === 'support') return '~';
  return '';
}

function excelColumnName(index) {
  let value = index;
  let out = '';
  while (value >= 0) {
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  }
  return out;
}

function sheetXml(name, rows, widths = []) {
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const lastCell = maxColumns ? `${excelColumnName(maxColumns - 1)}${rows.length || 1}` : 'A1';
  const colsXml = widths.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rowsXml = rows.map((row, rowIndex) => {
    const cellsXml = row.map((cell, columnIndex) => {
      const ref = `${excelColumnName(columnIndex)}${rowIndex + 1}`;
      if (typeof cell === 'number') {
        return `<c r="${ref}"${rowIndex === 0 ? ' s="1"' : ''}><v>${cell}</v></c>`;
      }
      const text = String(cell ?? '');
      return `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cellsXml}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

function buildExcelWorkbook(doc) {
  const rows = projectRowsForExport(doc);
  const projectNames = rows.map(({ project }) => project.name);
  const matrixHeader = [
    'Kerndoel nr',
    'Kerndoel',
    'Subkerndoel code',
    'Subkerndoel',
    'Label',
    'Vaardigheid',
    'Leerjaar',
    'Specificatie',
    ...projectNames,
    'Opmerking',
  ];
  const matrixRows = [
    matrixHeader,
    ...(doc?.records || []).map((record) => [
      record.kerndoelNumber || '',
      record.kerndoel || '',
      record.subgoalCode || '',
      record.subgoal || '',
      record.label || '',
      record.magisterSkill || '',
      record.phase || '',
      record.specification || '',
      ...rows.map(({ project }) => projectMarker(record.projects?.[project.id] || '')),
      record.note || '',
    ]),
  ];

  const overviewRows = [
    ['Veld', 'Waarde'],
    ['Gegenereerd op', new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())],
    ['Bronbestand', doc?.sourceWorkbook || 'Onbekend'],
    ['Aantal projecten', rows.length],
    ['Aantal labels', (doc?.records || []).length],
    ['Aantal Magister-vaardigheden', (doc?.magisterSkills || []).length],
    ['Aantal kerndoelen/subkerndoelen', (doc?.goals || []).length],
  ];

  const projectRows = [
    [
      'Project',
      'Kolom in bronblad',
      'Hoofdvaardigheid',
      'Ondersteunende vaardigheden',
      'Focuslabels',
      'Ondersteunende labels',
      'Samenvatting voor Magister',
      'Tekst voor leerlingenplatform',
      'Docentnotitie',
      'Magister-notitie',
      'Bron voor koppeling',
      'Onderbouwing',
    ],
    ...rows.map(({ project, snapshot }) => [
      project.name,
      project.column || '',
      project.primaryMagisterSkill || '',
      (project.secondaryMagisterSkills || []).join(', '),
      snapshot.focusRecords.length,
      snapshot.supportRecords.length,
      project.assessmentSummary || '',
      project.studentFacingDescription || '',
      project.teacherNotes || '',
      project.magisterNote || '',
      project.sourceBasis || '',
      project.skillRationale || '',
    ]),
  ];

  const statusRows = [
    ['Waarde in matrix', 'Betekenis'],
    ['X', 'Eindbeoordeling / focuslabel'],
    ['~', 'Ondersteunend label'],
    ['', 'Niet gekoppeld'],
  ];

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="17640"/>
  </bookViews>
  <sheets>
    <sheet name="01_specificaties_long" sheetId="1" r:id="rId1"/>
    <sheet name="02_projectkaarten" sheetId="2" r:id="rId2"/>
    <sheet name="03_overzicht" sheetId="3" r:id="rId3"/>
    <sheet name="04_legenda" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F5A68"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

  const files = [
    ['[Content_Types].xml', contentTypesXml],
    ['_rels/.rels', rootRelsXml],
    ['xl/workbook.xml', workbookXml],
    ['xl/_rels/workbook.xml.rels', workbookRelsXml],
    ['xl/styles.xml', stylesXml],
    ['xl/worksheets/sheet1.xml', sheetXml('01_specificaties_long', matrixRows, [12, 30, 14, 34, 34, 20, 16, 22, ...projectNames.map(() => 16), 28])],
    ['xl/worksheets/sheet2.xml', sheetXml('02_projectkaarten', projectRows, [22, 14, 18, 28, 14, 18, 34, 40, 28, 28, 32, 44])],
    ['xl/worksheets/sheet3.xml', sheetXml('03_overzicht', overviewRows, [28, 80])],
    ['xl/worksheets/sheet4.xml', sheetXml('04_legenda', statusRows, [22, 34])],
  ];

  return createZipBlob(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function createZipBlob(entries, mimeType) {
  const normalized = entries.map(([name, content]) => {
    const nameBytes = utf8Bytes(name);
    const dataBytes = typeof content === 'string' ? utf8Bytes(content) : content;
    return {
      nameBytes,
      dataBytes,
      crc: crc32(dataBytes),
    };
  });

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of normalized) {
    const localHeader = new Uint8Array(30 + entry.nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, entry.crc);
    writeUint32(localView, 18, entry.dataBytes.length);
    writeUint32(localView, 22, entry.dataBytes.length);
    writeUint16(localView, 26, entry.nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(entry.nameBytes, 30);
    localParts.push(localHeader, entry.dataBytes);

    const centralHeader = new Uint8Array(46 + entry.nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, entry.crc);
    writeUint32(centralView, 20, entry.dataBytes.length);
    writeUint32(centralView, 24, entry.dataBytes.length);
    writeUint16(centralView, 28, entry.nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(entry.nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + entry.dataBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, normalized.length);
  writeUint16(endView, 10, normalized.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  return new Blob([...localParts, ...centralParts, endHeader], { type: mimeType });
}

function buildReportHtml(doc) {
  const rows = projectRowsForExport(doc);
  const generatedAt = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  const projectSections = rows.map(({ project, snapshot }) => `
    <section class="report-project">
      <header class="report-project-head">
        <div>
          <p class="report-kicker">Projectkaart</p>
          <h2>${escapeHtml(project.name)}</h2>
        </div>
        <div class="report-badges">
          <span class="report-badge">Hoofdvaardigheid: ${escapeHtml(project.primaryMagisterSkill || 'Nog niet ingevuld')}</span>
          <span class="report-badge">Focuslabels: ${escapeHtml(snapshot.focusRecords.length)}</span>
          <span class="report-badge">Ondersteunend: ${escapeHtml(snapshot.supportRecords.length)}</span>
        </div>
      </header>
      <div class="report-grid">
        <article class="report-card">
          <h3>Magister en leerlinguitleg</h3>
          <p><strong>Samenvatting:</strong> ${escapeHtml(project.assessmentSummary || '-')}</p>
          <p><strong>Leerlingenplatform:</strong> ${escapeHtml(project.studentFacingDescription || '-')}</p>
          <p><strong>Magister-notitie:</strong> ${escapeHtml(project.magisterNote || '-')}</p>
          <p><strong>Docentnotitie:</strong> ${escapeHtml(project.teacherNotes || '-')}</p>
        </article>
        <article class="report-card">
          <h3>Vaardigheidskoppeling</h3>
          <p><strong>Hoofdvaardigheid:</strong> ${escapeHtml(project.primaryMagisterSkill || '-')}</p>
          <p><strong>Ondersteunend:</strong> ${escapeHtml((project.secondaryMagisterSkills || []).join(', ') || '-')}</p>
          <p><strong>Bron:</strong> ${escapeHtml(project.sourceBasis || '-')}</p>
          <p><strong>Onderbouwing:</strong> ${escapeHtml(project.skillRationale || '-')}</p>
        </article>
      </div>
      <div class="report-grid">
        <article class="report-card">
          <h3>Focuslabels</h3>
          <ul>${snapshot.focusRecords.map((record) => `<li><strong>${escapeHtml(record.magisterSkill)}</strong>: ${escapeHtml(record.label)}</li>`).join('')}</ul>
        </article>
        <article class="report-card">
          <h3>Ondersteunende labels</h3>
          <ul>${snapshot.supportRecords.map((record) => `<li><strong>${escapeHtml(record.magisterSkill)}</strong>: ${escapeHtml(record.label)}</li>`).join('')}</ul>
        </article>
      </div>
    </section>
  `).join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kerndoelenrapport</title>
  <style>
    :root {
      --bg: #f4ecdf;
      --surface: #fffdf8;
      --line: rgba(29, 38, 51, 0.12);
      --ink: #182330;
      --muted: #5d6a7a;
      --accent: #0f5a68;
      --warm: #b76a17;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Avenir Next", "Gill Sans", sans-serif; color: var(--ink); background: linear-gradient(180deg, #fbf8f2, var(--bg)); }
    .report-shell { width: min(1240px, calc(100vw - 40px)); margin: 0 auto; padding: 28px 0 56px; display: grid; gap: 18px; }
    .report-hero, .report-project, .report-card { border: 1px solid var(--line); border-radius: 22px; background: rgba(255,255,255,0.88); box-shadow: 0 20px 60px rgba(30,24,15,0.08); }
    .report-hero { padding: 28px; }
    .report-kicker { margin: 0 0 8px; font-size: 12px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--warm); }
    h1, h2, h3 { margin: 0; }
    .report-meta { color: var(--muted); line-height: 1.7; margin-top: 10px; }
    .report-summary { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-top: 18px; }
    .report-chip { padding: 14px 16px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); }
    .report-project { padding: 22px; display: grid; gap: 16px; }
    .report-project-head { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
    .report-badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .report-badge { display: inline-flex; min-height: 30px; align-items: center; padding: 0 12px; border-radius: 999px; background: rgba(15,90,104,0.08); color: var(--accent); font-weight: 700; }
    .report-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
    .report-card { padding: 18px; }
    .report-card h3 { margin-bottom: 10px; }
    .report-card p, .report-card li { line-height: 1.6; color: var(--muted); }
    .report-card ul { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
    @media print { body { background: #fff; } .report-shell { width: auto; padding: 0; } }
    @media (max-width: 900px) { .report-summary, .report-grid { grid-template-columns: 1fr; } .report-project-head { flex-direction: column; } .report-badges { justify-content: flex-start; } }
  </style>
</head>
<body>
  <main class="report-shell">
    <section class="report-hero">
      <p class="report-kicker">Kerndoelen Studio</p>
      <h1>Totaaloverzicht Kerndoelen, Labels en Magister-vaardigheden</h1>
      <p class="report-meta">Gegenereerd op ${escapeHtml(generatedAt)}. Dit rapport bundelt per project de hoofdvaardigheid, ondersteunende vaardigheden, leerlinguitleg, docentnotities en alle focus- en ondersteunende labels. Geschikt als bespreekstuk voor collega’s, MT en inspectie.</p>
      <div class="report-summary">
        <div class="report-chip"><strong>${escapeHtml(doc.projects.length)}</strong><br />projecten</div>
        <div class="report-chip"><strong>${escapeHtml(doc.records.length)}</strong><br />labels</div>
        <div class="report-chip"><strong>${escapeHtml(doc.magisterSkills.length)}</strong><br />Magister-vaardigheden</div>
        <div class="report-chip"><strong>${escapeHtml(doc.sourceWorkbook || 'Onbekend')}</strong><br />bronbestand</div>
      </div>
    </section>
    ${projectSections}
  </main>
</body>
</html>`;
}

function exportWorkbook() {
  const workbook = buildExcelWorkbook(recomputeKerndoelenStats(state.doc));
  downloadBlob(`kerndoelen-overzicht-${timestampStamp()}.xlsx`, workbook);
}

function exportReport() {
  const html = buildReportHtml(recomputeKerndoelenStats(state.doc));
  downloadBlob(`kerndoelen-rapport-${timestampStamp()}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
}

function saveDoc() {
  state.doc = saveStoredKerndoelenDoc(state.doc);
  renderEditor();
}

async function boot() {
  state.doc = await loadKerndoelenDoc(DATA_URL);
  state.selectedProjectId = state.doc?.projects?.[0]?.id || '';
  renderProjectSelect();
  renderEditor();
  sourceLine.textContent = state.doc?.sourceWorkbook
    ? `Bron: ${state.doc.sourceWorkbook}`
    : 'Bronbestand onbekend';
}

projectSelect?.addEventListener('change', () => {
  state.selectedProjectId = slugifyProject(projectSelect.value);
  renderEditor();
});

recordSearchInput?.addEventListener('input', () => {
  state.search = recordSearchInput.value;
  renderEditor();
});

assessmentSummaryInput?.addEventListener('input', () => {
  updateProjectField('assessmentSummary', assessmentSummaryInput.value);
});

studentDescriptionInput?.addEventListener('input', () => {
  updateProjectField('studentFacingDescription', studentDescriptionInput.value);
});

teacherNotesInput?.addEventListener('input', () => {
  updateProjectField('teacherNotes', teacherNotesInput.value);
});

magisterNoteInput?.addEventListener('input', () => {
  updateProjectField('magisterNote', magisterNoteInput.value);
});

recordsBody?.addEventListener('change', (event) => {
  const select = event.target instanceof HTMLSelectElement ? event.target : null;
  if (!select) return;
  const recordId = String(select.dataset.recordId || '').trim();
  const record = state.doc?.records?.find((item) => item.id === recordId);
  if (!record) return;
  const nextValue = String(select.value || '').trim();
  if (!nextValue) delete record.projects[state.selectedProjectId];
  else record.projects[state.selectedProjectId] = nextValue;
  state.doc = recomputeKerndoelenStats(state.doc);
  renderEditor();
});

saveDocBtn?.addEventListener('click', () => {
  saveDoc();
});

exportDocBtn?.addEventListener('click', () => {
  exportDoc();
});

exportWorkbookBtn?.addEventListener('click', () => {
  exportWorkbook();
});

exportReportBtn?.addEventListener('click', () => {
  exportReport();
});

resetDocBtn?.addEventListener('click', async () => {
  clearStoredKerndoelenDoc();
  state.search = '';
  recordSearchInput.value = '';
  await boot();
});

boot().catch((error) => {
  sourceLine.textContent = `Laden mislukt: ${error?.message || error}`;
});
