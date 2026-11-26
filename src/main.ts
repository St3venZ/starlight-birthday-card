/// <reference types="vite/client" />
import './styles/main.css';
import type { BirthdayCardConfig, MosaicSlot, SceneAct } from './config/types';
import { cardConfig } from './config/card.config';
import { validateCardConfig } from './config/validateConfig';
import { SceneApp } from './engine/SceneApp';
import { SoundEngine, type SoundSfxEvent } from './audio/SoundEngine';
import { OverlayUI } from './ui/OverlayUI';
import { CardShareClient } from './share/storageAdapter';
import { CreatorStudio } from './studio/CreatorStudio';
import { loadDraft } from './studio/draftStore';

type AppRoute =
  | { kind: 'home' }
  | { kind: 'create' }
  | { kind: 'share'; shortId: string };

/**
 * Resolves the directory the app is served from, e.g. `/` for a root domain or
 * `/starlight-birthday-card/` for a GitHub Pages project site.
 *
 * Derived from the bundle's own URL rather than hardcoded, so the same build
 * works when hosted at the domain root, in a repository subpath, or portably
 * via `file:`. Without this, a project site sees
 * `/starlight-birthday-card/create` and fails to match `/create`, silently
 * rendering the landing page instead of the Studio.
 */
function computeBasePath(): string {
  try {
    const modulePath = new URL(import.meta.url).pathname;
    const base = modulePath.replace(/\/assets\/[^/]+$/, '/');
    return base.endsWith('/') ? base : `${base}/`;
  } catch {
    return '/';
  }
}

const BASE_PATH = computeBasePath();

/** Normalizes `location.pathname` to a base-relative route like `/create`. */
function getRelativePath(): string {
  let pathname = window.location.pathname;
  if (BASE_PATH !== '/' && pathname.startsWith(BASE_PATH)) {
    pathname = pathname.slice(BASE_PATH.length - 1);
  }
  return pathname.replace(/\/+$/, '') || '/';
}

/** Prefixes an app route with the hosting base, e.g. `/create` -> `/repo/create`. */
function withBase(routePath: string): string {
  if (BASE_PATH === '/') return routePath;
  return `${BASE_PATH.replace(/\/$/, '')}${routePath}`;
}

function parseRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#/, '').trim();
  if (hash === '/create' || hash === '/create/') {
    return { kind: 'create' };
  }
  const hashShareMatch = /^\/c\/([^/?#]+)/.exec(hash);
  if (hashShareMatch?.[1]) {
    return { kind: 'share', shortId: decodeURIComponent(hashShareMatch[1]) };
  }

  const pathname = getRelativePath();
  if (pathname === '/create') {
    return { kind: 'create' };
  }
  const pathShareMatch = /^\/c\/([^/?#]+)/.exec(pathname);
  if (pathShareMatch?.[1]) {
    return { kind: 'share', shortId: decodeURIComponent(pathShareMatch[1]) };
  }

  return { kind: 'home' };
}

function shouldUseHashNavigation(): boolean {
  if (window.location.protocol === 'file:') return true;
  if (window.location.hash.startsWith('#/')) return true;
  const pathname = getRelativePath().replace(/\/index\.html$/, '');
  const isRootHosted =
    pathname === '' ||
    pathname === '/' ||
    pathname === '/create' ||
    pathname.startsWith('/c/');
  return !isRootHosted;
}

function updateDocumentTitle(config: BirthdayCardConfig, suffix?: string): void {
  if (suffix) {
    document.title = suffix;
    return;
  }
  const recipient = config.recipientName.trim();
  document.title =
    recipient && recipient !== '你'
      ? `祝 ${recipient} ${config.age} 岁生日快乐`
      : `${config.age} 岁生日快乐`;
}

function dismissBootVeil(): void {
  const veil = document.getElementById('boot-veil');
  if (!veil || veil.dataset.dismissed === 'true') return;
  veil.dataset.dismissed = 'true';
  veil.classList.add('is-hidden');
  window.setTimeout(() => {
    veil.style.display = 'none';
  }, 460);
}

function triggerViewportResize(): void {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  });
}

function bootstrap(): void {
  const appEl = document.getElementById('app');
  const canvasRoot = document.getElementById('canvas-root');
  const uiRoot = document.getElementById('ui-root');

  if (!appEl || !canvasRoot || !uiRoot) {
    throw new Error('Starlight Birthday Card requires #app, #canvas-root, and #ui-root mount elements.');
  }

  // Create dedicated mount containers for Studio Drawer and Share Gate (passcode / empty states)
  let studioRoot = document.getElementById('studio-root');
  if (!studioRoot) {
    studioRoot = document.createElement('div');
    studioRoot.id = 'studio-root';
    studioRoot.hidden = true;
    appEl.append(studioRoot);
  }

  let gateRoot = document.getElementById('share-gate-root');
  if (!gateRoot) {
    gateRoot = document.createElement('div');
    gateRoot.id = 'share-gate-root';
    gateRoot.hidden = true;
    appEl.append(gateRoot);
  }

  const shareClient = new CardShareClient();

  let activeScene: SceneApp | null = null;
  let activeOverlay: OverlayUI | null = null;
  let activeSound: SoundEngine | null = null;
  let activeStudio: CreatorStudio | null = null;
  let activeRouteCleanup: Array<() => void> = [];
  let routeVersion = 0;
  let inRehearsal = false;

  // Coalesced Studio → 3D updates (see onConfigChange)
  let studioUpdateTimer: number | null = null;
  let pendingStudioUpdate: {
    config: BirthdayCardConfig;
    opts?: { jumpToAct?: SceneAct };
  } | null = null;

  // Safety fallback so boot veil never stays stuck
  const bootFallbackTimer = window.setTimeout(dismissBootVeil, 3800);

  const navigate = (targetPath: string): void => {
    if (shouldUseHashNavigation()) {
      window.location.hash = `#${targetPath}`;
      return;
    }

    // `targetPath` is app-relative (`/create`), but the browser needs the full
    // hosted path (`/starlight-birthday-card/create`). Without the base, a
    // project-site deployment would navigate above its own scope and 404.
    const nextPath = withBase(targetPath);
    if (window.location.pathname !== nextPath || window.location.search) {
      window.history.pushState({}, '', nextPath);
      void renderCurrentRoute();
    }
  };

  const cleanupCurrentRoute = (): void => {
    if (studioUpdateTimer !== null) {
      window.clearTimeout(studioUpdateTimer);
      studioUpdateTimer = null;
    }
    pendingStudioUpdate = null;

    activeRouteCleanup.forEach((fn) => fn());
    activeRouteCleanup = [];

    activeStudio?.dispose();
    activeStudio = null;

    activeScene?.dispose();
    activeScene = null;

    activeOverlay?.dispose();
    activeOverlay = null;

    activeSound?.dispose();
    activeSound = null;

    inRehearsal = false;
    appEl.classList.remove('is-studio', 'is-studio-rehearsal');
    studioRoot.hidden = true;
    studioRoot.innerHTML = '';
    gateRoot.hidden = true;
    gateRoot.innerHTML = '';
    canvasRoot.innerHTML = '';
    uiRoot.innerHTML = '';
  };

  const mountInteractiveCard = (
    rawConfig: BirthdayCardConfig,
    opts: {
      studioMode: boolean;
      hideCreateEntry: boolean;
      onExitRehearsal?: () => void;
    }
  ): { scene: SceneApp; overlay: OverlayUI; sound: SoundEngine; config: BirthdayCardConfig } => {
    const { config, warnings } = validateCardConfig(rawConfig);
    updateDocumentTitle(config, opts.studioMode ? '制作生日贺卡' : undefined);

    const sound = new SoundEngine(config.audio);
    let sceneApp: SceneApp | null = null;
    let overlay: OverlayUI | null = null;

    const syncAudioUI = (): void => {
      overlay?.setAudioState(sound.isPlaying(), sound.isMuted());
    };

    const unlockAudioOnce = (): void => {
      if (!config.audio.enabled || sound.isMuted()) {
        return;
      }
      if (!sound.isPlaying()) {
        sound.unlockAndStart();
        syncAudioUI();
        window.setTimeout(syncAudioUI, 120);
      }
    };

    overlay = new OverlayUI(uiRoot, config, {
      onOpenCard: () => {
        unlockAudioOnce();
        sceneApp?.openCard();
      },
      onEnterMemories: () => {
        unlockAudioOnce();
        sceneApp?.enterMemoryWall();
      },
      onFlipCard: () => {
        sceneApp?.flipFocusedCard();
      },
      onNextMemory: () => {
        sceneApp?.focusNextMemory();
      },
      onCloseFocus: () => {
        sceneApp?.closeFocusedCard();
      },
      onSelectMemory: (id: string) => {
        sceneApp?.focusMemoryById(id);
      },
      onToggleMute: () => {
        const nextMuted = !sound.isMuted();
        sound.setMuted(nextMuted);
        // Turning sound on must also *start* playback. Previously the button only
        // unmuted, so on WeChat the first tap produced silence until the user
        // interacted with the card itself.
        if (!nextMuted && !sound.isPlaying()) {
          sound.unlockAndStart();
        }
        syncAudioUI();
        window.setTimeout(syncAudioUI, 140);
      },
      onToggleAutoCruise: () => {
        if (!sceneApp) return;
        const nextEnabled = !sceneApp.isAutoCruise();
        sceneApp.setAutoCruise(nextEnabled);
        overlay?.setAutoCruiseState(sceneApp.isAutoCruise());
      },
      onOpenBlessing: () => {
        sceneApp?.openBlessingLetter();
      },
      onCloseCardAndCelebrate: () => {
        sceneApp?.closeCardAndCelebrate();
      },
      onRevisitMemories: () => {
        sceneApp?.revisitMemories();
      },
      onReplay: () => {
        sceneApp?.replay();
      },
      onUnlockAudio: () => {
        sound.setMuted(false);
        sound.unlockAndStart();
        syncAudioUI();
        window.setTimeout(syncAudioUI, 140);
      },
      onOpenStudio: () => {
        navigate('/create');
      },
      onExitRehearsal: opts.onExitRehearsal,
    });

    overlay.setStudioMode(opts.studioMode);
    overlay.setCreateEntryVisible(!opts.hideCreateEntry);
    if (warnings.length > 0 && !opts.studioMode) {
      overlay.showConfigWarnings(warnings);
    }

    sceneApp = new SceneApp(canvasRoot, config, {
      onReady: () => {
        window.clearTimeout(bootFallbackTimer);
        dismissBootVeil();
      },
      onActChange: (act: SceneAct) => {
        overlay?.setAct(act);
        if (sceneApp) {
          overlay?.setAutoCruiseState(sceneApp.isAutoCruise());
        }
      },
      onMemoryProgress: (
        litCount: number,
        total: number,
        litIds: string[],
        nextMemoryId: string | null
      ) => {
        overlay?.setMemoryProgress(litCount, total, litIds, nextMemoryId);
      },
      onFocusChange: (slot: MosaicSlot | null, flipped: boolean) => {
        overlay?.setFocusedSlot(slot, flipped);
      },
      onSfx: (event: SoundSfxEvent) => {
        sound.playSfx(event);
      },
    });

    const removeGestureUnlockers = (): void => {
      window.removeEventListener('pointerdown', firstGestureHandler, true);
      window.removeEventListener('touchstart', firstGestureHandler, true);
      window.removeEventListener('keydown', firstGestureHandler, true);
      window.removeEventListener('wheel', firstGestureHandler, true);
    };

    const firstGestureHandler = (): void => {
      unlockAudioOnce();
      syncAudioUI();
      if (sound.isPlaying()) {
        removeGestureUnlockers();
      }
    };

    // Music should come up on its own. Browsers forbid audible playback until the
    // visitor has interacted, so we attempt it immediately and retry on the very
    // first gesture (touch, click, key or scroll) anywhere on the page. This also
    // covers the Studio, where music previously never started at all.
    if (config.audio.enabled && !sound.isMuted()) {
      window.addEventListener('pointerdown', firstGestureHandler, {
        capture: true,
        passive: true,
      });
      window.addEventListener('touchstart', firstGestureHandler, {
        capture: true,
        passive: true,
      });
      window.addEventListener('keydown', firstGestureHandler, { capture: true });
      window.addEventListener('wheel', firstGestureHandler, {
        capture: true,
        passive: true,
      });
    }

    void sound.tryAutoStart().then((started) => {
      syncAudioUI();
      if (started) {
        removeGestureUnlockers();
      }
    });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!sceneApp) return;
      const target = event.target as HTMLElement | null;
      const isEditingField =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isEditingField) return;

      const act = sceneApp.getAct();

      if (act === 'PHOTO_FOCUS') {
        if (event.key === 'Escape') {
          event.preventDefault();
          sceneApp.closeFocusedCard();
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          sceneApp.focusNextMemory();
          return;
        }
        if (event.key === ' ' || event.key === 'Enter') {
          const isInteractiveTarget =
            target !== null && (target.tagName === 'BUTTON' || target.tagName === 'A');
          if (!isInteractiveTarget) {
            event.preventDefault();
            sceneApp.flipFocusedCard();
          }
        }
        return;
      }

      if (event.key === 'Escape' && inRehearsal && opts.onExitRehearsal) {
        event.preventDefault();
        opts.onExitRehearsal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    activeRouteCleanup.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      removeGestureUnlockers();
    });

    activeScene = sceneApp;
    activeOverlay = overlay;
    activeSound = sound;

    return { scene: sceneApp, overlay, sound, config };
  };

  const renderShareStatusCard = (title: string, message: string): void => {
    dismissBootVeil();
    gateRoot.hidden = false;
    gateRoot.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'passcode-gate';

    const card = document.createElement('section');
    card.className = 'passcode-card';

    const h1 = document.createElement('h1');
    h1.className = 'passcode-title';
    h1.textContent = title;

    const desc = document.createElement('p');
    desc.className = 'passcode-subtitle';
    desc.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'passcode-actions';

    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'ui-paper-cta';
    homeBtn.textContent = '查看示例贺卡';
    homeBtn.addEventListener('click', () => navigate('/'));

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'ui-paper-link';
    createBtn.textContent = '制作我的贺卡';
    createBtn.addEventListener('click', () => navigate('/create'));

    actions.append(homeBtn, createBtn);
    card.append(h1, desc, actions);
    wrap.append(card);
    gateRoot.append(wrap);
  };

  const renderPasscodeGate = (
    shortId: string,
    recipientHint: string,
    ageHint: number,
    initialError?: string
  ): void => {
    dismissBootVeil();
    gateRoot.hidden = false;
    gateRoot.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'passcode-gate';

    const card = document.createElement('section');
    card.className = 'passcode-card';
    card.setAttribute('aria-label', '输入生日口令');

    const heading = document.createElement('h1');
    heading.className = 'passcode-title';
    const cleanRecipient = recipientHint.trim();
    heading.textContent =
      cleanRecipient && cleanRecipient !== '你'
        ? `写给 ${cleanRecipient} 的 ${ageHint} 岁贺卡`
        : `${ageHint} 岁生日贺卡`;

    const subtitle = document.createElement('p');
    subtitle.className = 'passcode-subtitle';
    subtitle.textContent = '输入 4 位生日口令解锁贺卡';

    const form = document.createElement('form');
    form.className = 'passcode-form';
    form.noValidate = true;

    const digitsRow = document.createElement('div');
    digitsRow.className = 'passcode-digits';

    const inputs: HTMLInputElement[] = [];
    for (let i = 0; i < 4; i += 1) {
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.pattern = '[0-9]*';
      input.maxLength = 1;
      input.autocomplete = 'one-time-code';
      input.className = 'passcode-digit';
      input.setAttribute('aria-label', `第 ${i + 1} 位数字`);
      inputs.push(input);
      digitsRow.append(input);
    }

    const errorEl = document.createElement('p');
    errorEl.className = 'passcode-error';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = initialError || '';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'ui-paper-cta passcode-submit';
    submitBtn.textContent = '解锁贺卡';

    let submitting = false;

    const getCode = (): string => inputs.map((el) => el.value.trim()).join('');

    const attemptUnlock = async (): Promise<void> => {
      if (submitting) return;
      const code = getCode();
      if (!/^\d{4}$/.test(code)) {
        errorEl.textContent = '请输入完整的 4 位数字口令';
        inputs.find((el) => !el.value)?.focus();
        return;
      }

      submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = '正在验证';
      errorEl.textContent = '';

      const res = await shareClient.fetchCard(shortId, code);
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = '解锁贺卡';

      if (res.status === 'ok') {
        gateRoot.hidden = true;
        gateRoot.innerHTML = '';
        mountInteractiveCard(res.config, {
          studioMode: false,
          hideCreateEntry: Boolean(res.config.shareSettings?.hideCreateEntry),
        });
        return;
      }

      if (res.status === 'wrong_passcode') {
        errorEl.textContent = '口令不太对，请再试一次';
        card.classList.remove('is-shaking');
        void card.offsetWidth;
        card.classList.add('is-shaking');
        inputs.forEach((el) => {
          el.value = '';
        });
        inputs[0]?.focus();
        return;
      }

      if (res.status === 'not_found') {
        renderShareStatusCard('未找到这张贺卡', '链接可能已过期或被创建者删除。');
        return;
      }

      errorEl.textContent = res.status === 'error' ? res.message : '验证失败，请稍后重试。';
    };

    inputs.forEach((input, idx) => {
      input.addEventListener('input', () => {
        const cleaned = input.value.replace(/\D/g, '');
        if (cleaned.length > 1) {
          // Handle pasted multi-digit code
          for (let j = 0; j < 4; j += 1) {
            inputs[j].value = cleaned[j] || '';
          }
          inputs[Math.min(3, cleaned.length - 1)]?.focus();
          if (cleaned.length >= 4) {
            void attemptUnlock();
          }
          return;
        }
        input.value = cleaned;
        if (cleaned && idx < 3) {
          inputs[idx + 1]?.focus();
        }
        if (getCode().length === 4) {
          void attemptUnlock();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          inputs[idx - 1]?.focus();
        }
      });

      input.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        const digits = text.replace(/\D/g, '').slice(0, 4);
        if (digits.length > 0) {
          e.preventDefault();
          for (let j = 0; j < 4; j += 1) {
            inputs[j].value = digits[j] || '';
          }
          inputs[Math.min(3, digits.length - 1)]?.focus();
          if (digits.length === 4) {
            void attemptUnlock();
          }
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void attemptUnlock();
    });

    form.append(digitsRow, errorEl, submitBtn);
    card.append(heading, subtitle, form);
    wrap.append(card);
    gateRoot.append(wrap);

    window.setTimeout(() => inputs[0]?.focus(), 60);
  };

  const renderCurrentRoute = async (): Promise<void> => {
    const version = ++routeVersion;
    cleanupCurrentRoute();

    const route = parseRoute();

    if (route.kind === 'home') {
      mountInteractiveCard(cardConfig, {
        studioMode: false,
        hideCreateEntry: false,
      });
      triggerViewportResize();
      return;
    }

    if (route.kind === 'create') {
      appEl.classList.add('is-studio');
      studioRoot.hidden = false;

      const savedDraft = await loadDraft().catch(() => null);
      if (version !== routeVersion) return;

      const initialConfig = savedDraft ?? cardConfig;

      const exitRehearsal = (): void => {
        if (!inRehearsal) return;
        inRehearsal = false;
        appEl.classList.remove('is-studio-rehearsal');
        activeStudio?.setPreviewMode(false);
        activeOverlay?.setStudioMode(true);
        activeOverlay?.setRehearsalBannerVisible(false);
        triggerViewportResize();
      };

      const mounted = mountInteractiveCard(initialConfig, {
        studioMode: true,
        hideCreateEntry: true,
        onExitRehearsal: exitRehearsal,
      });

      triggerViewportResize();

      activeStudio = new CreatorStudio({
        mountEl: studioRoot,
        initialConfig: mounted.config,
        shareClient,
        onConfigChange: (nextConfig, opts) => {
          const { config: validated } = validateCardConfig(nextConfig);
          mounted.overlay.updateConfig(validated);
          mounted.sound.setMuted(!validated.audio.enabled);
          mounted.overlay.setAudioState(mounted.sound.isPlaying(), mounted.sound.isMuted());

          // Debounce and coalesce 3D updates. The Studio emits on every keystroke
          // and every drag frame; applying each one immediately rebuilds layout
          // maths and re-uploads textures, which is what made the mobile preview
          // stutter. Bursts are merged into a single trailing update.
          pendingStudioUpdate = { config: validated, opts };
          if (studioUpdateTimer === null) {
            studioUpdateTimer = window.setTimeout(() => {
              studioUpdateTimer = null;
              const next = pendingStudioUpdate;
              pendingStudioUpdate = null;
              if (!next) return;
              mounted.scene.updateConfig(next.config, next.opts);
            }, 120);
          }
        },
        onFocusMemory: (memoryId) => {
          mounted.scene.focusMemoryById(memoryId);
        },
        onFullscreenCurrentStage: () => {
          if (inRehearsal) return;
          inRehearsal = true;
          appEl.classList.add('is-studio-rehearsal');
          activeStudio?.setPreviewMode(true);
          mounted.overlay.setStudioMode(false);
          mounted.overlay.setRehearsalBannerVisible(true);
          triggerViewportResize();
        },
        onPreviewFullCard: (previewConfig) => {
          const { config: validated } = validateCardConfig(previewConfig);
          inRehearsal = true;
          appEl.classList.add('is-studio-rehearsal');
          activeStudio?.setPreviewMode(true);
          mounted.overlay.updateConfig(validated);
          mounted.overlay.setStudioMode(false);
          mounted.overlay.setRehearsalBannerVisible(true);
          mounted.scene.updateConfig(validated);
          triggerViewportResize();
          if (validated.audio.enabled) {
            mounted.sound.setMuted(false);
            mounted.sound.unlockAndStart();
            mounted.overlay.setAudioState(mounted.sound.isPlaying(), mounted.sound.isMuted());
          }
          mounted.scene.replay();
        },
        onOpenPublishedUrl: (shortId) => {
          navigate(`/c/${shortId}`);
        },
        onExitStudio: () => {
          navigate('/');
        },
      });
      return;
    }

    // route.kind === 'share'
    const queryPasscode = new URLSearchParams(window.location.search).get('p')?.trim() || undefined;
    const result = await shareClient.fetchCard(route.shortId, queryPasscode);
    if (version !== routeVersion) return;

    if (result.status === 'ok') {
      mountInteractiveCard(result.config, {
        studioMode: false,
        hideCreateEntry: Boolean(result.config.shareSettings?.hideCreateEntry),
      });
      triggerViewportResize();
      return;
    }

    if (result.status === 'passcode_required') {
      renderPasscodeGate(route.shortId, result.recipientHint, result.ageHint);
      return;
    }

    if (result.status === 'wrong_passcode') {
      renderPasscodeGate(
        route.shortId,
        result.recipientHint || '你',
        result.ageHint ?? 24,
        '链接中的口令不正确，请重新输入'
      );
      return;
    }

    if (result.status === 'not_found') {
      renderShareStatusCard('未找到这张贺卡', '链接可能已过期、被删除，或是在其他浏览器中生成的本地预览链接。');
      return;
    }

    renderShareStatusCard('暂时无法打开贺卡', result.message);
  };

  const onPopState = (): void => {
    void renderCurrentRoute();
  };

  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', onPopState);

  window.addEventListener(
    'beforeunload',
    () => {
      window.clearTimeout(bootFallbackTimer);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onPopState);
      cleanupCurrentRoute();
    },
    { once: true }
  );

  void renderCurrentRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
