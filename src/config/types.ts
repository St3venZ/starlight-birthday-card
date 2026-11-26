export type CaptionTemplateId = 'polaroid' | 'editorial' | 'milestone' | 'warm-note';

export type MosaicDensityMode = 'auto' | 'compact' | 'standard' | 'deluxe';

export interface CaptionTemplateMeta {
  id: CaptionTemplateId;
  name: string;
  description: string;
  sampleTitle: string;
  sampleCaption: string;
  sampleBackNote: string;
  badgeLabel?: string;
}

export interface MemoryPhotoItem {
  id: string;
  image: string;
  date: string;
  title: string;
  /** 聚焦查看照片时直接展示在画面下方的文字说明（留空时自动回退使用 message） */
  caption?: string;
  /** 照片说明的排版风格与文案模板（默认 'polaroid'） */
  template?: CaptionTemplateId;
  /** 翻转卡片 180° 后展示在卡片背面的详细留言 */
  message: string;
  accentColor?: string;
  /** 可选：将这张照片锁定到年龄数字点阵中的固定槽位索引 */
  pinnedSlotIndex?: number;
}

export type PresetMotif =
  | 'starlight-cake'
  | 'wishing-bottle'
  | 'crescent-lantern'
  | 'gilded-giftbox'
  | 'aurora-balloon'
  | 'stardust-hourglass'
  | 'celestial-firework'
  | 'constellation-musicbox';

export interface PresetCardMeta {
  id: string;
  name: string;
  subtitle: string;
  image?: string;
  motif: PresetMotif;
}

export interface BirthdayCardConfig {
  recipientName: string;
  senderName: string;
  age: number;
  birthdayDate: string;
  coverSubtitle: string;
  /** 数字点阵密度模式（auto 按照片数和位数自适应，也可手动切换 compact / standard / deluxe） */
  densityMode?: MosaicDensityMode;
  /** 可控随机排布种子（用于“随机换排布”且保证每次打开排布一致） */
  layoutSeed?: number;
  /** 分享链接的隐私与入口展示控制 */
  shareSettings?: {
    hideCreateEntry?: boolean;
    passcodeEnabled?: boolean;
  };
  prologue: {
    title: string;
    lines: string[];
    ctaLabel: string;
  };
  memories: MemoryPhotoItem[];
  presetFill: {
    autoFill: boolean;
    selectedPresetIds: string[];
  };
  finalBlessing: {
    headline: string;
    paragraphs: string[];
    signature: string;
    closeCardLabel: string;
  };
  finaleWish: {
    title: string;
    subtitle: string;
  };
  audio: {
    enabled: boolean;
    customBgmUrl: string;
    volume: number;
  };
}

export type SceneAct =
  | 'ENTRANCE'
  | 'AWAITING_OPEN'
  | 'OPENING'
  | 'PROLOGUE'
  | 'CONSTELLATION_FORM'
  | 'MEMORY_EXPLORE'
  | 'PHOTO_FOCUS'
  | 'BLESSING_LETTER'
  | 'CLOSING_CARD'
  | 'FIREWORKS_FINALE';

export interface MosaicSlot {
  index: number;
  kind: 'memory' | 'preset';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  memoryOrder?: number;
  memory?: MemoryPhotoItem;
  preset?: PresetCardMeta;
  /** 超出数字点阵基数时，放置在后方星环光晕层的回忆槽位标记 */
  isHalo?: boolean;
  /** 所属年龄数字位索引（0 为最左侧数字，光晕层槽位为 undefined） */
  digitIndex?: number;
}

export interface MosaicLayoutResult {
  ageText: string;
  slots: MosaicSlot[];
  bounds: { width: number; height: number; depth: number };
  cardWidth: number;
  cardHeight: number;
  densityUsed: Exclude<MosaicDensityMode, 'auto'>;
  layoutSeed: number;
  totalDigitSlots: number;
}
