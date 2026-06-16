/* IndexedDB-backed roster persistence. One database, one object store keyed by cfnId.
   Async I/O only — the app loads the roster into memory once at init and renders from
   memory, so this is the sole place that knows about IndexedDB. Browser-only (node
   tests cover the pure reducers in scout.js; this is verified by browser E2E). */
const SCOUT_DB = 'sf6-scout';
const SCOUT_STORE = 'profiles';

function _openScoutDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SCOUT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCOUT_STORE)) db.createObjectStore(SCOUT_STORE, { keyPath: 'cfnId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// {cfnId: profile} of everything stored (empty object if none / IndexedDB unavailable).
async function loadRoster() {
  if (typeof indexedDB === 'undefined') return {};
  const db = await _openScoutDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(SCOUT_STORE, 'readonly').objectStore(SCOUT_STORE).getAll();
    req.onsuccess = () => {
      const out = Object.create(null);   // null-proto: user-derived ids can't pollute via __proto__
      for (const p of req.result) out[p.cfnId] = p;
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

async function saveProfile(profile) {
  if (typeof indexedDB === 'undefined') return;
  const db = await _openScoutDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCOUT_STORE, 'readwrite');
    tx.objectStore(SCOUT_STORE).put(profile);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteProfileFromStore(cfnId) {
  if (typeof indexedDB === 'undefined') return;
  const db = await _openScoutDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCOUT_STORE, 'readwrite');
    tx.objectStore(SCOUT_STORE).delete(String(cfnId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearRosterStore() {
  if (typeof indexedDB === 'undefined') return;
  const db = await _openScoutDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCOUT_STORE, 'readwrite');
    tx.objectStore(SCOUT_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
