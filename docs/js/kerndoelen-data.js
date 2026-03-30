export const KERNDOELEN_STORAGE_KEY = 'kerndoelen.projectStudioDoc';

export function slugifyProject(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeProjects(items) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: slugifyProject(item.id || item.name || ''),
        name: String(item.name || '').trim(),
        column: Number(item.column || 0),
        primaryMagisterSkill: String(item.primaryMagisterSkill || '').trim(),
        secondaryMagisterSkills: Array.isArray(item.secondaryMagisterSkills)
          ? item.secondaryMagisterSkills.map((value) => String(value || '').trim()).filter(Boolean)
          : [],
        skillRationale: String(item.skillRationale || '').trim(),
        sourceBasis: String(item.sourceBasis || '').trim(),
        assessmentSummary: String(item.assessmentSummary || '').trim(),
        studentFacingDescription: String(item.studentFacingDescription || '').trim(),
        magisterNote: String(item.magisterNote || '').trim(),
        teacherNotes: String(item.teacherNotes || '').trim(),
        stats: {
          focus: Number(item?.stats?.focus || 0),
          support: Number(item?.stats?.support || 0),
        },
      }))
      .filter((item) => item.id && item.name)
    : [];
}

function normalizeRecords(items) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const projects = {};
        for (const [projectId, status] of Object.entries(item.projects || {})) {
          const normalizedProjectId = slugifyProject(projectId);
          const normalizedStatus = String(status || '').trim();
          if (normalizedProjectId && ['focus', 'support'].includes(normalizedStatus)) {
            projects[normalizedProjectId] = normalizedStatus;
          }
        }
        return {
          id: String(item.id || '').trim(),
          kerndoelNumber: String(item.kerndoelNumber || '').trim(),
          kerndoel: String(item.kerndoel || '').trim(),
          subgoalCode: String(item.subgoalCode || '').trim(),
          subgoal: String(item.subgoal || '').trim(),
          label: String(item.label || '').trim(),
          magisterSkill: String(item.magisterSkill || '').trim(),
          phase: String(item.phase || '').trim(),
          specification: String(item.specification || '').trim(),
          note: String(item.note || '').trim(),
          projects,
        };
      })
      .filter((item) => item.label)
    : [];
}

export function normalizeKerndoelenDoc(raw) {
  const doc = raw && typeof raw === 'object' ? structuredClone(raw) : {};
  doc.schemaVersion = Number(doc.schemaVersion || 1);
  doc.generatedAt = String(doc.generatedAt || '').trim();
  doc.sourceWorkbook = String(doc.sourceWorkbook || '').trim();
  doc.magisterSkills = Array.isArray(doc.magisterSkills)
    ? doc.magisterSkills.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  doc.goals = Array.isArray(doc.goals)
    ? doc.goals
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        kerndoelNumber: String(item.kerndoelNumber || '').trim(),
        kerndoel: String(item.kerndoel || '').trim(),
        subgoalCode: String(item.subgoalCode || '').trim(),
        subgoal: String(item.subgoal || '').trim(),
      }))
      .filter((item) => item.subgoalCode || item.kerndoelNumber)
    : [];
  doc.projects = normalizeProjects(doc.projects);
  doc.records = normalizeRecords(doc.records);
  return recomputeKerndoelenStats(doc);
}

export function recomputeKerndoelenStats(doc) {
  const normalized = doc && typeof doc === 'object' ? doc : {};
  const counterByProject = new Map();
  for (const project of normalized.projects || []) {
    counterByProject.set(project.id, { focus: 0, support: 0 });
  }
  for (const record of normalized.records || []) {
    for (const [projectId, status] of Object.entries(record.projects || {})) {
      if (!counterByProject.has(projectId)) counterByProject.set(projectId, { focus: 0, support: 0 });
      if (status === 'focus' || status === 'support') {
        counterByProject.get(projectId)[status] += 1;
      }
    }
  }
  normalized.projects = (normalized.projects || []).map((project) => ({
    ...project,
    stats: counterByProject.get(project.id) || { focus: 0, support: 0 },
  }));
  return normalized;
}

export function readStoredKerndoelenDoc() {
  try {
    const raw = localStorage.getItem(KERNDOELEN_STORAGE_KEY);
    if (!raw) return null;
    return normalizeKerndoelenDoc(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredKerndoelenDoc(doc) {
  const normalized = recomputeKerndoelenStats(normalizeKerndoelenDoc(doc));
  localStorage.setItem(KERNDOELEN_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearStoredKerndoelenDoc() {
  localStorage.removeItem(KERNDOELEN_STORAGE_KEY);
}

export async function loadKerndoelenDoc(url) {
  const resolved = new URL(url, window.location.href);
  resolved.searchParams.set('_t', String(Date.now()));
  const response = await fetch(resolved.toString(), { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const baseDoc = normalizeKerndoelenDoc(await response.json());
  return readStoredKerndoelenDoc() || baseDoc;
}

export function projectBySlug(doc, value) {
  const slug = slugifyProject(value);
  return (doc?.projects || []).find((project) => project.id === slug) || null;
}

export function recordsForProject(doc, projectId) {
  const slug = slugifyProject(projectId);
  return (doc?.records || [])
    .filter((record) => record?.projects?.[slug])
    .sort((left, right) => {
      const numberDelta = Number(left.kerndoelNumber || 0) - Number(right.kerndoelNumber || 0);
      if (numberDelta !== 0) return numberDelta;
      const codeDelta = String(left.subgoalCode || '').localeCompare(String(right.subgoalCode || ''), 'nl');
      if (codeDelta !== 0) return codeDelta;
      return String(left.label || '').localeCompare(String(right.label || ''), 'nl');
    });
}

export function buildProjectSnapshot(doc, projectId) {
  const project = projectBySlug(doc, projectId);
  if (!project) return null;
  const records = recordsForProject(doc, project.id);
  const focusRecords = records.filter((record) => record.projects?.[project.id] === 'focus');
  const supportRecords = records.filter((record) => record.projects?.[project.id] === 'support');
  const skills = [...new Set(
    focusRecords
      .map((record) => String(record.magisterSkill || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, 'nl'));
  const goals = [...new Set(
    focusRecords
      .map((record) => `${record.subgoalCode} ${record.subgoal}`.trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right, 'nl'));

  return {
    project,
    records,
    focusRecords,
    supportRecords,
    skills: project.primaryMagisterSkill
      ? [project.primaryMagisterSkill, ...project.secondaryMagisterSkills.filter((value) => value !== project.primaryMagisterSkill)]
      : skills,
    inferredSkills: skills,
    goals,
  };
}
