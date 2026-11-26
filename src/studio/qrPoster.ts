/**
 * 零外部依赖的 ISO/IEC 18004 QR Code Byte-Mode 编码器（纠错等级 M，Versions 1–10）
 * 与纯暖白棉纸风 1080×1440 分享海报生成器。
 */

interface QrVersionSpec {
  version: number;
  totalDataCodewords: number;
  ecPerBlock: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
  alignments: readonly number[];
}

// ISO/IEC 18004 Table 9 & Annex E — Error Correction Level M (Versions 1..10)
const QR_LEVEL_M_SPECS: readonly QrVersionSpec[] = [
  { version: 1, totalDataCodewords: 16, ecPerBlock: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0, alignments: [] },
  { version: 2, totalDataCodewords: 28, ecPerBlock: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0, alignments: [6, 18] },
  { version: 3, totalDataCodewords: 44, ecPerBlock: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0, alignments: [6, 22] },
  { version: 4, totalDataCodewords: 64, ecPerBlock: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0, alignments: [6, 26] },
  { version: 5, totalDataCodewords: 86, ecPerBlock: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0, alignments: [6, 30] },
  { version: 6, totalDataCodewords: 108, ecPerBlock: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0, alignments: [6, 34] },
  { version: 7, totalDataCodewords: 124, ecPerBlock: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0, alignments: [6, 22, 38] },
  { version: 8, totalDataCodewords: 154, ecPerBlock: 22, g1Blocks: 2, g1Data: 38, g2Blocks: 2, g2Data: 39, alignments: [6, 24, 42] },
  { version: 9, totalDataCodewords: 182, ecPerBlock: 22, g1Blocks: 3, g1Data: 36, g2Blocks: 2, g2Data: 37, alignments: [6, 26, 46] },
  { version: 10, totalDataCodewords: 216, ecPerBlock: 26, g1Blocks: 4, g1Data: 43, g2Blocks: 1, g2Data: 44, alignments: [6, 28, 50] },
];

function gfMul(a: number, b: number): number {
  let x = a;
  let y = b;
  let result = 0;
  for (let i = 0; i < 8; i++) {
    if ((y & 1) !== 0) result ^= x;
    const hi = x & 0x80;
    x = (x << 1) & 0xff;
    if (hi !== 0) x ^= 0x1d;
    y >>>= 1;
  }
  return result;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
    root = gfMul(root, 2);
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, gen: Uint8Array): Uint8Array {
  const ecLen = gen.length - 1;
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function appendBits(target: number[], value: number, bitCount: number): void {
  for (let i = bitCount - 1; i >= 0; i--) {
    target.push((value >>> i) & 1);
  }
}

function encodeDataCodewords(bytes: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const countBits = spec.version <= 9 ? 8 : 16;
  const totalBits = spec.totalDataCodewords * 8;
  const bits: number[] = [];

  // Byte mode indicator (0100) + character count + raw UTF-8 bytes
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, countBits);
  for (let i = 0; i < bytes.length; i++) {
    appendBits(bits, bytes[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const terminatorLen = Math.min(4, totalBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) {
    bits.push(0);
  }

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Convert bits to bytes and pad with alternating 0xEC, 0x11
  const out = new Uint8Array(spec.totalDataCodewords);
  const dataByteLen = bits.length / 8;
  for (let i = 0; i < dataByteLen; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | bits[i * 8 + b];
    }
    out[i] = val;
  }

  let padToggle = 0;
  for (let i = dataByteLen; i < spec.totalDataCodewords; i++) {
    out[i] = padToggle === 0 ? 0xec : 0x11;
    padToggle ^= 1;
  }

  return out;
}

function interleaveBlocks(dataCodewords: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  const gen = rsGeneratorPoly(spec.ecPerBlock);

  let offset = 0;
  for (let b = 0; b < spec.g1Blocks; b++) {
    const slice = dataCodewords.subarray(offset, offset + spec.g1Data);
    dataBlocks.push(slice);
    ecBlocks.push(rsComputeRemainder(slice, gen));
    offset += spec.g1Data;
  }
  for (let b = 0; b < spec.g2Blocks; b++) {
    const slice = dataCodewords.subarray(offset, offset + spec.g2Data);
    dataBlocks.push(slice);
    ecBlocks.push(rsComputeRemainder(slice, gen));
    offset += spec.g2Data;
  }

  const totalBlocks = spec.g1Blocks + spec.g2Blocks;
  const maxDataLen = Math.max(spec.g1Data, spec.g2Data);
  const totalBytes = spec.totalDataCodewords + totalBlocks * spec.ecPerBlock;
  const result = new Uint8Array(totalBytes);

  let outIdx = 0;
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (i < dataBlocks[b].length) {
        result[outIdx++] = dataBlocks[b][i];
      }
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      result[outIdx++] = ecBlocks[b][i];
    }
  }

  return result;
}

function computeFormatBitsLevelM(mask: number): number {
  // ECC Level M format indicator is 00 -> 5-bit data = (00 << 3) | mask = mask
  const data = mask & 0x07;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

function maskCondition(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function drawFormatBits(modules: boolean[][], size: number, mask: number): void {
  const bits = computeFormatBitsLevelM(mask);

  // Copy 1: around top-left finder
  for (let i = 0; i <= 5; i++) {
    modules[i][8] = ((bits >>> i) & 1) === 1;
  }
  modules[7][8] = ((bits >>> 6) & 1) === 1;
  modules[8][8] = ((bits >>> 7) & 1) === 1;
  modules[8][7] = ((bits >>> 8) & 1) === 1;
  for (let i = 9; i < 15; i++) {
    modules[8][14 - i] = ((bits >>> i) & 1) === 1;
  }

  // Copy 2: top-right & bottom-left
  for (let i = 0; i < 8; i++) {
    modules[8][size - 1 - i] = ((bits >>> i) & 1) === 1;
  }
  for (let i = 8; i < 15; i++) {
    modules[size - 15 + i][8] = ((bits >>> i) & 1) === 1;
  }
  // Always-dark module
  modules[size - 8][8] = true;
}

function evaluatePenalty(modules: boolean[][], size: number): number {
  let penalty = 0;

  // Rule 1: Adjacent runs of >= 5 same-color modules (horizontal & vertical)
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of same color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = modules[r][c];
      if (
        modules[r][c + 1] === color &&
        modules[r + 1][c] === color &&
        modules[r + 1][c + 1] === color
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 3: Finder-like 1:1:3:1:1 patterns preceded or followed by 4 light modules
  const checkLineFinderPenalty = (getBit: (idx: number) => boolean): number => {
    let score = 0;
    for (let i = 0; i <= size - 11; i++) {
      const p1 =
        getBit(i) &&
        !getBit(i + 1) &&
        getBit(i + 2) &&
        getBit(i + 3) &&
        getBit(i + 4) &&
        !getBit(i + 5) &&
        getBit(i + 6) &&
        !getBit(i + 7) &&
        !getBit(i + 8) &&
        !getBit(i + 9) &&
        !getBit(i + 10);
      const p2 =
        !getBit(i) &&
        !getBit(i + 1) &&
        !getBit(i + 2) &&
        !getBit(i + 3) &&
        getBit(i + 4) &&
        !getBit(i + 5) &&
        getBit(i + 6) &&
        getBit(i + 7) &&
        getBit(i + 8) &&
        !getBit(i + 9) &&
        getBit(i + 10);
      if (p1 || p2) score += 40;
    }
    return score;
  };

  for (let r = 0; r < size; r++) {
    penalty += checkLineFinderPenalty((c) => modules[r][c]);
  }
  for (let c = 0; c < size; c++) {
    penalty += checkLineFinderPenalty((r) => modules[r][c]);
  }

  // Rule 4: Dark/light balance deviation from 50%
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) darkCount += 1;
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
  penalty += k * 10;

  return penalty;
}

/**
 * 将 UTF-8 字符串编码为标准 ISO/IEC 18004 二维码矩阵（Byte Mode，纠错等级 M，Versions 1–10）。
 */
export function encodeQrMatrix(text: string): boolean[][] {
  const utf8 = new TextEncoder().encode(text);

  let chosen: QrVersionSpec | null = null;
  for (const spec of QR_LEVEL_M_SPECS) {
    const countBits = spec.version <= 9 ? 8 : 16;
    if (4 + countBits + utf8.length * 8 <= spec.totalDataCodewords * 8) {
      chosen = spec;
      break;
    }
  }

  if (!chosen) {
    // Graceful truncation to Version 10 max byte capacity (213 bytes)
    chosen = QR_LEVEL_M_SPECS[QR_LEVEL_M_SPECS.length - 1];
  }

  const maxBytes = Math.floor(
    (chosen.totalDataCodewords * 8 - 4 - (chosen.version <= 9 ? 8 : 16)) / 8
  );
  const payload = utf8.length <= maxBytes ? utf8 : utf8.subarray(0, maxBytes);

  const dataCodewords = encodeDataCodewords(payload, chosen);
  const allCodewords = interleaveBlocks(dataCodewords, chosen);

  const size = 17 + 4 * chosen.version;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunction = (r: number, c: number, dark: boolean): void => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = dark;
    isFunction[r][c] = true;
  };

  // 1. Finder patterns + 1-module white separators
  const drawFinder = (top: number, left: number): void => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        const dark = inOuter && dist !== 2;
        setFunction(r, c, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setFunction(6, i, dark);
    setFunction(i, 6, dark);
  }

  // 3. Alignment patterns
  const centers = chosen.alignments;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const cr = centers[i];
      const cc = centers[j];
      const overlapsFinder =
        (cr <= 8 && cc <= 8) ||
        (cr <= 8 && cc >= size - 9) ||
        (cr >= size - 9 && cc <= 8);
      if (overlapsFinder) continue;

      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunction(cr + dr, cc + dc, dist !== 1);
        }
      }
    }
  }

  // 4. Reserve format info positions & dark module
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = true;
    isFunction[size - 1 - i][8] = true;
  }
  setFunction(size - 8, 8, true);

  // 5. Version info blocks (Versions 7–10)
  if (chosen.version >= 7) {
    const vBits = computeVersionBits(chosen.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((vBits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  // 6. Place data + EC bits in standard 2-column zigzag order
  let bitIdx = 0;
  const totalDataBitLen = allCodewords.length * 8;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunction[r][c]) continue;
        let dark = false;
        if (bitIdx < totalDataBitLen) {
          const byte = allCodewords[bitIdx >>> 3];
          dark = ((byte >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx += 1;
        }
        modules[r][c] = dark;
      }
    }
    upward = !upward;
  }

  // 7. Evaluate all 8 mask patterns and select lowest penalty
  const applyMask = (mask: number): void => {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunction[r][c] && maskCondition(mask, r, c)) {
          modules[r][c] = !modules[r][c];
        }
      }
    }
  };

  let bestMask = 0;
  let bestPenalty = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormatBits(modules, size, mask);
    const penalty = evaluatePenalty(modules, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(mask); // XOR reverts
  }

  applyMask(bestMask);
  drawFormatBits(modules, size, bestMask);

  return modules;
}

/**
 * 将文本渲染为带 4 模块标准安静区的高对比度二维码 Canvas（像素对齐、清晰可扫）。
 */
export function renderQrToCanvas(
  text: string,
  size = 360,
  fg = '#1E1D1B',
  bg = '#FFFFFF'
): HTMLCanvasElement {
  const matrix = encodeQrMatrix(text);
  const count = matrix.length;
  const quietZone = 4;
  const totalModules = count + quietZone * 2;

  const targetSize = Math.max(120, Math.round(size));
  const scale = Math.max(2, Math.floor(targetSize / totalModules));
  const drawSize = scale * totalModules;
  const offset = Math.floor((targetSize - drawSize) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, targetSize, targetSize);

  ctx.fillStyle = fg;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!matrix[r][c]) continue;
      ctx.fillRect(
        offset + (c + quietZone) * scale,
        offset + (r + quietZone) * scale,
        scale,
        scale
      );
    }
  }

  return canvas;
}

export interface SharePosterOptions {
  shareUrl: string;
  recipientName: string;
  senderName: string;
  age: number;
  birthdayDate: string;
  hasPasscode: boolean;
  passcodeHint?: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number
): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const keepStart = Math.ceil((maxLen - 3) * 0.65);
  const keepEnd = maxLen - 3 - keepStart;
  return `${text.slice(0, keepStart)}...${text.slice(text.length - keepEnd)}`;
}

/**
 * 生成 1080×1440 纯暖白棉纸质感分享海报（PNG Data URL），
 * 包含香槟金极细边框、杂志感英文/中文标题、醒目岁数与高对比度可扫描二维码。
 */
export function generateSharePosterDataUrl(opts: SharePosterOptions): string {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const serif = '"Noto Serif SC", "Songti SC", "STSong", Georgia, serif';
  const sans = '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif';

  // 1. Warm-white cotton paper base with soft ivory center luminescence
  const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.36, 80, W * 0.5, H * 0.5, H * 0.78);
  bgGrad.addColorStop(0, '#FDFBF8');
  bgGrad.addColorStop(0.65, '#FAF8F4');
  bgGrad.addColorStop(1, '#F2ECE2');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle deterministic cotton paper fiber texture
  ctx.fillStyle = 'rgba(156, 122, 70, 0.032)';
  for (let i = 0; i < 420; i++) {
    const px = ((i * 263 + 47) % W);
    const py = ((i * 521 + 91) % H);
    const r = (i % 3) === 0 ? 1.4 : 0.9;
    ctx.fillRect(px, py, r, r);
  }

  // 2. Champagne-gold double hairline architectural border
  ctx.strokeStyle = 'rgba(186, 152, 98, 0.48)';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.strokeStyle = 'rgba(186, 152, 98, 0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(62, 62, W - 124, H - 124);

  // Delicate corner accents
  ctx.fillStyle = '#B8955A';
  drawFourPointStar(ctx, 62, 62, 7, 2.2);
  drawFourPointStar(ctx, W - 62, 62, 7, 2.2);
  drawFourPointStar(ctx, 62, H - 62, 7, 2.2);
  drawFourPointStar(ctx, W - 62, H - 62, 7, 2.2);

  // 3. Top eyebrow + date
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9C7A46';
  ctx.font = `500 22px ${sans}`;
  const dateLabel = opts.birthdayDate.trim()
    ? `BIRTHDAY CARD  ·  ${opts.birthdayDate.trim()}`
    : 'BIRTHDAY CARD  ·  3D 生日贺卡';
  ctx.fillText(dateLabel, W / 2, 132);

  // 4. Editorial serif title
  ctx.fillStyle = '#242321';
  ctx.font = `500 74px ${serif}`;
  ctx.fillText('Happy Birthday', W / 2, 224);

  // Hairline ornament
  ctx.strokeStyle = 'rgba(156, 122, 70, 0.42)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 140, 286);
  ctx.lineTo(W / 2 - 18, 286);
  ctx.moveTo(W / 2 + 18, 286);
  ctx.lineTo(W / 2 + 140, 286);
  ctx.stroke();
  ctx.fillStyle = '#B8955A';
  drawFourPointStar(ctx, W / 2, 286, 8, 2.5);

  // 5. Crisp age numeral & recipient dedication
  const safeAge = Math.max(1, Math.min(999, Math.round(opts.age || 24)));
  const recipient = opts.recipientName.trim() || '你';
  const sender = opts.senderName.trim() || '你的朋友';

  ctx.fillStyle = '#9C7A46';
  ctx.font = `600 132px ${serif}`;
  ctx.fillText(String(safeAge), W / 2, 396);

  ctx.fillStyle = '#242321';
  ctx.font = `500 36px ${serif}`;
  const recipientLine =
    recipient === '你'
      ? `祝你 ${safeAge} 岁生日快乐`
      : `致 ${recipient} · ${safeAge} 岁生日快乐`;
  ctx.fillText(recipientLine, W / 2, 496);

  ctx.fillStyle = '#706A61';
  ctx.font = `400 24px ${sans}`;
  ctx.fillText('为你准备了一张可翻阅的 3D 生日贺卡', W / 2, 548);

  // 6. Elevated white QR frame
  const frameSize = 468;
  const frameX = (W - frameSize) / 2;
  const frameY = 606;

  ctx.save();
  ctx.shadowColor = 'rgba(36, 35, 33, 0.08)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, frameX, frameY, frameSize, frameSize, 24);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(186, 152, 98, 0.36)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, frameX, frameY, frameSize, frameSize, 24);
  ctx.stroke();

  const qrSize = 408;
  const qrCanvas = renderQrToCanvas(opts.shareUrl, qrSize, '#1E1D1B', '#FFFFFF');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    qrCanvas,
    Math.round(frameX + (frameSize - qrSize) / 2),
    Math.round(frameY + (frameSize - qrSize) / 2)
  );
  ctx.imageSmoothingEnabled = true;

  // 7. Scan instruction, optional passcode pill, short link & signature
  ctx.fillStyle = '#242321';
  ctx.font = `500 28px ${sans}`;
  ctx.fillText('微信扫一扫或浏览器打开', W / 2, 1144);

  let nextY = 1200;
  if (opts.hasPasscode) {
    const passcodeText = opts.passcodeHint?.trim()
      ? `口令提示：${opts.passcodeHint.trim()}`
      : '已开启 4 位生日口令保护';
    ctx.font = `400 22px ${sans}`;
    const pillWidth = Math.min(620, Math.max(300, ctx.measureText(passcodeText).width + 54));
    const pillX = (W - pillWidth) / 2;
    const pillY = nextY - 22;

    ctx.fillStyle = '#F3EFE6';
    drawRoundedRect(ctx, pillX, pillY, pillWidth, 44, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(156, 122, 70, 0.35)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, pillX, pillY, pillWidth, 44, 22);
    ctx.stroke();

    ctx.fillStyle = '#856537';
    ctx.fillText(passcodeText, W / 2, nextY);
    nextY += 56;
  }

  ctx.fillStyle = '#7A7369';
  ctx.font = `400 21px "SFMono-Regular", Consolas, Menlo, monospace`;
  ctx.fillText(truncateMiddle(opts.shareUrl, 52), W / 2, nextY);

  // Bottom sender footer
  ctx.strokeStyle = 'rgba(186, 152, 98, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 180, 1304);
  ctx.lineTo(W / 2 + 180, 1304);
  ctx.stroke();

  ctx.fillStyle = '#524D46';
  ctx.font = `400 25px ${serif}`;
  ctx.fillText(`来自 ${sender} 的心意`, W / 2, 1346);

  return canvas.toDataURL('image/png');
}

export function downloadPosterPng(dataUrl: string, filename: string): void {
  const safeName = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = safeName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
