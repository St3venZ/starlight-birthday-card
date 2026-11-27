import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import type {
  BirthdayCardConfig,
  MosaicLayoutResult,
  MosaicSlot,
  SceneAct,
} from '../config/types';
import { SYSTEM_PRESETS } from '../config/presets';
import { buildAgeMosaicLayout } from './layout/ageMosaicLayout';
import { clamp, damp, easeInOutCubic, easeOutCubic, lerp } from './utils/math';
import { CosmicBackdrop } from './shaders/cosmicBackdrop';
import { EntranceParticles } from './shaders/entranceParticles';
import { FireworksSystem } from './objects/FireworksSystem';
import { PopupBookCard } from './objects/PopupBookCard';
import { MemoryCardDeck } from './objects/MemoryCardDeck';
import { CameraRig } from './camera/CameraRig';

export type SceneSfxEvent =
  | 'open'
  | 'prologue'
  | 'assemble'
  | 'hover'
  | 'focus'
  | 'flip'
  | 'lit'
  | 'wave'
  | 'close'
  | 'firework';

export interface SceneAppCallbacks {
  onReady?: () => void;
  onActChange?: (act: SceneAct) => void;
  onMemoryProgress?: (
    litCount: number,
    total: number,
    litIds: string[],
    nextMemoryId: string | null,
  ) => void;
  onFocusChange?: (slot: MosaicSlot | null, flipped: boolean) => void;
  onSfx?: (event: SceneSfxEvent) => void;
}

const ENTRANCE_DURATION = 2.2;
const OPENING_DURATION = 1.7;
const CONSTELLATION_DURATION = 1.6;
const CLOSING_DURATION = 1.8;
const CLICK_DRAG_THRESHOLD_PX = 7;

/**
 * Generates a lightweight warm-starlight PMREM studio environment so metallic
 * champagne-gold trims, seal sticker, and cake accents reflect real foil sheen.
 */
function createStarlightEnvironment(
  renderer: THREE.WebGLRenderer,
): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x090e22);

  const domeGeo = new THREE.SphereGeometry(18, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({
    color: 0x101938,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  // Warm champagne-gold overhead softbox
  const keyGeo = new THREE.PlaneGeometry(14, 7);
  const keyMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 2.05, 1.45),
    side: THREE.DoubleSide,
  });
  const keyPanel = new THREE.Mesh(keyGeo, keyMat);
  keyPanel.position.set(5, 8, 7);
  keyPanel.lookAt(0, 0, 0);
  envScene.add(keyPanel);

  // Cool starlight-blue opposite rim reflection strip
  const rimGeo = new THREE.PlaneGeometry(12, 8);
  const rimMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.95, 1.2, 2.0),
    side: THREE.DoubleSide,
  });
  const rimPanel = new THREE.Mesh(rimGeo, rimMat);
  rimPanel.position.set(-8, 4, -5);
  rimPanel.lookAt(0, 0, 0);
  envScene.add(rimPanel);

  // Candlelight amber warm floor bounce
  const floorGeo = new THREE.PlaneGeometry(16, 16);
  const floorMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.35, 0.92, 0.45),
    side: THREE.DoubleSide,
  });
  const floorPanel = new THREE.Mesh(floorGeo, floorMat);
  floorPanel.position.set(0, -8, 4);
  floorPanel.lookAt(0, 0, 0);
  envScene.add(floorPanel);

  const envRT = pmrem.fromScene(envScene, 0.036);

  domeGeo.dispose();
  domeMat.dispose();
  keyGeo.dispose();
  keyMat.dispose();
  rimGeo.dispose();
  rimMat.dispose();
  floorGeo.dispose();
  floorMat.dispose();
  pmrem.dispose();

  return envRT;
}

function computeAdaptiveMaxDpr(): number {
  if (typeof window === 'undefined') return 2;
  const dpr = window.devicePixelRatio || 1;
  const isCoarseOrCompact =
    window.matchMedia?.('(pointer: coarse)').matches ||
    Math.min(window.innerWidth, window.innerHeight) < 768;

  // Phones commonly report 2.5-3.5. Clamping to 1.5 made the whole 3D scene look
  // soft, which read as low quality on WeChat. Render at (near) native density
  // instead, and reclaim the GPU budget through bloom resolution, particle count
  // and the FPS watchdog rather than by blurring the image.
  return isCoarseOrCompact ? Math.min(dpr, 2.5) : Math.min(dpr, 2);
}

/**
 * Phones spend most of their GPU budget on fill rate: a full-screen bloom
 * chain plus a nebula shader plus thousands of additive particles. These
 * budgets keep the scene fluid instead of dropping resolution mid-animation.
 */
function computeParticleBudget(): number {
  if (typeof window === 'undefined') return 3200;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 768;
  return coarse || small ? 2000 : 3200;
}

function computeBloomResolutionScale(): number {
  if (typeof window === 'undefined') return 0.5;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 768;
  // Bloom is a wide soft glow, so it survives a lower internal resolution while
  // the crisp geometry and text above it render at full device density.
  return coarse || small ? 0.28 : 0.5;
}

/** Antialiasing is redundant when the pixel ratio is already >= 1.5. */
function shouldAntialias(pixelRatio: number): boolean {
  return pixelRatio < 1.5;
}

export class SceneApp {
  private _layout: MosaicLayoutResult;

  private readonly container: HTMLElement;
  private readonly callbacks?: SceneAppCallbacks;
  private readonly reducedMotion: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly envRT: THREE.WebGLRenderTarget;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly composerTarget: THREE.WebGLRenderTarget | null;
  private readonly bloomPass: UnrealBloomPass;

  private readonly backdrop: CosmicBackdrop;
  private readonly entranceParticles: EntranceParticles;
  private readonly fireworks: FireworksSystem;
  private readonly card: PopupBookCard;
  private deck: MemoryCardDeck;
  private readonly cameraRig: CameraRig;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly tmpVecA = new THREE.Vector3();
  private readonly tmpVecB = new THREE.Vector3();
  private readonly skyPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 6.2);

  private act: SceneAct = 'ENTRANCE';
  private actElapsed = 0;
  private totalElapsed = 0;
  private lastFrameTime = 0;
  private rafId: number | null = null;
  private disposed = false;

  // Adaptive DPR & gentle FPS watchdog
  private maxPixelRatio: number;
  private currentPixelRatio: number;
  private bloomResolutionScale = 0.5;
  private fpsSampleTime = 0;
  private fpsSampleFrames = 0;
  private lowFpsDuration = 0;
  private dprTrimCooldown = 0;

  // Book choreography state
  private cardOpenCurrent = 0;
  private cardAlphaCurrent = 1;
  private cardScaleCurrent = 0.42;
  private readonly cardPosCurrent = new THREE.Vector3(0, -0.5, -9.5);
  private readonly cardRotCurrent = new THREE.Euler(0.12, -0.35, 0);
  private sealRestoredThisClose = false;

  // Memory celebration & auto-cruise state
  private celebrationTriggered = false;
  private autoCruiseEnabled = false;
  private cruiseTimer = 0;
  private cruiseStage: 'idle' | 'front' | 'back' = 'idle';
  private cruiseReplayIndex = 0;

  // Pointer interaction state
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerActive = false;
  private lastHoverTargetKey: string | null = null;
  private lastHoverSfxTime = -1;

  // Managed timeouts cleared cleanly on replay/dispose
  private readonly activeTimers = new Set<number>();
  private readonly resizeObserver: ResizeObserver | null;

  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onWindowResizeBound: () => void;

  get layout(): MosaicLayoutResult {
    return this._layout;
  }

  constructor(
    container: HTMLElement,
    config: BirthdayCardConfig,
    callbacks?: SceneAppCallbacks,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);

    this.maxPixelRatio = computeAdaptiveMaxDpr();
    this.currentPixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.bloomResolutionScale = computeBloomResolutionScale();

    // ─── Renderer & Tone Mapping ─────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias: shouldAntialias(this.currentPixelRatio),
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x050712, 1);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    // ─── Scene & Camera ──────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050712);

    this.envRT = createStarlightEnvironment(this.renderer);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.72;

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 220);

    // Clean Night-Sky Studio Lighting calibrated for crisp warm-white cardstock
    const hemiLight = new THREE.HemisphereLight(0xc2d4ff, 0x262840, 0.78);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf0, 1.22);
    keyLight.position.set(4.5, 7.5, 10.5);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8faeff, 0.65);
    rimLight.position.set(-7.5, 3.8, -6.5);
    this.scene.add(rimLight);

    const warmFill = new THREE.PointLight(0xffd8a8, 0.52, 24, 1.6);
    warmFill.position.set(0, -3.5, 5.8);
    this.scene.add(warmFill);

    // ─── Post-Processing Pipeline (MSAA Target + Selective HDR Bloom) ─
    const isWebGL2 = this.renderer.capabilities.isWebGL2;
    const maxSamples = this.renderer.capabilities.maxSamples ?? 0;
    const canMsaaHalfFloat =
      isWebGL2 &&
      maxSamples > 0 &&
      this.renderer.extensions.has('EXT_color_buffer_float');
    const isCoarseOrCompact =
      window.matchMedia?.('(pointer: coarse)').matches ||
      Math.min(window.innerWidth, window.innerHeight) < 768;
    const desiredSamples = isCoarseOrCompact ? 2 : 4;
    const msaaSamples = canMsaaHalfFloat ? Math.min(desiredSamples, maxSamples) : 0;
    this.composerTarget =
      msaaSamples > 0
        ? new THREE.WebGLRenderTarget(
            Math.max(1, Math.floor(width * this.currentPixelRatio)),
            Math.max(1, Math.floor(height * this.currentPixelRatio)),
            {
              type: THREE.HalfFloatType,
              samples: msaaSamples,
            },
          )
        : null;
    this.composer = this.composerTarget
      ? new EffectComposer(this.renderer, this.composerTarget)
      : new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.currentPixelRatio);
    this.composer.setSize(width, height);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        Math.max(1, Math.floor(width * this.bloomResolutionScale)),
        Math.max(1, Math.floor(height * this.bloomResolutionScale)),
      ),
      0.4,
      0.42,
      0.92,
    );
    const outputPass = new OutputPass();
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(outputPass);

    // ─── Scene Objects (Card ready immediately; Mosaic hydration deferred!) ─
    this._layout = this.buildLayoutForConfig(config);

    this.backdrop = new CosmicBackdrop();
    this.scene.add(this.backdrop.group);

    this.entranceParticles = new EntranceParticles(computeParticleBudget());
    this.scene.add(this.entranceParticles.points);

    this.fireworks = new FireworksSystem();
    this.scene.add(this.fireworks.group);

    this.card = new PopupBookCard(config);
    this.card.group.position.copy(this.cardPosCurrent);
    this.card.group.scale.setScalar(this.cardScaleCurrent);
    this.scene.add(this.card.group);

    this.deck = this.createDeck(this._layout);
    this.scene.add(this.deck.group);

    this.cameraRig = new CameraRig(this.camera, this.renderer.domElement);
    this.cameraRig.setMosaicBounds(this._layout.bounds);
    this.cameraRig.onResize(width / height);
    this.cameraRig.setAct('ENTRANCE');

    // ─── Input & Resize Listeners ────────────────────────────────────
    this.onPointerDownBound = this.handlePointerDown.bind(this);
    this.onPointerMoveBound = this.handlePointerMove.bind(this);
    this.onPointerUpBound = this.handlePointerUp.bind(this);
    this.onWindowResizeBound = this.handleResize.bind(this);

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDownBound);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMoveBound);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('resize', this.onWindowResizeBound);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    } else {
      this.resizeObserver = null;
    }

    // ─── Shader Pre-Compilation & 2 Silent Warmup Renders ────────────
    this.cameraRig.update(0, 0.016);
    this.backdrop.update(0, 0.016, 1.0);
    this.entranceParticles.update(0, 0.016);
    this.card.update(0, 0.016);
    this.renderer.compile(this.scene, this.camera);
    this.composer.render();
    this.composer.render();

    // Emit initial state, notify host that shaders/first frame are hot, then begin clean t=0 rAF
    this.emitMemoryProgress();
    this.callbacks?.onActChange?.(this.act);
    this.callbacks?.onReady?.();

    this.actElapsed = 0;
    this.lastFrameTime = 0;
    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }

  getAct(): SceneAct {
    return this.act;
  }

  /**
   * Live Creator Studio API: updates greeting card textures & rebuilds 3D Age Mosaic
   * with new densityMode / layoutSeed / photos / copy without tearing down WebGL context.
   *
   * Rebuilding the deck allocates one canvas texture pair per card, so it is only
   * done when the *layout* actually changed (photo count / order / density / seed).
   * Plain copy edits (caption, back message, template) are applied in place, which
   * keeps typing in the Studio smooth instead of re-uploading dozens of textures
   * on every keystroke.
   */
  updateConfig(
    nextConfig: BirthdayCardConfig,
    options?: { jumpToAct?: SceneAct },
  ): void {
    if (this.disposed) return;

    const prevFocusedId =
      this.act === 'PHOTO_FOCUS'
        ? (this.deck.getFocusedSlot()?.memory?.id ?? null)
        : null;
    const prevFlipped = this.act === 'PHOTO_FOCUS' && this.deck.isFocusedFlipped();

    this.card.updateConfig(nextConfig);

    // Rebuild mosaic layout with densityMode & layoutSeed
    this._layout = this.buildLayoutForConfig(nextConfig);

    if (this.deckMatchesLayout(this._layout)) {
      // Layout identity unchanged: patch textures in place, skip the full rebuild.
      this.deck.applyConfig(this._layout);
    } else {
      const oldDeck = this.deck;
      this.scene.remove(oldDeck.group);
      oldDeck.dispose();

      this.deck = this.createDeck(this._layout);
      this.scene.add(this.deck.group);
      this.cameraRig.setMosaicBounds(this._layout.bounds);
    }

    this.celebrationTriggered = false;

    const targetAct = options?.jumpToAct ?? this.act;
    const needsMosaicImmediate =
      targetAct === 'MEMORY_EXPLORE' ||
      targetAct === 'PHOTO_FOCUS' ||
      targetAct === 'BLESSING_LETTER' ||
      targetAct === 'CONSTELLATION_FORM';

    if (needsMosaicImmediate) {
      this.deck.hydrateAllNow();
      this.deck.setVisibility(true, true);
    }

    if (options?.jumpToAct) {
      this.jumpToAct(options.jumpToAct);
      return;
    }

    // Preserve live PHOTO_FOCUS editing when user tweaks caption/back message in Studio
    if (this.act === 'PHOTO_FOCUS') {
      if (
        prevFocusedId &&
        this._layout.slots.some(
          (s) => s.kind === 'memory' && s.memory?.id === prevFocusedId,
        )
      ) {
        this.deck.focusMemoryById(prevFocusedId, this.camera);
        if (prevFlipped) {
          this.deck.flipFocusedCard();
        }
      } else {
        this.callbacks?.onFocusChange?.(null, false);
        this.transitionTo('MEMORY_EXPLORE');
      }
    }

    this.emitMemoryProgress();
  }

  /**
   * Compares the currently mounted deck against a freshly computed layout to
   * decide whether a full rebuild is really required. Geometry depends on card
   * size, slot count, per-slot position and the memory/preset assignment.
   */
  private deckMatchesLayout(next: MosaicLayoutResult): boolean {
    const prev = this.deck.layout;
    if (!prev) return false;
    if (prev.slots.length !== next.slots.length) return false;
    if (
      Math.abs(prev.cardWidth - next.cardWidth) > 1e-4 ||
      Math.abs(prev.cardHeight - next.cardHeight) > 1e-4
    ) {
      return false;
    }

    for (let i = 0; i < next.slots.length; i += 1) {
      const a = prev.slots[i];
      const b = next.slots[i];
      if (a.kind !== b.kind) return false;
      if (
        Math.abs(a.position.x - b.position.x) > 1e-4 ||
        Math.abs(a.position.y - b.position.y) > 1e-4 ||
        Math.abs(a.position.z - b.position.z) > 1e-4
      ) {
        return false;
      }
      const aKey = a.memory?.id ?? a.preset?.id ?? '';
      const bKey = b.memory?.id ?? b.preset?.id ?? '';
      if (aKey !== bKey) return false;
    }

    return true;
  }

  /**
   * Live Creator Studio step navigation: cleanly stages the 3D scene at the requested act.
   */
  jumpToAct(targetAct: SceneAct): void {
    if (this.disposed) return;

    if (targetAct === 'ENTRANCE') {
      this.replay();
      return;
    }

    this.clearTimers();
    this.autoCruiseEnabled = false;
    this.cruiseStage = 'idle';
    this.lastHoverTargetKey = null;

    const hearthY = -(this._layout.bounds.height * 0.54 + 1.05);

    switch (targetAct) {
      case 'AWAITING_OPEN': {
        this.fireworks.setAutoLaunch(false);
        this.fireworks.clear();
        this.deck.hideAll();
        this.entranceParticles.reset();
        this.entranceParticles.setProgress(1);
        this.card.triggerSealRestore();
        this.cardPosCurrent.set(0, 0, 0);
        this.cardRotCurrent.set(0, 0, 0);
        this.cardScaleCurrent = 1;
        this.cardAlphaCurrent = 1;
        this.cardOpenCurrent = 0.22;
        this.applyCardTransform();
        this.cameraRig.resetUserOffset();
        this.callbacks?.onFocusChange?.(null, false);
        this.transitionTo('AWAITING_OPEN');
        break;
      }

      case 'OPENING':
      case 'PROLOGUE': {
        this.fireworks.setAutoLaunch(false);
        this.fireworks.clear();
        this.deck.hideAll();
        this.entranceParticles.setProgress(1);
        this.entranceParticles.burst();
        this.card.triggerSealBreak();
        this.cardPosCurrent.set(0, 1.08, -0.15);
        this.cardRotCurrent.set(0.04, 0, 0);
        this.cardScaleCurrent = 0.82;
        this.cardAlphaCurrent = 1;
        this.cardOpenCurrent = 1.0;
        this.applyCardTransform();
        this.cameraRig.resetUserOffset();
        this.callbacks?.onFocusChange?.(null, false);
        this.transitionTo(targetAct);
        break;
      }

      case 'CONSTELLATION_FORM': {
        this.fireworks.setAutoLaunch(false);
        this.fireworks.clear();
        this.entranceParticles.setProgress(1);
        this.entranceParticles.burst();
        this.card.triggerSealBreak();
        this.cardOpenCurrent = 1.0;
        this.applyCardTransform();
        const hearthOrigin = this.card.getHearthWorldPosition(this.tmpVecA);
        this.deck.startAssembly(hearthOrigin);
        this.transitionTo('CONSTELLATION_FORM');
        break;
      }

      case 'MEMORY_EXPLORE':
      case 'PHOTO_FOCUS': {
        this.fireworks.setAutoLaunch(false);
        this.fireworks.clear();
        this.entranceParticles.setProgress(1);
        this.entranceParticles.burst();
        this.card.triggerSealBreak();
        this.cardPosCurrent.set(0, hearthY, -0.45);
        this.cardRotCurrent.set(0.04, 0, 0);
        this.cardScaleCurrent = 0.42;
        this.cardAlphaCurrent = 0.3;
        this.cardOpenCurrent = 1.0;
        this.applyCardTransform();
        this.deck.hydrateAllNow();
        this.deck.setVisibility(true, true);
        if (this.deck.getFocusedSlot()) {
          this.deck.closeFocusedCard();
        }
        this.cameraRig.resetUserOffset();
        this.transitionTo('MEMORY_EXPLORE');
        this.emitMemoryProgress();
        break;
      }

      case 'BLESSING_LETTER': {
        this.fireworks.setAutoLaunch(false);
        this.fireworks.clear();
        this.entranceParticles.setProgress(1);
        this.entranceParticles.burst();
        this.card.triggerSealBreak();
        this.cardPosCurrent.set(0, -2.25, 1.35);
        this.cardRotCurrent.set(0.06, 0, 0);
        this.cardScaleCurrent = 0.72;
        this.cardAlphaCurrent = 0.82;
        this.cardOpenCurrent = 1.0;
        this.applyCardTransform();
        this.deck.hydrateAllNow();
        this.deck.setVisibility(true, true);
        if (this.deck.getFocusedSlot()) {
          this.deck.closeFocusedCard();
        }
        this.transitionTo('BLESSING_LETTER');
        break;
      }

      case 'CLOSING_CARD': {
        this.closeCardAndCelebrate();
        break;
      }

      case 'FIREWORKS_FINALE': {
        this.deck.hideAll();
        this.entranceParticles.setProgress(1);
        this.entranceParticles.burst();
        this.card.triggerSealRestore();
        this.cardPosCurrent.set(0, -1.24, 0.1);
        this.cardRotCurrent.set(-0.06, 0, 0);
        this.cardScaleCurrent = 0.84;
        this.cardAlphaCurrent = 1.0;
        this.cardOpenCurrent = 0.0;
        this.applyCardTransform();
        this.transitionTo('FIREWORKS_FINALE');
        break;
      }
    }
  }

  openCard(): void {
    if (this.act !== 'AWAITING_OPEN' && this.act !== 'ENTRANCE') return;

    this.card.setHoveringSeal(false);
    this.card.triggerSealBreak();
    this.entranceParticles.burst();

    const sealPos = this.card.getSealWorldPosition(this.tmpVecA);
    this.fireworks.burstAt(sealPos.x, sealPos.y, sealPos.z, 0xf3d38c);
    this.callbacks?.onSfx?.('open');

    this.transitionTo('OPENING');
  }

  enterMemoryWall(): void {
    if (this.act !== 'PROLOGUE' && this.act !== 'OPENING') return;

    this.cardOpenCurrent = 1;
    this.card.setOpenAmount(1);
    const hearthOrigin = this.card.getHearthWorldPosition(this.tmpVecA);
    this.deck.startAssembly(hearthOrigin);
    this.callbacks?.onSfx?.('assemble');

    this.transitionTo('CONSTELLATION_FORM');
  }

  focusMemoryById(memoryId: string): void {
    if (this.act !== 'MEMORY_EXPLORE' && this.act !== 'PHOTO_FOCUS') {
      this.jumpToAct('MEMORY_EXPLORE');
    }
    this.autoCruiseEnabled = false;
    this.cruiseStage = 'idle';

    this.deck.focusMemoryById(memoryId, this.camera);
    if (this.deck.getFocusedSlot()) {
      this.transitionTo('PHOTO_FOCUS');
    }
  }

  focusNextMemory(): void {
    if (this.act !== 'MEMORY_EXPLORE' && this.act !== 'PHOTO_FOCUS') return;
    this.autoCruiseEnabled = false;
    this.cruiseStage = 'idle';

    const currentFocused = this.deck.getFocusedSlot();
    const memorySlots = this._layout.slots
      .filter((s) => s.kind === 'memory' && s.memory)
      .sort((a, b) => (a.memoryOrder ?? a.index) - (b.memoryOrder ?? b.index));

    if (memorySlots.length === 0) {
      if (this.act === 'PHOTO_FOCUS') {
        this.closeFocusedCard();
      }
      return;
    }

    const litIds = this.deck.getLitIds();
    const nextUnlit = memorySlots.find(
      (s) =>
        s.memory &&
        !litIds.has(s.memory.id) &&
        s.index !== currentFocused?.index,
    );

    if (nextUnlit && nextUnlit.memory) {
      this.deck.focusSlotByIndex(nextUnlit.index, this.camera);
      this.transitionTo('PHOTO_FOCUS');
      return;
    }

    if (
      currentFocused &&
      currentFocused.kind === 'memory' &&
      currentFocused.memory &&
      !litIds.has(currentFocused.memory.id)
    ) {
      this.closeFocusedCard();
      return;
    }

    const currentIdx = currentFocused
      ? memorySlots.findIndex((s) => s.index === currentFocused.index)
      : -1;
    const nextSlot = memorySlots[(currentIdx + 1) % memorySlots.length];
    if (nextSlot) {
      this.deck.focusSlotByIndex(nextSlot.index, this.camera);
      this.transitionTo('PHOTO_FOCUS');
    }
  }

  flipFocusedCard(): void {
    if (this.act !== 'PHOTO_FOCUS') return;
    this.deck.flipFocusedCard();
  }

  closeFocusedCard(): void {
    if (this.act !== 'PHOTO_FOCUS') return;
    this.deck.closeFocusedCard();
    this.transitionTo('MEMORY_EXPLORE');
  }

  setAutoCruise(enabled: boolean): void {
    if (enabled && this.deck.totalMemories === 0) {
      this.autoCruiseEnabled = false;
      return;
    }
    this.autoCruiseEnabled = enabled;
    this.cruiseTimer = enabled ? 0.55 : 0;
    this.cruiseStage = 'idle';
    if (enabled) {
      this.cruiseReplayIndex = 0;
    }
  }

  isAutoCruise(): boolean {
    return this.autoCruiseEnabled;
  }

  openBlessingLetter(): void {
    if (this.act === 'BLESSING_LETTER' || this.act === 'CLOSING_CARD') return;
    this.autoCruiseEnabled = false;
    this.cruiseStage = 'idle';

    if (this.act === 'PHOTO_FOCUS') {
      this.deck.closeFocusedCard();
    }
    this.transitionTo('BLESSING_LETTER');
  }

  closeCardAndCelebrate(): void {
    if (this.act === 'CLOSING_CARD' || this.act === 'FIREWORKS_FINALE') return;
    this.autoCruiseEnabled = false;
    this.cruiseStage = 'idle';
    this.clearTimers();

    if (this.act === 'PHOTO_FOCUS') {
      this.deck.closeFocusedCard();
    }

    this.deck.setVisibility(false, false);
    this.sealRestoredThisClose = false;
    this.callbacks?.onSfx?.('close');

    this.transitionTo('CLOSING_CARD');
  }

  revisitMemories(): void {
    if (this.act !== 'BLESSING_LETTER' && this.act !== 'FIREWORKS_FINALE') return;
    this.clearTimers();
    this.autoCruiseEnabled = false;
    this.cruiseStage = 'idle';

    if (this.act === 'FIREWORKS_FINALE') {
      this.fireworks.setAutoLaunch(false);
      this.fireworks.clear();
      this.deck.setVisibility(true, false);
    }

    this.transitionTo('MEMORY_EXPLORE');
  }

  launchFireworkAtScreen(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hitPoint = this.tmpVecA;
    const hit = this.raycaster.ray.intersectPlane(this.skyPlane, hitPoint);
    if (hit) {
      const tx = clamp(hitPoint.x, -11, 11);
      const ty = clamp(hitPoint.y, 0.4, 8.8);
      const tz = -5.4 - Math.random() * 2.6;
      this.fireworks.launchAt(tx, ty, tz);
    } else {
      this.fireworks.launchAt(
        (Math.random() - 0.5) * 8,
        3.2 + Math.random() * 3.5,
        -6.2,
      );
    }
    this.callbacks?.onSfx?.('firework');
  }

  replay(): void {
    this.clearTimers();
    this.autoCruiseEnabled = false;
    this.cruiseStage = 'idle';
    this.celebrationTriggered = false;
    this.sealRestoredThisClose = false;
    this.lastHoverTargetKey = null;

    this.fireworks.setAutoLaunch(false);
    this.fireworks.clear();
    this.deck.resetProgress();
    this.deck.hideAll();
    this.entranceParticles.reset();

    this.card.triggerSealRestore();
    this.cardOpenCurrent = 0;
    this.cardAlphaCurrent = 1;
    this.cardScaleCurrent = 0.42;
    this.cardPosCurrent.set(0, -0.5, -9.5);
    this.cardRotCurrent.set(0.12, -0.35, 0);
    this.card.setOpenAmount(0);
    this.card.setCardVisibility(1);
    this.card.group.position.copy(this.cardPosCurrent);
    this.card.group.rotation.copy(this.cardRotCurrent);
    this.card.group.scale.setScalar(this.cardScaleCurrent);

    this.cameraRig.resetUserOffset();
    this.callbacks?.onFocusChange?.(null, false);
    this.emitMemoryProgress();

    this.transitionTo('ENTRANCE');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clearTimers();

    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResizeBound);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDownBound);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMoveBound);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUpBound);

    this.cameraRig.dispose();
    this.deck.dispose();
    this.card.dispose();
    this.fireworks.dispose();
    this.entranceParticles.dispose();
    this.backdrop.dispose();

    this.bloomPass.dispose();
    this.composer.dispose();
    this.composerTarget?.dispose();
    this.scene.environment = null;
    this.envRT.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private buildLayoutForConfig(config: BirthdayCardConfig): MosaicLayoutResult {
    return buildAgeMosaicLayout(
      config.age,
      config.memories,
      SYSTEM_PRESETS,
      config.presetFill,
      {
        densityMode: config.densityMode,
        layoutSeed: config.layoutSeed,
      },
    );
  }

  private createDeck(layout: MosaicLayoutResult): MemoryCardDeck {
    return new MemoryCardDeck(layout, {
      onMemoryLit: (memoryId, litCount, totalMemories) => {
        this.handleMemoryLit(memoryId, litCount, totalMemories);
      },
      onFocusChange: (slot, flipped) => {
        this.callbacks?.onFocusChange?.(slot, flipped);
      },
      onCardClickSfx: () => {
        this.callbacks?.onSfx?.('focus');
      },
      onCardFlipSfx: () => {
        this.callbacks?.onSfx?.('flip');
      },
    });
  }

  private transitionTo(nextAct: SceneAct): void {
    if (this.act === nextAct && nextAct !== 'ENTRANCE') return;
    this.act = nextAct;
    this.actElapsed = 0;

    this.cameraRig.setAct(nextAct);
    this.cameraRig.setOrbitEnabled(
      nextAct === 'MEMORY_EXPLORE' ||
        nextAct === 'AWAITING_OPEN' ||
        nextAct === 'PROLOGUE' ||
        nextAct === 'FIREWORKS_FINALE',
    );

    if (nextAct !== 'AWAITING_OPEN') {
      this.card.setHoveringSeal(false);
    }
    if (nextAct !== 'MEMORY_EXPLORE') {
      this.deck.setHoveredSlot(null);
    }
    if (nextAct === 'FIREWORKS_FINALE') {
      this.fireworks.setAutoLaunch(true);
      this.fireworks.launchAt(-3.2, 4.3, -6.2);
      this.scheduleTimer(() => {
        if (this.act === 'FIREWORKS_FINALE') {
          this.fireworks.launchAt(3.1, 4.9, -6.8);
        }
      }, 360);
    } else {
      this.fireworks.setAutoLaunch(false);
    }

    this.renderer.domElement.style.cursor =
      nextAct === 'MEMORY_EXPLORE' ? 'grab' : 'default';

    this.callbacks?.onActChange?.(nextAct);
  }

  private tick(now: number): void {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame((t) => this.tick(t));

    // Guarantee clean t=0 start on very first rAF frame after shader pre-compile
    let rawDt: number;
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = now;
      rawDt = 1 / 60;
    } else {
      rawDt = (now - this.lastFrameTime) * 0.001;
      this.lastFrameTime = now;
    }

    const dt = clamp(rawDt, 0.001, 1 / 30);
    this.totalElapsed += dt;
    this.actElapsed += dt;

    // Gentle FPS watchdog: trims pixel ratio one step if rolling FPS stays < 44 for > 1.5s
    this.updatePerformanceWatchdog(rawDt);

    // Idle time-sliced mosaic hydration ONLY after ENTRANCE settles (zero entrance jank!)
    if (this.act !== 'ENTRANCE' && !this.deck.isHydrated()) {
      this.deck.hydrateStep(3.5);
    }

    this.updateActChoreography(dt);
    this.updateAutoCruise(dt);

    // Dynamically calibrate bloom so pure white cardstock & photos stay razor-sharp while stars & fireworks glow
    const targetBloomStrength =
      this.act === 'PHOTO_FOCUS'
        ? 0.2
        : this.act === 'BLESSING_LETTER'
          ? 0.36
          : this.act === 'AWAITING_OPEN' ||
              this.act === 'OPENING' ||
              this.act === 'PROLOGUE' ||
              this.act === 'CLOSING_CARD'
            ? 0.4
            : this.act === 'FIREWORKS_FINALE'
              ? 0.54
              : 0.46;
    this.bloomPass.strength = damp(
      this.bloomPass.strength,
      targetBloomStrength,
      6.5,
      dt,
    );

    const backdropIntensity =
      this.act === 'FIREWORKS_FINALE'
        ? 1.18
        : this.act === 'BLESSING_LETTER'
          ? 0.92
          : 1.0;

    this.cameraRig.update(this.totalElapsed, dt);
    this.backdrop.update(this.totalElapsed, dt, backdropIntensity);
    this.entranceParticles.update(this.totalElapsed, dt);
    this.card.update(this.totalElapsed, dt);
    this.deck.update(this.totalElapsed, dt, this.camera, this.act);
    this.fireworks.update(this.totalElapsed, dt);

    this.composer.render();
  }

  private updatePerformanceWatchdog(rawDt: number): void {
    // Ignore background tab pause spikes and the initial hydration warmup window
    if (rawDt <= 0 || rawDt > 0.25 || this.totalElapsed < 4.0) return;

    if (this.dprTrimCooldown > 0) {
      this.dprTrimCooldown = Math.max(0, this.dprTrimCooldown - rawDt);
    }

    this.fpsSampleTime += rawDt;
    this.fpsSampleFrames += 1;

    if (this.fpsSampleTime >= 0.5) {
      const fps = this.fpsSampleFrames / this.fpsSampleTime;
      // Only treat sustained <24 fps as genuine overload so 30fps mobile/WeChat
      // power-saving modes never get downgraded into blurry low-DPR rendering.
      if (fps < 24) {
        this.lowFpsDuration += this.fpsSampleTime;
      } else {
        this.lowFpsDuration = 0;
      }

      const nativeDpr = window.devicePixelRatio || 1;
      const minPixelRatio =
        nativeDpr >= 2
          ? Math.min(this.maxPixelRatio, 1.75)
          : Math.min(this.maxPixelRatio, 1.25);

      if (
        this.lowFpsDuration > 2.5 &&
        this.dprTrimCooldown <= 0 &&
        this.currentPixelRatio > minPixelRatio
      ) {
        this.currentPixelRatio = Math.max(
          minPixelRatio,
          Number((this.currentPixelRatio - 0.25).toFixed(2)),
        );
        this.renderer.setPixelRatio(this.currentPixelRatio);
        this.composer.setPixelRatio(this.currentPixelRatio);
        this.lowFpsDuration = 0;
        this.dprTrimCooldown = 4.0;
      }

      this.fpsSampleTime = 0;
      this.fpsSampleFrames = 0;
    }
  }

  private updateActChoreography(dt: number): void {
    const motion = this.reducedMotion ? 0.25 : 1.0;
    const hearthY = -(this._layout.bounds.height * 0.54 + 1.05);

    switch (this.act) {
      case 'ENTRANCE': {
        const t = clamp(this.actElapsed / ENTRANCE_DURATION, 0, 1);
        const easedPos = easeOutCubic(t);
        const easedOpen = easeInOutCubic(clamp((t - 0.35) / 0.65, 0, 1));

        this.entranceParticles.setProgress(easeInOutCubic(t));

        this.cardPosCurrent.set(
          0,
          lerp(-0.55, 0.02, easedPos),
          lerp(-9.5, 0, easedPos),
        );
        this.cardRotCurrent.set(
          lerp(0.14, 0.0, easedPos),
          lerp(-0.38, 0.0, easedPos),
          0,
        );
        this.cardScaleCurrent = lerp(0.42, 1.0, easedPos);
        this.cardAlphaCurrent = clamp(t * 2.4, 0, 1);
        this.cardOpenCurrent = lerp(0, 0.22, easedOpen);

        this.applyCardTransform();

        if (t >= 1) {
          this.transitionTo('AWAITING_OPEN');
        }
        break;
      }

      case 'AWAITING_OPEN': {
        const floatY = Math.sin(this.totalElapsed * 1.35) * 0.09 * motion;
        const tiltY = Math.sin(this.totalElapsed * 0.72) * 0.055 * motion;
        const tiltX = Math.cos(this.totalElapsed * 0.85) * 0.025 * motion;

        this.cardPosCurrent.x = damp(this.cardPosCurrent.x, 0, 5, dt);
        this.cardPosCurrent.y = damp(this.cardPosCurrent.y, floatY, 5, dt);
        this.cardPosCurrent.z = damp(this.cardPosCurrent.z, 0, 5, dt);
        this.cardRotCurrent.x = damp(this.cardRotCurrent.x, tiltX, 5, dt);
        this.cardRotCurrent.y = damp(this.cardRotCurrent.y, tiltY, 5, dt);
        this.cardRotCurrent.z = damp(this.cardRotCurrent.z, 0, 5, dt);
        this.cardScaleCurrent = damp(this.cardScaleCurrent, 1.0, 5, dt);
        this.cardAlphaCurrent = damp(this.cardAlphaCurrent, 1.0, 5, dt);
        this.cardOpenCurrent = damp(this.cardOpenCurrent, 0.22, 6, dt);

        this.applyCardTransform();
        break;
      }

      case 'OPENING': {
        const t = clamp(this.actElapsed / OPENING_DURATION, 0, 1);
        const eased = easeInOutCubic(t);

        this.cardOpenCurrent = lerp(0.22, 1.0, eased);
        this.cardPosCurrent.set(0, lerp(0, 0.78, eased), lerp(0, 0.05, eased));
        this.cardRotCurrent.set(0, 0, 0);
        this.cardScaleCurrent = lerp(1.0, 0.85, eased);
        this.cardAlphaCurrent = 1;

        this.applyCardTransform();

        if (t >= 1) {
          this.callbacks?.onSfx?.('prologue');
          this.transitionTo('PROLOGUE');
        }
        break;
      }

      case 'PROLOGUE': {
        const floatY = 1.08 + Math.sin(this.totalElapsed * 1.05) * 0.05 * motion;
        const swayY = Math.sin(this.totalElapsed * 0.45) * 0.04 * motion;

        this.cardPosCurrent.x = damp(this.cardPosCurrent.x, 0, 4, dt);
        this.cardPosCurrent.y = damp(this.cardPosCurrent.y, floatY, 3.6, dt);
        this.cardPosCurrent.z = damp(this.cardPosCurrent.z, -0.15, 4, dt);
        this.cardRotCurrent.x = damp(this.cardRotCurrent.x, 0.04, 4, dt);
        this.cardRotCurrent.y = damp(this.cardRotCurrent.y, swayY, 4, dt);
        this.cardRotCurrent.z = damp(this.cardRotCurrent.z, 0, 4, dt);
        this.cardScaleCurrent = damp(this.cardScaleCurrent, 0.82, 4, dt);
        this.cardAlphaCurrent = damp(this.cardAlphaCurrent, 1.0, 4, dt);
        this.cardOpenCurrent = damp(this.cardOpenCurrent, 1.0, 5, dt);

        this.applyCardTransform();
        break;
      }

      case 'CONSTELLATION_FORM': {
        const t = clamp(this.actElapsed / CONSTELLATION_DURATION, 0, 1);

        this.cardPosCurrent.x = damp(this.cardPosCurrent.x, 0, 3.6, dt);
        this.cardPosCurrent.y = damp(this.cardPosCurrent.y, hearthY, 3.2, dt);
        this.cardPosCurrent.z = damp(this.cardPosCurrent.z, -0.45, 3.2, dt);
        this.cardScaleCurrent = damp(this.cardScaleCurrent, 0.44, 3.2, dt);
        this.cardAlphaCurrent = damp(this.cardAlphaCurrent, 0.34, 3.2, dt);
        this.cardOpenCurrent = damp(this.cardOpenCurrent, 1.0, 4, dt);

        this.applyCardTransform();

        if (t >= 1) {
          this.transitionTo('MEMORY_EXPLORE');
          this.emitMemoryProgress();
        }
        break;
      }

      case 'MEMORY_EXPLORE':
      case 'PHOTO_FOCUS': {
        const targetAlpha = this.act === 'PHOTO_FOCUS' ? 0.14 : 0.3;
        const floatY = hearthY + Math.sin(this.totalElapsed * 0.85) * 0.04 * motion;

        this.cardPosCurrent.x = damp(this.cardPosCurrent.x, 0, 3.2, dt);
        this.cardPosCurrent.y = damp(this.cardPosCurrent.y, floatY, 3.2, dt);
        this.cardPosCurrent.z = damp(this.cardPosCurrent.z, -0.45, 3.2, dt);
        this.cardRotCurrent.x = damp(this.cardRotCurrent.x, 0.04, 3.2, dt);
        this.cardRotCurrent.y = damp(
          this.cardRotCurrent.y,
          Math.sin(this.totalElapsed * 0.35) * 0.06 * motion,
          3.2,
          dt,
        );
        this.cardScaleCurrent = damp(this.cardScaleCurrent, 0.42, 3.2, dt);
        this.cardAlphaCurrent = damp(this.cardAlphaCurrent, targetAlpha, 4.0, dt);
        this.cardOpenCurrent = damp(this.cardOpenCurrent, 1.0, 4, dt);

        this.applyCardTransform();
        break;
      }

      case 'BLESSING_LETTER': {
        const floatY = -2.25 + Math.sin(this.totalElapsed * 0.8) * 0.05 * motion;

        this.cardPosCurrent.x = damp(this.cardPosCurrent.x, 0, 3.4, dt);
        this.cardPosCurrent.y = damp(this.cardPosCurrent.y, floatY, 3.2, dt);
        this.cardPosCurrent.z = damp(this.cardPosCurrent.z, 1.35, 3.2, dt);
        this.cardRotCurrent.x = damp(this.cardRotCurrent.x, 0.06, 3.4, dt);
        this.cardRotCurrent.y = damp(
          this.cardRotCurrent.y,
          Math.sin(this.totalElapsed * 0.3) * 0.05 * motion,
          3.4,
          dt,
        );
        this.cardRotCurrent.z = damp(this.cardRotCurrent.z, 0, 3.4, dt);
        this.cardScaleCurrent = damp(this.cardScaleCurrent, 0.72, 3.2, dt);
        this.cardAlphaCurrent = damp(this.cardAlphaCurrent, 0.82, 3.6, dt);
        this.cardOpenCurrent = damp(this.cardOpenCurrent, 1.0, 4.2, dt);

        this.applyCardTransform();
        break;
      }

      case 'CLOSING_CARD': {
        const t = clamp(this.actElapsed / CLOSING_DURATION, 0, 1);
        const eased = easeInOutCubic(t);

        // Glide visibly front-and-center and physically fold crisp white card shut (1.0 -> 0.0)
        // Cake cleanly shrinks & disappears over [0.90 -> 0.56] inside PopupBookCard before leaves meet!
        this.cardPosCurrent.x = damp(this.cardPosCurrent.x, 0, 5.2, dt);
        this.cardPosCurrent.y = damp(this.cardPosCurrent.y, -0.18, 4.5, dt);
        this.cardPosCurrent.z = damp(this.cardPosCurrent.z, 0.15, 4.5, dt);
        this.cardRotCurrent.x = damp(this.cardRotCurrent.x, 0.01, 5.2, dt);
        this.cardRotCurrent.y = damp(this.cardRotCurrent.y, 0, 5.2, dt);
        this.cardRotCurrent.z = damp(this.cardRotCurrent.z, 0, 5.2, dt);
        this.cardScaleCurrent = damp(this.cardScaleCurrent, 0.96, 4.6, dt);
        this.cardAlphaCurrent = damp(this.cardAlphaCurrent, 1.0, 6.0, dt);
        this.cardOpenCurrent = lerp(1.0, 0.0, eased);

        if (!this.sealRestoredThisClose && t >= 0.72) {
          this.sealRestoredThisClose = true;
          this.card.triggerSealRestore();
          const sealPos = this.card.getSealWorldPosition(this.tmpVecA);
          this.fireworks.burstAt(sealPos.x, sealPos.y, sealPos.z, 0xffd27d);
        }

        this.applyCardTransform();

        if (t >= 1) {
          this.transitionTo('FIREWORKS_FINALE');
        }
        break;
      }

      case 'FIREWORKS_FINALE': {
        const floatY = -1.24 + Math.sin(this.totalElapsed * 1.1) * 0.07 * motion;
        const swayY = Math.sin(this.totalElapsed * 0.42) * 0.11 * motion;
        const swayX = -0.06 + Math.cos(this.totalElapsed * 0.36) * 0.025 * motion;

        this.cardPosCurrent.x = damp(this.cardPosCurrent.x, 0, 3.2, dt);
        this.cardPosCurrent.y = damp(this.cardPosCurrent.y, floatY, 3.0, dt);
        this.cardPosCurrent.z = damp(this.cardPosCurrent.z, 0.1, 3.0, dt);
        this.cardRotCurrent.x = damp(this.cardRotCurrent.x, swayX, 3.2, dt);
        this.cardRotCurrent.y = damp(this.cardRotCurrent.y, swayY, 3.2, dt);
        this.cardRotCurrent.z = damp(this.cardRotCurrent.z, 0, 3.2, dt);
        this.cardScaleCurrent = damp(this.cardScaleCurrent, 0.84, 3.0, dt);
        this.cardAlphaCurrent = damp(this.cardAlphaCurrent, 1.0, 4.0, dt);
        this.cardOpenCurrent = damp(this.cardOpenCurrent, 0.0, 6.0, dt);

        this.applyCardTransform();
        break;
      }
    }
  }

  private updateAutoCruise(dt: number): void {
    if (!this.autoCruiseEnabled) return;
    if (this.act !== 'MEMORY_EXPLORE' && this.act !== 'PHOTO_FOCUS') return;

    this.cruiseTimer -= dt;
    if (this.cruiseTimer > 0) return;

    if (this.act === 'MEMORY_EXPLORE') {
      let next = this.deck.getNextGuidedSlot();
      if (!next) {
        const memorySlots = this._layout.slots
          .filter((s) => s.kind === 'memory' && s.memory)
          .sort((a, b) => (a.memoryOrder ?? a.index) - (b.memoryOrder ?? b.index));
        if (memorySlots.length === 0) {
          this.autoCruiseEnabled = false;
          this.cruiseStage = 'idle';
          return;
        }
        next = memorySlots[this.cruiseReplayIndex % memorySlots.length];
        this.cruiseReplayIndex += 1;
      }
      this.deck.focusSlotByIndex(next.index, this.camera);
      this.transitionTo('PHOTO_FOCUS');
      this.cruiseStage = 'front';
      this.cruiseTimer = 2.35;
      return;
    }

    if (this.act === 'PHOTO_FOCUS') {
      if (this.cruiseStage === 'front') {
        this.deck.flipFocusedCard();
        this.cruiseStage = 'back';
        this.cruiseTimer = 3.5;
      } else {
        this.deck.closeFocusedCard();
        this.transitionTo('MEMORY_EXPLORE');
        this.cruiseStage = 'idle';
        this.cruiseTimer = 1.05;
      }
    }
  }

  private applyCardTransform(): void {
    this.card.group.position.copy(this.cardPosCurrent);
    this.card.group.rotation.copy(this.cardRotCurrent);
    this.card.group.scale.setScalar(this.cardScaleCurrent);
    this.card.setOpenAmount(this.cardOpenCurrent);
    this.card.setCardVisibility(this.cardAlphaCurrent);
  }

  private handleMemoryLit(
    memoryId: string,
    litCount: number,
    totalMemories: number,
  ): void {
    this.callbacks?.onSfx?.('lit');
    this.emitMemoryProgress();

    const slot = this._layout.slots.find(
      (s) => s.kind === 'memory' && s.memory?.id === memoryId,
    );
    if (slot) {
      this.scheduleTimer(() => {
        if (this.disposed) return;
        const pos = this.deck.getSlotWorldPosition(slot.index, this.tmpVecB);
        if (pos) {
          this.fireworks.burstAt(pos.x, pos.y, pos.z + 0.25, 0xffbe5c);
        }
      }, 360);
    }

    if (
      totalMemories > 0 &&
      litCount >= totalMemories &&
      !this.celebrationTriggered
    ) {
      this.celebrationTriggered = true;
      this.autoCruiseEnabled = false;
      this.cruiseStage = 'idle';

      this.scheduleTimer(() => {
        if (this.disposed) return;
        if (this.act !== 'MEMORY_EXPLORE') return;

        this.deck.triggerCelebrationWave();
        this.callbacks?.onSfx?.('wave');

        const halfW = this._layout.bounds.width * 0.36;
        const halfH = this._layout.bounds.height * 0.34;
        this.fireworks.burstAt(-halfW, halfH, 0.6, 0xf3d38c);
        this.fireworks.burstAt(halfW, halfH * 0.85, 0.6, 0xffb85c);
        this.fireworks.burstAt(0, halfH * 1.15, 0.8, 0xf5f2eb);

        this.scheduleTimer(() => {
          if (this.disposed) return;
          if (this.act === 'MEMORY_EXPLORE') {
            this.transitionTo('BLESSING_LETTER');
          }
        }, 1150);
      }, 540);
    }
  }

  private emitMemoryProgress(): void {
    const litCount = this.deck.getLitCount();
    const total = this.deck.totalMemories;
    const litIds = Array.from(this.deck.getLitIds());
    const nextMemoryId = this.deck.getNextGuidedSlot()?.memory?.id ?? null;
    this.callbacks?.onMemoryProgress?.(litCount, total, litIds, nextMemoryId);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointerActive = true;
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;

    if (this.act === 'MEMORY_EXPLORE') {
      this.renderer.domElement.style.cursor = 'grabbing';
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    this.updateRaycasterFromClient(e.clientX, e.clientY);
    this.deck.setPointerNdc(this.pointerNdc.x, this.pointerNdc.y);

    if (this.act === 'AWAITING_OPEN') {
      const hits = this.raycaster.intersectObjects(
        this.card.getInteractiveMeshes(),
        false,
      );
      const hovering = hits.length > 0;
      this.card.setHoveringSeal(hovering);
      this.renderer.domElement.style.cursor = hovering ? 'pointer' : 'default';
      this.maybeTriggerHoverSfx(hovering ? 'seal' : null);
      return;
    }

    if (this.act === 'PROLOGUE') {
      const cakeHits = this.raycaster.intersectObjects(
        this.card.getCakeInteractiveMeshes(),
        false,
      );
      const hoveringCake = cakeHits.length > 0;
      this.renderer.domElement.style.cursor = hoveringCake ? 'pointer' : 'default';
      this.maybeTriggerHoverSfx(hoveringCake ? 'cake' : null);
      return;
    }

    if (this.act === 'MEMORY_EXPLORE') {
      if (this.pointerActive) return;
      const slot = this.deck.raycast(this.raycaster);
      this.deck.setHoveredSlot(slot ? slot.index : null);
      this.renderer.domElement.style.cursor = slot ? 'pointer' : 'grab';
      this.maybeTriggerHoverSfx(slot ? `slot-${slot.index}` : null);
      return;
    }

    if (this.act === 'PHOTO_FOCUS') {
      const slot = this.deck.raycast(this.raycaster);
      this.renderer.domElement.style.cursor = slot ? 'pointer' : 'default';
      return;
    }

    if (this.act === 'FIREWORKS_FINALE') {
      this.renderer.domElement.style.cursor = 'crosshair';
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.pointerActive) return;
    this.pointerActive = false;

    const moveDist = Math.hypot(
      e.clientX - this.pointerDownX,
      e.clientY - this.pointerDownY,
    );

    if (this.act === 'MEMORY_EXPLORE') {
      this.renderer.domElement.style.cursor = 'grab';
    }

    // Ignore drags so camera orbiting never accidentally selects a card
    if (moveDist > CLICK_DRAG_THRESHOLD_PX) return;

    this.updateRaycasterFromClient(e.clientX, e.clientY);

    if (this.act === 'AWAITING_OPEN') {
      const hits = this.raycaster.intersectObjects(
        this.card.getInteractiveMeshes(),
        false,
      );
      if (hits.length > 0) {
        this.openCard();
      }
      return;
    }

    if (this.act === 'PROLOGUE') {
      const cakeHits = this.raycaster.intersectObjects(
        this.card.getCakeInteractiveMeshes(),
        false,
      );
      if (cakeHits.length > 0) {
        this.card.triggerCakeWishPulse();
        const candlePos = this.card.getCandleWorldPosition(this.tmpVecA);
        this.fireworks.burstAt(candlePos.x, candlePos.y + 0.14, candlePos.z, 0xffd078);
        this.callbacks?.onSfx?.('lit');
      }
      return;
    }

    if (this.act === 'MEMORY_EXPLORE') {
      const hitSlot = this.deck.raycast(this.raycaster);
      if (hitSlot) {
        this.autoCruiseEnabled = false;
        this.cruiseStage = 'idle';
        this.deck.focusSlotByIndex(hitSlot.index, this.camera);
        this.transitionTo('PHOTO_FOCUS');
      }
      return;
    }

    if (this.act === 'PHOTO_FOCUS') {
      this.autoCruiseEnabled = false;
      this.cruiseStage = 'idle';
      const hitFocused = this.deck.raycast(this.raycaster);
      if (hitFocused) {
        this.flipFocusedCard();
      } else {
        this.closeFocusedCard();
      }
      return;
    }

    if (this.act === 'FIREWORKS_FINALE') {
      this.launchFireworkAtScreen(e.clientX, e.clientY);
    }
  }

  private updateRaycasterFromClient(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
  }

  private maybeTriggerHoverSfx(targetKey: string | null): void {
    if (targetKey === this.lastHoverTargetKey) return;
    this.lastHoverTargetKey = targetKey;
    if (!targetKey) return;

    if (this.totalElapsed - this.lastHoverSfxTime > 0.14) {
      this.lastHoverSfxTime = this.totalElapsed;
      this.callbacks?.onSfx?.('hover');
    }
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.maxPixelRatio = computeAdaptiveMaxDpr();
    this.currentPixelRatio = Math.min(this.currentPixelRatio, this.maxPixelRatio);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(this.currentPixelRatio);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(
      Math.max(1, Math.floor(width * this.bloomResolutionScale)),
      Math.max(1, Math.floor(height * this.bloomResolutionScale)),
    );

    this.cameraRig.onResize(width / height);
  }

  private scheduleTimer(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.activeTimers.delete(id);
      fn();
    }, ms);
    this.activeTimers.add(id);
  }

  private clearTimers(): void {
    for (const id of this.activeTimers) {
      window.clearTimeout(id);
    }
    this.activeTimers.clear();
  }
}
