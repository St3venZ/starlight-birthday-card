import type { CaptionTemplateId, CaptionTemplateMeta, MemoryPhotoItem } from './types';

/**
 * 内置 4 套简洁实用的照片文字说明与排版模板。
 * 创作者可在 `src/config/card.config.ts` 中为每张照片自由指定 `template` 和 `caption`。
 */
export const CAPTION_TEMPLATES: Record<CaptionTemplateId, CaptionTemplateMeta> = {
  polaroid: {
    id: 'polaroid',
    name: '拍立得寄语',
    description: '简短自然的一句话随手记，适合旅行、聚会与日常抓拍。',
    sampleTitle: '海边日落',
    sampleCaption: '那天风很轻，我们沿着海边走了很久。',
    sampleBackNote: '后来翻到这张照片，还是会想起那天傍晚柔和的光线和轻松的心情。',
    badgeLabel: '拍立得',
  },
  editorial: {
    id: 'editorial',
    name: '极简旁白',
    description: '克制干净的画册式旁白，适合风景、人像与氛围感照片。',
    sampleTitle: '雨后街灯',
    sampleCaption: '雨停之后，路灯把整条小街照得很安静。',
    sampleBackNote: '喜欢这样不赶时间的傍晚，慢慢走，什么都刚刚好。',
    badgeLabel: '画册',
  },
  milestone: {
    id: 'milestone',
    name: '纪念刻度',
    description: '清晰记录时间节点与重要时刻，适合成长纪念与年度回顾。',
    sampleTitle: '新旅程的起点',
    sampleCaption: '这一天记下了今年最难忘的一次出发。',
    sampleBackNote: '每一次认真做出的决定，都会在往后的日子里给出答案。',
    badgeLabel: '刻度',
  },
  'warm-note': {
    id: 'warm-note',
    name: '温柔便签',
    description: '像贴在照片旁的一张手写小便签，语气亲切真诚。',
    sampleTitle: '一起吃的晚饭',
    sampleCaption: '热汤刚端上来的时候，聊了很多轻松的小事。',
    sampleBackNote: '平凡日子里一顿舒心的晚饭，比什么宏大的安排都更让人开心。',
    badgeLabel: '便签',
  },
};

export const CAPTION_TEMPLATE_LIST: CaptionTemplateMeta[] = [
  CAPTION_TEMPLATES.polaroid,
  CAPTION_TEMPLATES.editorial,
  CAPTION_TEMPLATES.milestone,
  CAPTION_TEMPLATES['warm-note'],
];

export function isValidCaptionTemplateId(value: unknown): value is CaptionTemplateId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAPTION_TEMPLATES, value);
}

/**
 * 解析单张回忆照片的前后展示文案与模板元信息：
 * - 若未填写 `caption`，优雅回退到 `message`（再回退到模板示例）；
 * - 若未指定或误填 `template`，自动回退到 `'polaroid'`。
 */
export function resolveMemoryDisplay(memory: MemoryPhotoItem): {
  template: CaptionTemplateMeta;
  caption: string;
  backMessage: string;
} {
  const template: CaptionTemplateMeta = isValidCaptionTemplateId(memory.template)
    ? CAPTION_TEMPLATES[memory.template]
    : CAPTION_TEMPLATES.polaroid;

  const trimmedCaption = typeof memory.caption === 'string' ? memory.caption.trim() : '';
  const trimmedMessage = typeof memory.message === 'string' ? memory.message.trim() : '';

  const caption = trimmedCaption || trimmedMessage || template.sampleCaption;
  const backMessage = trimmedMessage || trimmedCaption || template.sampleBackNote;

  return {
    template,
    caption,
    backMessage,
  };
}
