export interface CompressedPhoto {
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

const DEFAULT_MAX_EDGE = 1080;
const DEFAULT_QUALITY = 0.82;
const TARGET_MAX_BYTES = 240_000;
const FALLBACK_RETRY_QUALITY = 0.7;
const SECOND_RETRY_QUALITY = 0.58;
const CANVAS_MATTE_FILL = '#FAF8F4';

interface DecodedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  let padding = 0;
  if (base64.endsWith('==')) padding = 2;
  else if (base64.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function extractMimeType(dataUrl: string): string {
  const match = /^data:([^;,]+)/i.exec(dataUrl);
  return match ? match[1].toLowerCase() : 'image/jpeg';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('无法读取图片文件内容'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败，请确认文件为常见图片格式'));
    img.src = src;
  });
}

async function decodeImageFile(file: File): Promise<DecodedImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => {
          try {
            bitmap.close();
          } catch {
            // ignore
          }
        },
      };
    } catch {
      // Fallback to FileReader + HTMLImageElement below
    }
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadHtmlImage(rawDataUrl);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    release: () => {
      img.src = '';
    },
  };
}

function computeScaledDimensions(
  srcWidth: number,
  srcHeight: number,
  maxEdge: number
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(srcWidth));
  const safeH = Math.max(1, Math.round(srcHeight));
  const longest = Math.max(safeW, safeH);
  if (longest <= maxEdge) {
    return { width: safeW, height: safeH };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

function renderAndEncode(
  source: CanvasImageSource,
  width: number,
  height: number,
  preferredMime: 'image/webp' | 'image/jpeg',
  quality: number
): { dataUrl: string; mimeType: string; sizeBytes: number } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('当前浏览器不支持 Canvas 2D 图片处理');
  }

  // Fill with warm-white paper tone so transparent PNGs never turn black on JPEG fallback
  ctx.fillStyle = CANVAS_MATTE_FILL;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);

  let dataUrl = canvas.toDataURL(preferredMime, quality);
  let mimeType = extractMimeType(dataUrl);

  // Older Safari / WebViews return image/png when image/webp is unsupported
  if (preferredMime === 'image/webp' && mimeType !== 'image/webp') {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    mimeType = extractMimeType(dataUrl);
  }

  // Release canvas backing store promptly on mobile devices
  canvas.width = 0;
  canvas.height = 0;

  return {
    dataUrl,
    mimeType,
    sizeBytes: estimateDataUrlBytes(dataUrl),
  };
}

/**
 * 压缩用户上传的照片：
 * - 优先使用 `createImageBitmap` 自动处理手机相册 EXIF 方向；
 * - 等比缩放至最长边 `maxEdge`（默认 1080px）；
 * - 优先导出 `image/webp`（不支持时平滑回退 `image/jpeg`）；
 * - 若超过 240KB 自动降质重试，使单张照片稳定控制在约 70–180KB。
 */
export async function compressPhotoFile(
  file: File,
  maxEdge = DEFAULT_MAX_EDGE,
  quality = DEFAULT_QUALITY
): Promise<CompressedPhoto> {
  const safeMaxEdge = Math.max(240, Math.min(2048, Math.round(maxEdge)));
  const safeQuality = Math.max(0.35, Math.min(0.95, quality));

  const decoded = await decodeImageFile(file);
  try {
    let { width, height } = computeScaledDimensions(decoded.width, decoded.height, safeMaxEdge);

    let encoded = renderAndEncode(decoded.source, width, height, 'image/webp', safeQuality);
    const workingMime: 'image/webp' | 'image/jpeg' =
      encoded.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';

    if (encoded.sizeBytes > TARGET_MAX_BYTES) {
      const retryQuality = Math.min(safeQuality - 0.08, FALLBACK_RETRY_QUALITY);
      const retry = renderAndEncode(decoded.source, width, height, workingMime, retryQuality);
      if (retry.sizeBytes < encoded.sizeBytes) {
        encoded = retry;
      }
    }

    if (encoded.sizeBytes > TARGET_MAX_BYTES) {
      const secondRetry = renderAndEncode(
        decoded.source,
        width,
        height,
        workingMime,
        SECOND_RETRY_QUALITY
      );
      if (secondRetry.sizeBytes < encoded.sizeBytes) {
        encoded = secondRetry;
      }
    }

    if (encoded.sizeBytes > 300_000 && Math.max(width, height) > 840) {
      const smaller = computeScaledDimensions(decoded.width, decoded.height, 840);
      const compact = renderAndEncode(
        decoded.source,
        smaller.width,
        smaller.height,
        workingMime,
        FALLBACK_RETRY_QUALITY
      );
      if (compact.sizeBytes < encoded.sizeBytes) {
        width = smaller.width;
        height = smaller.height;
        encoded = compact;
      }
    }

    return {
      dataUrl: encoded.dataUrl,
      width,
      height,
      sizeBytes: encoded.sizeBytes,
      mimeType: encoded.mimeType,
    };
  } finally {
    decoded.release();
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
