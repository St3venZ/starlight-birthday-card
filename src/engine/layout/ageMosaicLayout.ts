import type {
  BirthdayCardConfig,
  MemoryPhotoItem,
  MosaicDensityMode,
  MosaicLayoutResult,
  MosaicSlot,
  PresetCardMeta,
} from '../../config/types';

export type ResolvedMosaicDensity = Exclude<MosaicDensityMode, 'auto'>;

export interface AgeMosaicLayoutOptions {
  densityMode?: MosaicDensityMode;
  layoutSeed?: number;
}

const DEFAULT_LAYOUT_SEED = 20261126;

/**
 * 3 档精调 0–9 比例字距点阵字形表：
 * - compact (4×6，数字 1 窄宽 2)：照片较少或 3 位数年龄时清朗紧凑；
 * - standard (5×7，数字 1 窄宽 3)：9–24 张照片时的经典黄金比例；
 * - deluxe (6×8，数字 1 窄宽 3)：25+ 张丰富回忆时的丰盈画卷。
 * 0/6/8/9 均柔化四角，且按单字真实宽度比例排布字距（数字 1 绝无尴尬大空隙）。
 */
export const GLYPH_SETS: Record<ResolvedMosaicDensity, { rows: number; glyphs: Record<string, readonly string[]> }> = {
  compact: {
    rows: 6,
    glyphs: {
      '0': [
        '.XX.',
        'X..X',
        'X..X',
        'X..X',
        'X..X',
        '.XX.',
      ],
      '1': [
        '.X',
        'XX',
        '.X',
        '.X',
        '.X',
        '.X',
      ],
      '2': [
        '.XX.',
        'X..X',
        '...X',
        '..X.',
        '.X..',
        'XXXX',
      ],
      '3': [
        '.XX.',
        'X..X',
        '.XX.',
        '...X',
        'X..X',
        '.XX.',
      ],
      '4': [
        '..X.',
        '.XX.',
        'X.X.',
        'XXXX',
        '..X.',
        '..X.',
      ],
      '5': [
        'XXXX',
        'X...',
        'XXX.',
        '...X',
        'X..X',
        '.XX.',
      ],
      '6': [
        '.XX.',
        'X...',
        'XXX.',
        'X..X',
        'X..X',
        '.XX.',
      ],
      '7': [
        'XXXX',
        '...X',
        '..X.',
        '.X..',
        '.X..',
        '.X..',
      ],
      '8': [
        '.XX.',
        'X..X',
        '.XX.',
        'X..X',
        'X..X',
        '.XX.',
      ],
      '9': [
        '.XX.',
        'X..X',
        'X..X',
        '.XXX',
        '...X',
        '.XX.',
      ],
    },
  },
  standard: {
    rows: 7,
    glyphs: {
      '0': [
        '.XXX.',
        'X...X',
        'X...X',
        'X...X',
        'X...X',
        'X...X',
        '.XXX.',
      ],
      '1': [
        '.X.',
        'XX.',
        '.X.',
        '.X.',
        '.X.',
        '.X.',
        'XXX',
      ],
      '2': [
        '.XXX.',
        'X...X',
        '....X',
        '..XX.',
        '.X...',
        'X....',
        'XXXXX',
      ],
      '3': [
        '.XXX.',
        'X...X',
        '....X',
        '..XX.',
        '....X',
        'X...X',
        '.XXX.',
      ],
      '4': [
        '...X.',
        '..XX.',
        '.X.X.',
        'X..X.',
        'XXXXX',
        '...X.',
        '...X.',
      ],
      '5': [
        'XXXXX',
        'X....',
        'XXXX.',
        '....X',
        '....X',
        'X...X',
        '.XXX.',
      ],
      '6': [
        '.XXX.',
        'X....',
        'X....',
        'XXXX.',
        'X...X',
        'X...X',
        '.XXX.',
      ],
      '7': [
        'XXXXX',
        '....X',
        '...X.',
        '..X..',
        '.X...',
        '.X...',
        '.X...',
      ],
      '8': [
        '.XXX.',
        'X...X',
        'X...X',
        '.XXX.',
        'X...X',
        'X...X',
        '.XXX.',
      ],
      '9': [
        '.XXX.',
        'X...X',
        'X...X',
        '.XXXX',
        '....X',
        '....X',
        '.XXX.',
      ],
    },
  },
  deluxe: {
    rows: 8,
    glyphs: {
      '0': [
        '.XXXX.',
        'X....X',
        'X....X',
        'X....X',
        'X....X',
        'X....X',
        'X....X',
        '.XXXX.',
      ],
      '1': [
        '.X.',
        'XX.',
        '.X.',
        '.X.',
        '.X.',
        '.X.',
        '.X.',
        'XXX',
      ],
      '2': [
        '.XXXX.',
        'X....X',
        '.....X',
        '...XX.',
        '..X...',
        '.X....',
        'X.....',
        'XXXXXX',
      ],
      '3': [
        '.XXXX.',
        'X....X',
        '.....X',
        '..XXX.',
        '.....X',
        '.....X',
        'X....X',
        '.XXXX.',
      ],
      '4': [
        '....X.',
        '...XX.',
        '..X.X.',
        '.X..X.',
        'X...X.',
        'XXXXXX',
        '....X.',
        '....X.',
      ],
      '5': [
        'XXXXXX',
        'X.....',
        'X.....',
        'XXXXX.',
        '.....X',
        '.....X',
        'X....X',
        '.XXXX.',
      ],
      '6': [
        '.XXXX.',
        'X.....',
        'X.....',
        'XXXXX.',
        'X....X',
        'X....X',
        'X....X',
        '.XXXX.',
      ],
      '7': [
        'XXXXXX',
        '.....X',
        '....X.',
        '...X..',
        '..X...',
        '..X...',
        '..X...',
        '..X...',
      ],
      '8': [
        '.XXXX.',
        'X....X',
        'X....X',
        '.XXXX.',
        'X....X',
        'X....X',
        'X....X',
        '.XXXX.',
      ],
      '9': [
        '.XXXX.',
        'X....X',
        'X....X',
        'X....X',
        '.XXXXX',
        '.....X',
        '.....X',
        '.XXXX.',
      ],
    },
  },
};

interface BaseCell {
  id: number;
  digitIndex: number;
  row: number;
  col: number;
  globalCol: number;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

/**
 * 确定性 Mulberry32 伪随机数生成器，保证同一 layoutSeed 每次生成完全一致的优雅排布。
 */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeAge(age: number): { safeAge: number; ageText: string } {
  const safeAge = Math.max(1, Math.min(999, Math.round(Number.isFinite(age) ? age : 24)));
  return { safeAge, ageText: String(safeAge) };
}

function resolveDensityMode(
  ageText: string,
  densityMode: MosaicDensityMode | undefined,
  photoCount: number
): ResolvedMosaicDensity {
  if (densityMode === 'compact' || densityMode === 'standard' || densityMode === 'deluxe') {
    return densityMode;
  }
  if (photoCount <= 8 || ageText.length >= 3) {
    return 'compact';
  }
  if (photoCount <= 24) {
    return 'standard';
  }
  return 'deluxe';
}

function countGlyphDots(glyph: readonly string[]): number {
  let total = 0;
  for (const row of glyph) {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === 'X') total += 1;
    }
  }
  return total;
}

/**
 * 快速计算给定年龄、密度模式与照片数量下的实际点阵密度与总数字槽位数，
 * 供创作者工坊在输入年龄 / 切换密度时实时展示提示。
 */
export function getDigitSlotCount(
  age: number,
  densityMode: MosaicDensityMode,
  photoCount: number
): { densityUsed: ResolvedMosaicDensity; totalDigitSlots: number } {
  const { ageText } = normalizeAge(age);
  const densityUsed = resolveDensityMode(ageText, densityMode, Math.max(0, photoCount));
  const set = GLYPH_SETS[densityUsed];

  let totalDigitSlots = 0;
  for (const digitChar of ageText) {
    const glyph = set.glyphs[digitChar] ?? set.glyphs['0'];
    totalDigitSlots += countGlyphDots(glyph);
  }

  return { densityUsed, totalDigitSlots };
}

/**
 * 确定性单元格种子微扰（[-1, 1]），随 layoutSeed 自然变化且 100% 可复现。
 */
function seededCellNoise(seed: number, a: number, b: number, c: number): number {
  let h = (seed ^ Math.imul(a + 17, 374761393) ^ Math.imul(b + 31, 668265263) ^ Math.imul(c + 53, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 4294967295) * 2 - 1;
}

/**
 * 根据密度和数字位数选择优雅协调的单卡尺寸、步距与全景微弧深度。
 */
function getMetricProfile(density: ResolvedMosaicDensity, digitCount: number): {
  cardWidth: number;
  cardHeight: number;
  colStep: number;
  rowStep: number;
  digitGapCols: number;
  arcDepth: number;
  maxYaw: number;
} {
  if (density === 'compact') {
    if (digitCount === 1) {
      return { cardWidth: 0.98, cardHeight: 1.3, colStep: 1.18, rowStep: 1.5, digitGapCols: 0, arcDepth: 0.52, maxYaw: 0.13 };
    }
    if (digitCount === 2) {
      return { cardWidth: 0.9, cardHeight: 1.2, colStep: 1.08, rowStep: 1.38, digitGapCols: 1.55, arcDepth: 1.05, maxYaw: 0.21 };
    }
    return { cardWidth: 0.76, cardHeight: 1.01, colStep: 0.92, rowStep: 1.18, digitGapCols: 1.35, arcDepth: 1.52, maxYaw: 0.27 };
  }

  if (density === 'standard') {
    if (digitCount === 1) {
      return { cardWidth: 0.92, cardHeight: 1.22, colStep: 1.12, rowStep: 1.42, digitGapCols: 0, arcDepth: 0.56, maxYaw: 0.14 };
    }
    if (digitCount === 2) {
      return { cardWidth: 0.84, cardHeight: 1.12, colStep: 1.02, rowStep: 1.3, digitGapCols: 1.55, arcDepth: 1.15, maxYaw: 0.22 };
    }
    return { cardWidth: 0.7, cardHeight: 0.93, colStep: 0.85, rowStep: 1.09, digitGapCols: 1.3, arcDepth: 1.65, maxYaw: 0.28 };
  }

  // deluxe
  if (digitCount === 1) {
    return { cardWidth: 0.82, cardHeight: 1.09, colStep: 0.98, rowStep: 1.26, digitGapCols: 0, arcDepth: 0.58, maxYaw: 0.14 };
  }
  if (digitCount === 2) {
    return { cardWidth: 0.74, cardHeight: 0.98, colStep: 0.9, rowStep: 1.15, digitGapCols: 1.55, arcDepth: 1.2, maxYaw: 0.23 };
  }
  return { cardWidth: 0.62, cardHeight: 0.83, colStep: 0.75, rowStep: 0.97, digitGapCols: 1.3, arcDepth: 1.72, maxYaw: 0.29 };
}

/**
 * 在单个数字内进行「可控排斥权重随机抽取」：
 * - 惩罚直接相邻已选点位，避免照片扎堆；
 * - 保留种子驱动的自然随机感，点击「随机换排布」即可获得全新视觉平衡。
 */
function selectRepulsionWeightedCells(
  freeCells: BaseCell[],
  alreadyChosen: BaseCell[],
  count: number,
  rng: () => number
): BaseCell[] {
  if (count <= 0 || freeCells.length === 0) return [];
  if (count >= freeCells.length) return [...freeCells];

  const pool = [...freeCells];
  const chosen: BaseCell[] = [...alreadyChosen];
  const newlyPicked: BaseCell[] = [];

  for (let step = 0; step < count && pool.length > 0; step++) {
    const weights: number[] = [];
    let totalWeight = 0;

    for (const candidate of pool) {
      let minDist = Infinity;
      for (const existing of chosen) {
        const d = Math.hypot(candidate.col - existing.col, candidate.row - existing.row);
        if (d < minDist) minDist = d;
      }

      let weight: number;
      if (!Number.isFinite(minDist)) {
        // 第一张照片略微偏好数字视觉中上与转折主干，同时保持随机性
        weight = 1.0;
      } else if (minDist <= 1.05) {
        weight = 0.045;
      } else if (minDist <= 1.52) {
        weight = 0.24;
      } else if (minDist <= 2.3) {
        weight = 1.05;
      } else {
        weight = 2.6;
      }

      weights.push(weight);
      totalWeight += weight;
    }

    let roll = rng() * totalWeight;
    let pickedIndex = pool.length - 1;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        pickedIndex = i;
        break;
      }
    }

    const picked = pool.splice(pickedIndex, 1)[0];
    chosen.push(picked);
    newlyPicked.push(picked);
  }

  return newlyPicked;
}

/**
 * 构建 3D 立体年龄数字照片拼图布局：
 * - 支持 compact / standard / deluxe 三档比例字距点阵字形，自动按照片数与年龄位数适配；
 * - 支持任意数量照片（1..40+）的可控种子随机排布（分层按位配额 + 邻域排斥采样）；
 * - 优先尊重创作者锁定的 `pinnedSlotIndex` 槽位；
 * - 照片数超出点阵总数时，全部数字槽位填满用户照片，并将多余照片优雅排布于后方星环光晕层（零丢图）；
 * - 开启 autoFill 时以相邻不重复的方式均衡填入内置暖白插画预设卡。
 */
export function buildAgeMosaicLayout(
  age: number,
  memories: MemoryPhotoItem[],
  presets: PresetCardMeta[],
  presetFill: BirthdayCardConfig['presetFill'],
  options?: AgeMosaicLayoutOptions
): MosaicLayoutResult {
  const { safeAge, ageText } = normalizeAge(age);
  const safeMemories = Array.isArray(memories) ? memories : [];
  const densityUsed = resolveDensityMode(ageText, options?.densityMode, safeMemories.length);
  const resolvedSeed =
    options?.layoutSeed !== undefined && Number.isFinite(options.layoutSeed)
      ? Math.floor(Math.abs(options.layoutSeed)) >>> 0
      : DEFAULT_LAYOUT_SEED;

  const glyphSet = GLYPH_SETS[densityUsed];
  const digits = ageText.split('');
  const digitCount = digits.length;
  const metrics = getMetricProfile(densityUsed, digitCount);

  // 1. 计算比例字距总宽（每位数字按自身实际列宽占位，窄宽 "1" 无多余空隙）
  const digitGlyphs = digits.map((ch) => glyphSet.glyphs[ch] ?? glyphSet.glyphs['0']);
  const digitWidths = digitGlyphs.map((g) => g[0].length);
  const totalWidthCols =
    digitWidths.reduce((acc, w) => acc + w, 0) +
    Math.max(0, digitCount - 1) * metrics.digitGapCols -
    1;
  const centerCol = totalWidthCols / 2;
  const centerRow = (glyphSet.rows - 1) / 2;
  const halfSpanX = Math.max(1, (totalWidthCols / 2) * metrics.colStep);
  const halfSpanY = Math.max(1, centerRow * metrics.rowStep);

  // 2. 构建基础数字层全部单元格
  const baseCells: BaseCell[] = [];
  const cellsByDigit: BaseCell[][] = [];
  let cellIdCounter = 0;
  let cursorCol = 0;

  digitGlyphs.forEach((glyph, digitIndex) => {
    const gWidth = glyph[0].length;
    const digitCells: BaseCell[] = [];

    for (let row = 0; row < glyphSet.rows; row++) {
      const pattern = glyph[row];
      for (let col = 0; col < gWidth; col++) {
        if (pattern[col] !== 'X') continue;

        const globalCol = cursorCol + col;
        const baseX = (globalCol - centerCol) * metrics.colStep;
        const baseY = (centerRow - row) * metrics.rowStep;

        const nx = baseX / halfSpanX;
        const ny = baseY / halfSpanY;

        // 随种子产生柔和的微悬浮抖动，既有手工悬停感又严格可复现
        const jitterX = seededCellNoise(resolvedSeed ^ 0x1357, digitIndex, row, col) * 0.024;
        const jitterY = seededCellNoise(resolvedSeed ^ 0x2468, digitIndex, row, col) * 0.024;
        const jitterZ = seededCellNoise(resolvedSeed ^ 0x9e37, digitIndex, row, col) * 0.14;
        const jitterRotZ = seededCellNoise(resolvedSeed ^ 0x7f4a, col, digitIndex, row) * 0.032;

        const x = baseX + jitterX;
        const y = baseY + jitterY;
        const z = metrics.arcDepth * (nx * nx) + jitterZ;
        const rotY = -nx * metrics.maxYaw;
        const rotX = ny * 0.045;
        const rotZ = jitterRotZ;

        const cell: BaseCell = {
          id: cellIdCounter++,
          digitIndex,
          row,
          col,
          globalCol,
          x,
          y,
          z,
          rotX,
          rotY,
          rotZ,
        };
        baseCells.push(cell);
        digitCells.push(cell);
      }
    }

    cellsByDigit.push(digitCells);
    cursorCol += gWidth + metrics.digitGapCols;
  });

  const totalDigitSlots = baseCells.length;
  const rng = createSeededRng(
    (resolvedSeed ^ Math.imul(safeAge + 1, 2654435761) ^ Math.imul(totalDigitSlots + 3, 2246822519)) >>>
      0
  );

  // 3. 优先尊重有效的 pinnedSlotIndex（将指定照片锁定到精确槽位）
  const assignedMemoryByCellId = new Map<number, MemoryPhotoItem>();
  const pinnedCellsByDigit: BaseCell[][] = Array.from({ length: digitCount }, () => []);
  const unpinnedMemories: MemoryPhotoItem[] = [];

  for (const memory of safeMemories) {
    const pin = memory.pinnedSlotIndex;
    if (
      typeof pin === 'number' &&
      Number.isInteger(pin) &&
      pin >= 0 &&
      pin < totalDigitSlots &&
      !assignedMemoryByCellId.has(pin)
    ) {
      assignedMemoryByCellId.set(pin, memory);
      const cell = baseCells[pin];
      pinnedCellsByDigit[cell.digitIndex].push(cell);
    } else {
      unpinnedMemories.push(memory);
    }
  }

  // 4. 分层按数字位自由槽位比例分配未锁定回忆配额，避免任何一位数字空洞
  const freeCellsByDigit = cellsByDigit.map((cells) =>
    cells.filter((cell) => !assignedMemoryByCellId.has(cell.id))
  );
  const totalFreeDigitSlots = freeCellsByDigit.reduce((acc, list) => acc + list.length, 0);
  const unpinnedInDigitsCount = Math.min(unpinnedMemories.length, totalFreeDigitSlots);

  const quotas = new Array<number>(digitCount).fill(0);
  if (unpinnedInDigitsCount > 0 && totalFreeDigitSlots > 0) {
    // 若总回忆数足够覆盖每一位数字，优先为尚未有照片的数字预留 1 个保底席位
    let remaining = unpinnedInDigitsCount;
    if (safeMemories.length >= digitCount) {
      for (let d = 0; d < digitCount && remaining > 0; d++) {
        if (pinnedCellsByDigit[d].length === 0 && freeCellsByDigit[d].length > 0) {
          quotas[d] += 1;
          remaining -= 1;
        }
      }
    }

    // 按剩余自由容量比例分配余量
    if (remaining > 0) {
      const capLeft = freeCellsByDigit.map((list, d) => list.length - quotas[d]);
      const sumCapLeft = capLeft.reduce((a, b) => a + b, 0);
      if (sumCapLeft > 0) {
        const remainders: Array<{ d: number; frac: number; tie: number }> = [];
        let assignedFloor = 0;

        for (let d = 0; d < digitCount; d++) {
          const exact = (remaining * capLeft[d]) / sumCapLeft;
          const whole = Math.min(capLeft[d], Math.floor(exact));
          quotas[d] += whole;
          assignedFloor += whole;
          remainders.push({ d, frac: exact - whole, tie: rng() });
        }

        let left = remaining - assignedFloor;
        remainders.sort((a, b) => {
          if (Math.abs(b.frac - a.frac) > 1e-6) return b.frac - a.frac;
          return b.tie - a.tie;
        });

        for (const item of remainders) {
          if (left <= 0) break;
          if (quotas[item.d] < freeCellsByDigit[item.d].length) {
            quotas[item.d] += 1;
            left -= 1;
          }
        }
      }
    }
  }

  // 5. 在每位数字内使用排斥权重随机采样挑选散落均匀的照片锚点
  const pickedUnpinnedCells: BaseCell[] = [];
  for (let d = 0; d < digitCount; d++) {
    const picked = selectRepulsionWeightedCells(
      freeCellsByDigit[d],
      pinnedCellsByDigit[d],
      quotas[d],
      rng
    );
    pickedUnpinnedCells.push(...picked);
  }

  // 将选中的未锁定槽位按从左到右、从上到下顺序对应绑定到前 unpinnedInDigitsCount 张未锁定回忆
  pickedUnpinnedCells.sort((a, b) => {
    if (Math.abs(a.globalCol - b.globalCol) > 1e-4) {
      return a.globalCol - b.globalCol;
    }
    return a.row - b.row;
  });

  pickedUnpinnedCells.forEach((cell, idx) => {
    assignedMemoryByCellId.set(cell.id, unpinnedMemories[idx]);
  });

  // 为全部位于数字层内的回忆统一编排 memoryOrder（从左到右、从上到下流畅游览）
  const allDigitMemoryCells = baseCells
    .filter((cell) => assignedMemoryByCellId.has(cell.id))
    .sort((a, b) => {
      if (Math.abs(a.globalCol - b.globalCol) > 1e-4) {
        return a.globalCol - b.globalCol;
      }
      return a.row - b.row;
    });

  const memoryOrderByCellId = new Map<number, number>();
  allDigitMemoryCells.forEach((cell, order) => {
    memoryOrderByCellId.set(cell.id, order);
  });

  // 6. 筛选可用内置预设池并为剩余数字空位进行相邻不重复的均衡补位
  const selectedIds = Array.isArray(presetFill?.selectedPresetIds)
    ? presetFill.selectedPresetIds
    : [];
  let activePresets: PresetCardMeta[];
  if (selectedIds.length > 0) {
    const wanted = new Set(selectedIds);
    const filtered = presets.filter((p) => wanted.has(p.id));
    activePresets = filtered.length > 0 ? filtered : presets;
  } else {
    activePresets = presets;
  }

  const autoFill = presetFill?.autoFill ?? true;
  const presetByCellId = new Map<number, PresetCardMeta>();

  if (autoFill && activePresets.length > 0) {
    const usageCount = new Map<string, number>();
    for (const p of activePresets) {
      usageCount.set(p.id, 0);
    }

    const cellLookup = new Map<string, BaseCell>();
    for (const cell of baseCells) {
      cellLookup.set(`${cell.digitIndex}:${cell.row}:${cell.col}`, cell);
    }

    const emptyCells = baseCells.filter((cell) => !assignedMemoryByCellId.has(cell.id));
    let lastAssignedId: string | null = null;

    for (const cell of emptyCells) {
      const neighborMotifs = new Set<string>();
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const neighbor = cellLookup.get(
            `${cell.digitIndex}:${cell.row + dr}:${cell.col + dc}`
          );
          if (!neighbor) continue;
          const assigned = presetByCellId.get(neighbor.id);
          if (assigned) {
            neighborMotifs.add(assigned.motif);
          }
        }
      }

      let bestPreset = activePresets[0];
      let bestScore = Infinity;

      for (let pIdx = 0; pIdx < activePresets.length; pIdx++) {
        const candidate = activePresets[pIdx];
        const count = usageCount.get(candidate.id) ?? 0;
        const neighborPenalty = neighborMotifs.has(candidate.motif) ? 1000 : 0;
        const immediateRepeatPenalty = candidate.id === lastAssignedId ? 50 : 0;
        const tieBreak =
          (((cell.id * 7 + pIdx * 13 + (resolvedSeed % 97)) % activePresets.length) + rng() * 0.25) *
          0.01;
        const score = neighborPenalty + immediateRepeatPenalty + count * 10 + tieBreak;

        if (score < bestScore) {
          bestScore = score;
          bestPreset = candidate;
        }
      }

      presetByCellId.set(cell.id, bestPreset);
      usageCount.set(bestPreset.id, (usageCount.get(bestPreset.id) ?? 0) + 1);
      lastAssignedId = bestPreset.id;
    }
  }

  // 7. 组装基础数字层槽位
  const slots: MosaicSlot[] = [];

  for (const cell of baseCells) {
    const mem = assignedMemoryByCellId.get(cell.id);
    if (mem !== undefined) {
      slots.push({
        index: slots.length,
        kind: 'memory',
        position: { x: cell.x, y: cell.y, z: cell.z },
        rotation: { x: cell.rotX, y: cell.rotY, z: cell.rotZ },
        memoryOrder: memoryOrderByCellId.get(cell.id),
        memory: mem,
        isHalo: false,
        digitIndex: cell.digitIndex,
      });
    } else if (autoFill) {
      const preset = presetByCellId.get(cell.id);
      if (preset) {
        slots.push({
          index: slots.length,
          kind: 'preset',
          position: { x: cell.x, y: cell.y, z: cell.z },
          rotation: { x: cell.rotX, y: cell.rotY, z: cell.rotZ },
          preset,
          isHalo: false,
          digitIndex: cell.digitIndex,
        });
      }
    }
  }

  // 8. 若未锁定照片数量超出数字基座全部槽位，将溢出照片均匀排布到后方星环光晕层（零丢图）
  const excessMemories = unpinnedMemories.slice(unpinnedInDigitsCount);
  if (excessMemories.length > 0) {
    const baseRadiusX = halfSpanX + metrics.cardWidth * 1.5;
    const baseRadiusY = halfSpanY + metrics.cardHeight * 1.18;
    const perRing = 18;
    const haloPhase = rng() * 0.35;

    const haloPositions: Array<{
      x: number;
      y: number;
      z: number;
      rotX: number;
      rotY: number;
      rotZ: number;
    }> = [];

    for (let i = 0; i < excessMemories.length; i++) {
      const ringIndex = Math.floor(i / perRing);
      const indexInRing = i % perRing;
      const countInRing = Math.min(perRing, excessMemories.length - ringIndex * perRing);

      // 均匀泊松角间隔 + 种子微偏移，确保星环照片之间绝不重叠
      const baseAngle =
        Math.PI -
        ((indexInRing + 0.5) / Math.max(1, countInRing)) * Math.PI * 2 +
        ringIndex * 0.31 +
        haloPhase;
      const angleJitter = (rng() - 0.5) * (Math.PI / Math.max(8, countInRing * 3));
      const angle = baseAngle + angleJitter;

      const rx = baseRadiusX + ringIndex * (metrics.cardWidth * 1.4);
      const ry = baseRadiusY + ringIndex * (metrics.cardHeight * 1.08);

      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle) * ry;
      const z = -1.35 - ringIndex * 0.65 + (rng() - 0.5) * 0.28;

      const nx = x / Math.max(1, rx);
      const ny = y / Math.max(1, ry);

      haloPositions.push({
        x,
        y,
        z,
        rotX: ny * 0.06,
        rotY: -nx * 0.28,
        rotZ: (rng() - 0.5) * 0.06,
      });
    }

    haloPositions.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 0.15) return a.x - b.x;
      return b.y - a.y;
    });

    const baseMemoryCount = allDigitMemoryCells.length;
    haloPositions.forEach((pos, idx) => {
      slots.push({
        index: slots.length,
        kind: 'memory',
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: pos.rotX, y: pos.rotY, z: pos.rotZ },
        memoryOrder: baseMemoryCount + idx,
        memory: excessMemories[idx],
        isHalo: true,
      });
    });
  }

  // 9. 精确计算 3D 包围盒
  let bounds: { width: number; height: number; depth: number };
  if (slots.length === 0) {
    bounds = { width: metrics.cardWidth, height: metrics.cardHeight, depth: 0.4 };
  } else {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const slot of slots) {
      const { x, y, z } = slot.position;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    bounds = {
      width: Number((maxX - minX + metrics.cardWidth).toFixed(3)),
      height: Number((maxY - minY + metrics.cardHeight).toFixed(3)),
      depth: Number(Math.max(0.25, maxZ - minZ + 0.25).toFixed(3)),
    };
  }

  return {
    ageText,
    slots,
    bounds,
    cardWidth: metrics.cardWidth,
    cardHeight: metrics.cardHeight,
    densityUsed,
    layoutSeed: resolvedSeed,
    totalDigitSlots,
  };
}
