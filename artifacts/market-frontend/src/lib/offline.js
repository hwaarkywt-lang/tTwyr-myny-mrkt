/**
 * Offline-First helper for ميني ماركت الفنية.
 *
 * Provides:
 *  - Service Worker registration
 *  - Online/Offline status detection
 *  - Sync queue for mutations made while offline (IndexedDB-backed)
 *  - Auto-retry on reconnect
 */

const DB_NAME = 'mmf-offline-db';
const DB_VERSION = 1;
const QUEUE_STORE = 'sync_queue';

/** Open IndexedDB (lazy) */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Add a queued mutation (for offline sync later) */
export async function enqueueRequest({ url, method, body, headers }) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const item = {
        url, method, body, headers,
        ts: Date.now(),
        retries: 0,
      };
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('enqueueRequest failed:', e);
  }
}

/** List queued mutations */
export async function listQueue() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const req = tx.objectStore(QUEUE_STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

/** Drop a queue entry by id */
export async function removeFromQueue(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const req = tx.objectStore(QUEUE_STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch { /* ignore */ }
}

/** Replay queued mutations sequentially. Returns counts. */
export async function flushQueue() {
  const items = await listQueue();
  let success = 0, failed = 0;
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers || { 'Content-Type': 'application/json' },
        body: item.body,
      });
      if (res.ok) {
        await removeFromQueue(item.id);
        success += 1;
      } else {
        failed += 1;
        // Drop on permanent failure (4xx)
        if (res.status >= 400 && res.status < 500) {
          await removeFromQueue(item.id);
        }
      }
    } catch {
      failed += 1;
      // Keep in queue for next round (network still down)
    }
  }
  return { success, failed };
}

/** Listen to online/offline events */
let onlineListeners = [];
export function onConnectivityChange(cb) {
  onlineListeners.push(cb);
  return () => { onlineListeners = onlineListeners.filter((c) => c !== cb); };
}

function _emit() {
  onlineListeners.forEach((cb) => {
    try { cb(navigator.onLine); } catch { /* ignore */ }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    _emit();
    const { success, failed } = await flushQueue();
    if (success > 0) {
      console.info(`[offline] ✅ مزامنة ${success} عملية محلية. فشل: ${failed}`);
      // Show toast if available
      try {
        const evt = new CustomEvent('offline-sync', { detail: { success, failed } });
        window.dispatchEvent(evt);
      } catch { /* ignore */ }
    }
  });
  window.addEventListener('offline', () => _emit());
}

/** Register service worker (call once on app boot) */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Don't register on dev preview (HMR conflicts) — only on production-like origins
  // For our needs we register always, since the SW only caches GETs.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.info('[sw] registered:', reg.scope))
      .catch((err) => console.warn('[sw] registration failed:', err));
  });
}

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
