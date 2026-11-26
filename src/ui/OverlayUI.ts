import type { BirthdayCardConfig, MosaicSlot, SceneAct } from '../config/types';
import { resolveMemoryDisplay } from '../config/templates';
import { SITE_BRAND } from '../config/site.config';

export interface OverlayCallbacks {
  onOpenCard: () => void;
  onEnterMemories: () => void;
  onFlipCard: () => void;
  onNextMemory: () => void;
  onCloseFocus: () => void;
  onSelectMemory: (id: string) => void;
  onToggleMute: () => void;
  onToggleAutoCruise: () => void;
  onOpenBlessing: () => void;
  onCloseCardAndCelebrate: () => void;
  onRevisitMemories: () => void;
  onReplay: () => void;
  onUnlockAudio: () => void;
  onOpenStudio?: () => void;
  onExitRehearsal?: () => void;
}

const SOUND_ON_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 9.5h3.8L13.5 5v14l-5.2-4.5H4.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M16.8 9.2a4.2 4.2 0 0 1 0 5.6M19.3 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const SOUND_OFF_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 9.5h3.8L13.5 5v14l-5.2-4.5H4.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M16.5 9.5l4 5M20.5 9.5l-4 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const FRAME_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 9V5.5A1 1 0 0 1 5.5 4.5H9M15 4.5h3.5a1 1 0 0 1 1 1V9M19.5 15v3.5a1 1 0 0 1-1 1H15M9 19.5H5.5a1 1 0 0 1-1-1V15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FULLSCREEN_ENTER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 4.5H5a.5.5 0 0 0-.5.5v3.5M15.5 4.5H19a.5.5 0 0 1 .5.5v3.5M19.5 15.5V19a.5.5 0 0 1-.5.5h-3.5M8.5 19.5H5a.5.5 0 0 1-.5-.5v-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5l4.2 4.2M19 5l-4.2 4.2M19 19l-4.2-4.2M5 19l4.2-4.2" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`;
const FULLSCREEN_EXIT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.5 4.5v4.5a.5.5 0 0 1-.5.5H4.5M14.5 4.5v4.5a.5.5 0 0 0 .5.5h4.5M19.5 14.5H15a.5.5 0 0 0-.5.5v4.5M4.5 14.5H9a.5.5 0 0 1 .5.5v4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PEN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.8 5.2l3 3L8.5 18.5l-4 1 1-4L15.8 5.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

export class OverlayUI {
  private readonly root: HTMLElement;
  private config: BirthdayCardConfig;
  private readonly callbacks: OverlayCallbacks;

  private readonly shell: HTMLDivElement;

  // Top-left discreet creator / rehearsal dock
  private readonly topLeftDock: HTMLDivElement;
  private readonly createEntryBtn: HTMLButtonElement;
  private readonly exitRehearsalBtn: HTMLButtonElement;

  // Top-right persistent controls
  private readonly soundBtn: HTMLButtonElement;
  private readonly soundIconEl: HTMLSpanElement;
  private readonly soundLabelEl: HTMLSpanElement;
  private readonly fullscreenBtn: HTMLButtonElement;
  private readonly fullscreenIconEl: HTMLSpanElement;
  private readonly souvenirBtn: HTMLButtonElement;
  private readonly souvenirLabelEl: HTMLSpanElement;
  private readonly exploreToolsEl: HTMLDivElement;
  private readonly cruiseBtn: HTMLButtonElement;
  private readonly blessingShortcutBtn: HTMLButtonElement;

  // Act layers
  private readonly awaitingLayer: HTMLDivElement;
  private readonly prologueLayer: HTMLDivElement;
  private readonly exploreLayer: HTMLDivElement;
  private readonly focusLayer: HTMLDivElement;
  private readonly blessingLayer: HTMLDivElement;
  private readonly finaleLayer: HTMLDivElement;

  // Dynamic text / track elements updated by config or progress
  private readonly prologueTitleEl: HTMLHeadingElement;
  private readonly prologueBodyEl: HTMLDivElement;
  private readonly prologueCtaEl: HTMLButtonElement;

  private readonly starTrackEl: HTMLDivElement;
  private readonly progressCaptionEl: HTMLParagraphElement;
  private readonly starButtons = new Map<string, HTMLButtonElement>();
  private readonly starDotCleanups: Array<() => void> = [];

  private readonly focusBarEl: HTMLDivElement;
  private readonly focusBadgeEl: HTMLSpanElement;
  private readonly focusDateEl: HTMLSpanElement;
  private readonly focusTitleEl: HTMLHeadingElement;
  private readonly focusCaptionEl: HTMLParagraphElement;
  private readonly flipBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly closeFocusBtn: HTMLButtonElement;

  private readonly letterHeadingEl: HTMLHeadingElement;
  private readonly letterParagraphsEl: HTMLDivElement;
  private readonly letterSignatureEl: HTMLParagraphElement;
  private readonly letterDateEl: HTMLParagraphElement;
  private readonly closeCardBtnEl: HTMLButtonElement;

  private readonly finaleTitleEl: HTMLHeadingElement;
  private readonly finaleSubtitleEl: HTMLParagraphElement;

  private readonly warningsEl: HTMLElement;
  private readonly brandEl: HTMLElement;

  private currentAct: SceneAct = 'ENTRANCE';
  private audioPlaying = false;
  private audioMuted = false;
  private autoCruise = false;
  private souvenirMode = false;
  private studioMode = false;
  private createEntryAllowed = true;
  private rehearsalVisible = false;
  private focusedSlot: MosaicSlot | null = null;
  private focusedFlipped = false;

  private readonly cleanupFns: Array<() => void> = [];

  constructor(root: HTMLElement, config: BirthdayCardConfig, callbacks: OverlayCallbacks) {
    this.root = root;
    this.config = config;
    this.callbacks = callbacks;

    this.shell = document.createElement('div');
    this.shell.className = 'starlight-ui';
    this.shell.dataset.act = this.currentAct;

    // 0. Top-left discreet creator entry / rehearsal return dock
    this.topLeftDock = document.createElement('div');
    this.topLeftDock.className = 'ui-dock-top-left';

    this.createEntryBtn = document.createElement('button');
    this.createEntryBtn.type = 'button';
    this.createEntryBtn.className = 'ui-pill-btn ui-create-entry-btn';
    this.createEntryBtn.setAttribute('aria-label', '制作我的贺卡');
    this.createEntryBtn.title = '制作我的贺卡';
    this.createEntryBtn.innerHTML = `<span class="ui-create-entry-icon">${PEN_ICON}</span><span class="ui-create-entry-label">制作我的贺卡</span>`;
    this.createEntryBtn.hidden = !callbacks.onOpenStudio || Boolean(config.shareSettings?.hideCreateEntry);
    this.bindClick(this.createEntryBtn, () => this.callbacks.onOpenStudio?.());

    this.exitRehearsalBtn = document.createElement('button');
    this.exitRehearsalBtn.type = 'button';
    this.exitRehearsalBtn.className = 'ui-pill-btn ui-rehearsal-exit-btn';
    this.exitRehearsalBtn.textContent = '返回编辑';
    this.exitRehearsalBtn.hidden = true;
    this.bindClick(this.exitRehearsalBtn, () => this.callbacks.onExitRehearsal?.());

    this.topLeftDock.append(this.createEntryBtn, this.exitRehearsalBtn);

    // 1. Top-right utility dock
    const topRightDock = document.createElement('div');
    topRightDock.className = 'ui-dock-top-right';

    this.exploreToolsEl = document.createElement('div');
    this.exploreToolsEl.className = 'ui-explore-tools';

    this.cruiseBtn = document.createElement('button');
    this.cruiseBtn.type = 'button';
    this.cruiseBtn.className = 'ui-pill-btn';
    this.cruiseBtn.textContent = '自动巡航';
    this.cruiseBtn.setAttribute('aria-pressed', 'false');
    this.bindClick(this.cruiseBtn, () => this.callbacks.onToggleAutoCruise());

    this.blessingShortcutBtn = document.createElement('button');
    this.blessingShortcutBtn.type = 'button';
    this.blessingShortcutBtn.className = 'ui-pill-btn ui-pill-btn--gold';
    this.blessingShortcutBtn.textContent = '查看祝福';
    this.bindClick(this.blessingShortcutBtn, () => this.callbacks.onOpenBlessing());

    this.exploreToolsEl.append(this.cruiseBtn, this.blessingShortcutBtn);

    this.souvenirBtn = document.createElement('button');
    this.souvenirBtn.type = 'button';
    this.souvenirBtn.className = 'ui-pill-btn ui-souvenir-btn';
    this.souvenirBtn.setAttribute('aria-pressed', 'false');
    this.souvenirBtn.setAttribute('aria-label', '切换纯净留影模式');

    const souvenirIcon = document.createElement('span');
    souvenirIcon.className = 'ui-souvenir-icon';
    souvenirIcon.innerHTML = FRAME_ICON;

    this.souvenirLabelEl = document.createElement('span');
    this.souvenirLabelEl.className = 'ui-souvenir-label';
    this.souvenirLabelEl.textContent = '纯净留影';

    this.souvenirBtn.append(souvenirIcon, this.souvenirLabelEl);
    this.bindClick(this.souvenirBtn, () => this.setSouvenirMode(!this.souvenirMode));

    this.soundBtn = document.createElement('button');
    this.soundBtn.type = 'button';
    this.soundBtn.className = 'ui-pill-btn ui-sound-btn';
    this.soundBtn.setAttribute('aria-label', '切换背景音乐');

    this.soundIconEl = document.createElement('span');
    this.soundIconEl.className = 'ui-sound-icon';
    this.soundIconEl.innerHTML = SOUND_ON_ICON;

    this.soundLabelEl = document.createElement('span');
    this.soundLabelEl.className = 'ui-sound-label';
    this.soundLabelEl.textContent = '开启音乐';

    this.soundBtn.append(this.soundIconEl, this.soundLabelEl);
    this.bindClick(this.soundBtn, () => {
      if (!this.audioPlaying && !this.audioMuted && this.config.audio.enabled) {
        this.callbacks.onUnlockAudio();
      } else {
        this.callbacks.onToggleMute();
      }
    });

    this.fullscreenBtn = document.createElement('button');
    this.fullscreenBtn.type = 'button';
    this.fullscreenBtn.className = 'ui-pill-btn ui-icon-btn ui-fullscreen-btn';
    this.fullscreenBtn.setAttribute('aria-label', '进入全屏');
    this.fullscreenBtn.setAttribute('aria-pressed', 'false');
    this.fullscreenBtn.title = '全屏';

    this.fullscreenIconEl = document.createElement('span');
    this.fullscreenIconEl.className = 'ui-fullscreen-icon';
    this.fullscreenIconEl.innerHTML = FULLSCREEN_ENTER_ICON;
    this.fullscreenBtn.append(this.fullscreenIconEl);

    const canFullscreen = this.supportsFullscreen();
    this.fullscreenBtn.hidden = !canFullscreen;
    if (canFullscreen) {
      this.bindClick(this.fullscreenBtn, () => this.toggleFullscreen());
      const onFullscreenChange = (): void => this.syncFullscreenState();
      document.addEventListener('fullscreenchange', onFullscreenChange);
      this.cleanupFns.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange));
      this.syncFullscreenState();
    }

    topRightDock.append(this.exploreToolsEl, this.souvenirBtn, this.soundBtn, this.fullscreenBtn);

    // 2. Act: AWAITING_OPEN
    this.awaitingLayer = document.createElement('div');
    this.awaitingLayer.className = 'ui-layer ui-layer--awaiting';
    const openCueBtn = document.createElement('button');
    openCueBtn.type = 'button';
    openCueBtn.className = 'ui-open-cue';
    openCueBtn.textContent = '点击打开贺卡';
    this.bindClick(openCueBtn, () => this.callbacks.onOpenCard());
    this.awaitingLayer.append(openCueBtn);

    // 3. Act: PROLOGUE
    this.prologueLayer = document.createElement('div');
    this.prologueLayer.className = 'ui-layer ui-layer--prologue';
    const prologueVeil = document.createElement('section');
    prologueVeil.className = 'ui-prologue-veil';

    this.prologueTitleEl = document.createElement('h1');
    this.prologueTitleEl.className = 'ui-prologue-title';

    this.prologueBodyEl = document.createElement('div');
    this.prologueBodyEl.className = 'ui-prologue-lines';

    this.prologueCtaEl = document.createElement('button');
    this.prologueCtaEl.type = 'button';
    this.prologueCtaEl.className = 'ui-primary-cta';
    this.bindClick(this.prologueCtaEl, () => this.callbacks.onEnterMemories());

    prologueVeil.append(this.prologueTitleEl, this.prologueBodyEl, this.prologueCtaEl);
    this.prologueLayer.append(prologueVeil);

    // 4. Act: MEMORY_EXPLORE
    this.exploreLayer = document.createElement('div');
    this.exploreLayer.className = 'ui-layer ui-layer--explore';

    const progressBar = document.createElement('nav');
    progressBar.className = 'ui-constellation-progress';
    progressBar.setAttribute('aria-label', '回忆浏览进度');

    this.starTrackEl = document.createElement('div');
    this.starTrackEl.className = 'ui-star-track';

    this.progressCaptionEl = document.createElement('p');
    this.progressCaptionEl.className = 'ui-progress-caption';

    progressBar.append(this.starTrackEl, this.progressCaptionEl);

    const exploreWhisper = document.createElement('p');
    exploreWhisper.className = 'ui-whisper ui-whisper--explore';
    exploreWhisper.textContent = '点击发光卡片查看回忆，可拖拽旋转视角';

    this.exploreLayer.append(progressBar, exploreWhisper);

    // 5. Act: PHOTO_FOCUS
    this.focusLayer = document.createElement('div');
    this.focusLayer.className = 'ui-layer ui-layer--focus';

    const focusVignette = document.createElement('div');
    focusVignette.className = 'ui-focus-vignette';
    focusVignette.setAttribute('aria-hidden', 'true');

    const dismissZones = ['top', 'left', 'right'].map((edge) => {
      const zone = document.createElement('div');
      zone.className = `ui-focus-dismiss ui-focus-dismiss--${edge}`;
      zone.setAttribute('aria-hidden', 'true');
      this.bindClick(zone, () => this.callbacks.onCloseFocus());
      return zone;
    });

    this.focusBarEl = document.createElement('div');
    this.focusBarEl.className = 'ui-focus-bar';
    this.focusBarEl.dataset.template = 'polaroid';
    this.focusBarEl.dataset.flipped = 'false';

    const focusContent = document.createElement('div');
    focusContent.className = 'ui-focus-content';

    const focusMetaRow = document.createElement('div');
    focusMetaRow.className = 'ui-focus-meta-row';

    this.focusBadgeEl = document.createElement('span');
    this.focusBadgeEl.className = 'ui-focus-badge';

    this.focusDateEl = document.createElement('span');
    this.focusDateEl.className = 'ui-focus-date';

    focusMetaRow.append(this.focusBadgeEl, this.focusDateEl);

    this.focusTitleEl = document.createElement('h2');
    this.focusTitleEl.className = 'ui-focus-title';

    this.focusCaptionEl = document.createElement('p');
    this.focusCaptionEl.className = 'ui-focus-caption';

    focusContent.append(focusMetaRow, this.focusTitleEl, this.focusCaptionEl);

    const focusActions = document.createElement('div');
    focusActions.className = 'ui-focus-actions';

    this.flipBtn = document.createElement('button');
    this.flipBtn.type = 'button';
    this.flipBtn.className = 'ui-focus-btn ui-focus-btn--primary';
    this.flipBtn.textContent = '翻看背面';
    this.bindClick(this.flipBtn, () => this.callbacks.onFlipCard());

    this.nextBtn = document.createElement('button');
    this.nextBtn.type = 'button';
    this.nextBtn.className = 'ui-focus-btn';
    this.nextBtn.textContent = '下一张';
    this.bindClick(this.nextBtn, () => this.callbacks.onNextMemory());

    this.closeFocusBtn = document.createElement('button');
    this.closeFocusBtn.type = 'button';
    this.closeFocusBtn.className = 'ui-focus-btn ui-focus-btn--quiet';
    this.closeFocusBtn.textContent = '返回';
    this.bindClick(this.closeFocusBtn, () => this.callbacks.onCloseFocus());

    focusActions.append(this.flipBtn, this.nextBtn, this.closeFocusBtn);
    this.focusBarEl.append(focusContent, focusActions);

    this.focusLayer.append(focusVignette, ...dismissZones, this.focusBarEl);

    // 6. Act: BLESSING_LETTER (Warm-white cotton stationery echoing the physical 3D white card)
    this.blessingLayer = document.createElement('div');
    this.blessingLayer.className = 'ui-layer ui-layer--blessing';

    const letterSheet = document.createElement('article');
    letterSheet.className = 'ui-letter-sheet';

    const letterScroll = document.createElement('div');
    letterScroll.className = 'ui-letter-scroll';

    this.letterHeadingEl = document.createElement('h2');
    this.letterHeadingEl.className = 'ui-letter-headline';

    this.letterParagraphsEl = document.createElement('div');
    this.letterParagraphsEl.className = 'ui-letter-body';

    const letterSignoff = document.createElement('footer');
    letterSignoff.className = 'ui-letter-signoff';

    this.letterSignatureEl = document.createElement('p');
    this.letterSignatureEl.className = 'ui-letter-signature';

    this.letterDateEl = document.createElement('p');
    this.letterDateEl.className = 'ui-letter-date';

    letterSignoff.append(this.letterSignatureEl, this.letterDateEl);

    const letterActions = document.createElement('div');
    letterActions.className = 'ui-letter-actions';

    this.closeCardBtnEl = document.createElement('button');
    this.closeCardBtnEl.type = 'button';
    this.closeCardBtnEl.className = 'ui-paper-cta';
    this.bindClick(this.closeCardBtnEl, () => this.callbacks.onCloseCardAndCelebrate());

    const revisitFromLetterBtn = document.createElement('button');
    revisitFromLetterBtn.type = 'button';
    revisitFromLetterBtn.className = 'ui-paper-link';
    revisitFromLetterBtn.textContent = '返回继续浏览';
    this.bindClick(revisitFromLetterBtn, () => this.callbacks.onRevisitMemories());

    letterActions.append(this.closeCardBtnEl, revisitFromLetterBtn);

    letterScroll.append(this.letterHeadingEl, this.letterParagraphsEl, letterSignoff, letterActions);
    letterSheet.append(letterScroll);
    this.blessingLayer.append(letterSheet);

    // 7. Act: FIREWORKS_FINALE
    this.finaleLayer = document.createElement('div');
    this.finaleLayer.className = 'ui-layer ui-layer--finale';

    const finaleHeader = document.createElement('header');
    finaleHeader.className = 'ui-finale-header';

    this.finaleTitleEl = document.createElement('h2');
    this.finaleTitleEl.className = 'ui-finale-title';

    this.finaleSubtitleEl = document.createElement('p');
    this.finaleSubtitleEl.className = 'ui-finale-subtitle';

    finaleHeader.append(this.finaleTitleEl, this.finaleSubtitleEl);

    const finaleHint = document.createElement('p');
    finaleHint.className = 'ui-whisper ui-whisper--finale';
    finaleHint.textContent = '轻触夜空任意位置放烟花';

    const finaleLinks = document.createElement('div');
    finaleLinks.className = 'ui-finale-links';

    const revisitFinaleBtn = document.createElement('button');
    revisitFinaleBtn.type = 'button';
    revisitFinaleBtn.className = 'ui-text-link';
    revisitFinaleBtn.textContent = '重温回忆';
    this.bindClick(revisitFinaleBtn, () => this.callbacks.onRevisitMemories());

    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.className = 'ui-text-link';
    replayBtn.textContent = '再看一遍';
    this.bindClick(replayBtn, () => this.callbacks.onReplay());

    finaleLinks.append(revisitFinaleBtn, replayBtn);
    this.finaleLayer.append(finaleHeader, finaleHint, finaleLinks);

    // 8. Quiet config warnings banner (hidden unless warnings exist)
    this.warningsEl = document.createElement('aside');
    this.warningsEl.className = 'ui-config-warnings';
    this.warningsEl.hidden = true;
    this.warningsEl.setAttribute('role', 'status');

    // 9. Subtle corner brand attribution (configured via src/config/site.config.ts)
    const brandText = `${SITE_BRAND.labelPrefix}${SITE_BRAND.name}${SITE_BRAND.labelSuffix}`;
    const brandUrl = SITE_BRAND.url.trim();
    if (brandUrl) {
      const link = document.createElement('a');
      link.className = 'ui-brand-mark ui-brand-mark--link';
      link.href = brandUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = brandText;
      this.brandEl = link;
    } else {
      const span = document.createElement('span');
      span.className = 'ui-brand-mark';
      span.textContent = brandText;
      this.brandEl = span;
    }

    this.shell.append(
      this.topLeftDock,
      topRightDock,
      this.awaitingLayer,
      this.prologueLayer,
      this.exploreLayer,
      this.focusLayer,
      this.blessingLayer,
      this.finaleLayer,
      this.warningsEl,
      this.brandEl
    );

    this.root.innerHTML = '';
    this.root.append(this.shell);

    this.renderConfigContent(config);
    this.setAudioState(false, !config.audio.enabled);
    this.setAutoCruiseState(false);
    this.setAct('ENTRANCE');
  }

  public updateConfig(nextConfig: BirthdayCardConfig): void {
    this.config = nextConfig;
    this.renderConfigContent(nextConfig);
    this.syncTopLeftVisibility();
  }

  public setCreateEntryVisible(visible: boolean): void {
    this.createEntryAllowed = visible;
    this.syncTopLeftVisibility();
  }

  public setRehearsalBannerVisible(visible: boolean): void {
    this.rehearsalVisible = visible;
    this.syncTopLeftVisibility();
  }

  public setStudioMode(inStudio: boolean): void {
    this.studioMode = inStudio;
    this.shell.classList.toggle('is-studio-pane', inStudio);
    this.syncTopLeftVisibility();
  }

  public setAct(act: SceneAct): void {
    this.currentAct = act;
    this.shell.dataset.act = act;

    this.setLayerActive(this.awaitingLayer, act === 'AWAITING_OPEN');
    this.setLayerActive(this.prologueLayer, act === 'PROLOGUE');
    this.setLayerActive(this.exploreLayer, act === 'MEMORY_EXPLORE');
    this.setLayerActive(this.focusLayer, act === 'PHOTO_FOCUS');
    this.setLayerActive(this.blessingLayer, act === 'BLESSING_LETTER');
    this.setLayerActive(this.finaleLayer, act === 'FIREWORKS_FINALE');

    const showExploreTools = act === 'MEMORY_EXPLORE';
    this.exploreToolsEl.classList.toggle('is-visible', showExploreTools);
    this.exploreToolsEl.setAttribute('aria-hidden', String(!showExploreTools));

    const allowSouvenir = act === 'MEMORY_EXPLORE' || act === 'FIREWORKS_FINALE';
    this.souvenirBtn.classList.toggle('is-visible', allowSouvenir);
    this.souvenirBtn.setAttribute('aria-hidden', String(!allowSouvenir));
    if (!allowSouvenir && this.souvenirMode) {
      this.setSouvenirMode(false);
    }
  }

  public setAudioState(playing: boolean, muted: boolean): void {
    this.audioPlaying = playing;
    this.audioMuted = muted;

    const awaitingUnlock = this.config.audio.enabled && !playing && !muted;
    this.soundBtn.classList.toggle('is-muted', muted);
    this.soundBtn.classList.toggle('is-playing', playing && !muted);
    this.soundBtn.classList.toggle('is-awaiting-unlock', awaitingUnlock);

    this.soundIconEl.innerHTML = muted ? SOUND_OFF_ICON : SOUND_ON_ICON;

    if (awaitingUnlock) {
      this.soundLabelEl.textContent = '开启音乐';
      this.soundBtn.setAttribute('aria-label', '点击开启背景音乐');
      this.soundBtn.setAttribute('aria-pressed', 'false');
    } else if (muted) {
      this.soundLabelEl.textContent = '已静音';
      this.soundBtn.setAttribute('aria-label', '取消静音');
      this.soundBtn.setAttribute('aria-pressed', 'false');
    } else {
      this.soundLabelEl.textContent = '音乐';
      this.soundBtn.setAttribute('aria-label', '静音');
      this.soundBtn.setAttribute('aria-pressed', 'true');
    }
  }

  public setAutoCruiseState(enabled: boolean): void {
    this.autoCruise = enabled;
    this.cruiseBtn.classList.toggle('is-active', enabled);
    this.cruiseBtn.setAttribute('aria-pressed', String(enabled));
    this.cruiseBtn.textContent = enabled ? '暂停巡航' : '自动巡航';
  }

  public setMemoryProgress(
    litCount: number,
    total: number,
    litIds: string[],
    nextMemoryId: string | null
  ): void {
    const litSet = new Set(litIds);
    const safeTotal = Math.max(0, total);
    const safeLit = Math.max(0, Math.min(safeTotal, litCount));
    const allLit = safeTotal > 0 && safeLit >= safeTotal;

    this.starTrackEl.classList.toggle('is-all-lit', allLit);

    if (safeTotal === 0) {
      this.progressCaptionEl.textContent = '回忆已就绪';
    } else if (allLit) {
      this.progressCaptionEl.textContent = `全部 ${safeTotal} 段回忆已点亮`;
    } else {
      this.progressCaptionEl.textContent = `已点亮 ${safeLit} / ${safeTotal}`;
    }

    let orderIdx = 0;
    this.starButtons.forEach((btn, id) => {
      const isLit = litSet.has(id);
      const isNext = nextMemoryId === id && !isLit;
      btn.style.setProperty('--star-index', `${orderIdx}`);
      btn.classList.toggle('is-lit', isLit);
      btn.classList.toggle('is-guided', isNext);
      btn.setAttribute('aria-current', isNext ? 'step' : 'false');
      orderIdx += 1;
    });
  }

  public setFocusedSlot(slot: MosaicSlot | null, flipped: boolean): void {
    this.focusedSlot = slot;
    this.focusedFlipped = flipped;
    this.focusBarEl.dataset.flipped = String(flipped);

    if (!slot) {
      this.focusBadgeEl.textContent = '';
      this.focusBadgeEl.hidden = true;
      this.focusDateEl.textContent = '';
      this.focusDateEl.hidden = true;
      this.focusTitleEl.textContent = '';
      this.focusCaptionEl.textContent = '';
      this.focusCaptionEl.hidden = true;
      return;
    }

    if (slot.kind === 'memory' && slot.memory) {
      const display = resolveMemoryDisplay(slot.memory);
      this.focusBarEl.dataset.template = display.template.id;

      const badgeText = display.template.badgeLabel || display.template.name;
      this.focusBadgeEl.textContent = badgeText;
      this.focusBadgeEl.hidden = !badgeText;

      this.focusDateEl.textContent = slot.memory.date || '';
      this.focusDateEl.hidden = !slot.memory.date;

      this.focusTitleEl.textContent = slot.memory.title || '回忆瞬间';
      this.focusCaptionEl.textContent = display.caption;
      this.focusCaptionEl.hidden = !display.caption;

      this.flipBtn.textContent = flipped ? '翻回正面' : '翻看背面';
      this.nextBtn.hidden = false;
    } else if (slot.preset) {
      this.focusBarEl.dataset.template = 'preset';

      this.focusBadgeEl.textContent = '纪念插画';
      this.focusBadgeEl.hidden = false;

      this.focusDateEl.textContent = '';
      this.focusDateEl.hidden = true;

      this.focusTitleEl.textContent = slot.preset.name;
      this.focusCaptionEl.textContent = slot.preset.subtitle || '';
      this.focusCaptionEl.hidden = !slot.preset.subtitle;

      this.flipBtn.textContent = flipped ? '翻回正面' : '翻看背面';
      this.nextBtn.hidden = this.config.memories.length === 0;
    }
  }

  public showConfigWarnings(warnings: string[]): void {
    if (!warnings || warnings.length === 0) {
      this.warningsEl.hidden = true;
      this.warningsEl.innerHTML = '';
      return;
    }

    this.warningsEl.hidden = false;
    this.warningsEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'ui-config-warnings__head';

    const title = document.createElement('span');
    title.textContent = '配置已自动修正';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'ui-config-warnings__close';
    dismissBtn.textContent = '知道了';
    this.bindClick(dismissBtn, () => {
      this.warningsEl.hidden = true;
    });

    header.append(title, dismissBtn);

    const list = document.createElement('ul');
    list.className = 'ui-config-warnings__list';
    warnings.slice(0, 4).forEach((msg) => {
      const li = document.createElement('li');
      li.textContent = msg;
      list.append(li);
    });

    this.warningsEl.append(header, list);
  }

  public dispose(): void {
    this.starDotCleanups.forEach((fn) => fn());
    this.starDotCleanups.length = 0;
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns.length = 0;
    this.starButtons.clear();
    this.root.innerHTML = '';
  }

  public isFocused(): boolean {
    return this.currentAct === 'PHOTO_FOCUS' && this.focusedSlot !== null;
  }

  public isFocusedFlipped(): boolean {
    return this.focusedFlipped;
  }

  private renderConfigContent(config: BirthdayCardConfig): void {
    // Prologue
    this.prologueTitleEl.textContent = config.prologue.title;
    this.prologueBodyEl.innerHTML = '';
    config.prologue.lines.forEach((line, index) => {
      const p = document.createElement('p');
      p.className = 'ui-prologue-line';
      p.style.setProperty('--stagger', `${index}`);
      p.textContent = line;
      this.prologueBodyEl.append(p);
    });
    this.prologueCtaEl.textContent = config.prologue.ctaLabel || '继续';

    // Memory Star Progress Track (compact dots when > 12 photos so bar never overflows)
    this.starDotCleanups.forEach((fn) => fn());
    this.starDotCleanups.length = 0;
    this.starButtons.clear();
    this.starTrackEl.innerHTML = '';
    this.starTrackEl.classList.toggle('is-dense', config.memories.length > 10);

    config.memories.forEach((memory, idx) => {
      const dotBtn = document.createElement('button');
      dotBtn.type = 'button';
      dotBtn.className = 'ui-star-dot';
      dotBtn.dataset.memoryId = memory.id;
      dotBtn.title = memory.title || `第 ${idx + 1} 张回忆`;
      dotBtn.setAttribute('aria-label', `查看回忆：${memory.title || `第 ${idx + 1} 张`}`);
      const core = document.createElement('span');
      core.className = 'ui-star-dot__core';
      dotBtn.append(core);
      const listener = (event: MouseEvent): void => {
        event.stopPropagation();
        this.callbacks.onSelectMemory(memory.id);
      };
      dotBtn.addEventListener('click', listener);
      this.starDotCleanups.push(() => dotBtn.removeEventListener('click', listener));
      this.starButtons.set(memory.id, dotBtn);
      this.starTrackEl.append(dotBtn);
    });
    this.progressCaptionEl.textContent = `已点亮 0 / ${config.memories.length}`;

    // Blessing letter
    this.letterHeadingEl.textContent = config.finalBlessing.headline;
    this.letterParagraphsEl.innerHTML = '';
    config.finalBlessing.paragraphs.forEach((text, index) => {
      const p = document.createElement('p');
      p.className = 'ui-letter-paragraph';
      p.style.setProperty('--stagger', `${index}`);
      p.textContent = text;
      this.letterParagraphsEl.append(p);
    });
    this.letterSignatureEl.textContent = config.finalBlessing.signature;
    this.letterDateEl.textContent = config.birthdayDate;
    this.closeCardBtnEl.textContent = config.finalBlessing.closeCardLabel || '合上贺卡';

    // Finale wish
    this.finaleTitleEl.textContent = config.finaleWish.title;
    this.finaleSubtitleEl.textContent = config.finaleWish.subtitle;
  }

  private syncTopLeftVisibility(): void {
    const showCreate =
      Boolean(this.callbacks.onOpenStudio) &&
      this.createEntryAllowed &&
      !this.studioMode &&
      !this.rehearsalVisible &&
      !this.config.shareSettings?.hideCreateEntry;
    this.createEntryBtn.hidden = !showCreate;
    this.exitRehearsalBtn.hidden = !this.rehearsalVisible;
  }

  private supportsFullscreen(): boolean {
    if (typeof document === 'undefined') return false;
    const rootEl = document.documentElement;
    return Boolean(document.fullscreenEnabled && typeof rootEl?.requestFullscreen === 'function');
  }

  private toggleFullscreen(): void {
    if (!this.supportsFullscreen()) return;
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen === 'function') {
        void document.exitFullscreen().catch(() => {});
      }
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  private syncFullscreenState(): void {
    const isFullscreen = Boolean(document.fullscreenElement);
    this.fullscreenBtn.classList.toggle('is-active', isFullscreen);
    this.fullscreenBtn.setAttribute('aria-pressed', String(isFullscreen));
    this.fullscreenBtn.setAttribute('aria-label', isFullscreen ? '退出全屏' : '进入全屏');
    this.fullscreenBtn.title = isFullscreen ? '退出全屏' : '全屏';
    this.fullscreenIconEl.innerHTML = isFullscreen ? FULLSCREEN_EXIT_ICON : FULLSCREEN_ENTER_ICON;
  }

  private setSouvenirMode(enabled: boolean): void {
    this.souvenirMode = enabled;
    this.shell.classList.toggle('is-souvenir', enabled);
    this.souvenirBtn.classList.toggle('is-active', enabled);
    this.souvenirBtn.setAttribute('aria-pressed', String(enabled));
    this.souvenirLabelEl.textContent = enabled ? '显示界面' : '纯净留影';
    this.souvenirBtn.setAttribute('aria-label', enabled ? '恢复显示界面' : '隐藏界面');
  }

  private setLayerActive(el: HTMLElement, active: boolean): void {
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-hidden', String(!active));
  }

  private bindClick(el: HTMLElement, handler: () => void): void {
    const listener = (event: MouseEvent): void => {
      event.stopPropagation();
      handler();
    };
    el.addEventListener('click', listener);
    this.cleanupFns.push(() => el.removeEventListener('click', listener));
  }
}
