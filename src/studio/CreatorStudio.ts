import { SYSTEM_PRESETS } from '../config/presets';
import { CAPTION_TEMPLATE_LIST, CAPTION_TEMPLATES, resolveMemoryDisplay } from '../config/templates';
import type {
  BirthdayCardConfig,
  CaptionTemplateId,
  MemoryPhotoItem,
  MosaicDensityMode,
  MosaicLayoutResult,
  SceneAct,
} from '../config/types';
import { buildAgeMosaicLayout, getDigitSlotCount } from '../engine/layout/ageMosaicLayout';
import type { CardShareClient, PublishCardResult } from '../share/storageAdapter';
import { applyBatchNotesToMemories, parseBatchTextNotes } from './batchTextParser';
import {
  clearDraft,
  loadDraft,
  loadPublishedRecords,
  removePublishedRecord,
  saveDraft,
  savePublishedRecord,
  type PublishedCardRecord,
} from './draftStore';
import { compressPhotoFile, formatFileSize } from './imageCompressor';
import { generateSharePosterDataUrl, savePosterToAlbum } from './qrPoster';

export interface CreatorStudioOptions {
  mountEl: HTMLElement;
  initialConfig: BirthdayCardConfig;
  defaultConfig?: BirthdayCardConfig;
  shareClient: CardShareClient;
  onConfigChange: (config: BirthdayCardConfig, opts?: { jumpToAct?: SceneAct }) => void;
  onFocusMemory: (memoryId: string) => void;
  onPreviewFullCard: (config: BirthdayCardConfig) => void;
  onFullscreenCurrentStage?: () => void;
  onOpenPublishedUrl: (shortId: string) => void;
  onExitStudio: () => void;
}

type StudioStep = 1 | 2 | 3 | 4;

const MIN_AGE = 10;
const MAX_AGE = 100;
const MAX_PHOTOS = 30;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2MB
const DRAFT_SAVE_DEBOUNCE_MS = 400;
const CONFIG_EMIT_DEBOUNCE_MS = 180;

function clampAge(value: number): number {
  if (!Number.isFinite(value)) return 24;
  return Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(value)));
}

const DENSITY_OPTIONS: ReadonlyArray<{ id: MosaicDensityMode; label: string }> = [
  { id: 'auto', label: '自动' },
  { id: 'compact', label: '紧凑' },
  { id: 'standard', label: '标准' },
  { id: 'deluxe', label: '丰盈' },
];

const DENSITY_LABELS: Record<Exclude<MosaicDensityMode, 'auto'>, string> = {
  compact: '紧凑',
  standard: '标准',
  deluxe: '丰盈',
};

interface RelationshipTemplate {
  id: string;
  label: string;
  coverSubtitle: string;
  prologueTitle: string;
  prologueLines: string[];
  blessingParagraphs: (age: number) => string[];
  finaleSubtitle: string;
}

const RELATIONSHIP_TEMPLATES: readonly RelationshipTemplate[] = [
  {
    id: 'friend',
    label: '给挚友',
    coverSubtitle: '愿新的一岁，轻松自在，常有好消息',
    prologueTitle: '生日快乐',
    prologueLines: [
      '把过去一年里一起留下的几个瞬间，收进了这张小小的贺卡。',
      '点开夜空里的任意一张照片，可以看看当时的记录与背面留言。',
    ],
    blessingParagraphs: (age) => [
      `祝你 ${age} 岁生日快乐。谢谢这一年里的并肩与照应，让很多普通的日子都变得轻松愉快。`,
      '新的一岁不需要太紧绷，愿你按自己的节奏生活，睡得安稳，吃得开心，想做的事都能慢慢落地。',
      '合上贺卡后，今夜的烟花为你而放。愿你一直自在、健康、顺遂。',
    ],
    finaleSubtitle: '愿新的一岁，自在顺遂，常有好消息',
  },
  {
    id: 'partner',
    label: '给恋人',
    coverSubtitle: '谢谢你把平凡的日子照得很亮',
    prologueTitle: '生日快乐',
    prologueLines: [
      '把这一年里最喜欢的几个瞬间，悄悄放进了这张贺卡里。',
      '它们会在夜空里拼出你的新岁数字，每一张背面都有想对你说的话。',
    ],
    blessingParagraphs: (age) => [
      `祝你 ${age} 岁生日快乐。翻看这些照片时，还是会觉得能和你一起走过这些日常真好。`,
      '愿新的一岁里，我们继续慢慢看风景、吃热乎的晚饭，把细碎的小事都过成值得记住的日子。',
      '合上这张贺卡，看一场属于今晚的烟花吧。愿你永远被温柔相待，平安喜乐。',
    ],
    finaleSubtitle: '愿岁岁常相伴，所愿皆如期',
  },
  {
    id: 'family',
    label: '给家人',
    coverSubtitle: '愿岁岁平安，健康顺遂，常伴欢喜',
    prologueTitle: '生日快乐',
    prologueLines: [
      '整理了几张珍贵的合照，做成一张可以随时打开翻看的贺卡。',
      '点击任意一张照片，都能重温那天的温暖瞬间和写给你的祝福。',
    ],
    blessingParagraphs: (age) => [
      `祝你 ${age} 岁生日快乐。平时总忙着各自的事情，趁今天把想说的话认真写进这张贺卡里。`,
      '新的一岁里，只愿你身体健康、心情舒畅，少操心烦事，多留些时间好好休息和享受生活。',
      '合上贺卡，看看今夜为你点亮的烟花吧。愿全家平平安安，每一天都暖意融融。',
    ],
    finaleSubtitle: '愿身体健康，平安顺意，喜乐常伴',
  },
];

interface BlessingQuickTemplate {
  id: string;
  label: string;
  headline: (age: number, recipient: string) => string;
  paragraphs: (age: number) => string[];
}

const BLESSING_TEMPLATES: readonly BlessingQuickTemplate[] = [
  {
    id: 'sincere',
    label: '真诚日常',
    headline: (age) => `${age} 岁生日快乐`,
    paragraphs: (age) => [
      `祝你 ${age} 岁生日快乐。刚刚点亮的那些照片，记录了过去一年里很多轻松、温暖、值得回味的时刻。`,
      '新的一岁不需要给自己太大压力。愿你每天睡个好觉，吃上合胃口的饭，忙时有条不紊，闲时能做真正喜欢的事。',
      '合上这张贺卡后，今夜的烟花会为你升空。愿你健康、开心、自在，万事顺心。',
    ],
  },
  {
    id: 'gentle',
    label: '温柔寄语',
    headline: (age, recipient) =>
      recipient && recipient !== '你' ? `致 ${recipient} · ${age} 岁生日快乐` : `${age} 岁生日快乐`,
    paragraphs: (age) => [
      `又迎来新的一岁啦，祝你 ${age} 岁生日快乐。`,
      '很庆幸过去一年里的很多美好片段都有你的身影。希望往后的日子里，好天气、好心情和好消息都会如约而至。',
      '合上贺卡，一起看今夜的烟花。愿你始终眼神明亮，步履轻快。',
    ],
  },
  {
    id: 'peaceful',
    label: '平安顺遂',
    headline: (age) => `愿 ${age} 岁平安顺遂`,
    paragraphs: (age) => [
      `祝你 ${age} 岁生日快乐，愿这一岁比上一岁更从容、更舒心。`,
      '愿你走过的每一段路都有收获，遇到的每一个人都真诚友善，所有认真的付出都能在时间里开花结果。',
      '合上贺卡后，祝今夜烟花烂漫，新岁一切顺遂。',
    ],
  },
];

function cloneConfig(config: BirthdayCardConfig): BirthdayCardConfig {
  return JSON.parse(JSON.stringify(config)) as BirthdayCardConfig;
}

function stripDemoMemories(config: BirthdayCardConfig): BirthdayCardConfig {
  config.memories = config.memories.filter(
    (memory) =>
      typeof memory.image === 'string' &&
      memory.image.trim().length > 0 &&
      !/(?:^|\/)demo\//i.test(memory.image.trim()),
  );
  return config;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateSeed(): number {
  return Math.floor(Math.random() * 899_999_999) + 100_000_000;
}

function createMemoryId(existing: MemoryPhotoItem[]): string {
  const used = new Set(existing.map((m) => m.id));
  let idx = existing.length + 1;
  let candidate = `memory-${String(idx).padStart(2, '0')}`;
  while (used.has(candidate)) {
    idx += 1;
    candidate = `memory-${String(idx).padStart(2, '0')}`;
  }
  return candidate;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('文件读取失败'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('音频读取失败'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('音频读取失败'));
    reader.readAsDataURL(file);
  });
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function getTodayDotDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export class CreatorStudio {
  private readonly options: CreatorStudioOptions;
  private readonly defaultConfig: BirthdayCardConfig;
  private config: BirthdayCardConfig;

  private activeStep: StudioStep = 1;
  private selectedMemoryId: string | null = null;
  private isFullPreview = false;
  private disposed = false;

  private draftStatus: 'idle' | 'saving' | 'saved' | 'restored' = 'idle';
  private draftSaveTimer: number | null = null;
  private configEmitTimer: number | null = null;
  private statusResetTimer: number | null = null;

  private batchDrawerOpen = false;
  private batchRawText = '';
  private uploadBusy = false;
  private uploadFeedback = '';
  private uploadError = false;
  private audioFeedback = '';
  private audioError = false;

  private passcodeInput = '';
  private passcodeHintInput = '';
  private isPublishing = false;
  private publishError = '';
  private publishedResult: PublishCardResult | null = null;
  private posterDataUrl: string | null = null;
  private posterLightboxOpen = false;
  private posterSaveHint = '';
  private wechatShareGuideOpen = false;
  private publishedHistory: PublishedCardRecord[] = [];
  private cloudConfigured: boolean | null = null;
  private copyFeedback = '';
  private jsonFeedback = '';
  private jsonError = false;
  private deleteBusyId: string | null = null;
  private dragMemoryId: string | null = null;
  private suppressNextPhotoClick = false;
  private resetConfirmArmed = false;
  private resetConfirmTimer: number | null = null;

  private rootEl: HTMLDivElement;

  constructor(options: CreatorStudioOptions) {
    this.options = options;
    const cleanDefault = stripDemoMemories(
      cloneConfig(options.defaultConfig ?? options.initialConfig),
    );
    const cleanInitial = stripDemoMemories(cloneConfig(options.initialConfig));
    this.defaultConfig = cleanDefault;
    this.config = this.ensureConfigDefaults(cleanInitial);
    this.selectedMemoryId = this.config.memories[0]?.id ?? null;

    this.rootEl = document.createElement('div');
    this.rootEl.className = 'studio-shell';
    this.options.mountEl.innerHTML = '';
    this.options.mountEl.appendChild(this.rootEl);

    this.render();
    void this.bootstrapAsyncState();
  }

  public setPreviewMode(fullPreview: boolean): void {
    this.isFullPreview = fullPreview;
    this.rootEl.classList.toggle('is-preview-hidden', fullPreview);
    this.rootEl.setAttribute('aria-hidden', fullPreview ? 'true' : 'false');
  }

  public dispose(): void {
    this.disposed = true;
    if (this.draftSaveTimer !== null) {
      window.clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
    }
    if (this.configEmitTimer !== null) {
      window.clearTimeout(this.configEmitTimer);
      this.configEmitTimer = null;
    }
    if (this.statusResetTimer !== null) {
      window.clearTimeout(this.statusResetTimer);
      this.statusResetTimer = null;
    }
    if (this.resetConfirmTimer !== null) {
      window.clearTimeout(this.resetConfirmTimer);
      this.resetConfirmTimer = null;
    }
    this.options.mountEl.innerHTML = '';
  }

  private ensureConfigDefaults(raw: BirthdayCardConfig): BirthdayCardConfig {
    return {
      ...raw,
      age: clampAge(raw.age),
      densityMode: raw.densityMode ?? 'auto',
      layoutSeed: typeof raw.layoutSeed === 'number' && Number.isFinite(raw.layoutSeed) ? raw.layoutSeed : 20261126,
      shareSettings: {
        hideCreateEntry: raw.shareSettings?.hideCreateEntry ?? false,
        passcodeEnabled: raw.shareSettings?.passcodeEnabled ?? false,
      },
      presetFill: {
        autoFill: raw.presetFill?.autoFill ?? true,
        selectedPresetIds: Array.isArray(raw.presetFill?.selectedPresetIds)
          ? [...raw.presetFill.selectedPresetIds]
          : [],
      },
      audio: {
        enabled: raw.audio?.enabled ?? true,
        customBgmUrl: raw.audio?.customBgmUrl ?? '',
        volume: typeof raw.audio?.volume === 'number' ? raw.audio.volume : 0.55,
      },
    };
  }

  private async bootstrapAsyncState(): Promise<void> {
    const [savedDraft, records, cloudReady] = await Promise.all([
      loadDraft().catch(() => null),
      loadPublishedRecords().catch(() => []),
      this.options.shareClient.isCloudConfigured().catch(() => false),
    ]);

    if (this.disposed) return;

    this.publishedHistory = records;
    this.cloudConfigured = cloudReady;

    if (savedDraft) {
      const restored = stripDemoMemories(cloneConfig(savedDraft));
      this.config = this.ensureConfigDefaults(restored);
      this.selectedMemoryId = this.config.memories[0]?.id ?? null;
      this.draftStatus = 'restored';
      this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' }, true);
    }

    this.render();
  }

  private scheduleDraftSave(): void {
    this.draftStatus = 'saving';
    this.updateDraftStatusBadge();

    if (this.draftSaveTimer !== null) {
      window.clearTimeout(this.draftSaveTimer);
    }
    this.draftSaveTimer = window.setTimeout(() => {
      this.draftSaveTimer = null;
      const snapshot = cloneConfig(this.config);
      void saveDraft(snapshot).then(() => {
        if (this.disposed) return;
        this.draftStatus = 'saved';
        this.updateDraftStatusBadge();
      });
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }

  private updateDraftStatusBadge(): void {
    const badge = this.rootEl.querySelector<HTMLElement>('[data-live="draft-status"]');
    if (!badge) return;
    badge.textContent = this.getDraftStatusText();
    badge.dataset.state = this.draftStatus;
  }

  private getDraftStatusText(): string {
    switch (this.draftStatus) {
      case 'saving':
        return '正在保存…';
      case 'saved':
        return '已自动保存';
      case 'restored':
        return '已恢复上次草稿';
      default:
        return '草稿自动保存';
    }
  }

  private emitConfigChange(opts?: { jumpToAct?: SceneAct }, immediate = false): void {
    if (this.configEmitTimer !== null) {
      window.clearTimeout(this.configEmitTimer);
      this.configEmitTimer = null;
    }

    const fire = (): void => {
      if (this.disposed) return;
      this.options.onConfigChange(cloneConfig(this.config), opts);
    };

    if (immediate) {
      fire();
      return;
    }

    this.configEmitTimer = window.setTimeout(() => {
      this.configEmitTimer = null;
      fire();
    }, CONFIG_EMIT_DEBOUNCE_MS);
  }

  private computePreviewLayout(): MosaicLayoutResult {
    // Always compute with autoFill:true so every digit cell index 0..totalDigitSlots-1 is visible & clickable for pinning
    return buildAgeMosaicLayout(
      this.config.age,
      this.config.memories,
      SYSTEM_PRESETS,
      {
        autoFill: true,
        selectedPresetIds: this.config.presetFill.selectedPresetIds,
      },
      {
        densityMode: this.config.densityMode ?? 'auto',
        layoutSeed: this.config.layoutSeed,
      }
    );
  }

  private getSelectedMemory(): MemoryPhotoItem | null {
    if (this.config.memories.length === 0) {
      this.selectedMemoryId = null;
      return null;
    }
    const found = this.config.memories.find((m) => m.id === this.selectedMemoryId);
    if (found) return found;
    this.selectedMemoryId = this.config.memories[0].id;
    return this.config.memories[0];
  }

  private getStepAct(step: StudioStep): SceneAct {
    switch (step) {
      case 1:
        return 'AWAITING_OPEN';
      case 2:
        return 'MEMORY_EXPLORE';
      case 3:
        return 'BLESSING_LETTER';
      case 4:
        return 'AWAITING_OPEN';
    }
  }

  private goToStep(step: StudioStep): void {
    if (this.activeStep === step) return;
    this.activeStep = step;
    this.render();
    this.emitConfigChange({ jumpToAct: this.getStepAct(step) }, true);
  }

  private render(): void {
    const bodyScroll = this.rootEl.querySelector<HTMLElement>('.studio-body');
    const prevScrollTop = bodyScroll ? bodyScroll.scrollTop : 0;

    this.rootEl.className = this.isFullPreview ? 'studio-shell is-preview-hidden' : 'studio-shell';
    this.rootEl.innerHTML = `
      ${this.renderHeaderHtml()}
      <div class="studio-body">
        ${this.renderActiveStepHtml()}
      </div>
      ${this.renderFooterHtml()}
      ${this.renderPosterLightboxHtml()}
    `;

    const nextScroll = this.rootEl.querySelector<HTMLElement>('.studio-body');
    if (nextScroll) {
      nextScroll.scrollTop = prevScrollTop;
    }

    this.bindEvents();
  }

  private renderHeaderHtml(): string {
    const tabs: Array<{ step: StudioStep; label: string }> = [
      { step: 1, label: '1 封面' },
      { step: 2, label: '2 照片墙' },
      { step: 3, label: '3 祝福' },
      { step: 4, label: '4 发布' },
    ];

    return `
      <header class="studio-header">
        <div class="studio-header-top">
          <div class="studio-title-group">
            <h1 class="studio-title">制作生日贺卡</h1>
            <span class="studio-draft-status" data-live="draft-status" data-state="${this.draftStatus}">${escapeHtml(
              this.getDraftStatusText()
            )}</span>
          </div>
          <div class="studio-header-actions">
            <button
              type="button"
              class="studio-btn studio-btn-secondary studio-btn-sm studio-header-preview-btn"
              data-action="fullscreen-current"
            >全屏试看</button>
            <button
              type="button"
              class="studio-ghost-btn ${this.resetConfirmArmed ? 'is-confirm-armed' : ''}"
              data-action="reset-draft"
            >${this.resetConfirmArmed ? '确认重置' : '重置草稿'}</button>
            <button type="button" class="studio-ghost-btn" data-action="exit-studio">退出</button>
          </div>
        </div>
        <nav class="studio-steps" role="tablist" aria-label="制作步骤">
          ${tabs
            .map(
              (tab) => `
            <button
              type="button"
              role="tab"
              class="studio-step-tab ${this.activeStep === tab.step ? 'is-active' : ''}"
              aria-selected="${this.activeStep === tab.step ? 'true' : 'false'}"
              data-action="goto-step"
              data-step="${tab.step}"
            >${tab.label}</button>
          `
            )
            .join('')}
        </nav>
      </header>
    `;
  }

  private renderFooterHtml(): string {
    const hasPrev = this.activeStep > 1;
    const hasNext = this.activeStep < 4;

    return `
      <footer class="studio-footer">
        <div>
          ${
            hasPrev
              ? `<button type="button" class="studio-btn studio-btn-secondary" data-action="prev-step">上一步</button>`
              : `<button type="button" class="studio-btn studio-btn-secondary" data-action="fullscreen-current">全屏试看</button>`
          }
        </div>
        <div>
          ${
            hasNext
              ? `<button type="button" class="studio-btn studio-btn-primary" data-action="next-step">下一步</button>`
              : `<button type="button" class="studio-btn studio-btn-primary" data-action="preview-full">从头完整试演</button>`
          }
        </div>
      </footer>
    `;
  }

  private renderActiveStepHtml(): string {
    switch (this.activeStep) {
      case 1:
        return this.renderStep1Html();
      case 2:
        return this.renderStep2Html();
      case 3:
        return this.renderStep3Html();
      case 4:
        return this.renderStep4Html();
    }
  }

  private getAgeSlotHintText(): string {
    const safeAge = clampAge(this.config.age);
    const info = getDigitSlotCount(
      safeAge,
      this.config.densityMode ?? 'auto',
      this.config.memories.length
    );
    return `10–100 岁 · 数字「${safeAge}」当前为 ${info.totalDigitSlots} 个卡位（${
      DENSITY_LABELS[info.densityUsed]
    }密度）`;
  }

  private renderStep1Html(): string {
    const prologueLinesText = this.config.prologue.lines.join('\n');

    return `
      <section class="studio-panel" data-step="1">
        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">快捷关系模板</h2>
            <span class="studio-section-sub">一键填入自然真诚的开场与祝福文案</span>
          </div>
          <div class="studio-chip-row">
            ${RELATIONSHIP_TEMPLATES.map(
              (tpl) =>
                `<button type="button" class="studio-chip" data-action="apply-rel-tpl" data-tpl="${tpl.id}">${escapeHtml(
                  tpl.label
                )}</button>`
            ).join('')}
          </div>
        </div>

        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">贺卡封面信息</h2>
            <span class="studio-section-sub">右侧 3D 白色折叠贺卡将实时更新</span>
          </div>

          <div class="studio-grid-2">
            <label class="studio-field">
              <span class="studio-label">收信人称呼</span>
              <input
                type="text"
                class="studio-input"
                data-field="recipientName"
                maxlength="24"
                placeholder="例如：小林 / 妈妈 / 你"
                value="${escapeHtml(this.config.recipientName)}"
              />
            </label>
            <label class="studio-field">
              <span class="studio-label">你的署名</span>
              <input
                type="text"
                class="studio-input"
                data-field="senderName"
                maxlength="24"
                placeholder="例如：你的朋友"
                value="${escapeHtml(this.config.senderName)}"
              />
            </label>
          </div>

          <div class="studio-grid-2">
            <label class="studio-field">
              <span class="studio-label">岁数（10–100 岁）</span>
              <input
                type="number"
                class="studio-input"
                data-field="age"
                min="10"
                max="100"
                step="1"
                value="${this.config.age}"
              />
              <span class="studio-hint" data-live="age-slots">${escapeHtml(this.getAgeSlotHintText())}</span>
            </label>
            <label class="studio-field">
              <span class="studio-label">生日日期</span>
              <input
                type="text"
                class="studio-input"
                data-field="birthdayDate"
                maxlength="24"
                placeholder="例如：2026.05.20"
                value="${escapeHtml(this.config.birthdayDate)}"
              />
            </label>
          </div>

          <label class="studio-field">
            <span class="studio-label">封面副标题</span>
            <input
              type="text"
              class="studio-input"
              data-field="coverSubtitle"
              maxlength="60"
              placeholder="一句简短真诚的封面寄语"
              value="${escapeHtml(this.config.coverSubtitle)}"
            />
          </label>
        </div>

        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">开场序言</h2>
            <span class="studio-section-sub">打开白色贺卡后印在内页右侧与下方提示中的开场话</span>
          </div>

          <label class="studio-field">
            <span class="studio-label">开场标题</span>
            <input
              type="text"
              class="studio-input"
              data-field="prologueTitle"
              maxlength="32"
              value="${escapeHtml(this.config.prologue.title)}"
            />
          </label>

          <label class="studio-field">
            <span class="studio-label">开场内容（按回车换行即自动分成自然段）</span>
            <textarea
              class="studio-textarea"
              data-field="prologueLines"
              rows="4"
              placeholder="写下打开贺卡后的第一段话，按回车换行即自动分成自然段…"
            >${escapeHtml(prologueLinesText)}</textarea>
          </label>
        </div>
      </section>
    `;
  }

  private renderSlotMapHtml(layout: MosaicLayoutResult): string {
    const slots = layout.slots;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const s of slots) {
      if (s.position.x < minX) minX = s.position.x;
      if (s.position.x > maxX) maxX = s.position.x;
      if (s.position.y < minY) minY = s.position.y;
      if (s.position.y > maxY) maxY = s.position.y;
    }

    const spanX = Math.max(1, maxX - minX + layout.cardWidth);
    const spanY = Math.max(1, maxY - minY + layout.cardHeight);
    const padX = layout.cardWidth * 0.65;
    const padY = layout.cardHeight * 0.65;
    const totalW = spanX + padX * 2;
    const totalH = spanY + padY * 2;

    // Preserve natural age aspect ratio inside the wide slot-map-canvas (~2.4:1)
    const canvasAspect = 2.4;
    const dataAspect = totalW / totalH;
    let usedWidthPct = 100;
    let usedHeightPct = 100;
    if (dataAspect < canvasAspect) {
      usedWidthPct = (dataAspect / canvasAspect) * 100;
    } else {
      usedHeightPct = (canvasAspect / dataAspect) * 100;
    }
    const offsetX = (100 - usedWidthPct) * 0.5;
    const offsetY = (100 - usedHeightPct) * 0.5;

    const dotW = Math.max(1.8, Math.min(5.2, (layout.cardWidth / totalW) * usedWidthPct * 0.82));
    const dotH = Math.max(4.5, Math.min(13.5, (layout.cardHeight / totalH) * usedHeightPct * 0.82));

    const haloCount = slots.filter((s) => s.isHalo).length;
    const summaryExtra = haloCount > 0 ? ` · +${haloCount} 张星环位` : '';

    const dotsHtml = slots
      .map((slot) => {
        const leftPct = (
          offsetX +
          ((slot.position.x - minX + layout.cardWidth * 0.5 + padX) / totalW) * usedWidthPct
        ).toFixed(2);
        const topPct = (
          offsetY +
          ((maxY - slot.position.y + layout.cardHeight * 0.5 + padY) / totalH) * usedHeightPct
        ).toFixed(2);
        const isMemory = slot.kind === 'memory' && Boolean(slot.memory);
        const isSelected = Boolean(isMemory && slot.memory?.id === this.selectedMemoryId);
        const isPinned = Boolean(
          isMemory &&
            typeof slot.memory?.pinnedSlotIndex === 'number' &&
            slot.memory.pinnedSlotIndex === slot.index &&
            !slot.isHalo
        );

        const classes = [
          'slot-map-dot',
          isMemory ? 'slot-map-dot--memory' : 'slot-map-dot--preset',
          slot.isHalo ? 'slot-map-dot--halo' : '',
          isSelected ? 'is-selected' : '',
          isPinned ? 'is-pinned' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const title = isMemory
          ? `${slot.memory!.title || '回忆照片'}${isPinned ? '（已锁定位置）' : ''} · 点击选中并在 3D 中查看`
          : `空余装饰位 #${slot.index + 1} · 点击将当前选中照片锁定到此位置`;

        return `
          <button
            type="button"
            class="${classes}"
            style="left:${leftPct}%;top:${topPct}%;width:${dotW.toFixed(2)}%;height:${dotH.toFixed(2)}%;"
            title="${escapeHtml(title)}"
            data-action="slot-map-click"
            data-slot-index="${slot.index}"
            data-slot-kind="${slot.kind}"
            data-is-halo="${slot.isHalo ? '1' : '0'}"
            ${isMemory ? `data-memory-id="${escapeHtml(slot.memory!.id)}"` : ''}
          ></button>
        `;
      })
      .join('');

    return `
      <div class="slot-map-card">
        <div class="slot-map-header">
          <div class="slot-map-summary">
            数字「<strong>${escapeHtml(layout.ageText)}</strong>」· ${this.config.memories.length} 张照片 / ${
              layout.totalDigitSlots
            } 个数字位${escapeHtml(summaryExtra)}
          </div>
          <button type="button" class="studio-btn studio-btn-secondary studio-btn-sm" data-action="shuffle-layout">
            随机换排布
          </button>
        </div>

        <div class="studio-segmented" role="group" aria-label="点阵密度">
          ${DENSITY_OPTIONS.map(
            (opt) => `
            <button
              type="button"
              class="studio-seg-btn ${(this.config.densityMode ?? 'auto') === opt.id ? 'is-active' : ''}"
              data-action="set-density"
              data-density="${opt.id}"
            >${opt.label}</button>
          `
          ).join('')}
        </div>

        <div class="slot-map-canvas" role="group" aria-label="年龄数字照片分布示意图">
          ${dotsHtml}
        </div>

        <div class="slot-map-legend">
          <span class="slot-map-legend-item"><i class="slot-map-swatch slot-map-swatch--memory"></i>你的照片（点选定位）</span>
          <span class="slot-map-legend-item"><i class="slot-map-swatch slot-map-swatch--preset"></i>装饰位（点击可锁定当前照片）</span>
        </div>
      </div>
    `;
  }

  private renderStep2Html(): string {
    const layout = this.computePreviewLayout();
    const selected = this.getSelectedMemory();
    const placeholderCount = this.config.memories.filter((m) => !m.image.trim()).length;

    const selectedSlot = selected
      ? layout.slots.find((s) => s.kind === 'memory' && s.memory?.id === selected.id)
      : undefined;
    const selectedIndex = selected ? this.config.memories.findIndex((m) => m.id === selected.id) : -1;
    const isPinned = Boolean(selected && typeof selected.pinnedSlotIndex === 'number');

    const batchParsed = this.batchRawText.trim() ? parseBatchTextNotes(this.batchRawText) : [];
    const activePresetIds = this.config.presetFill.selectedPresetIds;

    return `
      <section class="studio-panel" data-step="2">
        <div class="studio-section">
          <div class="studio-dropzone" data-dropzone="photos" role="button" tabindex="0">
            <input
              type="file"
              accept="image/*"
              multiple
              class="studio-sr-input"
              data-input="photo-files"
            />
            <div class="studio-dropzone-title">${
              this.uploadBusy ? '正在压缩并导入照片…' : '点击选择或拖入回忆照片'
            }</div>
            <div class="studio-dropzone-sub">
              支持多选 · 自动矫正旋转并压缩 · 当前 ${this.config.memories.length} / ${MAX_PHOTOS} 张
            </div>
          </div>

          ${
            this.uploadFeedback
              ? `<p class="studio-feedback ${this.uploadError ? 'studio-feedback--error' : 'studio-feedback--ok'}">${escapeHtml(
                  this.uploadFeedback
                )}</p>`
              : ''
          }

          <div class="studio-toolbar">
            <button type="button" class="studio-btn studio-btn-secondary studio-btn-sm" data-action="toggle-batch">
              ${this.batchDrawerOpen ? '收起批量导入' : '批量导入文字'}
            </button>
            ${
              placeholderCount > 0 && this.config.memories.length > placeholderCount
                ? `<button type="button" class="studio-ghost-btn" data-action="remove-placeholders">移除 ${placeholderCount} 张示例占位图</button>`
                : ''
            }
          </div>

          ${
            this.batchDrawerOpen
              ? `
            <div class="studio-batch-drawer">
              <div class="studio-section-head">
                <span class="studio-label">批量导入照片说明</span>
                <label class="studio-ghost-btn studio-file-label">
                  从 .txt / .json 导入
                  <input type="file" accept=".txt,.json,.md,text/plain,application/json" class="studio-sr-input" data-input="batch-file" />
                </label>
              </div>
              <p class="studio-hint">
                自动识别 3 种格式：① JSON 数组；② 竖线分隔（如 <code>2025.06.18 | 海边日落 | 那天风很大 | 背面悄悄话</code>）；③ 空行分隔段落。
              </p>
              <textarea
                class="studio-textarea studio-textarea--code"
                rows="5"
                data-field="batchRawText"
                placeholder="2025.06.18 | 海边日落 | 那天风很大，走得很轻松 | 希望以后还能常去看海"
              >${escapeHtml(this.batchRawText)}</textarea>
              <div class="studio-batch-preview" data-live="batch-preview">
                ${
                  batchParsed.length > 0
                    ? `已识别 <strong>${batchParsed.length}</strong> 条说明（将按顺序写入前 ${Math.min(
                        batchParsed.length,
                        this.config.memories.length
                      )} 张照片）`
                    : '粘贴或导入文本后将在此实时显示识别条数'
                }
              </div>
              <div class="studio-toolbar">
                <button
                  type="button"
                  class="studio-btn studio-btn-primary studio-btn-sm"
                  data-action="apply-batch"
                  ${batchParsed.length === 0 || this.config.memories.length === 0 ? 'disabled' : ''}
                >一键套用到照片</button>
                <button type="button" class="studio-ghost-btn" data-action="clear-batch">清空</button>
              </div>
            </div>
          `
              : ''
          }
        </div>

        <div class="studio-section">
          ${this.renderSlotMapHtml(layout)}
        </div>

        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">照片列表与单张编辑</h2>
            <span class="studio-section-sub">直接拖动 ⋮⋮ 调整照片顺序，点击卡片可在 3D 中聚焦编辑</span>
          </div>

          ${
            this.config.memories.length === 0
              ? `<p class="studio-hint">还没有回忆照片，请点击上方区域上传照片（未上传时数字将由暖白生日插画卡构成）。</p>`
              : `
            <div class="studio-photo-list" role="listbox" aria-label="回忆照片列表（支持拖动排序）">
              ${this.config.memories
                .map((mem, idx) => {
                  const isSel = mem.id === selected?.id;
                  const memPinned = typeof mem.pinnedSlotIndex === 'number';
                  const previewLine = mem.caption?.trim() || mem.message.trim();
                  const subText = [mem.date.trim(), previewLine ? previewLine.slice(0, 18) : '']
                    .filter(Boolean)
                    .join(' · ');
                  return `
                    <div
                      class="studio-photo-item ${isSel ? 'is-selected' : ''} ${memPinned ? 'is-pinned' : ''}"
                      draggable="true"
                      role="option"
                      tabindex="0"
                      aria-selected="${isSel ? 'true' : 'false'}"
                      data-photo-item="1"
                      data-memory-id="${escapeHtml(mem.id)}"
                      data-index="${idx}"
                    >
                      <span
                        class="studio-drag-handle"
                        data-drag-handle="1"
                        title="按住拖动调整顺序"
                        aria-label="拖动排序"
                      >⋮⋮</span>
                      <span class="studio-photo-item-thumb">
                        ${
                          mem.image.trim()
                            ? `<img class="studio-photo-thumb-img" src="${escapeHtml(mem.image)}" alt="${escapeHtml(
                                mem.title || `照片 ${idx + 1}`
                              )}" loading="lazy" draggable="false" />`
                            : `<span class="studio-photo-thumb-placeholder">示例 ${idx + 1}</span>`
                        }
                      </span>
                      <span class="studio-photo-item-meta">
                        <span class="studio-photo-item-title" data-live="thumb-title-${escapeHtml(mem.id)}">${escapeHtml(
                          mem.title || `回忆 ${idx + 1}`
                        )}</span>
                        ${
                          subText
                            ? `<span class="studio-photo-item-sub">${escapeHtml(subText)}</span>`
                            : ''
                        }
                      </span>
                      <span class="studio-photo-item-badges">
                        ${memPinned ? `<span class="studio-photo-item-pin" title="已锁定槽位">锁</span>` : ''}
                        <span class="studio-photo-item-order">#${idx + 1}</span>
                      </span>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `
          }

          ${
            selected
              ? this.renderSelectedMemoryEditorHtml(selected, selectedIndex, isPinned, selectedSlot?.isHalo ?? false)
              : ''
          }
        </div>

        <div class="studio-section studio-section--subtle">
          <div class="studio-section-head">
            <h2 class="studio-section-title">空位装饰卡风格</h2>
            <span class="studio-section-sub">未填满的数字槽位自动用暖白插画卡补齐</span>
          </div>

          <label class="studio-checkbox">
            <input
              type="checkbox"
              data-action="toggle-autofill"
              ${this.config.presetFill.autoFill ? 'checked' : ''}
            />
            <span>开启自动装饰补位（推荐保持开启以呈现完整年龄数字）</span>
          </label>

          ${
            this.config.presetFill.autoFill
              ? `
            <div class="studio-chip-row">
              <button
                type="button"
                class="studio-chip ${activePresetIds.length === 0 ? 'is-active' : ''}"
                data-action="preset-all"
              >全部 8 款</button>
              ${SYSTEM_PRESETS.map((preset) => {
                const isSelectedPreset =
                  activePresetIds.length > 0 && activePresetIds.includes(preset.id);
                return `
                  <button
                    type="button"
                    class="studio-chip ${isSelectedPreset ? 'is-active' : ''}"
                    data-action="toggle-preset"
                    data-preset-id="${escapeHtml(preset.id)}"
                  >${escapeHtml(preset.name)}</button>
                `;
              }).join('')}
            </div>
          `
              : ''
          }
        </div>
      </section>
    `;
  }

  private renderSelectedMemoryEditorHtml(
    memory: MemoryPhotoItem,
    index: number,
    isPinned: boolean,
    isHalo: boolean
  ): string {
    const resolved = resolveMemoryDisplay(memory);
    const activeTplId: CaptionTemplateId = resolved.template.id;
    const tplMeta = CAPTION_TEMPLATES[activeTplId];
    const total = this.config.memories.length;

    return `
      <div class="studio-editor-card">
        <div class="studio-editor-head">
          <span class="studio-label">第 ${index + 1} / ${total} 张${isPinned ? ` · 已锁定槽位 #${memory.pinnedSlotIndex! + 1}` : ''}</span>
          <div class="studio-editor-actions">
            <button type="button" class="studio-ghost-btn" data-action="focus-memory">3D 查看</button>
            <button
              type="button"
              class="studio-ghost-btn"
              data-action="toggle-pin"
              ${!isPinned && isHalo ? 'disabled title="星环位照片需点击上方数字空位锁定"' : ''}
            >${isPinned ? '取消锁定' : '锁定当前位置'}</button>
            <button type="button" class="studio-danger-btn" data-action="delete-memory">删除</button>
          </div>
        </div>

        <div class="studio-field">
          <span class="studio-label">文字排版模板</span>
          <div class="studio-template-pills" role="radiogroup" aria-label="照片排版模板">
            ${CAPTION_TEMPLATE_LIST.map((tpl) => {
              const label = tpl.id === 'milestone' ? '纪念刻度' : tpl.id === 'warm-note' ? '温柔便签' : tpl.badgeLabel ?? tpl.name;
              return `
                <button
                  type="button"
                  class="studio-template-pill ${activeTplId === tpl.id ? 'is-active' : ''}"
                  data-action="set-memory-template"
                  data-template-id="${tpl.id}"
                >${escapeHtml(label)}</button>
              `;
            }).join('')}
          </div>
          <span class="studio-hint">${escapeHtml(tplMeta.description)}</span>
        </div>

        <div class="studio-grid-2">
          <label class="studio-field">
            <span class="studio-label">日期</span>
            <input
              type="text"
              class="studio-input"
              data-memory-field="date"
              maxlength="24"
              placeholder="例如：2025.07.19"
              value="${escapeHtml(memory.date)}"
            />
          </label>
          <label class="studio-field">
            <span class="studio-label">照片标题</span>
            <input
              type="text"
              class="studio-input"
              data-memory-field="title"
              maxlength="32"
              placeholder="${escapeHtml(tplMeta.sampleTitle)}"
              value="${escapeHtml(memory.title)}"
            />
          </label>
        </div>

        <label class="studio-field">
          <span class="studio-label">正面说明（点开照片时直接显示）</span>
          <textarea
            class="studio-textarea"
            rows="2"
            data-memory-field="caption"
            placeholder="${escapeHtml(tplMeta.sampleCaption)}"
          >${escapeHtml(memory.caption ?? '')}</textarea>
        </label>

        <label class="studio-field">
          <span class="studio-label">背面留言（翻转 180° 后显示）</span>
          <textarea
            class="studio-textarea"
            rows="3"
            data-memory-field="message"
            placeholder="${escapeHtml(tplMeta.sampleBackNote)}"
          >${escapeHtml(memory.message)}</textarea>
        </label>
      </div>
    `;
  }

  private renderStep3Html(): string {
    const paragraphsText = this.config.finalBlessing.paragraphs.join('\n');
    const volumePct = Math.round((this.config.audio.volume ?? 0.55) * 100);
    const hasCustomAudio = Boolean(this.config.audio.customBgmUrl.trim());
    const isDataAudio = this.config.audio.customBgmUrl.startsWith('data:audio/');

    return `
      <section class="studio-panel" data-step="3">
        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">终幕信纸祝福</h2>
            <span class="studio-section-sub">浏览完照片后展开的纯白棉纸祝福信</span>
          </div>

          <div class="studio-chip-row">
            ${BLESSING_TEMPLATES.map(
              (tpl) =>
                `<button type="button" class="studio-chip" data-action="apply-blessing-tpl" data-tpl="${tpl.id}">${escapeHtml(
                  tpl.label
                )}</button>`
            ).join('')}
          </div>

          <label class="studio-field">
            <span class="studio-label">祝福大标题</span>
            <input
              type="text"
              class="studio-input"
              data-field="blessingHeadline"
              maxlength="40"
              value="${escapeHtml(this.config.finalBlessing.headline)}"
            />
          </label>

          <label class="studio-field">
            <span class="studio-label">祝福正文（按回车换行即自动分成自然段）</span>
            <textarea
              class="studio-textarea studio-textarea--tall"
              rows="7"
              data-field="blessingParagraphs"
              placeholder="写下想对 TA 说的新岁祝福，按回车换行即自动分成自然段…"
            >${escapeHtml(paragraphsText)}</textarea>
          </label>

          <div class="studio-grid-2">
            <label class="studio-field">
              <span class="studio-label">信末署名</span>
              <input
                type="text"
                class="studio-input"
                data-field="blessingSignature"
                maxlength="24"
                value="${escapeHtml(this.config.finalBlessing.signature)}"
              />
            </label>
            <label class="studio-field">
              <span class="studio-label">合卡按钮文案</span>
              <input
                type="text"
                class="studio-input"
                data-field="closeCardLabel"
                maxlength="16"
                value="${escapeHtml(this.config.finalBlessing.closeCardLabel)}"
              />
            </label>
          </div>

          <div class="studio-grid-2">
            <label class="studio-field">
              <span class="studio-label">烟花终幕标题</span>
              <input
                type="text"
                class="studio-input"
                data-field="finaleTitle"
                maxlength="24"
                value="${escapeHtml(this.config.finaleWish.title)}"
              />
            </label>
            <label class="studio-field">
              <span class="studio-label">烟花终幕副句</span>
              <input
                type="text"
                class="studio-input"
                data-field="finaleSubtitle"
                maxlength="40"
                value="${escapeHtml(this.config.finaleWish.subtitle)}"
              />
            </label>
          </div>
        </div>

        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">背景音乐</h2>
            <span class="studio-section-sub">默认自动演奏内置轻柔八音盒旋律</span>
          </div>

          <label class="studio-checkbox">
            <input
              type="checkbox"
              data-action="toggle-audio"
              ${this.config.audio.enabled ? 'checked' : ''}
            />
            <span>开启背景音乐</span>
          </label>

          <label class="studio-field">
            <span class="studio-label">音量 <strong data-live="volume-pct">${volumePct}%</strong></span>
            <div class="studio-range-row">
              <input
                type="range"
                class="studio-range"
                min="0"
                max="100"
                step="1"
                data-field="audioVolume"
                value="${volumePct}"
              />
            </div>
          </label>

          <label class="studio-field">
            <span class="studio-label">自定义音频链接（可选）</span>
            <input
              type="text"
              class="studio-input"
              data-field="customBgmUrl"
              placeholder="留空使用内置八音盒，或输入 MP3 / OGG 地址"
              value="${escapeHtml(isDataAudio ? '已上传本地音频文件' : this.config.audio.customBgmUrl)}"
              ${isDataAudio ? 'readonly' : ''}
            />
          </label>

          <div class="studio-toolbar">
            <label class="studio-btn studio-btn-secondary studio-btn-sm studio-file-label">
              上传本地音频（≤ 2MB）
              <input type="file" accept="audio/*" class="studio-sr-input" data-input="audio-file" />
            </label>
            ${
              hasCustomAudio
                ? `<button type="button" class="studio-ghost-btn" data-action="clear-audio">恢复内置八音盒</button>`
                : ''
            }
          </div>

          ${
            this.audioFeedback
              ? `<p class="studio-feedback ${this.audioError ? 'studio-feedback--error' : 'studio-feedback--ok'}">${escapeHtml(
                  this.audioFeedback
                )}</p>`
              : ''
          }
        </div>
      </section>
    `;
  }

  private renderStep4Html(): string {
    const recipient = this.config.recipientName.trim() || '你';
    const hideCreateEntry = this.config.shareSettings?.hideCreateEntry ?? false;
    const modeHint =
      this.cloudConfigured === true
        ? '云端短链服务已就绪 · 生成后支持微信/浏览器跨设备打开（180 天有效）'
        : this.cloudConfigured === false
          ? '当前为本机分享模式 · 可立即预览与下载海报；部署至 Cloudflare Pages 后自动升级全球短链'
          : '正在检测分享服务状态…';

    return `
      <section class="studio-panel" data-step="4">
        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">从头完整试演</h2>
            <span class="studio-section-sub">致 ${escapeHtml(recipient)} · ${this.config.age} 岁 · ${
              this.config.memories.length
            } 张回忆照片（顶部「全屏试看」可随时预览当前阶段）</span>
          </div>
          <button type="button" class="studio-btn studio-btn-primary studio-btn-block" data-action="preview-full">
            从头完整试演
          </button>
        </div>

        <div class="studio-section">
          <div class="studio-section-head">
            <h2 class="studio-section-title">生成专属分享链接与动态海报</h2>
            <span class="studio-section-sub">${escapeHtml(modeHint)}（海报随姓名「${escapeHtml(
              recipient
            )}」与「${this.config.age} 岁」自动更新）</span>
          </div>

          <label class="studio-field">
            <span class="studio-label">访问口令（可选）</span>
            <input
              type="text"
              inputmode="numeric"
              maxlength="4"
              class="studio-input"
              data-field="passcodeInput"
              placeholder="4 位数字口令，如 1126，留空则直接打开"
              value="${escapeHtml(this.passcodeInput)}"
            />
          </label>

          ${
            this.passcodeInput.length > 0
              ? `
            <label class="studio-field">
              <span class="studio-label">海报口令提示（可选，仅显示在分享海报上）</span>
              <input
                type="text"
                maxlength="24"
                class="studio-input"
                data-field="passcodeHintInput"
                placeholder="例如：你的生日 4 位数字"
                value="${escapeHtml(this.passcodeHintInput)}"
              />
            </label>
          `
              : ''
          }

          <label class="studio-checkbox">
            <input
              type="checkbox"
              data-action="toggle-hide-create"
              ${hideCreateEntry ? 'checked' : ''}
            />
            <span>收信人页面隐藏“制作同款”按钮</span>
          </label>

          <button
            type="button"
            class="studio-btn studio-btn-accent studio-btn-block"
            data-action="publish-card"
            ${this.isPublishing ? 'disabled' : ''}
          >${this.isPublishing ? '正在生成专属链接与海报…' : '生成专属分享链接'}</button>

          ${
            this.publishError
              ? `<p class="studio-feedback studio-feedback--error">${escapeHtml(this.publishError)}</p>`
              : ''
          }
        </div>

        ${this.publishedResult ? this.renderPublishedResultHtml(this.publishedResult) : ''}

        ${this.renderPublishedHistoryHtml()}

        <div class="studio-section studio-section--subtle">
          <div class="studio-section-head">
            <h2 class="studio-section-title">配置文件备份（自托管）</h2>
            <span class="studio-section-sub">适合备份或直接替换开源仓库中的配置</span>
          </div>
          <div class="studio-toolbar">
            <button type="button" class="studio-btn studio-btn-secondary studio-btn-sm" data-action="export-json">
              导出 JSON 配置
            </button>
            <label class="studio-btn studio-btn-secondary studio-btn-sm studio-file-label">
              导入 JSON 配置
              <input type="file" accept=".json,application/json" class="studio-sr-input" data-input="import-json" />
            </label>
          </div>
          ${
            this.jsonFeedback
              ? `<p class="studio-feedback ${this.jsonError ? 'studio-feedback--error' : 'studio-feedback--ok'}">${escapeHtml(
                  this.jsonFeedback
                )}</p>`
              : ''
          }
        </div>
      </section>
    `;
  }

  private renderPublishedResultHtml(result: PublishCardResult): string {
    const modeLabel = result.mode === 'cloud' ? '云端短链' : '本机链接';
    const isDeleting = this.deleteBusyId === result.shortId;

    return `
      <div class="poster-result-card">
        <div class="studio-section-head">
          <h3 class="studio-section-title">专属贺卡已生成</h3>
          <span class="poster-mode-badge">${modeLabel}</span>
        </div>

        <div class="poster-url-row">
          <input
            type="text"
            readonly
            class="studio-input"
            value="${escapeHtml(result.shareUrl)}"
            aria-label="专属分享链接"
          />
          <button type="button" class="studio-btn studio-btn-secondary studio-btn-sm" data-action="copy-url">
            ${this.copyFeedback || '复制链接'}
          </button>
        </div>

        <div class="poster-actions">
          <button type="button" class="studio-btn studio-btn-primary studio-btn-sm" data-action="open-published">
            立即打开预览
          </button>
          ${
            this.posterDataUrl
              ? `<button type="button" class="studio-btn studio-btn-accent studio-btn-sm" data-action="download-poster">一键保存海报到相册</button>`
              : ''
          }
          <button type="button" class="studio-btn studio-btn-secondary studio-btn-sm" data-action="share-wechat-card">
            微信卡片转发
          </button>
        </div>

        ${
          this.posterSaveHint
            ? `<p class="poster-save-hint">${escapeHtml(this.posterSaveHint)}</p>`
            : ''
        }

        ${
          this.wechatShareGuideOpen
            ? `
          <div class="poster-wechat-guide">
            <strong>如何以卡片形式发到微信好友对话框：</strong>
            <ol>
              <li>先点上方「立即打开预览」进入你的专属贺卡页（网址为 <code>/c/${escapeHtml(result.shortId)}</code>）</li>
              <li>在微信内点右上角 <code>...</code> 按钮，选择「转发给朋友」即可发出带专属标题与封面的卡片</li>
              <li>也可以把下方二维码海报一键保存到相册，直接发图给对方长按识别</li>
            </ol>
          </div>
        `
            : ''
        }

        ${
          this.posterDataUrl
            ? `
          <div class="poster-preview-wrap">
            <img
              class="poster-preview-img"
              src="${this.posterDataUrl}"
              alt="白色简约生日贺卡二维码海报"
              data-action="open-poster-lightbox"
              title="点击放大海报，手机端可长按保存相册"
            />
          </div>
          <p class="studio-hint poster-tap-tip">海报已自动写入「${escapeHtml(
            this.config.recipientName.trim() || '你'
          )}」与「${this.config.age} 岁」，点击海报可全屏放大或长按存相册。</p>
        `
            : ''
        }

        <div class="studio-manage-box">
          <div class="studio-section-head">
            <span class="studio-label">创作者管理密钥</span>
            <button type="button" class="studio-ghost-btn" data-action="copy-token">复制密钥</button>
          </div>
          <code class="studio-token-code">${escapeHtml(result.editToken)}</code>
          <div class="studio-toolbar">
            <span class="studio-hint">请妥善保存，用于删除或撤销该分享链接。</span>
            <button
              type="button"
              class="studio-danger-btn"
              data-action="delete-published"
              data-short-id="${escapeHtml(result.shortId)}"
              data-edit-token="${escapeHtml(result.editToken)}"
              ${isDeleting ? 'disabled' : ''}
            >${isDeleting ? '删除中…' : '删除此链接'}</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderPosterLightboxHtml(): string {
    if (!this.posterLightboxOpen || !this.posterDataUrl) return '';
    return `
      <div class="poster-lightbox" role="dialog" aria-modal="true" aria-label="保存分享海报到相册" data-action="close-poster-lightbox">
        <div class="poster-lightbox-inner" data-stop-lightbox="1">
          <img class="poster-lightbox-img" src="${this.posterDataUrl}" alt="生日贺卡高清分享海报" />
          <p class="poster-lightbox-tip">手机微信请长按上方海报，选择「保存图片」到相册或「转发给朋友」</p>
          <button type="button" class="studio-btn studio-btn-secondary studio-btn-sm" data-action="close-poster-lightbox">
            关闭预览
          </button>
        </div>
      </div>
    `;
  }

  private renderPublishedHistoryHtml(): string {
    const others = this.publishedHistory.filter(
      (item) => !this.publishedResult || item.shortId !== this.publishedResult.shortId
    );
    if (others.length === 0) return '';

    return `
      <div class="studio-section studio-section--subtle">
        <div class="studio-section-head">
          <h2 class="studio-section-title">近期已生成链接</h2>
          <span class="studio-section-sub">保存在当前浏览器中，便于随时回访或删除</span>
        </div>
        <div class="studio-history-list">
          ${others
            .slice(0, 5)
            .map((rec) => {
              const busy = this.deleteBusyId === rec.shortId;
              return `
                <div class="studio-history-item">
                  <div>
                    <strong>致 ${escapeHtml(rec.recipientName || '你')} · ${rec.age} 岁</strong>
                    <div class="studio-hint">${rec.mode === 'cloud' ? '云端' : '本机'} · ${escapeHtml(rec.shortId)}</div>
                  </div>
                  <div class="studio-editor-actions">
                    <button type="button" class="studio-ghost-btn" data-action="history-open" data-short-id="${escapeHtml(
                      rec.shortId
                    )}">打开</button>
                    <button type="button" class="studio-ghost-btn" data-action="history-copy" data-url="${escapeHtml(
                      rec.shareUrl
                    )}">复制</button>
                    <button
                      type="button"
                      class="studio-danger-btn"
                      data-action="delete-published"
                      data-short-id="${escapeHtml(rec.shortId)}"
                      data-edit-token="${escapeHtml(rec.editToken)}"
                      ${busy ? 'disabled' : ''}
                    >${busy ? '…' : '删除'}</button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Button clicks via delegation
    this.rootEl.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
      const action = el.dataset.action;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.addEventListener('change', () => this.handleCheckboxAction(action ?? '', el.checked));
      } else {
        el.addEventListener('click', (evt) => {
          if (
            action === 'close-poster-lightbox' &&
            el.classList.contains('poster-lightbox') &&
            (evt.target as HTMLElement | null)?.closest('[data-stop-lightbox]')
          ) {
            return;
          }
          evt.preventDefault();
          void this.handleClickAction(action ?? '', el);
        });
      }
    });

    // Step 1 / 3 / 4 text & number inputs (in-place state updates without breaking IME)
    this.rootEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]').forEach((input) => {
      input.addEventListener('input', () => this.handleFieldInput(input));
      if (input.dataset.field === 'age') {
        const snapAge = (): void => {
          const parsed = Number.parseInt(input.value, 10);
          const clamped = clampAge(Number.isFinite(parsed) ? parsed : this.config.age);
          this.config.age = clamped;
          input.value = String(clamped);
          const slotEl = this.rootEl.querySelector<HTMLElement>('[data-live="age-slots"]');
          if (slotEl) slotEl.textContent = this.getAgeSlotHintText();
          this.scheduleDraftSave();
          this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        };
        input.addEventListener('change', snapAge);
        input.addEventListener('blur', snapAge);
      }
    });

    // Step 2 direct drag-and-drop photo reordering (HTML5 DnD + touch pointer fallback)
    this.bindPhotoDragAndDrop();

    // Step 2 selected memory fields
    this.rootEl
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-memory-field]')
      .forEach((input) => {
        input.addEventListener('input', () => this.handleMemoryFieldInput(input));
      });

    // Photo dropzone + file picker
    const dropzone = this.rootEl.querySelector<HTMLElement>('[data-dropzone="photos"]');
    const photoInput = this.rootEl.querySelector<HTMLInputElement>('[data-input="photo-files"]');
    if (dropzone && photoInput) {
      dropzone.addEventListener('click', (e) => {
        if (e.target !== photoInput) photoInput.click();
      });
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          photoInput.click();
        }
      });
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('is-dragover');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          void this.handlePhotoFiles(files);
        }
      });
      photoInput.addEventListener('change', () => {
        if (photoInput.files && photoInput.files.length > 0) {
          void this.handlePhotoFiles(photoInput.files);
          photoInput.value = '';
        }
      });
    }

    // Batch text file input
    const batchFileInput = this.rootEl.querySelector<HTMLInputElement>('[data-input="batch-file"]');
    if (batchFileInput) {
      batchFileInput.addEventListener('change', () => {
        const file = batchFileInput.files?.[0];
        if (!file) return;
        void readFileAsText(file)
          .then((text) => {
            if (this.disposed) return;
            this.batchRawText = text;
            this.render();
          })
          .catch(() => {
            if (this.disposed) return;
            this.uploadFeedback = '无法读取该文本文件，请确认文件为 UTF-8 编码。';
            this.uploadError = true;
            this.render();
          });
        batchFileInput.value = '';
      });
    }

    // Custom audio file input
    const audioFileInput = this.rootEl.querySelector<HTMLInputElement>('[data-input="audio-file"]');
    if (audioFileInput) {
      audioFileInput.addEventListener('change', () => {
        const file = audioFileInput.files?.[0];
        if (!file) return;
        void this.handleAudioFileUpload(file);
        audioFileInput.value = '';
      });
    }

    // Import JSON config file input
    const importJsonInput = this.rootEl.querySelector<HTMLInputElement>('[data-input="import-json"]');
    if (importJsonInput) {
      importJsonInput.addEventListener('change', () => {
        const file = importJsonInput.files?.[0];
        if (!file) return;
        void this.handleImportJsonFile(file);
        importJsonInput.value = '';
      });
    }
  }

  private handleFieldInput(el: HTMLInputElement | HTMLTextAreaElement): void {
    const field = el.dataset.field;
    if (!field) return;

    switch (field) {
      case 'recipientName':
        this.config.recipientName = el.value;
        this.refreshPublishedPosterIfNeeded();
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        break;
      case 'senderName':
        this.config.senderName = el.value;
        this.refreshPublishedPosterIfNeeded();
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        break;
      case 'age': {
        const num = Number.parseInt(el.value, 10);
        if (Number.isFinite(num)) {
          this.config.age = clampAge(num);
          const slotEl = this.rootEl.querySelector<HTMLElement>('[data-live="age-slots"]');
          if (slotEl) slotEl.textContent = this.getAgeSlotHintText();
          this.refreshPublishedPosterIfNeeded();
          this.scheduleDraftSave();
          this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        }
        break;
      }
      case 'birthdayDate':
        this.config.birthdayDate = el.value;
        this.refreshPublishedPosterIfNeeded();
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        break;
      case 'coverSubtitle':
        this.config.coverSubtitle = el.value;
        this.refreshPublishedPosterIfNeeded();
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        break;
      case 'prologueTitle':
        this.config.prologue.title = el.value;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        break;
      case 'prologueLines':
        this.config.prologue.lines = el.value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' });
        break;
      case 'batchRawText': {
        this.batchRawText = el.value;
        const parsed = this.batchRawText.trim() ? parseBatchTextNotes(this.batchRawText) : [];
        const previewEl = this.rootEl.querySelector<HTMLElement>('[data-live="batch-preview"]');
        if (previewEl) {
          previewEl.innerHTML =
            parsed.length > 0
              ? `已识别 <strong>${parsed.length}</strong> 条说明（将按顺序写入前 ${Math.min(
                  parsed.length,
                  this.config.memories.length
                )} 张照片）`
              : '粘贴或导入文本后将在此实时显示识别条数';
        }
        const applyBtn = this.rootEl.querySelector<HTMLButtonElement>('[data-action="apply-batch"]');
        if (applyBtn) {
          applyBtn.disabled = parsed.length === 0 || this.config.memories.length === 0;
        }
        break;
      }
      case 'blessingHeadline':
        this.config.finalBlessing.headline = el.value;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      case 'blessingParagraphs':
        this.config.finalBlessing.paragraphs = el.value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      case 'blessingSignature':
        this.config.finalBlessing.signature = el.value;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      case 'closeCardLabel':
        this.config.finalBlessing.closeCardLabel = el.value;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      case 'finaleTitle':
        this.config.finaleWish.title = el.value;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      case 'finaleSubtitle':
        this.config.finaleWish.subtitle = el.value;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      case 'audioVolume': {
        const pct = Math.max(0, Math.min(100, Number.parseInt(el.value, 10) || 0));
        this.config.audio.volume = pct / 100;
        const pctEl = this.rootEl.querySelector<HTMLElement>('[data-live="volume-pct"]');
        if (pctEl) pctEl.textContent = `${pct}%`;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      }
      case 'customBgmUrl':
        this.config.audio.customBgmUrl = el.value.trim();
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' });
        break;
      case 'passcodeInput': {
        const digitsOnly = el.value.replace(/\D+/g, '').slice(0, 4);
        const hadPasscode = this.passcodeInput.length > 0;
        this.passcodeInput = digitsOnly;
        if (el.value !== digitsOnly) {
          el.value = digitsOnly;
        }
        const nowHasPasscode = this.passcodeInput.length > 0;
        if (hadPasscode !== nowHasPasscode) {
          // Toggle optional hint field cleanly while preserving focus
          this.render();
          const reFocused = this.rootEl.querySelector<HTMLInputElement>('[data-field="passcodeInput"]');
          if (reFocused) {
            reFocused.focus();
            reFocused.setSelectionRange(digitsOnly.length, digitsOnly.length);
          }
        }
        break;
      }
      case 'passcodeHintInput':
        this.passcodeHintInput = el.value;
        this.refreshPublishedPosterIfNeeded();
        break;
    }
  }

  private refreshPublishedPosterIfNeeded(): void {
    if (!this.publishedResult) return;
    this.posterDataUrl = generateSharePosterDataUrl({
      shareUrl: this.publishedResult.shareUrl,
      recipientName: this.config.recipientName || '你',
      senderName: this.config.senderName || '你的朋友',
      age: this.config.age,
      birthdayDate: this.config.birthdayDate,
      coverSubtitle: this.config.coverSubtitle,
      hasPasscode: this.passcodeInput.trim().length === 4,
      passcodeHint: this.passcodeHintInput.trim() || undefined,
    });
    const imgEl = this.rootEl.querySelector<HTMLImageElement>('.poster-preview-img');
    if (imgEl && this.posterDataUrl) {
      imgEl.src = this.posterDataUrl;
    }
  }

  private handleMemoryFieldInput(el: HTMLInputElement | HTMLTextAreaElement): void {
    const field = el.dataset.memoryField;
    const selected = this.getSelectedMemory();
    if (!field || !selected) return;

    switch (field) {
      case 'date':
        selected.date = el.value;
        break;
      case 'title': {
        selected.title = el.value;
        const thumbName = this.rootEl.querySelector<HTMLElement>(
          `[data-live="thumb-title-${CSS.escape(selected.id)}"]`
        );
        if (thumbName) {
          thumbName.textContent = el.value.trim() || '回忆照片';
        }
        break;
      }
      case 'caption':
        selected.caption = el.value;
        break;
      case 'message':
        selected.message = el.value;
        break;
    }

    this.scheduleDraftSave();
    this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' });
  }

  private handleCheckboxAction(action: string, checked: boolean): void {
    switch (action) {
      case 'toggle-autofill':
        this.config.presetFill.autoFill = checked;
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      case 'toggle-audio':
        this.config.audio.enabled = checked;
        this.scheduleDraftSave();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' }, true);
        break;
      case 'toggle-hide-create':
        this.config.shareSettings = {
          ...this.config.shareSettings,
          hideCreateEntry: checked,
        };
        this.scheduleDraftSave();
        this.emitConfigChange();
        break;
    }
  }

  private async handleClickAction(action: string, el: HTMLElement): Promise<void> {
    switch (action) {
      case 'goto-step': {
        const nextStep = Number.parseInt(el.dataset.step ?? '1', 10) as StudioStep;
        if (nextStep >= 1 && nextStep <= 4) {
          this.goToStep(nextStep);
        }
        break;
      }
      case 'prev-step':
        if (this.activeStep > 1) {
          this.goToStep((this.activeStep - 1) as StudioStep);
        }
        break;
      case 'next-step':
        if (this.activeStep < 4) {
          this.goToStep((this.activeStep + 1) as StudioStep);
        }
        break;
      case 'exit-studio':
        this.options.onExitStudio();
        break;
      case 'reset-draft': {
        if (!this.resetConfirmArmed) {
          this.resetConfirmArmed = true;
          this.uploadFeedback = '再点一次「确认重置」即可清空当前草稿。';
          this.uploadError = false;
          this.render();
          if (this.resetConfirmTimer !== null) {
            window.clearTimeout(this.resetConfirmTimer);
          }
          this.resetConfirmTimer = window.setTimeout(() => {
            this.resetConfirmTimer = null;
            if (!this.resetConfirmArmed || this.disposed) return;
            this.resetConfirmArmed = false;
            this.render();
          }, 4000);
          return;
        }
        this.resetConfirmArmed = false;
        if (this.resetConfirmTimer !== null) {
          window.clearTimeout(this.resetConfirmTimer);
          this.resetConfirmTimer = null;
        }
        await clearDraft();
        if (this.disposed) return;
        this.config = this.ensureConfigDefaults(cloneConfig(this.defaultConfig));
        this.selectedMemoryId = this.config.memories[0]?.id ?? null;
        this.draftStatus = 'idle';
        this.uploadFeedback = '草稿已清空，当前为空白创作底板。';
        this.uploadError = false;
        this.publishError = '';
        this.publishedResult = null;
        this.posterDataUrl = null;
        this.render();
        this.emitConfigChange({ jumpToAct: this.getStepAct(this.activeStep) }, true);
        break;
      }
      case 'apply-rel-tpl': {
        const tpl = RELATIONSHIP_TEMPLATES.find((item) => item.id === el.dataset.tpl);
        if (!tpl) return;
        this.config.coverSubtitle = tpl.coverSubtitle;
        this.config.prologue.title = tpl.prologueTitle;
        this.config.prologue.lines = [...tpl.prologueLines];
        this.config.finalBlessing.paragraphs = tpl.blessingParagraphs(this.config.age);
        this.config.finaleWish.subtitle = tpl.finaleSubtitle;
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' }, true);
        break;
      }
      case 'shuffle-layout':
        this.config.layoutSeed = generateSeed();
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      case 'set-density': {
        const mode = el.dataset.density as MosaicDensityMode | undefined;
        if (mode === 'auto' || mode === 'compact' || mode === 'standard' || mode === 'deluxe') {
          this.config.densityMode = mode;
          this.scheduleDraftSave();
          this.render();
          this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        }
        break;
      }
      case 'slot-map-click': {
        const kind = el.dataset.slotKind;
        const slotIndex = Number.parseInt(el.dataset.slotIndex ?? '-1', 10);
        const isHalo = el.dataset.isHalo === '1';
        const memoryId = el.dataset.memoryId;

        if (kind === 'memory' && memoryId) {
          this.selectedMemoryId = memoryId;
          this.render();
          this.options.onFocusMemory(memoryId);
        } else if (!isHalo && slotIndex >= 0) {
          const selected = this.getSelectedMemory();
          if (selected) {
            // Release any other memory pinned to this exact slot
            for (const m of this.config.memories) {
              if (m.id !== selected.id && m.pinnedSlotIndex === slotIndex) {
                delete m.pinnedSlotIndex;
              }
            }
            selected.pinnedSlotIndex = slotIndex;
            this.scheduleDraftSave();
            this.render();
            this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
          }
        }
        break;
      }
      case 'toggle-batch':
        this.batchDrawerOpen = !this.batchDrawerOpen;
        this.render();
        break;
      case 'clear-batch':
        this.batchRawText = '';
        this.render();
        break;
      case 'apply-batch': {
        const notes = parseBatchTextNotes(this.batchRawText);
        if (notes.length === 0 || this.config.memories.length === 0) return;
        this.config.memories = applyBatchNotesToMemories(this.config.memories, notes);
        this.batchDrawerOpen = false;
        this.uploadFeedback = `已将 ${Math.min(notes.length, this.config.memories.length)} 条文案写入对应照片。`;
        this.uploadError = false;
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      }
      case 'remove-placeholders': {
        this.config.memories = this.config.memories.filter((m) => m.image.trim().length > 0);
        this.selectedMemoryId = this.config.memories[0]?.id ?? null;
        this.uploadFeedback = '已移除未上传图片的示例占位图。';
        this.uploadError = false;
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      }
      case 'focus-memory': {
        const selected = this.getSelectedMemory();
        if (selected) {
          this.options.onFocusMemory(selected.id);
        }
        break;
      }
      case 'fullscreen-current':
        if (this.options.onFullscreenCurrentStage) {
          this.options.onFullscreenCurrentStage();
        } else {
          this.options.onPreviewFullCard(cloneConfig(this.config));
        }
        break;
      case 'toggle-pin': {
        const selected = this.getSelectedMemory();
        if (!selected) return;
        if (typeof selected.pinnedSlotIndex === 'number') {
          delete selected.pinnedSlotIndex;
        } else {
          const layout = this.computePreviewLayout();
          const currentSlot = layout.slots.find(
            (s) => s.kind === 'memory' && s.memory?.id === selected.id && !s.isHalo
          );
          if (currentSlot) {
            selected.pinnedSlotIndex = currentSlot.index;
          }
        }
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      }
      case 'delete-memory': {
        const selected = this.getSelectedMemory();
        if (!selected) return;
        const idx = this.config.memories.findIndex((m) => m.id === selected.id);
        this.config.memories = this.config.memories.filter((m) => m.id !== selected.id);
        const fallback = this.config.memories[Math.min(idx, this.config.memories.length - 1)];
        this.selectedMemoryId = fallback?.id ?? null;
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      }
      case 'set-memory-template': {
        const selected = this.getSelectedMemory();
        const tplId = el.dataset.templateId as CaptionTemplateId | undefined;
        if (!selected || !tplId || !Object.prototype.hasOwnProperty.call(CAPTION_TEMPLATES, tplId)) {
          return;
        }
        selected.template = tplId;
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      }
      case 'preset-all':
        this.config.presetFill.selectedPresetIds = [];
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      case 'toggle-preset': {
        const pid = el.dataset.presetId;
        if (!pid) return;
        const current = new Set(this.config.presetFill.selectedPresetIds);
        if (current.has(pid)) {
          current.delete(pid);
        } else {
          current.add(pid);
        }
        this.config.presetFill.selectedPresetIds =
          current.size >= SYSTEM_PRESETS.length ? [] : Array.from(current);
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
        break;
      }
      case 'apply-blessing-tpl': {
        const tpl = BLESSING_TEMPLATES.find((item) => item.id === el.dataset.tpl);
        if (!tpl) return;
        this.config.finalBlessing.headline = tpl.headline(this.config.age, this.config.recipientName);
        this.config.finalBlessing.paragraphs = tpl.paragraphs(this.config.age);
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' }, true);
        break;
      }
      case 'clear-audio':
        this.config.audio.customBgmUrl = '';
        this.audioFeedback = '已恢复内置轻柔八音盒旋律。';
        this.audioError = false;
        this.scheduleDraftSave();
        this.render();
        this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' }, true);
        break;
      case 'preview-full':
        this.options.onPreviewFullCard(cloneConfig(this.config));
        break;
      case 'publish-card':
        await this.handlePublishCard();
        break;
      case 'copy-url':
        if (this.publishedResult) {
          const ok = await copyTextToClipboard(this.publishedResult.shareUrl);
          this.copyFeedback = ok ? '已复制' : '请手动复制';
          this.render();
          if (this.statusResetTimer !== null) window.clearTimeout(this.statusResetTimer);
          this.statusResetTimer = window.setTimeout(() => {
            this.copyFeedback = '';
            if (!this.disposed) this.render();
          }, 2200);
        }
        break;
      case 'copy-token':
        if (this.publishedResult) {
          await copyTextToClipboard(this.publishedResult.editToken);
          el.textContent = '已复制';
          window.setTimeout(() => {
            if (!this.disposed) el.textContent = '复制密钥';
          }, 1800);
        }
        break;
      case 'open-published':
        if (this.publishedResult) {
          this.options.onOpenPublishedUrl(this.publishedResult.shortId);
        }
        break;
      case 'download-poster':
        if (this.posterDataUrl) {
          const safeRecipient = (this.config.recipientName.trim() || 'birthday').replace(
            /[\\/:*?"<>|]/g,
            ''
          );
          const outcome = await savePosterToAlbum(
            this.posterDataUrl,
            `生日贺卡-${safeRecipient}-${this.config.age}岁.png`
          );
          if (this.disposed) return;
          if (outcome === 'lightbox') {
            this.posterLightboxOpen = true;
            this.posterSaveHint = '微信端已为你打开高清海报，长按图片即可保存到相册。';
          } else if (outcome === 'shared') {
            this.posterSaveHint = '已调起系统分享与保存图像面板。';
          } else {
            this.posterSaveHint = '海报 PNG 已开始下载保存。';
          }
          this.render();
        }
        break;
      case 'open-poster-lightbox':
        if (this.posterDataUrl) {
          this.posterLightboxOpen = true;
          this.render();
        }
        break;
      case 'close-poster-lightbox':
        if (this.posterLightboxOpen) {
          this.posterLightboxOpen = false;
          this.render();
        }
        break;
      case 'share-wechat-card':
        if (this.publishedResult) {
          const recipient = this.config.recipientName.trim() || '你';
          const shareTitle =
            recipient === '你'
              ? `送你一份 ${this.config.age} 岁 3D 生日贺卡`
              : `送给 ${recipient} 的 ${this.config.age} 岁 3D 生日贺卡`;
          const shareText =
            this.config.coverSubtitle.trim() ||
            `点开纯白立体贺卡，翻阅专属 ${this.config.age} 岁星空照片墙与 3D 烟花`;

          const isWeChat = /micromessenger/i.test(navigator.userAgent);
          if (!isWeChat && typeof navigator.share === 'function') {
            try {
              await navigator.share({
                title: shareTitle,
                text: shareText,
                url: this.publishedResult.shareUrl,
              });
              this.posterSaveHint = '已调起系统转发卡片。';
              this.render();
              break;
            } catch (err) {
              if (err instanceof Error && err.name === 'AbortError') break;
            }
          }
          this.wechatShareGuideOpen = !this.wechatShareGuideOpen;
          this.render();
        }
        break;
      case 'history-open': {
        const sid = el.dataset.shortId;
        if (sid) this.options.onOpenPublishedUrl(sid);
        break;
      }
      case 'history-copy': {
        const url = el.dataset.url;
        if (url) {
          await copyTextToClipboard(url);
          el.textContent = '已复制';
          window.setTimeout(() => {
            if (!this.disposed) el.textContent = '复制';
          }, 1800);
        }
        break;
      }
      case 'delete-published': {
        const shortId = el.dataset.shortId;
        const editToken = el.dataset.editToken;
        if (!shortId || !editToken) return;
        const ok = window.confirm('确定删除这个分享链接吗？删除后收信人将无法再打开此链接。');
        if (!ok) return;
        this.deleteBusyId = shortId;
        this.publishError = '';
        this.render();

        const res = await this.options.shareClient.deleteCard(shortId, editToken);
        if (this.disposed) return;

        this.deleteBusyId = null;
        if (res.ok) {
          await removePublishedRecord(shortId);
          this.publishedHistory = this.publishedHistory.filter((item) => item.shortId !== shortId);
          if (this.publishedResult?.shortId === shortId) {
            this.publishedResult = null;
            this.posterDataUrl = null;
          }
        } else {
          this.publishError = res.error || '删除失败，请稍后重试。';
        }
        this.render();
        break;
      }
      case 'export-json':
        this.handleExportJson();
        break;
    }
  }

  private bindPhotoDragAndDrop(): void {
    const items = Array.from(
      this.rootEl.querySelectorAll<HTMLElement>('.studio-photo-item[data-photo-item="1"]')
    );
    if (items.length === 0) return;

    const clearIndicators = (): void => {
      for (const el of items) {
        el.classList.remove('is-drag-over-top', 'is-drag-over-bottom');
      }
    };

    const clearAllDragClasses = (): void => {
      for (const el of items) {
        el.classList.remove('is-dragging', 'is-drag-over-top', 'is-drag-over-bottom');
      }
    };

    const selectPhoto = (id: string): void => {
      if (!id) return;
      this.selectedMemoryId = id;
      this.render();
      this.options.onFocusMemory(id);
    };

    items.forEach((item) => {
      const memId = item.dataset.memoryId ?? '';

      item.addEventListener('click', (evt) => {
        if (this.suppressNextPhotoClick) {
          this.suppressNextPhotoClick = false;
          return;
        }
        const target = evt.target as HTMLElement | null;
        if (target?.closest('[data-drag-handle="1"]')) return;
        selectPhoto(memId);
      });

      item.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          selectPhoto(memId);
        }
      });

      // Desktop HTML5 Drag & Drop
      item.addEventListener('dragstart', (evt) => {
        this.dragMemoryId = memId;
        item.classList.add('is-dragging');
        if (evt.dataTransfer) {
          evt.dataTransfer.effectAllowed = 'move';
          evt.dataTransfer.setData('text/plain', memId);
        }
      });

      item.addEventListener('dragover', (evt) => {
        evt.preventDefault();
        const sourceId = this.dragMemoryId || evt.dataTransfer?.getData('text/plain') || '';
        if (!sourceId || sourceId === memId) {
          clearIndicators();
          return;
        }
        if (evt.dataTransfer) {
          evt.dataTransfer.dropEffect = 'move';
        }
        const rect = item.getBoundingClientRect();
        const placeAfter = evt.clientY > rect.top + rect.height * 0.5;
        clearIndicators();
        item.classList.add(placeAfter ? 'is-drag-over-bottom' : 'is-drag-over-top');
      });

      item.addEventListener('dragleave', (evt) => {
        const related = evt.relatedTarget as Node | null;
        if (!related || !item.contains(related)) {
          item.classList.remove('is-drag-over-top', 'is-drag-over-bottom');
        }
      });

      item.addEventListener('drop', (evt) => {
        evt.preventDefault();
        const sourceId = this.dragMemoryId || evt.dataTransfer?.getData('text/plain') || '';
        const rect = item.getBoundingClientRect();
        const placeAfter = evt.clientY > rect.top + rect.height * 0.5;
        this.dragMemoryId = null;
        clearAllDragClasses();
        if (sourceId && sourceId !== memId) {
          this.reorderMemoryById(sourceId, memId, placeAfter);
        }
      });

      item.addEventListener('dragend', () => {
        this.dragMemoryId = null;
        clearAllDragClasses();
      });

      // Touch / mobile pointer-based drag fallback on handle
      const handle = item.querySelector<HTMLElement>('[data-drag-handle="1"]');
      if (handle) {
        let pointerActive = false;
        let pointerTargetId: string | null = null;
        let pointerPlaceAfter = false;

        handle.addEventListener('pointerdown', (evt) => {
          if (evt.pointerType === 'mouse') return;
          evt.preventDefault();
          pointerActive = true;
          pointerTargetId = null;
          pointerPlaceAfter = false;
          item.classList.add('is-dragging');
          handle.setPointerCapture?.(evt.pointerId);
        });

        handle.addEventListener('pointermove', (evt) => {
          if (!pointerActive) return;
          evt.preventDefault();
          const hit = document
            .elementFromPoint(evt.clientX, evt.clientY)
            ?.closest<HTMLElement>('.studio-photo-item[data-photo-item="1"]');
          clearIndicators();
          if (!hit || hit === item) {
            pointerTargetId = null;
            return;
          }
          const targetId = hit.dataset.memoryId ?? '';
          if (!targetId || targetId === memId) {
            pointerTargetId = null;
            return;
          }
          const rect = hit.getBoundingClientRect();
          pointerTargetId = targetId;
          pointerPlaceAfter = evt.clientY > rect.top + rect.height * 0.5;
          hit.classList.add(pointerPlaceAfter ? 'is-drag-over-bottom' : 'is-drag-over-top');
        });

        const finishPointerDrag = (commit: boolean, pointerId: number): void => {
          if (!pointerActive) return;
          pointerActive = false;
          try {
            handle.releasePointerCapture?.(pointerId);
          } catch {
            // ignore
          }
          clearAllDragClasses();
          if (commit && pointerTargetId && pointerTargetId !== memId) {
            this.suppressNextPhotoClick = true;
            this.reorderMemoryById(memId, pointerTargetId, pointerPlaceAfter);
          }
          pointerTargetId = null;
        };

        handle.addEventListener('pointerup', (evt) => finishPointerDrag(true, evt.pointerId));
        handle.addEventListener('pointercancel', (evt) => finishPointerDrag(false, evt.pointerId));
      }
    });
  }

  private reorderMemoryById(sourceId: string, targetId: string, placeAfter: boolean): void {
    const fromIdx = this.config.memories.findIndex((m) => m.id === sourceId);
    const targetIdx = this.config.memories.findIndex((m) => m.id === targetId);
    if (fromIdx < 0 || targetIdx < 0 || fromIdx === targetIdx) return;

    const next = [...this.config.memories];
    const [moved] = next.splice(fromIdx, 1);
    const nextTargetIdx = next.findIndex((m) => m.id === targetId);
    if (nextTargetIdx < 0) return;
    const insertIdx = placeAfter ? nextTargetIdx + 1 : nextTargetIdx;
    next.splice(insertIdx, 0, moved);

    const changed = next.some((item, idx) => item.id !== this.config.memories[idx]?.id);
    if (!changed) return;

    this.config.memories = next;
    this.scheduleDraftSave();
    this.render();
    this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
  }

  private async handlePhotoFiles(fileList: FileList): Promise<void> {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|avif)$/i.test(f.name)
    );
    if (files.length === 0) {
      this.uploadFeedback = '未检测到图片文件，请选择 JPG / PNG / WebP 格式照片。';
      this.uploadError = true;
      this.render();
      return;
    }

    const remainingSlots = MAX_PHOTOS - this.config.memories.length;
    if (remainingSlots <= 0) {
      this.uploadFeedback = `已达到单张贺卡上限（${MAX_PHOTOS} 张），请先删除不需要的照片后再上传。`;
      this.uploadError = true;
      this.render();
      return;
    }

    const toProcess = files.slice(0, remainingSlots);
    const trimmedCount = files.length - toProcess.length;

    this.uploadBusy = true;
    this.uploadError = false;
    this.uploadFeedback = `正在压缩导入 0 / ${toProcess.length} 张照片…`;
    this.render();

    let imported = 0;
    let totalBytes = 0;
    let firstAddedId: string | null = null;
    const today = getTodayDotDate();

    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i];
      try {
        const compressed = await compressPhotoFile(file);
        if (this.disposed) return;

        const id = createMemoryId(this.config.memories);
        const cleanBaseName = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 20);
        const title = cleanBaseName && !/^IMG_|^DSC|^PXL|^wx_camera/i.test(cleanBaseName)
          ? cleanBaseName
          : `回忆 ${this.config.memories.length + 1}`;

        const newItem: MemoryPhotoItem = {
          id,
          image: compressed.dataUrl,
          date: today,
          title,
          template: 'polaroid',
          caption: '',
          message: '',
        };

        this.config.memories.push(newItem);
        if (!firstAddedId) firstAddedId = id;
        imported += 1;
        totalBytes += compressed.sizeBytes;
      } catch {
        // Skip unreadable image gracefully
      }
    }

    if (this.disposed) return;

    this.uploadBusy = false;
    if (imported > 0) {
      this.selectedMemoryId = firstAddedId ?? this.selectedMemoryId;
      const limitNote =
        trimmedCount > 0 ? `（已达 ${MAX_PHOTOS} 张上限，忽略其余 ${trimmedCount} 张）` : '';
      this.uploadFeedback = `已导入 ${imported} 张照片（压缩后共 ${formatFileSize(totalBytes)}）${limitNote}`;
      this.uploadError = false;
      this.scheduleDraftSave();
      this.emitConfigChange({ jumpToAct: 'MEMORY_EXPLORE' }, true);
    } else {
      this.uploadFeedback = '照片读取失败，请尝试转换为 JPG / PNG 后重新上传。';
      this.uploadError = true;
    }

    this.render();
  }

  private async handleAudioFileUpload(file: File): Promise<void> {
    if (file.size > MAX_AUDIO_BYTES) {
      this.audioFeedback = `音频文件过大（${formatFileSize(file.size)}），请选择 2MB 以内的 MP3 / OGG 音频。`;
      this.audioError = true;
      this.render();
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (this.disposed) return;
      this.config.audio.customBgmUrl = dataUrl;
      this.config.audio.enabled = true;
      this.audioFeedback = `已载入音频：${file.name}（${formatFileSize(file.size)}）`;
      this.audioError = false;
      this.scheduleDraftSave();
      this.render();
      this.emitConfigChange({ jumpToAct: 'BLESSING_LETTER' }, true);
    } catch {
      if (this.disposed) return;
      this.audioFeedback = '音频文件读取失败，请换一个音频文件重试。';
      this.audioError = true;
      this.render();
    }
  }

  private async handlePublishCard(): Promise<void> {
    const cleanPasscode = this.passcodeInput.trim();
    if (cleanPasscode && !/^\d{4}$/.test(cleanPasscode)) {
      this.publishError = '口令需为 4 位数字（例如 1126），或留空直接打开。';
      this.render();
      return;
    }

    this.isPublishing = true;
    this.publishError = '';
    this.render();

    try {
      const snapshot = cloneConfig(this.config);
      snapshot.shareSettings = {
        hideCreateEntry: snapshot.shareSettings?.hideCreateEntry ?? false,
        passcodeEnabled: cleanPasscode.length === 4,
      };

      const result = await this.options.shareClient.publishCard({
        config: snapshot,
        passcode: cleanPasscode || undefined,
      });

      if (this.disposed) return;

      this.publishedResult = result;
      this.posterSaveHint = '';
      this.wechatShareGuideOpen = false;
      this.posterDataUrl = generateSharePosterDataUrl({
        shareUrl: result.shareUrl,
        recipientName: snapshot.recipientName || '你',
        senderName: snapshot.senderName || '你的朋友',
        age: snapshot.age,
        birthdayDate: snapshot.birthdayDate,
        coverSubtitle: snapshot.coverSubtitle,
        hasPasscode: cleanPasscode.length === 4,
        passcodeHint: this.passcodeHintInput.trim() || undefined,
      });

      const record: PublishedCardRecord = {
        shortId: result.shortId,
        shareUrl: result.shareUrl,
        editToken: result.editToken,
        recipientName: snapshot.recipientName || '你',
        age: snapshot.age,
        createdAt: new Date().toISOString(),
        mode: result.mode,
      };
      await savePublishedRecord(record);
      this.publishedHistory = [
        record,
        ...this.publishedHistory.filter((item) => item.shortId !== record.shortId),
      ];
    } catch (err) {
      if (this.disposed) return;
      this.publishError = err instanceof Error ? err.message : '生成分享链接失败，请稍后重试。';
    } finally {
      if (!this.disposed) {
        this.isPublishing = false;
        this.render();
      }
    }
  }

  private handleExportJson(): void {
    const snapshot = cloneConfig(this.config);
    const jsonText = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `birthday-card-${snapshot.age}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    this.jsonFeedback = '已导出 JSON 配置文件。';
    this.jsonError = false;
    this.render();
  }

  private async handleImportJsonFile(file: File): Promise<void> {
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text) as Partial<BirthdayCardConfig>;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.age !== 'number') {
        throw new Error('JSON 文件缺少必要的贺卡配置字段（如 age）。');
      }

      const merged: BirthdayCardConfig = this.ensureConfigDefaults({
        ...cloneConfig(this.defaultConfig),
        ...parsed,
        prologue: {
          ...this.defaultConfig.prologue,
          ...(parsed.prologue ?? {}),
        },
        presetFill: {
          ...this.defaultConfig.presetFill,
          ...(parsed.presetFill ?? {}),
        },
        finalBlessing: {
          ...this.defaultConfig.finalBlessing,
          ...(parsed.finalBlessing ?? {}),
        },
        finaleWish: {
          ...this.defaultConfig.finaleWish,
          ...(parsed.finaleWish ?? {}),
        },
        audio: {
          ...this.defaultConfig.audio,
          ...(parsed.audio ?? {}),
        },
        memories: Array.isArray(parsed.memories) ? parsed.memories.slice(0, MAX_PHOTOS) : [],
      });

      if (this.disposed) return;

      this.config = merged;
      this.selectedMemoryId = this.config.memories[0]?.id ?? null;
      this.jsonFeedback = `已导入配置（致 ${merged.recipientName || '你'} · ${merged.age} 岁 · ${merged.memories.length} 张照片）。`;
      this.jsonError = false;
      this.scheduleDraftSave();
      this.render();
      this.emitConfigChange({ jumpToAct: 'AWAITING_OPEN' }, true);
    } catch (err) {
      if (this.disposed) return;
      this.jsonFeedback = err instanceof Error ? err.message : 'JSON 格式无效，导入失败。';
      this.jsonError = true;
      this.render();
    }
  }
}
