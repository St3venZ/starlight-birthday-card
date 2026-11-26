import type { BirthdayCardConfig } from '../config/types';

export interface PublishedCardRecord {
  shortId: string;
  shareUrl: string;
  editToken: string;
  recipientName: string;
  age: number;
  createdAt: string;
  mode: 'cloud' | 'local';
}

const DB_NAME = 'starlight_card_studio_v1';
const DB_VERSION = 1;
const DRAFT_STORE = 'drafts';
const DRAFT_KEY = 'current';
const PUBLISHED_STORE = 'published';

const LS_DRAFT_KEY = 'starlight_card_studio_v1:draft';
const LS_PUBLISHED_KEY = 'starlight_card_studio_v1:published';

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE);
      }
      if (!db.objectStoreNames.contains(PUBLISHED_STORE)) {
        db.createObjectStore(PUBLISHED_STORE, { keyPath: 'shortId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open studio IndexedDB'));
  });
}

function readLocalStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota or private browsing restriction; ignore gracefully
  }
}

function removeLocalStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function saveDraft(config: BirthdayCardConfig): Promise<void> {
  const snapshot: BirthdayCardConfig = JSON.parse(JSON.stringify(config)) as BirthdayCardConfig;
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      tx.objectStore(DRAFT_STORE).put(snapshot, DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save draft'));
      tx.onabort = () => reject(tx.error ?? new Error('Draft transaction aborted'));
    });
    db.close();
  } catch {
    writeLocalStorage(LS_DRAFT_KEY, snapshot);
  }
}

export async function loadDraft(): Promise<BirthdayCardConfig | null> {
  try {
    const db = await openStudioDb();
    const result = await new Promise<BirthdayCardConfig | null>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readonly');
      const req = tx.objectStore(DRAFT_STORE).get(DRAFT_KEY);
      req.onsuccess = () => {
        resolve((req.result as BirthdayCardConfig | undefined) ?? null);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to load draft'));
    });
    db.close();
    if (result) return result;
  } catch {
    // Fall through to localStorage
  }
  return readLocalStorage<BirthdayCardConfig>(LS_DRAFT_KEY);
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      tx.objectStore(DRAFT_STORE).delete(DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear draft'));
      tx.onabort = () => reject(tx.error ?? new Error('Clear draft aborted'));
    });
    db.close();
  } catch {
    // Fall through to clear localStorage mirror as well
  }
  removeLocalStorage(LS_DRAFT_KEY);
}

function sortRecordsNewestFirst(records: PublishedCardRecord[]): PublishedCardRecord[] {
  return [...records].sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return tb - ta;
  });
}

export async function savePublishedRecord(record: PublishedCardRecord): Promise<void> {
  const cleanRecord: PublishedCardRecord = { ...record };
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PUBLISHED_STORE, 'readwrite');
      tx.objectStore(PUBLISHED_STORE).put(cleanRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save published record'));
      tx.onabort = () => reject(tx.error ?? new Error('Published record transaction aborted'));
    });
    db.close();
  } catch {
    const existing = readLocalStorage<PublishedCardRecord[]>(LS_PUBLISHED_KEY) ?? [];
    const filtered = existing.filter((item) => item.shortId !== cleanRecord.shortId);
    writeLocalStorage(LS_PUBLISHED_KEY, sortRecordsNewestFirst([cleanRecord, ...filtered]));
  }
}

export async function loadPublishedRecords(): Promise<PublishedCardRecord[]> {
  try {
    const db = await openStudioDb();
    const records = await new Promise<PublishedCardRecord[]>((resolve, reject) => {
      const tx = db.transaction(PUBLISHED_STORE, 'readonly');
      const req = tx.objectStore(PUBLISHED_STORE).getAll();
      req.onsuccess = () => {
        const list = Array.isArray(req.result) ? (req.result as PublishedCardRecord[]) : [];
        resolve(sortRecordsNewestFirst(list));
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to load published records'));
    });
    db.close();
    return records;
  } catch {
    const fallback = readLocalStorage<PublishedCardRecord[]>(LS_PUBLISHED_KEY);
    return Array.isArray(fallback) ? sortRecordsNewestFirst(fallback) : [];
  }
}

export async function removePublishedRecord(shortId: string): Promise<void> {
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PUBLISHED_STORE, 'readwrite');
      tx.objectStore(PUBLISHED_STORE).delete(shortId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to remove published record'));
      tx.onabort = () => reject(tx.error ?? new Error('Remove record aborted'));
    });
    db.close();
  } catch {
    // Fall through
  }
  const existing = readLocalStorage<PublishedCardRecord[]>(LS_PUBLISHED_KEY);
  if (Array.isArray(existing)) {
    writeLocalStorage(
      LS_PUBLISHED_KEY,
      existing.filter((item) => item.shortId !== shortId)
    );
  }
}
