import { SYSTEM_PRESETS } from './presets';
import { isValidCaptionTemplateId } from './templates';
import type {
  BirthdayCardConfig,
  CaptionTemplateId,
  MemoryPhotoItem,
  MosaicDensityMode,
} from './types';

export interface ValidateConfigResult {
  config: BirthdayCardConfig;
  warnings: string[];
}

const VALID_PRESET_IDS = new Set(SYSTEM_PRESETS.map((preset) => preset.id));
const VALID_DENSITY_MODES = new Set<MosaicDensityMode>(['auto', 'compact', 'standard', 'deluxe']);
const DEFAULT_LAYOUT_SEED = 20261126;

/**
 * 校验并规范化生日贺卡配置，温和修正边界值并输出可读告警，
 * 确保即使配置出现越界、重复 ID、未知模板、非法密度或缺失字段也能零崩溃运行。
 */
export function validateCardConfig(input: BirthdayCardConfig): ValidateConfigResult {
  const warnings: string[] = [];

  // 1. 基础文案字段兜底
  const recipientName =
    typeof input.recipientName === 'string' && input.recipientName.trim().length > 0
      ? input.recipientName.trim()
      : '你';
  if (recipientName !== (input.recipientName ?? '').trim()) {
    warnings.push('recipientName 为空，已自动使用默认称呼「你」。');
  }

  const senderName =
    typeof input.senderName === 'string' && input.senderName.trim().length > 0
      ? input.senderName.trim()
      : '你的朋友';
  if (senderName !== (input.senderName ?? '').trim()) {
    warnings.push('senderName 为空，已自动使用默认署名「你的朋友」。');
  }

  const birthdayDate =
    typeof input.birthdayDate === 'string' && input.birthdayDate.trim().length > 0
      ? input.birthdayDate.trim()
      : '';

  const coverSubtitle =
    typeof input.coverSubtitle === 'string' ? input.coverSubtitle.trim() : '';

  // 2. 年龄范围校验：严格收敛在 10..100 整数
  let safeAge: number;
  if (typeof input.age !== 'number' || !Number.isFinite(input.age)) {
    safeAge = 24;
    warnings.push(`age 配置无效 (${String(input.age)})，已自动回退为 24。`);
  } else {
    const rounded = Math.round(input.age);
    if (rounded < 10) {
      safeAge = 10;
      warnings.push(`age (${input.age}) 小于 10，已自动修正为 10（支持 10–100 岁）。`);
    } else if (rounded > 100) {
      safeAge = 100;
      warnings.push(`age (${input.age}) 超过 100，已自动修正为 100（支持 10–100 岁）。`);
    } else {
      safeAge = rounded;
      if (rounded !== input.age) {
        warnings.push(`age (${input.age}) 非整数，已自动四舍五入为 ${rounded}。`);
      }
    }
  }

  // 2.5 密度模式、随机种子与分享选项校验
  let safeDensityMode: MosaicDensityMode = 'auto';
  if (input.densityMode !== undefined) {
    if (VALID_DENSITY_MODES.has(input.densityMode)) {
      safeDensityMode = input.densityMode;
    } else {
      warnings.push(
        `densityMode (${String(input.densityMode)}) 无效，已自动回退为「auto」。`
      );
    }
  }

  let safeLayoutSeed = DEFAULT_LAYOUT_SEED;
  if (input.layoutSeed !== undefined) {
    if (typeof input.layoutSeed === 'number' && Number.isFinite(input.layoutSeed)) {
      safeLayoutSeed = Math.floor(Math.abs(input.layoutSeed)) >>> 0;
    } else {
      warnings.push(`layoutSeed (${String(input.layoutSeed)}) 无效，已恢复默认排布种子。`);
    }
  }

  const rawShareSettings = input.shareSettings ?? {};
  const safeShareSettings = {
    hideCreateEntry:
      typeof rawShareSettings.hideCreateEntry === 'boolean'
        ? rawShareSettings.hideCreateEntry
        : false,
    passcodeEnabled:
      typeof rawShareSettings.passcodeEnabled === 'boolean'
        ? rawShareSettings.passcodeEnabled
        : false,
  };

  // 3. 回忆照片列表校验、ID 去重、模板校验与锁定槽位校验
  const rawMemories = Array.isArray(input.memories) ? input.memories : [];
  if (!Array.isArray(input.memories)) {
    warnings.push('memories 配置缺失或不是数组，已重置为空列表。');
  }

  const seenIds = new Set<string>();
  const seenPinnedSlots = new Set<number>();
  const safeMemories: MemoryPhotoItem[] = rawMemories.map((item, idx) => {
    const baseId =
      typeof item?.id === 'string' && item.id.trim().length > 0
        ? item.id.trim()
        : `memory-${idx + 1}`;

    if (typeof item?.id !== 'string' || item.id.trim().length === 0) {
      warnings.push(`第 ${idx + 1} 条回忆缺少 id，已自动命名为「${baseId}」。`);
    }

    let uniqueId = baseId;
    if (seenIds.has(uniqueId)) {
      let suffix = 2;
      while (seenIds.has(`${baseId}-${suffix}`)) {
        suffix += 1;
      }
      uniqueId = `${baseId}-${suffix}`;
      warnings.push(`检测到重复的回忆 id「${baseId}」，已自动去重为「${uniqueId}」。`);
    }
    seenIds.add(uniqueId);

    let safeTemplate: CaptionTemplateId = 'polaroid';
    if (item?.template !== undefined) {
      if (isValidCaptionTemplateId(item.template)) {
        safeTemplate = item.template;
      } else {
        warnings.push(
          `回忆「${uniqueId}」使用了未知模板 (${String(item.template)})，已自动回退为「polaroid」。`
        );
      }
    }

    let safePinnedSlot: number | undefined;
    if (item?.pinnedSlotIndex !== undefined) {
      if (
        typeof item.pinnedSlotIndex === 'number' &&
        Number.isInteger(item.pinnedSlotIndex) &&
        item.pinnedSlotIndex >= 0
      ) {
        if (seenPinnedSlots.has(item.pinnedSlotIndex)) {
          warnings.push(
            `回忆「${uniqueId}」锁定的槽位 #${item.pinnedSlotIndex} 已被其他照片占用，已自动解除锁定。`
          );
        } else {
          safePinnedSlot = item.pinnedSlotIndex;
          seenPinnedSlots.add(item.pinnedSlotIndex);
        }
      } else {
        warnings.push(
          `回忆「${uniqueId}」的 pinnedSlotIndex (${String(item.pinnedSlotIndex)}) 无效，已自动忽略。`
        );
      }
    }

    const caption =
      typeof item?.caption === 'string' && item.caption.trim().length > 0
        ? item.caption.trim()
        : undefined;

    const accentColor =
      typeof item?.accentColor === 'string' && item.accentColor.trim().length > 0
        ? item.accentColor.trim()
        : undefined;

    return {
      id: uniqueId,
      image: typeof item?.image === 'string' ? item.image.trim() : '',
      date: typeof item?.date === 'string' ? item.date.trim() : '',
      title:
        typeof item?.title === 'string' && item.title.trim().length > 0
          ? item.title.trim()
          : `回忆 ${idx + 1}`,
      template: safeTemplate,
      ...(caption ? { caption } : {}),
      message: typeof item?.message === 'string' ? item.message.trim() : '',
      ...(accentColor ? { accentColor } : {}),
      ...(safePinnedSlot !== undefined ? { pinnedSlotIndex: safePinnedSlot } : {}),
    };
  });

  // 4. 预设补位配置校验
  const rawPresetFill = input.presetFill ?? { autoFill: true, selectedPresetIds: [] };
  const autoFill = typeof rawPresetFill.autoFill === 'boolean' ? rawPresetFill.autoFill : true;
  const rawSelectedIds = Array.isArray(rawPresetFill.selectedPresetIds)
    ? rawPresetFill.selectedPresetIds
    : [];

  const validSelectedIds: string[] = [];
  const unknownPresetIds: string[] = [];
  const seenPresetIds = new Set<string>();

  for (const rawId of rawSelectedIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id) continue;
    if (!VALID_PRESET_IDS.has(id)) {
      unknownPresetIds.push(id);
      continue;
    }
    if (!seenPresetIds.has(id)) {
      seenPresetIds.add(id);
      validSelectedIds.push(id);
    }
  }

  if (unknownPresetIds.length > 0) {
    warnings.push(
      `presetFill.selectedPresetIds 包含未知预设 ID (${unknownPresetIds.join(', ')})，已自动忽略。`
    );
  }
  if (rawSelectedIds.length > 0 && validSelectedIds.length === 0) {
    warnings.push('presetFill.selectedPresetIds 中无有效预设，已自动回退为使用全部内置预设。');
  }

  // 5. 音频音量与地址校验
  const rawAudio = input.audio ?? { enabled: true, customBgmUrl: '', volume: 0.55 };
  const audioEnabled = typeof rawAudio.enabled === 'boolean' ? rawAudio.enabled : true;
  const customBgmUrl =
    typeof rawAudio.customBgmUrl === 'string' ? rawAudio.customBgmUrl.trim() : '';

  let safeVolume: number;
  if (typeof rawAudio.volume !== 'number' || !Number.isFinite(rawAudio.volume)) {
    safeVolume = 0.55;
    warnings.push('audio.volume 配置无效，已自动恢复为默认值 0.55。');
  } else if (rawAudio.volume < 0) {
    safeVolume = 0;
    warnings.push(`audio.volume (${rawAudio.volume}) 小于 0，已自动修正为 0。`);
  } else if (rawAudio.volume > 1) {
    safeVolume = 1;
    warnings.push(`audio.volume (${rawAudio.volume}) 大于 1，已自动修正为 1。`);
  } else {
    safeVolume = rawAudio.volume;
  }

  // 6. 序言、终幕祝福与烟花寄语安全拷贝
  const rawPrologue = input.prologue ?? { title: '', lines: [], ctaLabel: '' };
  const safePrologueLines = Array.isArray(rawPrologue.lines)
    ? rawPrologue.lines.filter(
        (line): line is string => typeof line === 'string' && line.trim().length > 0
      )
    : [];

  const rawBlessing = input.finalBlessing ?? {
    headline: '',
    paragraphs: [],
    signature: '',
    closeCardLabel: '',
  };
  const safeParagraphs = Array.isArray(rawBlessing.paragraphs)
    ? rawBlessing.paragraphs.filter(
        (p): p is string => typeof p === 'string' && p.trim().length > 0
      )
    : [];

  const rawFinaleWish = input.finaleWish ?? { title: '', subtitle: '' };

  const normalized: BirthdayCardConfig = {
    recipientName,
    senderName,
    age: safeAge,
    birthdayDate,
    coverSubtitle,
    densityMode: safeDensityMode,
    layoutSeed: safeLayoutSeed,
    shareSettings: safeShareSettings,
    prologue: {
      title:
        typeof rawPrologue.title === 'string' && rawPrologue.title.trim().length > 0
          ? rawPrologue.title.trim()
          : '生日快乐',
      lines:
        safePrologueLines.length > 0
          ? safePrologueLines
          : ['把值得记住的瞬间收进这张贺卡，祝你生日快乐。'],
      ctaLabel:
        typeof rawPrologue.ctaLabel === 'string' && rawPrologue.ctaLabel.trim().length > 0
          ? rawPrologue.ctaLabel.trim()
          : '进入回忆相册',
    },
    memories: safeMemories,
    presetFill: {
      autoFill,
      selectedPresetIds: validSelectedIds,
    },
    finalBlessing: {
      headline:
        typeof rawBlessing.headline === 'string' && rawBlessing.headline.trim().length > 0
          ? rawBlessing.headline.trim()
          : `${safeAge} 岁生日快乐`,
      paragraphs:
        safeParagraphs.length > 0
          ? safeParagraphs
          : [`祝你 ${safeAge} 岁生日快乐，平安喜乐，万事顺意。`],
      signature:
        typeof rawBlessing.signature === 'string' && rawBlessing.signature.trim().length > 0
          ? rawBlessing.signature.trim()
          : senderName,
      closeCardLabel:
        typeof rawBlessing.closeCardLabel === 'string' &&
        rawBlessing.closeCardLabel.trim().length > 0
          ? rawBlessing.closeCardLabel.trim()
          : '合上贺卡',
    },
    finaleWish: {
      title:
        typeof rawFinaleWish.title === 'string' && rawFinaleWish.title.trim().length > 0
          ? rawFinaleWish.title.trim()
          : '生日快乐',
      subtitle:
        typeof rawFinaleWish.subtitle === 'string' ? rawFinaleWish.subtitle.trim() : '',
    },
    audio: {
      enabled: audioEnabled,
      customBgmUrl,
      volume: safeVolume,
    },
  };

  return { config: normalized, warnings };
}
