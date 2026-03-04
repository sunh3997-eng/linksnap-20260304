/**
 * LinkSnap — IndexedDB wrapper
 * Provides a clean Promise-based API over the browser's IndexedDB.
 */

const DB_NAME    = "linksnap";
const DB_VERSION = 1;
const STORE_NAME = "links";

class LinkDB {
  constructor() {
    this._db = null;
  }

  // Open (or create) the database
  async open() {
    if (this._db) return this._db;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db    = e.target.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("url",     "url",     { unique: false });
      };

      req.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };

      req.onerror = () => reject(req.error);
    });
  }

  // Internal helper: get a transaction + store
  async _store(mode = "readonly") {
    const db = await this.open();
    const tx = db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  }

  /**
   * Save a link. Generates a unique id if not provided.
   * @param {Object} link
   * @returns {Promise<string>} the saved id
   */
  async save(link) {
    const record = {
      id:              link.id || crypto.randomUUID(),
      url:             link.url,
      title:           link.title || "",
      summary:         link.summary || "",
      content_preview: link.content_preview || "",
      tags:            link.tags || [],
      savedAt:         link.savedAt || Date.now(),
      model:           link.model || "",
    };

    const store = await this._store("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(record.id);
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Return all links sorted newest-first.
   * @returns {Promise<Object[]>}
   */
  async getAll() {
    const store = await this._store("readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => b.savedAt - a.savedAt);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Full-text search across title, summary, url, and tags.
   * @param {string} query
   * @returns {Promise<Object[]>}
   */
  async search(query) {
    if (!query || !query.trim()) return this.getAll();
    const q = query.trim().toLowerCase();
    const all = await this.getAll();
    return all.filter((link) => {
      const haystack = [
        link.title,
        link.summary,
        link.url,
        (link.tags || []).join(" "),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  /**
   * Delete a link by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    const store = await this._store("readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /**
   * Count links saved in the current calendar month.
   * @returns {Promise<number>}
   */
  async getMonthCount() {
    const all   = await this.getAll();
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    return all.filter((link) => {
      const d = new Date(link.savedAt);
      return d.getFullYear() === year && d.getMonth() === month;
    }).length;
  }

  /**
   * Delete all links saved before the given timestamp.
   * @param {number} beforeMs  Unix timestamp in milliseconds
   * @returns {Promise<number>} number of deleted records
   */
  async deleteOlderThan(beforeMs) {
    const all  = await this.getAll();
    const old  = all.filter((l) => l.savedAt < beforeMs);
    await Promise.all(old.map((l) => this.delete(l.id)));
    return old.length;
  }
}

// Singleton exported to all extension pages via importScripts / <script>
const db = new LinkDB();
