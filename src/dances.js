// Dances are data: { id, name, rules?, bpm?, aspect, duration, referenceFrames:[{t, lm}], segments? }.
// Built-in templates ship in /dances; anything the user uploads (poses + the video, which is
// also the music) is kept in IndexedDB on this device only.
import dougie from '../dances/dougie.json';

export const BUILTIN = { dougie };

const DB_NAME = 'dougie-coach';
const STORE = 'dances';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

/** @returns {Promise<{dance:object, video:Blob|null}>} */
export async function loadDance(id) {
  try {
    const rec = await tx('readonly', (s) => s.get(id));
    if (rec?.dance?.referenceFrames?.length) return rec;
  } catch (e) {
    console.warn('IndexedDB unavailable, starting fresh', e);
  }
  return { dance: structuredClone(BUILTIN[id]), video: null };
}

export async function saveDance(dance, video) {
  try {
    await tx('readwrite', (s) => s.put({ dance, video }, dance.id));
    return true;
  } catch (e) {
    console.warn('Could not save dance', e);
    return false;
  }
}
