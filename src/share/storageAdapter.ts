import type { BirthdayCardConfig } from '../config/types';

export interface PublishCardRequest {
  config: BirthdayCardConfig;
  passcode?: string;
  shortId?: string;
  editToken?: string;
}

export interface PublishCardResult {
  shortId: string;
  shareUrl: string;
  editToken: string;
  expiresAt: string;
  mode: 'cloud' | 'local';
}

export type FetchCardResult =
  | { status: 'ok'; config: BirthdayCardConfig; mode: 'cloud' | 'local' }
  | { status: 'passcode_required'; recipientHint: string; ageHint: number; mode: 'cloud' | 'local' }
  | { status: 'wrong_passcode'; recipientHint?: string; ageHint?: number; mode: 'cloud' | 'local' }
  | { status: 'not_found'; mode: 'cloud' | 'local' }
  | { status: 'error'; message: string; mode: 'cloud' | 'local' };

export interface DeleteCardResult {
  ok: boolean;
  error?: string;
}

interface LocalStoredCardRecord {
  shortId: string;
  config: BirthdayCardConfig;
  recipientHint: string;
  ageHint: number;
  passcodeSalt?: string;
  passcodeHash?: string;
  editTokenSalt: string;
  editTokenHash: string;
  createdAt: string;
  expiresAt: string;
}

const LOCAL_DB_NAME = 'starlight_card_shares_v1';
const LOCAL_STORE_NAME = 'cards';
const LOCAL_LS_PREFIX = 'starlight_card_share_v1:';
const TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += BASE62[bytes[i] % BASE62.length];
  }
  return out;
}

/**
 * Pure-JS SHA-256 fallback used only if crypto.subtle is unavailable (e.g. non-HTTPS LAN IP).
 */
function sha256FallbackHex(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = utf8.length * 8;
  const totalLen = Math.ceil((utf8.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(utf8);
  padded[utf8.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + k[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return Array.from(h)
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

async function sha256Salted(value: string, salt: string): Promise<string> {
  const text = `${salt}:${value}`;
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const data = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return sha256FallbackHex(text);
    }
  }
  return sha256FallbackHex(text);
}

function openLocalShareDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(LOCAL_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
          db.createObjectStore(LOCAL_STORE_NAME, { keyPath: 'shortId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function localPutRecord(record: LocalStoredCardRecord): Promise<void> {
  const db = await openLocalShareDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
        tx.objectStore(LOCAL_STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return;
    } catch {
      db.close();
    }
  }

  try {
    localStorage.setItem(`${LOCAL_LS_PREFIX}${record.shortId}`, JSON.stringify(record));
  } catch {
    throw new Error('本地浏览器存储空间不足，请减少照片数量或部署云端存储。');
  }
}

async function localGetRecord(shortId: string): Promise<LocalStoredCardRecord | null> {
  const db = await openLocalShareDb();
  if (db) {
    try {
      const found = await new Promise<LocalStoredCardRecord | null>((resolve) => {
        const tx = db.transaction(LOCAL_STORE_NAME, 'readonly');
        const req = tx.objectStore(LOCAL_STORE_NAME).get(shortId);
        req.onsuccess = () => resolve((req.result as LocalStoredCardRecord | undefined) ?? null);
        req.onerror = () => resolve(null);
      });
      db.close();
      if (found) return found;
    } catch {
      db.close();
    }
  }

  try {
    const raw = localStorage.getItem(`${LOCAL_LS_PREFIX}${shortId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LocalStoredCardRecord;
  } catch {
    return null;
  }
}

async function localDeleteRecord(shortId: string): Promise<void> {
  const db = await openLocalShareDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(LOCAL_STORE_NAME, 'readwrite');
        tx.objectStore(LOCAL_STORE_NAME).delete(shortId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    } catch {
      db.close();
    }
  }

  try {
    localStorage.removeItem(`${LOCAL_LS_PREFIX}${shortId}`);
  } catch {
    // Ignore storage cleanup errors
  }
}

export function buildCardShareUrl(shortId: string): string {
  if (typeof window === 'undefined') {
    return `/c/${shortId}`;
  }
  const { origin, pathname, protocol } = window.location;
  if (protocol === 'file:') {
    return `${origin}${pathname}#/c/${shortId}`;
  }
  // If hosted under a subpath (e.g. GitHub Pages /repo-name/), keep hash route so static refresh works
  const normalizedPath = pathname.replace(/\/index\.html$/, '');
  const isKnownAppRoot =
    normalizedPath === '' ||
    normalizedPath === '/' ||
    normalizedPath === '/create' ||
    normalizedPath.startsWith('/c/');

  if (isKnownAppRoot) {
    return `${origin}/c/${shortId}`;
  }

  const baseDir = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;
  return `${origin}${baseDir}#/c/${shortId}`;
}

function getExplicitEnvApiBase(): string | null {
  try {
    const envBase = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_BASE;
    if (envBase && envBase.trim().length > 0) {
      return envBase.trim().replace(/\/+$/, '');
    }
  } catch {
    // Ignore when executed outside Vite
  }
  return null;
}

export class CardShareClient {
  private readonly apiBase: string;
  private readonly hasExplicitApiBase: boolean;
  private cloudAvailableCache: boolean | null = null;

  constructor(apiBase?: string) {
    const explicit = apiBase?.trim() ? apiBase.trim().replace(/\/+$/, '') : getExplicitEnvApiBase();
    this.hasExplicitApiBase = Boolean(explicit);
    this.apiBase = explicit ?? '/api/cards';
  }

  public async isCloudConfigured(): Promise<boolean> {
    if (this.cloudAvailableCache !== null) {
      return this.cloudAvailableCache;
    }

    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      this.cloudAvailableCache = false;
      return false;
    }

    if (window.location.protocol === 'file:') {
      this.cloudAvailableCache = false;
      return false;
    }

    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    if (!this.hasExplicitApiBase && isLocalHost) {
      this.cloudAvailableCache = false;
      return false;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1600);

    try {
      const res = await fetch(`${this.apiBase}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      window.clearTimeout(timer);

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/json')) {
        this.cloudAvailableCache = false;
        return false;
      }

      const data = (await res.json()) as { ok?: boolean; service?: string };
      this.cloudAvailableCache = Boolean(data?.ok && data?.service === 'starlight-cards');
      return this.cloudAvailableCache;
    } catch {
      window.clearTimeout(timer);
      this.cloudAvailableCache = false;
      return false;
    }
  }

  public async publishCard(req: PublishCardRequest): Promise<PublishCardResult> {
    const cleanPasscode = req.passcode?.trim() ?? '';
    if (cleanPasscode && !/^\d{4}$/.test(cleanPasscode)) {
      throw new Error('生日口令需为 4 位数字（例如 1126），或留空直接访问。');
    }

    if (req.config.memories.length > 30) {
      throw new Error('单张贺卡最多支持 30 张回忆照片，请精简后再发布。');
    }

    const configToStore: BirthdayCardConfig = {
      ...req.config,
      shareSettings: {
        ...req.config.shareSettings,
        passcodeEnabled: cleanPasscode.length === 4,
      },
    };

    const cloudReady = await this.isCloudConfigured();
    if (cloudReady) {
      return this.publishToCloud(configToStore, cleanPasscode, req.shortId, req.editToken);
    }

    return this.publishToLocal(configToStore, cleanPasscode, req.shortId, req.editToken);
  }

  public async fetchCard(shortId: string, passcode?: string): Promise<FetchCardResult> {
    const cleanId = shortId.trim();
    if (!cleanId) {
      return { status: 'not_found', mode: 'local' };
    }

    if (cleanId.startsWith('local-')) {
      return this.fetchFromLocal(cleanId, passcode);
    }

    return this.fetchFromCloud(cleanId, passcode);
  }

  public async deleteCard(shortId: string, editToken: string): Promise<DeleteCardResult> {
    const cleanId = shortId.trim();
    const cleanToken = editToken.trim();
    if (!cleanId || !cleanToken) {
      return { ok: false, error: '缺少贺卡编号或管理密钥。' };
    }

    if (cleanId.startsWith('local-')) {
      return this.deleteFromLocal(cleanId, cleanToken);
    }

    try {
      const res = await fetch(`${this.apiBase}/${encodeURIComponent(cleanId)}`, {
        method: 'DELETE',
        headers: {
          'X-Edit-Token': cleanToken,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: errBody.error || '删除失败，请检查管理密钥是否正确。' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: '网络请求失败，未能删除云端贺卡。' };
    }
  }

  private async publishToCloud(
    config: BirthdayCardConfig,
    passcode: string,
    existingShortId?: string,
    existingEditToken?: string
  ): Promise<PublishCardResult> {
    const isUpdate = Boolean(existingShortId && existingEditToken && !existingShortId.startsWith('local-'));
    const endpoint = isUpdate
      ? `${this.apiBase}/${encodeURIComponent(existingShortId!)}`
      : this.apiBase;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (isUpdate && existingEditToken) {
      headers['X-Edit-Token'] = existingEditToken;
    }

    const res = await fetch(endpoint, {
      method: isUpdate ? 'PUT' : 'POST',
      headers,
      body: JSON.stringify({
        config,
        passcode,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      shortId?: string;
      shareUrl?: string;
      editToken?: string;
      expiresAt?: string;
      error?: string;
    };

    if (!res.ok || !data.shortId) {
      throw new Error(data.error || `发布失败（HTTP ${res.status}）`);
    }

    return {
      shortId: data.shortId,
      shareUrl: data.shareUrl || buildCardShareUrl(data.shortId),
      editToken: data.editToken || existingEditToken || '',
      expiresAt: data.expiresAt || new Date(Date.now() + TTL_MS).toISOString(),
      mode: 'cloud',
    };
  }

  private async fetchFromCloud(shortId: string, passcode?: string): Promise<FetchCardResult> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (passcode && passcode.trim()) {
        headers['X-Card-Passcode'] = passcode.trim();
      }

      const res = await fetch(`${this.apiBase}/${encodeURIComponent(shortId)}`, {
        method: 'GET',
        headers,
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        if (res.status === 404) {
          return { status: 'not_found', mode: 'cloud' };
        }
        return {
          status: 'error',
          message: '当前环境未启用云端贺卡服务，请部署至 Cloudflare Pages 或使用本地试演链接。',
          mode: 'cloud',
        };
      }

      const data = (await res.json()) as {
        status?: string;
        config?: BirthdayCardConfig;
        recipientHint?: string;
        ageHint?: number;
        error?: string;
      };

      if (res.status === 404 || data.status === 'not_found') {
        return { status: 'not_found', mode: 'cloud' };
      }

      if (res.status === 403 || data.status === 'wrong_passcode') {
        return {
          status: 'wrong_passcode',
          recipientHint: data.recipientHint,
          ageHint: data.ageHint,
          mode: 'cloud',
        };
      }

      if (data.status === 'passcode_required') {
        return {
          status: 'passcode_required',
          recipientHint: data.recipientHint || '你',
          ageHint: Number.isFinite(data.ageHint) ? Number(data.ageHint) : 24,
          mode: 'cloud',
        };
      }

      if (res.ok && data.status === 'ok' && data.config) {
        return { status: 'ok', config: data.config, mode: 'cloud' };
      }

      return {
        status: 'error',
        message: data.error || '无法读取这张贺卡，请稍后再试。',
        mode: 'cloud',
      };
    } catch {
      return {
        status: 'error',
        message: '网络连接异常，暂时无法打开这张贺卡。',
        mode: 'cloud',
      };
    }
  }

  private async publishToLocal(
    config: BirthdayCardConfig,
    passcode: string,
    existingShortId?: string,
    existingEditToken?: string
  ): Promise<PublishCardResult> {
    const now = Date.now();
    const shortId =
      existingShortId && existingShortId.startsWith('local-')
        ? existingShortId
        : `local-${randomToken(8)}`;
    const editToken = existingEditToken && existingEditToken.length >= 12 ? existingEditToken : randomToken(24);
    const editTokenSalt = randomToken(16);
    const editTokenHash = await sha256Salted(editToken, editTokenSalt);

    let passcodeSalt: string | undefined;
    let passcodeHash: string | undefined;
    if (passcode) {
      passcodeSalt = randomToken(16);
      passcodeHash = await sha256Salted(passcode, passcodeSalt);
    }

    const expiresAt = new Date(now + TTL_MS).toISOString();
    const record: LocalStoredCardRecord = {
      shortId,
      config,
      recipientHint: config.recipientName || '你',
      ageHint: config.age,
      passcodeSalt,
      passcodeHash,
      editTokenSalt,
      editTokenHash,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    };

    await localPutRecord(record);

    return {
      shortId,
      shareUrl: buildCardShareUrl(shortId),
      editToken,
      expiresAt,
      mode: 'local',
    };
  }

  private async fetchFromLocal(shortId: string, passcode?: string): Promise<FetchCardResult> {
    const record = await localGetRecord(shortId);
    if (!record) {
      return { status: 'not_found', mode: 'local' };
    }

    if (Date.parse(record.expiresAt) < Date.now()) {
      await localDeleteRecord(shortId);
      return { status: 'not_found', mode: 'local' };
    }

    if (record.passcodeHash && record.passcodeSalt) {
      const attempt = passcode?.trim() ?? '';
      if (!attempt) {
        return {
          status: 'passcode_required',
          recipientHint: record.recipientHint,
          ageHint: record.ageHint,
          mode: 'local',
        };
      }
      const attemptHash = await sha256Salted(attempt, record.passcodeSalt);
      if (attemptHash !== record.passcodeHash) {
        return {
          status: 'wrong_passcode',
          recipientHint: record.recipientHint,
          ageHint: record.ageHint,
          mode: 'local',
        };
      }
    }

    return {
      status: 'ok',
      config: record.config,
      mode: 'local',
    };
  }

  private async deleteFromLocal(shortId: string, editToken: string): Promise<DeleteCardResult> {
    const record = await localGetRecord(shortId);
    if (!record) {
      return { ok: false, error: '未找到该本地分享链接。' };
    }

    const tokenHash = await sha256Salted(editToken, record.editTokenSalt);
    if (tokenHash !== record.editTokenHash) {
      return { ok: false, error: '管理密钥不匹配，无权删除。' };
    }

    await localDeleteRecord(shortId);
    return { ok: true };
  }
}
