import type { MemoryPhotoItem } from '../config/types';

export interface ParsedBatchNote {
  date?: string;
  title?: string;
  caption: string;
  message?: string;
}

const DATE_LIKE_PATTERN =
  /^(?:\d{4}[./年-]\d{1,2}(?:[./月-]\d{1,2}日?)?|\d{2}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}月\d{1,2}日?)$/;

function isDateLike(value: string): boolean {
  return DATE_LIKE_PATTERN.test(value.trim());
}

function cleanField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function tryParseJsonNotes(trimmed: string): ParsedBatchNote[] | null {
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  let items: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.memories)) items = obj.memories;
    else if (Array.isArray(obj.notes)) items = obj.notes;
    else items = [obj];
  }

  if (!items) return null;

  const notes: ParsedBatchNote[] = [];
  for (const entry of items) {
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (text) notes.push({ caption: text });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const date = cleanField(record.date);
    const title = cleanField(record.title);
    const caption = cleanField(record.caption);
    const message = cleanField(record.message);

    const resolvedCaption = caption ?? message ?? title ?? '';
    if (!resolvedCaption && !date && !title && !message) continue;

    notes.push({
      ...(date ? { date } : {}),
      ...(title ? { title } : {}),
      caption: resolvedCaption,
      ...(message ? { message } : {}),
    });
  }
  return notes;
}

function parseDelimitedLine(line: string): ParsedBatchNote | null {
  const parts = line
    .split(/\s*(?:\||｜|\t)\s*/)
    .map((part) => part.trim());

  if (parts.every((part) => part.length === 0)) {
    return null;
  }

  if (parts.length >= 4) {
    const [date, title, caption, ...rest] = parts;
    const message = rest.filter(Boolean).join(' | ');
    const resolvedCaption = caption || message || title;
    return {
      ...(date ? { date } : {}),
      ...(title ? { title } : {}),
      caption: resolvedCaption,
      ...(message ? { message } : {}),
    };
  }

  if (parts.length === 3) {
    const [p0, p1, p2] = parts;
    if (isDateLike(p0)) {
      return {
        date: p0,
        ...(p1 ? { title: p1 } : {}),
        caption: p2 || p1,
      };
    }
    return {
      ...(p0 ? { title: p0 } : {}),
      caption: p1 || p2 || p0,
      ...(p2 ? { message: p2 } : {}),
    };
  }

  if (parts.length === 2) {
    const [p0, p1] = parts;
    if (isDateLike(p0)) {
      return {
        date: p0,
        caption: p1,
      };
    }
    return {
      ...(p0 ? { title: p0 } : {}),
      caption: p1 || p0,
    };
  }

  return { caption: parts[0] };
}

function parseParagraphBlocks(normalized: string): ParsedBatchNote[] {
  const blocks = normalized
    .split(/\n[ \t]*\n+/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    )
    .filter((lines) => lines.length > 0);

  const notes: ParsedBatchNote[] = [];

  for (const lines of blocks) {
    if (lines.length === 1) {
      notes.push({ caption: lines[0] });
      continue;
    }

    if (lines.length >= 3 && isDateLike(lines[0]) && lines[1].length <= 14) {
      notes.push({
        date: lines[0],
        title: lines[1],
        caption: lines.slice(2).join('\n'),
      });
      continue;
    }

    if (lines[0].length <= 14) {
      notes.push({
        title: lines[0],
        caption: lines.slice(1).join('\n'),
      });
      continue;
    }

    notes.push({
      caption: lines.join('\n'),
    });
  }

  return notes;
}

/**
 * 自动识别并解析 3 种常见批量照片文字格式：
 * 1. JSON 数组：`[{ date?, title?, caption?, message? }]`；
 * 2. 竖线 / 制表符分隔行：`2025.06.18 | 海边日落 | 那天风很大 | 背面悄悄话`（兼容中文 `｜` 与 ASCII `|`）；
 * 3. 空行分隔的自然段（每段作为 `caption`，首行 <= 14 字时自动识别为 `title`）。
 */
export function parseBatchTextNotes(raw: string): ParsedBatchNote[] {
  if (typeof raw !== 'string') return [];
  const normalized = raw.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  // 1) JSON array / object format
  const fromJson = tryParseJsonNotes(normalized);
  if (fromJson !== null) {
    return fromJson;
  }

  // 2) Pipe / full-width pipe / tab delimited lines
  const nonEmptyLines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const delimitedCount = nonEmptyLines.filter((line) => /[|｜\t]/.test(line)).length;
  if (delimitedCount > 0 && delimitedCount * 2 >= nonEmptyLines.length) {
    const notes: ParsedBatchNote[] = [];
    for (const line of nonEmptyLines) {
      const parsed = parseDelimitedLine(line);
      if (parsed && (parsed.caption || parsed.title || parsed.message || parsed.date)) {
        notes.push(parsed);
      }
    }
    return notes;
  }

  // 3) Plain blank-line separated paragraphs
  return parseParagraphBlocks(normalized);
}

/**
 * 将批量解析出的文案不可变地合并进现有照片列表，完整保留原有图片、ID、模板与锁定槽位。
 */
export function applyBatchNotesToMemories(
  memories: MemoryPhotoItem[],
  notes: ParsedBatchNote[]
): MemoryPhotoItem[] {
  if (!Array.isArray(memories) || memories.length === 0 || !Array.isArray(notes) || notes.length === 0) {
    return memories.map((item) => ({ ...item }));
  }

  return memories.map((memory, index) => {
    const note = notes[index];
    if (!note) {
      return { ...memory };
    }

    const nextCaption = note.caption.trim() || memory.caption;
    const explicitMessage = note.message?.trim();
    const existingMessage = memory.message.trim();
    const nextMessage = explicitMessage || existingMessage || nextCaption || '';

    return {
      ...memory,
      date: note.date?.trim() ? note.date.trim() : memory.date,
      title: note.title?.trim() ? note.title.trim() : memory.title,
      ...(nextCaption ? { caption: nextCaption } : {}),
      message: nextMessage,
    };
  });
}
