/* IndexedDB-backed roster persistence. One database, two object stores:
   - 'profiles' (keyed by cfnId): the player roster
   - 'meta' (keyed by key): small app-level flags (e.g. wizardSeen)
   Async I/O only — the app loads the roster into memory once at init and renders from
   memory, so this is the sole place that knows about IndexedDB. Browser-only (node
   tests cover the pure reducers in scout.js; this is verified by browser E2E). */
const SCOUT_DB = 'sf6-scout';
const SCOUT_STORE = 'profiles';
const META_STORE = 'meta';

function _openScoutDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SCOUT_DB, 2);   // v2 adds the 'meta' store
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCOUT_STORE)) db.createObjectStore(SCOUT_STORE, { keyPath: 'cfnId' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getMeta(key) {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await _openScoutDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => reject(req.error);
  });
}

async function setMeta(key, value) {
  if (typeof indexedDB === 'undefined') return;
  const db = await _openScoutDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
