/**
 * Cloudflare Pages Functions API for Starlight 3D Birthday Card
 *
 * Required binding (zero credit card needed on Cloudflare free tier):
 *   - CARD_META: KVNamespace
 *
 * Optional binding (automatically used for binary photos/audio when enabled):
 *   - CARD_ASSETS: R2Bucket
 *
 * Routes:
 *   OPTIONS /api/cards/*
 *   GET     /api/cards/health
 *   POST    /api/cards
 *   GET     /api/cards/:shortId
 *   PUT     /api/cards/:shortId
 *   DELETE  /api/cards/:shortId
 *   GET     /api/cards/:shortId/assets/:key
 */

interface R2ObjectBody {
  body: ReadableStream | null;
  httpMetadata?: { contentType?: string };
  etag?: string;
}

interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
}

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  getWithMetadata<Metadata = Record<string, unknown>>(
    key: string,
    type: 'arrayBuffer'
  ): Promise<{ value: ArrayBuffer | null; metadata: Metadata | null }>;
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  CARD_ASSETS?: R2BucketLike;
  CARD_META?: KVNamespaceLike;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
}

interface MemoryPhotoPayload {
  id: string;
  image: string;
  date: string;
  title: string;
  caption?: string;
  template?: string;
  message: string;
  accentColor?: string;
  pinnedSlotIndex?: number;
}

interface CardConfigPayload {
  recipientName: string;
  senderName: string;
  age: number;
  birthdayDate: string;
  coverSubtitle: string;
  prologue: { title: string; lines: string[]; ctaLabel: string };
  memories: MemoryPhotoPayload[];
  presetFill: { autoFill: boolean; selectedPresetIds: string[] };
  finalBlessing: {
    headline: string;
    paragraphs: string[];
    signature: string;
    closeCardLabel: string;
  };
  finaleWish: { title: string; subtitle: string };
  audio: { enabled: boolean; customBgmUrl: string; volume: number };
  densityMode?: string;
  layoutSeed?: number;
  shareSettings?: { hideCreateEntry?: boolean; passcodeEnabled?: boolean };
}

interface StoredMetaRecord {
  shortId: string;
  config: CardConfigPayload;
  recipientHint: string;
  ageHint: number;
  assetKeys: string[];
  passcodeSalt?: string;
  passcodeHash?: string;
  editTokenSalt: string;
  editTokenHash: string;
  createdAt: string;
  expiresAt: string;
}

const MAX_PHOTOS = 30;
const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024; // 6 MB
const CARD_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days (15552000s)
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Card-Passcode, X-Edit-Token, X-Forwarded-Origin',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function resolvePublicOrigin(request: Request): string {
  const forwarded = request.headers.get('X-Forwarded-Origin')?.trim();
  if (forwarded && /^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(forwarded)) {
    return forwarded;
  }
  return new URL(request.url).origin;
}

function randomBase62(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += BASE62[bytes[i] % BASE62.length];
  }
  return out;
}

async function sha256Salted(value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function decodeDataUrl(dataUrl: string): { mimeType: string; ext: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:webp|jpeg|jpg|png)|audio\/(?:mpeg|mp3|ogg|webm|mp4));base64,([A-Za-z0-9+/=]+)$/i.exec(
    dataUrl.trim()
  );
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const extMap: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
  };
  const ext = extMap[mimeType] ?? 'bin';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mimeType, ext, bytes };
}

function parsePathSegments(params: { path?: string | string[] }): string[] {
  if (!params.path) return [];
  if (Array.isArray(params.path)) return params.path.filter(Boolean);
  return params.path.split('/').filter(Boolean);
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function storeBinaryAsset(
  env: Env,
  shortId: string,
  fileName: string,
  bytes: Uint8Array,
  mimeType: string
): Promise<string> {
  if (env.CARD_ASSETS) {
    const r2Key = `cards/${shortId}/${fileName}`;
    await env.CARD_ASSETS.put(r2Key, bytes, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    return r2Key;
  }

  const kvKey = `asset:${shortId}:${fileName}`;
  await env.CARD_META!.put(kvKey, toExactArrayBuffer(bytes), {
    expirationTtl: CARD_TTL_SECONDS,
    metadata: { contentType: mimeType },
  });
  return kvKey;
}

function extractReferencedAssetFileNames(shortId: string, config: CardConfigPayload): Set<string> {
  const prefix = `/api/cards/${shortId}/assets/`;
  const used = new Set<string>();
  for (const item of config.memories) {
    if (typeof item.image === 'string' && item.image.startsWith(prefix)) {
      used.add(item.image.slice(prefix.length));
    }
  }
  const bgm = config.audio?.customBgmUrl;
  if (typeof bgm === 'string' && bgm.startsWith(prefix)) {
    used.add(bgm.slice(prefix.length));
  }
  return used;
}

async function deleteAssetKey(env: Env, key: string): Promise<void> {
  if (key.startsWith('asset:')) {
    await env.CARD_META?.delete(key);
    return;
  }
  if (key.startsWith('cards/') && env.CARD_ASSETS) {
    await env.CARD_ASSETS.delete(key);
  }
}

async function extractAndStoreAssets(
  env: Env,
  shortId: string,
  rawConfig: CardConfigPayload
): Promise<{ config: CardConfigPayload; assetKeys: string[] }> {
  const assetKeys: string[] = [];
  const nextMemories: MemoryPhotoPayload[] = [];
  const versionTag = randomBase62(4);

  for (let idx = 0; idx < rawConfig.memories.length; idx += 1) {
    const item = rawConfig.memories[idx];
    const imageVal = typeof item.image === 'string' ? item.image.trim() : '';

    if (imageVal.startsWith('data:image/')) {
      const decoded = decodeDataUrl(imageVal);
      if (!decoded) {
        throw new Error(`第 ${idx + 1} 张照片格式不受支持，请使用 JPG/PNG/WebP。`);
      }
      const fileName = `${idx}-${versionTag}.${decoded.ext}`;
      const storedKey = await storeBinaryAsset(env, shortId, fileName, decoded.bytes, decoded.mimeType);
      assetKeys.push(storedKey);
      nextMemories.push({
        ...item,
        image: `/api/cards/${shortId}/assets/${fileName}`,
      });
    } else {
      nextMemories.push(item);
    }
  }

  let nextAudio = rawConfig.audio;
  const rawAudioUrl = typeof rawConfig.audio?.customBgmUrl === 'string' ? rawConfig.audio.customBgmUrl.trim() : '';
  if (rawAudioUrl.startsWith('data:audio/')) {
    const decoded = decodeDataUrl(rawAudioUrl);
    if (decoded && decoded.bytes.byteLength <= 2.2 * 1024 * 1024) {
      const fileName = `bgm-${versionTag}.${decoded.ext}`;
      const storedKey = await storeBinaryAsset(env, shortId, fileName, decoded.bytes, decoded.mimeType);
      assetKeys.push(storedKey);
      nextAudio = {
        ...rawConfig.audio,
        customBgmUrl: `/api/cards/${shortId}/assets/${fileName}`,
      };
    }
  }

  return {
    config: {
      ...rawConfig,
      memories: nextMemories,
      audio: nextAudio,
    },
    assetKeys,
  };
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const segments = parsePathSegments(params);

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health check: ready whenever CARD_META (KV) is bound; CARD_ASSETS (R2) is optional
  if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
    const ready = Boolean(env.CARD_META);
    return jsonResponse(
      {
        ok: ready,
        service: 'starlight-cards',
        mode: ready ? 'cloud' : 'unconfigured',
        storage: ready ? (env.CARD_ASSETS ? 'r2+kv' : 'kv') : 'none',
      },
      ready ? 200 : 503
    );
  }

  if (!env.CARD_META) {
    return jsonResponse(
      { error: 'Cloudflare KV (CARD_META) 尚未绑定，请先按 docs/DEPLOY_CLOUD.md 配置。' },
      503
    );
  }

  // GET /api/cards/:shortId/assets/:key -> serve immutable binary asset from R2 (if bound) or KV fallback
  if (method === 'GET' && segments.length === 3 && segments[1] === 'assets') {
    const shortId = segments[0];
    const fileKey = segments[2];
    if (!/^[A-Za-z0-9_-]{4,24}$/.test(shortId) || !/^[A-Za-z0-9._-]{1,64}$/.test(fileKey)) {
      return jsonResponse({ error: 'Invalid asset path' }, 400);
    }

    if (env.CARD_ASSETS) {
      const obj = await env.CARD_ASSETS.get(`cards/${shortId}/${fileKey}`);
      if (obj && obj.body) {
        return new Response(obj.body, {
          status: 200,
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Robots-Tag': 'noindex, nofollow',
            ...CORS_HEADERS,
          },
        });
      }
    }

    const kvAsset = await env.CARD_META.getWithMetadata<{ contentType?: string }>(
      `asset:${shortId}:${fileKey}`,
      'arrayBuffer'
    );
    if (kvAsset && kvAsset.value) {
      return new Response(kvAsset.value, {
        status: 200,
        headers: {
          'Content-Type': kvAsset.metadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Robots-Tag': 'noindex, nofollow',
          ...CORS_HEADERS,
        },
      });
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }

  // POST /api/cards -> create new published card
  if (method === 'POST' && segments.length === 0) {
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return jsonResponse({ error: '提交内容超过 6MB 上限，请减少照片或重新压缩。' }, 413);
    }

    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).byteLength > MAX_PAYLOAD_BYTES) {
      return jsonResponse({ error: '提交内容超过 6MB 上限，请减少照片或重新压缩。' }, 413);
    }

    let body: { config?: CardConfigPayload; passcode?: string };
    try {
      body = JSON.parse(rawText) as { config?: CardConfigPayload; passcode?: string };
    } catch {
      return jsonResponse({ error: '请求 JSON 格式无效。' }, 400);
    }

    if (!body.config || !Array.isArray(body.config.memories)) {
      return jsonResponse({ error: '缺少有效的贺卡配置数据。' }, 400);
    }

    if (body.config.memories.length > MAX_PHOTOS) {
      return jsonResponse({ error: `单张贺卡最多支持 ${MAX_PHOTOS} 张照片。` }, 400);
    }

    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    if (passcode && !/^\d{4}$/.test(passcode)) {
      return jsonResponse({ error: '生日口令需为 4 位数字。' }, 400);
    }

    const shortId = randomBase62(10);
    const editToken = randomBase62(24);
    const editTokenSalt = randomBase62(16);
    const editTokenHash = await sha256Salted(editToken, editTokenSalt);

    let passcodeSalt: string | undefined;
    let passcodeHash: string | undefined;
    if (passcode) {
      passcodeSalt = randomBase62(16);
      passcodeHash = await sha256Salted(passcode, passcodeSalt);
    }

    try {
      const { config, assetKeys } = await extractAndStoreAssets(env, shortId, body.config);
      const now = Date.now();
      const expiresAt = new Date(now + CARD_TTL_SECONDS * 1000).toISOString();

      const stored: StoredMetaRecord = {
        shortId,
        config: {
          ...config,
          shareSettings: {
            ...config.shareSettings,
            passcodeEnabled: Boolean(passcode),
          },
        },
        recipientHint: config.recipientName || '你',
        ageHint: Number.isFinite(config.age) ? config.age : 24,
        assetKeys,
        passcodeSalt,
        passcodeHash,
        editTokenSalt,
        editTokenHash,
        createdAt: new Date(now).toISOString(),
        expiresAt,
      };

      await env.CARD_META.put(`card:${shortId}`, JSON.stringify(stored), {
        expirationTtl: CARD_TTL_SECONDS,
      });

      const origin = resolvePublicOrigin(request);
      return jsonResponse(
        {
          shortId,
          shareUrl: `${origin}/c/${shortId}`,
          editToken,
          expiresAt,
        },
        201
      );
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : '保存贺卡失败，请稍后重试。' },
        500
      );
    }
  }

  // Operations on /api/cards/:shortId
  if (segments.length === 1) {
    const shortId = segments[0];
    if (!/^[A-Za-z0-9_-]{4,24}$/.test(shortId)) {
      return jsonResponse({ status: 'not_found' }, 404);
    }

    const metaRaw = await env.CARD_META.get(`card:${shortId}`);
    if (!metaRaw) {
      return jsonResponse({ status: 'not_found' }, 404);
    }

    const stored = JSON.parse(metaRaw) as StoredMetaRecord;

    // GET /api/cards/:shortId
    if (method === 'GET') {
      if (stored.passcodeHash && stored.passcodeSalt) {
        const url = new URL(request.url);
        const attempt =
          request.headers.get('X-Card-Passcode')?.trim() ||
          url.searchParams.get('p')?.trim() ||
          '';

        if (!attempt) {
          return jsonResponse({
            status: 'passcode_required',
            recipientHint: stored.recipientHint,
            ageHint: stored.ageHint,
          });
        }

        const attemptHash = await sha256Salted(attempt, stored.passcodeSalt);
        if (!constantTimeEqual(attemptHash, stored.passcodeHash)) {
          return jsonResponse(
            {
              status: 'wrong_passcode',
              recipientHint: stored.recipientHint,
              ageHint: stored.ageHint,
            },
            403
          );
        }
      }

      return jsonResponse({ status: 'ok', config: stored.config });
    }

    // Verify X-Edit-Token for PUT / DELETE
    const editToken = request.headers.get('X-Edit-Token')?.trim() || '';
    if (!editToken) {
      return jsonResponse({ error: '缺少管理密钥 X-Edit-Token。' }, 401);
    }
    const tokenHash = await sha256Salted(editToken, stored.editTokenSalt);
    if (!constantTimeEqual(tokenHash, stored.editTokenHash)) {
      return jsonResponse({ error: '管理密钥无效。' }, 403);
    }

    // DELETE /api/cards/:shortId -> purge metadata + all R2 & KV assets
    if (method === 'DELETE') {
      await env.CARD_META.delete(`card:${shortId}`);

      const kvKeys = (stored.assetKeys ?? []).filter((k) => k.startsWith('asset:'));
      await Promise.all(kvKeys.map((k) => env.CARD_META!.delete(k)));

      if (env.CARD_ASSETS) {
        const listed = await env.CARD_ASSETS.list({ prefix: `cards/${shortId}/` });
        const r2Keys = listed.objects.map((o) => o.key);
        if (r2Keys.length > 0) {
          await env.CARD_ASSETS.delete(r2Keys);
        }
      }

      return jsonResponse({ ok: true });
    }

    // PUT /api/cards/:shortId -> update config, store new assets, purge orphaned assets
    if (method === 'PUT') {
      const rawText = await request.text();
      if (new TextEncoder().encode(rawText).byteLength > MAX_PAYLOAD_BYTES) {
        return jsonResponse({ error: '提交内容超过 6MB 上限。' }, 413);
      }

      let body: { config?: CardConfigPayload; passcode?: string };
      try {
        body = JSON.parse(rawText) as { config?: CardConfigPayload; passcode?: string };
      } catch {
        return jsonResponse({ error: '请求 JSON 格式无效。' }, 400);
      }

      if (!body.config || !Array.isArray(body.config.memories) || body.config.memories.length > MAX_PHOTOS) {
        return jsonResponse({ error: `贺卡配置无效或照片超过 ${MAX_PHOTOS} 张上限。` }, 400);
      }

      const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
      if (passcode && !/^\d{4}$/.test(passcode)) {
        return jsonResponse({ error: '生日口令需为 4 位数字。' }, 400);
      }

      const { config, assetKeys: newlyStoredKeys } = await extractAndStoreAssets(env, shortId, body.config);
      const referencedFiles = extractReferencedAssetFileNames(shortId, config);

      // Clean up any previous asset keys no longer referenced by the updated card
      const keptPreviousKeys: string[] = [];
      for (const prevKey of stored.assetKeys ?? []) {
        const fileName = prevKey.startsWith(`asset:${shortId}:`)
          ? prevKey.slice(`asset:${shortId}:`.length)
          : prevKey.startsWith(`cards/${shortId}/`)
            ? prevKey.slice(`cards/${shortId}/`.length)
            : '';
        if (fileName && !referencedFiles.has(fileName)) {
          await deleteAssetKey(env, prevKey);
        } else {
          keptPreviousKeys.push(prevKey);
        }
      }

      let passcodeSalt = stored.passcodeSalt;
      let passcodeHash = stored.passcodeHash;
      if (typeof body.passcode === 'string') {
        if (passcode) {
          passcodeSalt = randomBase62(16);
          passcodeHash = await sha256Salted(passcode, passcodeSalt);
        } else {
          passcodeSalt = undefined;
          passcodeHash = undefined;
        }
      }

      const expiresAt = new Date(Date.now() + CARD_TTL_SECONDS * 1000).toISOString();
      const updated: StoredMetaRecord = {
        ...stored,
        config: {
          ...config,
          shareSettings: {
            ...config.shareSettings,
            passcodeEnabled: Boolean(passcodeHash),
          },
        },
        recipientHint: config.recipientName || '你',
        ageHint: Number.isFinite(config.age) ? config.age : 24,
        assetKeys: Array.from(new Set([...keptPreviousKeys, ...newlyStoredKeys])),
        passcodeSalt,
        passcodeHash,
        expiresAt,
      };

      await env.CARD_META.put(`card:${shortId}`, JSON.stringify(updated), {
        expirationTtl: CARD_TTL_SECONDS,
      });

      const origin = resolvePublicOrigin(request);
      return jsonResponse({
        shortId,
        shareUrl: `${origin}/c/${shortId}`,
        editToken,
        expiresAt,
      });
    }
  }

  return jsonResponse({ error: 'Method Not Allowed' }, 405);
}
