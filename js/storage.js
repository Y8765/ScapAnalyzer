/**
 * OpenSCAP Storage Manager
 * Uses IndexedDB for large data (reports) and localStorage for small data (exemptions, settings).
 * IndexedDB supports hundreds of MB — perfect for dozens of 15MB+ report files.
 */

const StorageManager = (() => {
  const DB_NAME = 'oscap-comparator';
  const DB_VERSION = 1;
  const STORE_REPORTS = 'reports';

  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_REPORTS)) {
          database.createObjectStore(STORE_REPORTS, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => { console.error('IndexedDB error:', e); reject(e); };
    });
  }

  async function saveReports(reports) {
    try {
      const database = await open();
      const tx = database.transaction(STORE_REPORTS, 'readwrite');
      const store = tx.objectStore(STORE_REPORTS);
      store.clear(); // Replace all
      reports.forEach((report, i) => {
        store.put({ id: i, data: report });
      });
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => { console.warn('Failed to save reports:', e); reject(e); };
      });
    } catch (e) {
      console.warn('IndexedDB save failed:', e);
      return false;
    }
  }

  async function loadReports() {
    try {
      const database = await open();
      const tx = database.transaction(STORE_REPORTS, 'readonly');
      const store = tx.objectStore(STORE_REPORTS);
      const req = store.getAll();
      return new Promise((resolve, reject) => {
        req.onsuccess = () => {
          const items = req.result || [];
          // Sort by id to maintain order
          items.sort((a, b) => a.id - b.id);
          resolve(items.map(item => item.data));
        };
        req.onerror = (e) => { console.warn('Failed to load reports:', e); resolve([]); };
      });
    } catch (e) {
      console.warn('IndexedDB load failed:', e);
      return [];
    }
  }

  async function clearAll() {
    try {
      const database = await open();
      const tx = database.transaction(STORE_REPORTS, 'readwrite');
      tx.objectStore(STORE_REPORTS).clear();
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn('IndexedDB clear failed:', e);
      return false;
    }
  }

  return { saveReports, loadReports, clearAll };
})();
