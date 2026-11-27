import { describe, expect, it } from 'vitest';
import { cardConfig } from '../src/config/card.config';
import { SYSTEM_PRESETS } from '../src/config/presets';
import { SITE_BRAND } from '../src/config/site.config';
import {
  CAPTION_TEMPLATE_LIST,
  CAPTION_TEMPLATES,
  resolveMemoryDisplay,
} from '../src/config/templates';
import type {
  BirthdayCardConfig,
  CaptionTemplateId,
  MemoryPhotoItem,
  MosaicDensityMode,
} from '../src/config/types';
import { validateCardConfig } from '../src/config/validateConfig';
import { wrapMixedText } from '../src/engine/artwork/proceduralArt';
import { buildAgeMosaicLayout, getDigitSlotCount } from '../src/engine/layout/ageMosaicLayout';

function makeMemories(count: number): MemoryPhotoItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `mem-${idx + 1}`,
    image: '',
    date: `2026.01.${String((idx % 28) + 1).padStart(2, '0')}`,
    title: `回忆 ${idx + 1}`,
    message: `这是第 ${idx + 1} 段关于生活的记录。`,
  }));
}

describe('getDigitSlotCount & 3 density modes', () => {
  it('auto-selects compact, standard, and deluxe density cleanly', () => {
    // 2 digits, <= 8 photos -> compact
    const c1 = getDigitSlotCount(24, 'auto', 6);
    expect(c1.densityUsed).toBe('compact');
    expect(c1.totalDigitSlots).toBeGreaterThanOrEqual(18);

    // 2 digits, 9..24 photos -> standard
    const s1 = getDigitSlotCount(24, 'auto', 15);
    expect(s1.densityUsed).toBe('standard');
    expect(s1.totalDigitSlots).toBeGreaterThan(c1.totalDigitSlots);

    // 2 digits, >= 25 photos -> deluxe
    const d1 = getDigitSlotCount(24, 'auto', 28);
    expect(d1.densityUsed).toBe('deluxe');
    expect(d1.totalDigitSlots).toBeGreaterThan(s1.totalDigitSlots);

    // 3 digits always chooses compact in auto mode to keep total cards crisp
    const threeDigits = getDigitSlotCount(100, 'auto', 18);
    expect(threeDigits.densityUsed).toBe('compact');
    expect(threeDigits.totalDigitSlots).toBeGreaterThanOrEqual(28);
  });

  it('honors explicit density modes and slim proportional kerning for digit 1', () => {
    const compact = getDigitSlotCount(18, 'compact', 6);
    const standard = getDigitSlotCount(18, 'standard', 6);
    const deluxe = getDigitSlotCount(18, 'deluxe', 6);

    expect(compact.densityUsed).toBe('compact');
    expect(standard.densityUsed).toBe('standard');
    expect(deluxe.densityUsed).toBe('deluxe');
    expect(compact.totalDigitSlots).toBeLessThan(standard.totalDigitSlots);
    expect(standard.totalDigitSlots).toBeLessThan(deluxe.totalDigitSlots);

    // 数字 "11" 在窄宽比例排布下，总宽度应明显窄于 "88"
    const layout11 = buildAgeMosaicLayout(
      11,
      makeMemories(4),
      SYSTEM_PRESETS,
      { autoFill: true, selectedPresetIds: [] },
      { densityMode: 'standard', layoutSeed: 123 }
    );
    const layout88 = buildAgeMosaicLayout(
      88,
      makeMemories(4),
      SYSTEM_PRESETS,
      { autoFill: true, selectedPresetIds: [] },
      { densityMode: 'standard', layoutSeed: 123 }
    );
    expect(layout11.bounds.width).toBeLessThan(layout88.bounds.width);
  });
});

describe('buildAgeMosaicLayout', () => {
  it('builds a clean 1-digit layout (age 7) with presets filling remaining dots', () => {
    const memories = makeMemories(4);
    const result = buildAgeMosaicLayout(7, memories, SYSTEM_PRESETS, {
      autoFill: true,
      selectedPresetIds: [],
    });

    expect(result.ageText).toBe('7');
    expect(result.slots.length).toBe(result.totalDigitSlots);
    expect(result.cardWidth).toBeGreaterThan(0);
    expect(result.cardHeight).toBeGreaterThan(0);
    expect(result.bounds.width).toBeGreaterThan(result.cardWidth);
    expect(result.bounds.height).toBeGreaterThan(result.cardHeight);

    const memorySlots = result.slots.filter((s) => s.kind === 'memory');
    const presetSlots = result.slots.filter((s) => s.kind === 'preset');
    expect(memorySlots).toHaveLength(4);
    expect(presetSlots.length).toBe(result.slots.length - 4);
    expect(memorySlots.map((s) => s.memoryOrder).sort((a, b) => a! - b!)).toEqual([0, 1, 2, 3]);
  });

  it('distributes memories across all digits cleanly for ages 10, 24, 80, and 100', () => {
    for (const age of [10, 24, 80]) {
      const res = buildAgeMosaicLayout(
        age,
        makeMemories(6),
        SYSTEM_PRESETS,
        { autoFill: true, selectedPresetIds: [] },
        { densityMode: 'auto', layoutSeed: 20261126 }
      );
      const mem = res.slots.filter((s) => s.kind === 'memory');
      expect(res.ageText).toBe(String(age));
      expect(mem).toHaveLength(6);
      expect(mem.filter((s) => s.digitIndex === 0).length).toBeGreaterThanOrEqual(2);
      expect(mem.filter((s) => s.digitIndex === 1).length).toBeGreaterThanOrEqual(2);
    }

    const res100 = buildAgeMosaicLayout(
      100,
      makeMemories(6),
      SYSTEM_PRESETS,
      { autoFill: true, selectedPresetIds: [] },
      { densityMode: 'auto', layoutSeed: 20261126 }
    );
    const mem100 = res100.slots.filter((s) => s.kind === 'memory');
    expect(mem100).toHaveLength(6);
    // 每位数字都不被饿死
    expect(mem100.filter((s) => s.digitIndex === 0).length).toBeGreaterThanOrEqual(1);
    expect(mem100.filter((s) => s.digitIndex === 1).length).toBeGreaterThanOrEqual(1);
    expect(mem100.filter((s) => s.digitIndex === 2).length).toBeGreaterThanOrEqual(1);
  });

  it('handles arbitrary photo counts (1, 3, 7, 15, 28, 40) without ever dropping a photo', () => {
    for (const count of [1, 3, 7, 15, 28, 40]) {
      const memories = makeMemories(count);
      const res = buildAgeMosaicLayout(
        24,
        memories,
        SYSTEM_PRESETS,
        { autoFill: true, selectedPresetIds: [] },
        { densityMode: 'auto', layoutSeed: 424242 }
      );

      const memSlots = res.slots.filter((s) => s.kind === 'memory');
      expect(memSlots).toHaveLength(count);
      const uniqueIds = new Set(memSlots.map((s) => s.memory?.id));
      expect(uniqueIds.size).toBe(count);

      // 超出点阵总数（如 40 > deluxe 的 37 点）时，超出部分进入后方光晕层 isHalo=true
      if (count > res.totalDigitSlots) {
        const haloSlots = memSlots.filter((s) => s.isHalo === true);
        expect(haloSlots).toHaveLength(count - res.totalDigitSlots);
        expect(haloSlots.every((s) => s.position.z < -0.9)).toBe(true);
      } else {
        expect(memSlots.every((s) => s.isHalo === false)).toBe(true);
      }
    }
  });

  it('produces identical layouts for the same seed and varied layouts for different seeds', () => {
    const memories = makeMemories(10);
    const a1 = buildAgeMosaicLayout(
      24,
      memories,
      SYSTEM_PRESETS,
      { autoFill: true, selectedPresetIds: [] },
      { densityMode: 'standard', layoutSeed: 10001 }
    );
    const a2 = buildAgeMosaicLayout(
      24,
      memories,
      SYSTEM_PRESETS,
      { autoFill: true, selectedPresetIds: [] },
      { densityMode: 'standard', layoutSeed: 10001 }
    );
    const b = buildAgeMosaicLayout(
      24,
      memories,
      SYSTEM_PRESETS,
      { autoFill: true, selectedPresetIds: [] },
      { densityMode: 'standard', layoutSeed: 99999 }
    );

    const a1Indices = a1.slots.filter((s) => s.kind === 'memory').map((s) => s.index);
    const a2Indices = a2.slots.filter((s) => s.kind === 'memory').map((s) => s.index);
    const bIndices = b.slots.filter((s) => s.kind === 'memory').map((s) => s.index);

    expect(a1Indices).toEqual(a2Indices);
    expect(a1.layoutSeed).toBe(10001);
    expect(b.layoutSeed).toBe(99999);
    expect(a1Indices).not.toEqual(bIndices);
  });

  it('honors pinnedSlotIndex even when layoutSeed is shuffled', () => {
    const memories = makeMemories(8);
    memories[0].pinnedSlotIndex = 0;
    memories[1].pinnedSlotIndex = 12;

    for (const seed of [111, 222, 333, 444]) {
      const res = buildAgeMosaicLayout(
        24,
        memories,
        SYSTEM_PRESETS,
        { autoFill: true, selectedPresetIds: [] },
        { densityMode: 'standard', layoutSeed: seed }
      );
      expect(res.slots[0].kind).toBe('memory');
      expect(res.slots[0].memory?.id).toBe('mem-1');
      expect(res.slots[12].kind).toBe('memory');
      expect(res.slots[12].memory?.id).toBe('mem-2');
    }
  });

  it('respects presetFill.autoFill=false and selectedPresetIds filtering', () => {
    const memories = makeMemories(3);

    const noAutofill = buildAgeMosaicLayout(24, memories, SYSTEM_PRESETS, {
      autoFill: false,
      selectedPresetIds: [],
    });
    expect(noAutofill.slots).toHaveLength(3);
    expect(noAutofill.slots.every((s) => s.kind === 'memory')).toBe(true);

    const filteredPresets = buildAgeMosaicLayout(24, memories, SYSTEM_PRESETS, {
      autoFill: true,
      selectedPresetIds: ['starlight-cake', 'wishing-bottle'],
    });
    const presetSlots = filteredPresets.slots.filter((s) => s.kind === 'preset');
    expect(presetSlots.length).toBeGreaterThan(10);
    expect(
      presetSlots.every(
        (s) => s.preset?.id === 'starlight-cake' || s.preset?.id === 'wishing-bottle'
      )
    ).toBe(true);
  });
});

describe('validateCardConfig', () => {
  it('validates the default cardConfig cleanly with zero warnings', () => {
    const { config, warnings } = validateCardConfig(cardConfig);
    expect(warnings).toEqual([]);
    expect(config.age).toBe(22);
    expect(config.densityMode).toBe('auto');
    expect(config.layoutSeed).toBe(20261126);
    expect(config.memories).toHaveLength(5);
  });

  it('clamps age, deduplicates memory IDs, clamps audio volume, and validates densityMode & pinnedSlotIndex', () => {
    const broken: BirthdayCardConfig = {
      ...cardConfig,
      age: 1500,
      densityMode: 'ultra-fake' as MosaicDensityMode,
      layoutSeed: Number.NaN,
      memories: [
        { id: 'dup', image: '', date: '2026.01.01', title: 'A', message: 'a', pinnedSlotIndex: 3 },
        { id: 'dup', image: '', date: '2026.01.02', title: 'B', message: 'b', pinnedSlotIndex: 3 },
        { id: '', image: '', date: '2026.01.03', title: 'C', message: 'c', pinnedSlotIndex: -2 },
      ],
      presetFill: {
        autoFill: true,
        selectedPresetIds: ['non-existent-id', 'also-invalid'],
      },
      audio: {
        enabled: true,
        customBgmUrl: '  ./audio/test.mp3  ',
        volume: 2.5,
      },
    };

    const { config, warnings } = validateCardConfig(broken);
    expect(config.age).toBe(100);
    expect(config.densityMode).toBe('auto');
    expect(config.layoutSeed).toBe(20261126);
    expect(config.memories.map((m) => m.id)).toEqual(['dup', 'dup-2', 'memory-3']);
    expect(config.memories[0].pinnedSlotIndex).toBe(3);
    expect(config.memories[1].pinnedSlotIndex).toBeUndefined();
    expect(config.memories[2].pinnedSlotIndex).toBeUndefined();
    expect(config.presetFill.selectedPresetIds).toEqual([]);
    expect(config.audio.volume).toBe(1);
    expect(config.audio.customBgmUrl).toBe('./audio/test.mp3');
    expect(warnings.length).toBeGreaterThanOrEqual(6);
  });

  it('clamps age strictly to 10..100 (5 -> 10, 150 -> 100) and allows 10, 24, 80, 100 cleanly', () => {
    for (const validAge of [10, 24, 80, 100]) {
      const res = validateCardConfig({ ...cardConfig, age: validAge });
      expect(res.config.age).toBe(validAge);
      expect(res.warnings).toEqual([]);
    }

    const lowAge = validateCardConfig({
      ...cardConfig,
      age: 5,
      audio: { enabled: true, customBgmUrl: '', volume: -0.3 },
    });
    expect(lowAge.config.age).toBe(10);
    expect(lowAge.config.audio.volume).toBe(0);
    expect(lowAge.warnings.some((w) => w.includes('10'))).toBe(true);

    const highAge = validateCardConfig({
      ...cardConfig,
      age: 150,
    });
    expect(highAge.config.age).toBe(100);
    expect(highAge.warnings.some((w) => w.includes('100'))).toBe(true);

    const nanAge = validateCardConfig({
      ...cardConfig,
      age: Number.NaN,
      audio: { enabled: true, customBgmUrl: '', volume: Number.NaN },
    });
    expect(nanAge.config.age).toBe(24);
    expect(nanAge.config.audio.volume).toBe(0.55);

    expect(SITE_BRAND.name).toBe('St3venZ');
    expect(SITE_BRAND.url).toBe('https://github.com/St3venZ');
    expect(SITE_BRAND.labelPrefix).toBe('由 ');
    expect(SITE_BRAND.labelSuffix).toBe(' 制作');
  });
});

describe('wrapMixedText', () => {
  it('never places Chinese or Latin closing/pause punctuation at the start of a wrapped line', () => {
    const forbiddenStart = /^[，。、；：！？）》」』】”’…—.,;:!?)\]]/;
    const fakeMeasure = (s: string) => {
      let width = 0;
      for (const ch of s) {
        width += /[A-Za-z0-9 .,;:!?]/.test(ch) ? 10 : 20;
      }
      return width;
    };

    for (const memory of cardConfig.memories) {
      for (const maxWidth of [220, 260, 300, 320, 340, 360]) {
        const lines = wrapMixedText(fakeMeasure, memory.message, maxWidth);
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
          expect(line).not.toMatch(forbiddenStart);
        }
      }
    }

    const mixedSample = 'Happy Birthday, 愿你永远闪闪发光！Every moment (with you), shines bright.';
    const mixedLines = wrapMixedText(fakeMeasure, mixedSample, 220);
    for (const line of mixedLines) {
      expect(line).not.toMatch(forbiddenStart);
    }
  });
});

describe('CAPTION_TEMPLATES & resolveMemoryDisplay', () => {
  it('exposes all 4 built-in creator caption templates with sample copy', () => {
    const expectedIds: CaptionTemplateId[] = ['polaroid', 'editorial', 'milestone', 'warm-note'];
    expect(CAPTION_TEMPLATE_LIST.map((t) => t.id)).toEqual(expectedIds);

    for (const id of expectedIds) {
      const tpl = CAPTION_TEMPLATES[id];
      expect(tpl.name.length).toBeGreaterThan(0);
      expect(tpl.description.length).toBeGreaterThan(0);
      expect(tpl.sampleTitle.length).toBeGreaterThan(0);
      expect(tpl.sampleCaption.length).toBeGreaterThan(0);
      expect(tpl.sampleBackNote.length).toBeGreaterThan(0);
    }
  });

  it('resolves explicit caption/template and falls back cleanly when omitted or unknown', () => {
    const explicit = resolveMemoryDisplay({
      id: 'm-1',
      image: '',
      date: '2026.05.20',
      title: '海边散步',
      template: 'editorial',
      caption: '简短的正面说明',
      message: '详细的背面留言',
    });
    expect(explicit.template.id).toBe('editorial');
    expect(explicit.caption).toBe('简短的正面说明');
    expect(explicit.backMessage).toBe('详细的背面留言');

    const fallbackCaption = resolveMemoryDisplay({
      id: 'm-2',
      image: '',
      date: '2026.05.20',
      title: '无正面注脚',
      message: '只有背面留言内容',
    });
    expect(fallbackCaption.template.id).toBe('polaroid');
    expect(fallbackCaption.caption).toBe('只有背面留言内容');
    expect(fallbackCaption.backMessage).toBe('只有背面留言内容');

    const unknownTemplate = resolveMemoryDisplay({
      id: 'm-3',
      image: '',
      date: '',
      title: '空白测试',
      template: 'non-existent' as CaptionTemplateId,
      caption: '   ',
      message: '',
    });
    expect(unknownTemplate.template.id).toBe('polaroid');
    expect(unknownTemplate.caption).toBe(CAPTION_TEMPLATES.polaroid.sampleCaption);
    expect(unknownTemplate.backMessage).toBe(CAPTION_TEMPLATES.polaroid.sampleBackNote);
  });

  it('validates unknown memory.template in validateCardConfig by falling back to polaroid', () => {
    const { config, warnings } = validateCardConfig({
      ...cardConfig,
      memories: [
        {
          id: 'bad-tpl',
          image: '',
          date: '2026.05.20',
          title: '模板校验',
          template: 'unknown-style' as CaptionTemplateId,
          caption: '  保留并裁剪的说明  ',
          message: '测试留言',
        },
      ],
    });
    expect(config.memories[0].template).toBe('polaroid');
    expect(config.memories[0].caption).toBe('保留并裁剪的说明');
    expect(warnings.some((w) => w.includes('unknown-style'))).toBe(true);
  });
});
