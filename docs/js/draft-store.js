const DB_NAME = 'lespresentatie-drafts';
const DB_VERSION = 1;
const STORE_DRAFTS = 'drafts';
const STORE_META = 'meta';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function draftKey(classId, type) {
  return `draft:${classId}:${type}`;
}

export async function saveDraft(classId, type, arrangement, savedAt = new Date().toISOString()) {
  const db = await openDb();
  try {
    const tx = db.transaction([STORE_DRAFTS, STORE_META], 'readwrite');
    tx.objectStore(STORE_DRAFTS).put({ arrangement, savedAt }, draftKey(classId, type));
    tx.objectStore(STORE_META).put({ classId, type, savedAt }, 'last');
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function loadDraft(classId, type) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_DRAFTS, 'readonly');
    const req = tx.objectStore(STORE_DRAFTS).get(draftKey(classId, type));
    const result = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return result?.arrangement || null;
  } finally {
    db.close();
  }
}

export async function loadLastDraftMeta() {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get('last');
    const result = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    return result || null;
  } finally {
    db.close();
  }
}
