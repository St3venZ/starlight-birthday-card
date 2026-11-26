import * as THREE from 'three';
import type {
  MosaicLayoutResult,
  MosaicSlot,
  PresetCardMeta,
  SceneAct,
} from '../../config/types';
import {
  createMemoryBackCanvas,
  createMemoryFallbackCanvas,
  createPresetArtCanvas,
  createPresetBackCanvas,
} from '../artwork/proceduralArt';
import { clamp, damp, easeInOutCubic, easeOutCubic } from '../utils/math';

export interface CardDeckCallbacks {
  onMemoryLit?: (memoryId: string, litCount: number, totalMemories: number) => void;
  onFocusChange?: (slot: MosaicSlot | null, flipped: boolean) => void;
  onCardClickSfx?: (kind: 'memory' | 'preset') => void;
  onCardFlipSfx?: () => void;
}

interface CardEntry {
  slot: MosaicSlot;
  root: THREE.Group;
  hitMesh: THREE.Mesh;
  frontMat: THREE.MeshBasicMaterial;
  backMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  frameMat: THREE.MeshBasicMaterial;
  frontTex: THREE.CanvasTexture;
  backTex: THREE.CanvasTexture;
  sharesPresetTex: boolean;
  hasRealImage: boolean;
  /** Decorative slot with no photo: never interactive, always dimmed identically. */
  isFiller: boolean;
  homePos: THREE.Vector3;
  homeQuat: THREE.Quaternion;
  assemblyStart: THREE.Vector3;
  assemblyCtrl: THREE.Vector3;
  assemblyDelay: number;
  assemblyDuration: number;
  disperseDrift: THREE.Vector3;
  disperseSpin: THREE.Vector3;
  phase: number;
  focusBlend: number;
  flipAngle: number;
  hoverBlend: number;
  litFlash: number;
  currentPos: THREE.Vector3;
  currentQuat: THREE.Quaternion;
  currentScale: number;
  currentAlpha: number;
}

type DeckMode = 'hidden' | 'assembling' | 'visible' | 'dispersing';

const FILAMENT_COUNT = 46;

function createRoundedFrameGeometry(
  width: number,
  height: number,
  border: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(width, height) * 0.045;

  const outer = new THREE.Shape();
  outer.moveTo(-hw + r, -hh);
  outer.lineTo(hw - r, -hh);
  outer.quadraticCurveTo(hw, -hh, hw, -hh + r);
  outer.lineTo(hw, hh - r);
  outer.quadraticCurveTo(hw, hh, hw - r, hh);
  outer.lineTo(-hw + r, hh);
  outer.quadraticCurveTo(-hw, hh, -hw, hh - r);
  outer.lineTo(-hw, -hh + r);
  outer.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const ihw = hw - border;
  const ihh = hh - border;
  const hole = new THREE.Path();
  hole.moveTo(-ihw, -ihh);
  hole.lineTo(-ihw, ihh);
  hole.lineTo(ihw, ihh);
  hole.lineTo(ihw, -ihh);
  hole.closePath();
  outer.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.0025,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -depth * 0.5);
  return geo;
}

function createSoftHaloMaterial(colorHex: number, hdrBoost = 1.0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uHdrBoost: { value: hdrBoost },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uHdrBoost;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float d = length(p);
        float glow = pow(max(0.0, 1.0 - d), 2.4);
        float ring = exp(-pow((d - 0.68) * 9.5, 2.0)) * 0.42;
        float pulse = 0.90 + 0.10 * sin(uTime * 2.6);
        float a = (glow * 0.46 + ring) * uOpacity * pulse;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * uHdrBoost, a);
      }
    `,
  });
}

function createFilamentMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(aSize * uPixelRatio * (155.0 / max(1.0, -mvPosition.z)), 1.5, 18.0 * uPixelRatio);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c) * 2.0;
        float core = exp(-d * d * 5.0);
        float halo = pow(max(0.0, 1.0 - d), 2.4) * 0.42;
        float a = (core + halo) * vAlpha * uOpacity;
        if (a < 0.004) discard;
        vec3 col = mix(vec3(1.12, 0.88, 0.42), vec3(1.32, 1.16, 0.78), core);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

function drawCoverPhotoCanvas(
  source: HTMLImageElement | ImageBitmap,
  width = 768,
  height = 1024,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, width, height);

  const naturalW = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const naturalH = 'naturalHeight' in source ? source.naturalHeight : source.height;

  // Center-crop ("cover") so user photos never stretch or distort
  const srcRatio = naturalW / Math.max(1, naturalH);
  const dstRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = naturalW;
  let sh = naturalH;

  if (srcRatio > dstRatio) {
    sw = naturalH * dstRatio;
    sx = (naturalW - sw) * 0.5;
  } else {
    sh = naturalW / dstRatio;
    sy = (naturalH - sh) * 0.5;
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);

  // Ultra-subtle edge polish so user photos read crisp like clean warm-white prints
  const rad = Math.max(width, height) * 0.78;
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    rad * 0.62,
    width * 0.5,
    height * 0.5,
    rad,
  );
  vignette.addColorStop(0, 'rgba(20, 18, 16, 0)');
  vignette.addColorStop(1, 'rgba(20, 18, 16, 0.14)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // Crisp subtle warm-white inner print hairline
  ctx.strokeStyle = 'rgba(250, 248, 244, 0.42)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  return canvas;
}

export class MemoryCardDeck {
  readonly group = new THREE.Group();
  readonly layout: MosaicLayoutResult;
  readonly totalMemories: number;

  private readonly callbacks?: CardDeckCallbacks;
  private readonly entries: CardEntry[] = [];
  private readonly entryBySlotIndex = new Map<number, CardEntry>();
  private readonly memorySlotsOrdered: MosaicSlot[] = [];
  private readonly litIds = new Set<string>();
  private readonly hitMeshes: THREE.Object3D[] = [];

  // Shared card geometries & hit material
  private readonly cardThickness = 0.022;
  private readonly bodyGeo: THREE.BoxGeometry;
  private readonly faceGeo: THREE.PlaneGeometry;
  private readonly frameGeo: THREE.ExtrudeGeometry;
  private readonly hitGeo: THREE.BoxGeometry;
  private readonly hitMat: THREE.MeshBasicMaterial;
  private readonly sharedGeometries: THREE.BufferGeometry[] = [];
  private readonly extraMaterials: THREE.Material[] = [];

  // Shared Preset Texture Pool (max 16 textures total for 8 system presets instead of 44+ duplicates)
  private readonly sharedPresetFrontTex = new Map<string, THREE.CanvasTexture>();
  private readonly sharedPresetBackTex = new Map<string, THREE.CanvasTexture>();
  private readonly presetImageFetched = new Set<string>();
  private readonly ownedTextures = new Set<THREE.CanvasTexture>();

  // Deferred time-sliced hydration cursor
  private nextHydrateIdx = 0;
  private hydrated = false;

  // Guided halo & filament
  private readonly guidedHaloGroup = new THREE.Group();
  private readonly guidedOuterRingMat: THREE.MeshBasicMaterial;
  private readonly guidedInnerRingMat: THREE.MeshBasicMaterial;
  private readonly guidedAuraMat: THREE.ShaderMaterial;
  private readonly filamentPoints: THREE.Points;
  private readonly filamentPositions: Float32Array;
  private readonly filamentSizes: Float32Array;
  private readonly filamentAlphas: Float32Array;
  private readonly filamentMat: THREE.ShaderMaterial;
  private readonly filamentCurve = new THREE.QuadraticBezierCurve3();
  private readonly lastLitPos = new THREE.Vector3();
  private hasLastLit = false;
  private guideVisibility = 0;

  // Focus backing halo & subtle rim light
  private readonly focusGlowGroup = new THREE.Group();
  private readonly focusHaloMat: THREE.ShaderMaterial;
  private readonly focusLight: THREE.PointLight;
  private focusGlowAlpha = 0;

  // Delicate golden constellation threads connecting already-lit memories
  private readonly constellationLines: THREE.LineSegments;
  private readonly constellationMat: THREE.LineBasicMaterial;
  private readonly constellationPositions: Float32Array;
  private constellationVisibility = 0;

  // Subtle pointer-driven micro-tilt when inspecting focused card
  private readonly reducedMotion: boolean;
  private pointerTiltX = 0;
  private pointerTiltY = 0;
  private smoothTiltX = 0;
  private smoothTiltY = 0;

  // Deck state
  private mode: DeckMode = 'hidden';
  private assemblyElapsed = 0;
  private disperseElapsed = 0;
  private fadeInElapsed = 0;
  private fadeInActive = false;

  private focusedIndex: number | null = null;
  private focusedFlipped = false;
  private hoveredIndex: number | null = null;

  private waveActive = false;
  private waveElapsed = 0;
  private disposed = false;

  // Scratch math helpers (zero per-frame GC allocations)
  private readonly tmpVecA = new THREE.Vector3();
  private readonly tmpVecB = new THREE.Vector3();
  private readonly tmpVecC = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpQuatA = new THREE.Quaternion();
  private readonly tmpQuatB = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpColor = new THREE.Color();

  // Slim warm-white Polaroid/cardstock frame palette (strictly below 0.92 bloom threshold except guided/wave)
  private readonly colPresetIdle = new THREE.Color(0xdad5cc);
  private readonly colMemoryUnlit = new THREE.Color(0xe7e3db);
  private readonly colMemoryLit = new THREE.Color(0xf0e0ba);
  private readonly colGuided = new THREE.Color(1.04, 0.88, 0.54);
  private readonly colHover = new THREE.Color(0xf4e5c4);
  private readonly colFocused = new THREE.Color(0xe0dcd4);
  private readonly colWavePeak = new THREE.Color(1.22, 1.04, 0.62);

  constructor(layout: MosaicLayoutResult, callbacks?: CardDeckCallbacks) {
    this.layout = layout;
    this.callbacks = callbacks;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.group.name = 'MemoryCardDeck';
    this.group.visible = false;

    const w = layout.cardWidth;
    const h = layout.cardHeight;
    const thickness = this.cardThickness;
    const border = Math.min(w, h) * 0.028;

    this.bodyGeo = this.trackGeo(new THREE.BoxGeometry(w * 0.98, h * 0.98, thickness));
    this.faceGeo = this.trackGeo(
      new THREE.PlaneGeometry(w - border * 1.9, h - border * 1.9),
    );
    this.frameGeo = this.trackGeo(
      createRoundedFrameGeometry(w, h, border, thickness + 0.005),
    );
    this.hitGeo = this.trackGeo(new THREE.BoxGeometry(w * 1.06, h * 1.06, 0.14));

    this.hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.extraMaterials.push(this.hitMat);

    // Collect ordered user memories immediately (lightweight metadata only — zero canvas work!)
    for (const slot of layout.slots) {
      if (slot.kind === 'memory' && slot.memory) {
        this.memorySlotsOrdered.push(slot);
      }
    }
    this.memorySlotsOrdered.sort(
      (a, b) => (a.memoryOrder ?? a.index) - (b.memoryOrder ?? b.index),
    );
    this.totalMemories = this.memorySlotsOrdered.length;
    this.hydrated = layout.slots.length === 0;

    // ─── Guided Next-Memory Double Halo ──────────────────────────────
    const haloRadius = Math.max(w, h) * 0.63;
    const outerRingGeo = this.trackGeo(
      new THREE.RingGeometry(haloRadius * 1.02, haloRadius * 1.055, 56),
    );
    const innerRingGeo = this.trackGeo(
      new THREE.RingGeometry(haloRadius * 0.87, haloRadius * 0.892, 56),
    );
    const auraGeo = this.trackGeo(
      new THREE.PlaneGeometry(haloRadius * 2.75, haloRadius * 2.75),
    );

    this.guidedOuterRingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.06, 0.86, 0.46),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.guidedInnerRingMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.16, 0.96, 0.56),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.guidedAuraMat = createSoftHaloMaterial(0xf3c974, 1.02);
    this.extraMaterials.push(
      this.guidedOuterRingMat,
      this.guidedInnerRingMat,
      this.guidedAuraMat,
    );

    const outerHaloMesh = new THREE.Mesh(outerRingGeo, this.guidedOuterRingMat);
    const innerHaloMesh = new THREE.Mesh(innerRingGeo, this.guidedInnerRingMat);
    const auraMesh = new THREE.Mesh(auraGeo, this.guidedAuraMat);
    auraMesh.position.z = -0.06;
    outerHaloMesh.position.z = -0.045;
    innerHaloMesh.position.z = -0.032;

    this.guidedHaloGroup.add(auraMesh, outerHaloMesh, innerHaloMesh);
    this.guidedHaloGroup.visible = false;
    this.group.add(this.guidedHaloGroup);

    // ─── Guided 3D Shooting-Star Particle Filament ───────────────────
    this.filamentPositions = new Float32Array(FILAMENT_COUNT * 3);
    this.filamentSizes = new Float32Array(FILAMENT_COUNT);
    this.filamentAlphas = new Float32Array(FILAMENT_COUNT);

    const filamentGeo = this.trackGeo(new THREE.BufferGeometry());
    filamentGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.filamentPositions, 3),
    );
    filamentGeo.setAttribute('aSize', new THREE.BufferAttribute(this.filamentSizes, 1));
    filamentGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.filamentAlphas, 1));

    this.filamentMat = createFilamentMaterial();
    this.extraMaterials.push(this.filamentMat);
    this.filamentPoints = new THREE.Points(filamentGeo, this.filamentMat);
    this.filamentPoints.frustumCulled = false;
    this.filamentPoints.visible = false;
    this.group.add(this.filamentPoints);

    // ─── Delicate Constellation Threads Linking Lit Memories ─────────
    const maxSegments = Math.max(1, this.totalMemories - 1);
    this.constellationPositions = new Float32Array(maxSegments * 2 * 3);
    const constellationGeo = this.trackGeo(new THREE.BufferGeometry());
    constellationGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.constellationPositions, 3),
    );
    constellationGeo.setDrawRange(0, 0);

    this.constellationMat = new THREE.LineBasicMaterial({
      color: 0xf3d38c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.extraMaterials.push(this.constellationMat);
    this.constellationLines = new THREE.LineSegments(
      constellationGeo,
      this.constellationMat,
    );
    this.constellationLines.frustumCulled = false;
    this.constellationLines.visible = false;
    this.group.add(this.constellationLines);

    // ─── Focused Card Subtle Non-HDR Backing Halo & Rim Light ────────
    this.focusHaloMat = createSoftHaloMaterial(0xeee7da, 0.72);
    this.extraMaterials.push(this.focusHaloMat);
    const focusHaloGeo = this.trackGeo(new THREE.PlaneGeometry(w * 2.0, h * 1.75));
    const focusHaloMesh = new THREE.Mesh(focusHaloGeo, this.focusHaloMat);
    this.focusGlowGroup.add(focusHaloMesh);

    this.focusLight = new THREE.PointLight(0xfff1d6, 0, 4.0, 2.0);
    this.focusLight.position.set(0, 0.2, 0.75);
    this.focusGlowGroup.add(this.focusLight);
    this.focusGlowGroup.visible = false;
    this.group.add(this.focusGlowGroup);
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  /**
   * Time-sliced background hydration (default <= 3.5ms per frame) so the opening
   * entrance animation runs at locked 60FPS with zero synchronous canvas freeze.
   */
  hydrateStep(budgetMs = 3.5): boolean {
    if (this.hydrated || this.disposed) return true;

    const start = performance.now();
    const total = this.layout.slots.length;
    while (this.nextHydrateIdx < total) {
      this.hydrateSlot(this.nextHydrateIdx);
      this.nextHydrateIdx += 1;
      if (performance.now() - start >= budgetMs) {
        break;
      }
    }

    if (this.nextHydrateIdx >= total) {
      this.hydrated = true;
    }
    return this.hydrated;
  }

  /**
   * Immediately completes any remaining card hydration (used when jumping
   * straight into the memory mosaic or live Studio preview).
   */
  hydrateAllNow(): void {
    if (this.hydrated || this.disposed) return;
    const total = this.layout.slots.length;
    while (this.nextHydrateIdx < total) {
      this.hydrateSlot(this.nextHydrateIdx);
      this.nextHydrateIdx += 1;
    }
    this.hydrated = true;
  }

  /**
   * In-place content refresh for live Studio editing.
   *
   * Called when the layout identity is unchanged (same slots, same photo order)
   * but the *copy* changed — caption, back-of-card message, template, title or
   * date. Only the affected canvas textures are repainted, so typing stays
   * smooth instead of reallocating every card and its GPU upload.
   *
   * Must be handed a layout whose slot order matches `this.layout`; the caller
   * (`SceneApp.deckMatchesLayout`) guarantees that.
   */
  applyConfig(next: MosaicLayoutResult): void {
    if (this.disposed) return;

    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      const slot = next.slots[i];
      if (!slot) continue;

      if (slot.kind === 'memory' && slot.memory) {
        // A real uploaded photo already replaced the procedural artwork on the
        // front face; repainting the front would silently drop it.
        if (!entry.hasRealImage) {
          const frontCanvas = createMemoryFallbackCanvas(
            slot.memory,
            slot.memoryOrder ?? slot.index,
            512,
            680,
          );
          this.repaintEntryTexture(entry, 'front', frontCanvas);
        }
        const backCanvas = createMemoryBackCanvas(slot.memory, 640, 860);
        this.repaintEntryTexture(entry, 'back', backCanvas);
      }

      entry.slot = slot;
    }
  }

  /** Swaps a card-face canvas texture in place and disposes the previous one. */
  private repaintEntryTexture(
    entry: CardEntry,
    face: 'front' | 'back',
    canvas: HTMLCanvasElement,
  ): void {
    const previous = face === 'front' ? entry.frontTex : entry.backTex;
    if (entry.sharesPresetTex) return;

    const nextTex = this.createOwnedCanvasTex(canvas);
    if (face === 'front') {
      entry.frontTex = nextTex;
      entry.frontMat.map = nextTex;
      entry.frontMat.needsUpdate = true;
    } else {
      entry.backTex = nextTex;
      entry.backMat.map = nextTex;
      entry.backMat.needsUpdate = true;
    }

    this.ownedTextures.delete(previous);
    previous.dispose();
  }

  startAssembly(origin: THREE.Vector3): void {
    this.hydrateAllNow();
    this.mode = 'assembling';
    this.assemblyElapsed = 0;
    this.fadeInActive = false;
    this.group.visible = true;

    const localOrigin = this.group.worldToLocal(origin.clone());
    const spreadY = Math.max(2.0, this.layout.bounds.height * 0.45);

    for (const entry of this.entries) {
      entry.assemblyStart.copy(localOrigin);
      entry.assemblyStart.x += Math.sin(entry.phase) * 0.45;
      entry.assemblyStart.z += Math.cos(entry.phase) * 0.25;

      // Sweeping outward parabolic control arc
      const sideBias = entry.homePos.x >= 0 ? 1 : -1;
      entry.assemblyCtrl.set(
        (entry.assemblyStart.x + entry.homePos.x) * 0.5 +
          sideBias * (1.2 + Math.abs(entry.homePos.x) * 0.25),
        Math.max(entry.homePos.y, entry.assemblyStart.y) + spreadY * 0.35,
        entry.homePos.z + 1.85 + Math.cos(entry.phase) * 0.8,
      );

      entry.currentPos.copy(entry.assemblyStart);
      entry.currentScale = 0.06;
      entry.currentAlpha = 0;
      entry.focusBlend = 0;
      entry.flipAngle = 0;
      entry.root.position.copy(entry.currentPos);
      entry.root.scale.setScalar(entry.currentScale);
    }
  }

  hideAll(): void {
    this.mode = 'hidden';
    this.fadeInActive = false;
    this.focusedIndex = null;
    this.focusedFlipped = false;
    this.hoveredIndex = null;
    this.guideVisibility = 0;
    this.group.visible = false;
    this.guidedHaloGroup.visible = false;
    this.filamentPoints.visible = false;
    this.constellationLines.visible = false;
    this.focusGlowGroup.visible = false;
    for (const entry of this.entries) {
      entry.focusBlend = 0;
      entry.flipAngle = 0;
      entry.hoverBlend = 0;
      entry.currentAlpha = 0;
      entry.currentScale = 0.001;
    }
  }

  setVisibility(visible: boolean, immediate = false): void {
    if (visible) {
      this.hydrateAllNow();
      this.group.visible = true;
      if (immediate) {
        this.mode = 'visible';
        this.fadeInActive = false;
        for (const entry of this.entries) {
          entry.currentPos.copy(entry.homePos);
          entry.currentQuat.copy(entry.homeQuat);
          entry.currentScale = 1;
          entry.currentAlpha = 1;
          this.applyCardMaterials(entry, 1);
          entry.root.position.copy(entry.homePos);
          entry.root.quaternion.copy(entry.homeQuat);
          entry.root.scale.setScalar(1);
        }
      } else {
        this.mode = 'visible';
        this.fadeInActive = true;
        this.fadeInElapsed = 0;
      }
      return;
    }

    // Hiding / dispersing
    if (this.focusedIndex !== null) {
      this.focusedIndex = null;
      this.focusedFlipped = false;
      this.callbacks?.onFocusChange?.(null, false);
    }
    this.hoveredIndex = null;

    if (immediate) {
      this.hideAll();
    } else if (this.mode !== 'hidden') {
      this.mode = 'dispersing';
      this.disperseElapsed = 0;
      this.fadeInActive = false;
    }
  }

  getNextGuidedSlot(): MosaicSlot | null {
    for (const slot of this.memorySlotsOrdered) {
      if (slot.memory && !this.litIds.has(slot.memory.id)) {
        return slot;
      }
    }
    return null;
  }

  getLitCount(): number {
    return this.litIds.size;
  }

  getLitIds(): Set<string> {
    return new Set(this.litIds);
  }

  getSlotWorldPosition(
    slotIndex: number,
    target = new THREE.Vector3(),
  ): THREE.Vector3 | null {
    const entry = this.entryBySlotIndex.get(slotIndex);
    if (!entry) return null;
    this.group.updateWorldMatrix(true, false);
    return target.copy(entry.homePos).applyMatrix4(this.group.matrixWorld);
  }

  focusSlotByIndex(slotIndex: number, _camera: THREE.Camera): void {
    this.hydrateAllNow();
    const entry = this.entryBySlotIndex.get(slotIndex);
    if (!entry) return;

    // If switching directly from another focused card, mark the previous memory lit first
    if (this.focusedIndex !== null && this.focusedIndex !== slotIndex) {
      const prev = this.entryBySlotIndex.get(this.focusedIndex);
      if (prev) {
        this.markSlotLitIfUnlit(prev);
      }
    }

    this.focusedIndex = slotIndex;
    this.focusedFlipped = false;
    this.hoveredIndex = null;

    this.callbacks?.onCardClickSfx?.(entry.slot.kind);
    this.callbacks?.onFocusChange?.(entry.slot, false);
  }

  focusMemoryById(memoryId: string, camera: THREE.Camera): void {
    this.hydrateAllNow();
    const targetSlot = this.memorySlotsOrdered.find((s) => s.memory?.id === memoryId);
    if (!targetSlot) return;
    this.focusSlotByIndex(targetSlot.index, camera);
  }

  flipFocusedCard(): boolean {
    if (this.focusedIndex === null) return false;
    const entry = this.entryBySlotIndex.get(this.focusedIndex);
    if (!entry) return false;

    this.focusedFlipped = !this.focusedFlipped;
    this.callbacks?.onCardFlipSfx?.();
    this.callbacks?.onFocusChange?.(entry.slot, this.focusedFlipped);
    return true;
  }

  closeFocusedCard(): void {
    if (this.focusedIndex === null) return;
    const entry = this.entryBySlotIndex.get(this.focusedIndex);
    this.focusedIndex = null;
    this.focusedFlipped = false;

    this.callbacks?.onFocusChange?.(null, false);
    if (entry) {
      this.markSlotLitIfUnlit(entry);
    }
  }

  triggerCelebrationWave(): void {
    this.waveActive = true;
    this.waveElapsed = 0;
  }

  getFocusedSlot(): MosaicSlot | null {
    if (this.focusedIndex === null) return null;
    return this.entryBySlotIndex.get(this.focusedIndex)?.slot ?? null;
  }

  isFocusedFlipped(): boolean {
    return this.focusedIndex !== null && this.focusedFlipped;
  }

  raycast(raycaster: THREE.Raycaster): MosaicSlot | null {
    if (!this.group.visible || this.mode === 'hidden' || this.mode === 'dispersing') {
      return null;
    }

    if (this.focusedIndex !== null) {
      const focusedEntry = this.entryBySlotIndex.get(this.focusedIndex);
      if (!focusedEntry) return null;
      const hits = raycaster.intersectObject(focusedEntry.hitMesh, false);
      return hits.length > 0 ? focusedEntry.slot : null;
    }

    const hits = raycaster.intersectObjects(this.hitMeshes, false);
    // Placeholder cards are decorative: skip them so only real photos respond.
    const hit = hits.find((h) => {
      const idx = h.object.userData.slotIndex as number | undefined;
      if (idx === undefined) return false;
      return this.entryBySlotIndex.get(idx)?.slot.kind === 'memory';
    });
    if (!hit) return null;
    const slotIndex = hit.object.userData.slotIndex as number | undefined;
    if (slotIndex === undefined) return null;
    return this.entryBySlotIndex.get(slotIndex)?.slot ?? null;
  }

  setHoveredSlot(slotIndex: number | null): void {
    this.hoveredIndex = slotIndex;
  }

  setPointerNdc(ndcX: number, ndcY: number): void {
    this.pointerTiltX = clamp(ndcX, -1, 1);
    this.pointerTiltY = clamp(ndcY, -1, 1);
  }

  resetProgress(): void {
    this.litIds.clear();
    this.hasLastLit = false;
    this.focusedIndex = null;
    this.focusedFlipped = false;
    this.hoveredIndex = null;
    this.waveActive = false;
    this.waveElapsed = 0;
    for (const entry of this.entries) {
      entry.litFlash = 0;
      entry.focusBlend = 0;
      entry.flipAngle = 0;
      entry.hoverBlend = 0;
    }
  }

  update(elapsed: number, dt: number, camera: THREE.Camera, act: SceneAct): void {
    if (!this.group.visible || this.mode === 'hidden') return;

    const safeDt = Math.min(dt, 0.05);

    if (this.mode === 'assembling') {
      this.assemblyElapsed += safeDt;
      let allArrived = true;
      for (const entry of this.entries) {
        const rawT =
          (this.assemblyElapsed - entry.assemblyDelay) / entry.assemblyDuration;
        if (rawT < 1) allArrived = false;
        const t = clamp(rawT, 0, 1);
        const eased = easeOutCubic(t);

        // Quadratic Bezier sweep from open card hearth into 3D Age Number slot
        const inv = 1 - eased;
        entry.currentPos.set(
          inv * inv * entry.assemblyStart.x +
            2 * inv * eased * entry.assemblyCtrl.x +
            eased * eased * entry.homePos.x,
          inv * inv * entry.assemblyStart.y +
            2 * inv * eased * entry.assemblyCtrl.y +
            eased * eased * entry.homePos.y,
          inv * inv * entry.assemblyStart.z +
            2 * inv * eased * entry.assemblyCtrl.z +
            eased * eased * entry.homePos.z,
        );

        const swirlSpin = (1 - eased) * Math.PI * 1.15;
        this.tmpEuler.set(
          entry.slot.rotation.x + (1 - eased) * 0.4,
          entry.slot.rotation.y + swirlSpin,
          entry.slot.rotation.z + (1 - eased) * 0.25,
        );
        entry.currentQuat.setFromEuler(this.tmpEuler);
        entry.currentScale = 0.08 + 0.92 * eased;
        entry.currentAlpha = clamp(t * 2.2, 0, 1);

        entry.root.position.copy(entry.currentPos);
        entry.root.quaternion.copy(entry.currentQuat);
        entry.root.scale.setScalar(entry.currentScale);
        this.applyCardMaterials(entry, entry.currentAlpha);
      }

      if (allArrived) {
        this.mode = 'visible';
      }
      this.guidedHaloGroup.visible = false;
      this.filamentPoints.visible = false;
      this.constellationLines.visible = false;
      this.focusGlowGroup.visible = false;
      return;
    }

    if (this.mode === 'dispersing') {
      this.disperseElapsed += safeDt;
      const duration = 1.25;
      const t = clamp(this.disperseElapsed / duration, 0, 1);
      const eased = easeInOutCubic(t);

      for (const entry of this.entries) {
        entry.currentPos
          .copy(entry.homePos)
          .addScaledVector(entry.disperseDrift, eased);

        this.tmpEuler.set(
          entry.slot.rotation.x + entry.disperseSpin.x * eased,
          entry.slot.rotation.y + entry.disperseSpin.y * eased,
          entry.slot.rotation.z + entry.disperseSpin.z * eased,
        );
        entry.currentQuat.setFromEuler(this.tmpEuler);
        entry.currentScale = Math.max(0.001, 1 - eased * 0.72);
        entry.currentAlpha = Math.max(0, 1 - eased * 1.15);

        entry.root.position.copy(entry.currentPos);
        entry.root.quaternion.copy(entry.currentQuat);
        entry.root.scale.setScalar(entry.currentScale);
        this.applyCardMaterials(entry, entry.currentAlpha);
      }

      this.guidedHaloGroup.visible = false;
      this.filamentPoints.visible = false;
      this.constellationLines.visible = false;
      this.focusGlowGroup.visible = false;

      if (t >= 1) {
        this.hideAll();
      }
      return;
    }

    // Mode === 'visible'
    let globalAlpha = 1;
    if (this.fadeInActive) {
      this.fadeInElapsed += safeDt;
      const ft = clamp(this.fadeInElapsed / 0.85, 0, 1);
      globalAlpha = easeOutCubic(ft);
      if (ft >= 1) this.fadeInActive = false;
    }

    if (this.waveActive) {
      this.waveElapsed += safeDt;
      if (this.waveElapsed > 1.7) {
        this.waveActive = false;
      }
    }

    const guidedSlot = act === 'MEMORY_EXPLORE' ? this.getNextGuidedSlot() : null;
    const guidedSlotIdx = guidedSlot ? guidedSlot.index : -1;
    const isBlessingBackdrop = act === 'BLESSING_LETTER';

    const tiltMotion = this.reducedMotion ? 0.2 : 1.0;
    this.smoothTiltX = damp(this.smoothTiltX, this.pointerTiltX, 6.5, safeDt);
    this.smoothTiltY = damp(this.smoothTiltY, this.pointerTiltY, 6.5, safeDt);

    // Compute world focus pose cleanly relative to current camera lens
    const focusPosWorld = this.tmpVecA;
    let focusScale = 1.8;
    const hasFocus = this.focusedIndex !== null;

    if (hasFocus) {
      const fovDeg =
        camera instanceof THREE.PerspectiveCamera ? camera.fov : 42;
      const aspect =
        camera instanceof THREE.PerspectiveCamera ? camera.aspect : 16 / 9;
      const camDist = camera.position.length();
      const focusDist = clamp(camDist * 0.34, 3.1, 5.1);

      const visH = 2 * focusDist * Math.tan(THREE.MathUtils.degToRad(fovDeg) * 0.5);
      const visW = visH * aspect;
      const isPortrait = aspect < 0.85;

      // Leave clean vertical room below the focused 3D card for the photo caption & action bar
      const maxScaleByH = (visH * (isPortrait ? 0.44 : 0.49)) / this.layout.cardHeight;
      const maxScaleByW = (visW * (isPortrait ? 0.74 : 0.76)) / this.layout.cardWidth;
      focusScale = Math.min(maxScaleByH, maxScaleByW);

      this.tmpForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      this.tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

      focusPosWorld
        .copy(camera.position)
        .addScaledVector(this.tmpForward, focusDist)
        .addScaledVector(this.tmpUp, visH * (isPortrait ? 0.115 : 0.095));

      this.group.worldToLocal(focusPosWorld);
    }

    const halfW = Math.max(1, this.layout.bounds.width * 0.55);

    for (const entry of this.entries) {
      const isFocused = this.focusedIndex === entry.slot.index;
      const isHovered =
        this.hoveredIndex === entry.slot.index && !hasFocus && act === 'MEMORY_EXPLORE';
      const isGuided = guidedSlotIdx === entry.slot.index && !hasFocus;
      const isLit =
        entry.slot.kind === 'memory' &&
        entry.slot.memory !== undefined &&
        this.litIds.has(entry.slot.memory.id);

      entry.focusBlend = damp(entry.focusBlend, isFocused ? 1 : 0, 8.2, safeDt);
      entry.hoverBlend = damp(entry.hoverBlend, isHovered ? 1 : 0, 10.5, safeDt);

      const targetFlip = isFocused && this.focusedFlipped ? Math.PI : 0;
      entry.flipAngle = damp(entry.flipAngle, targetFlip, 7.2, safeDt);

      if (entry.litFlash > 0) {
        entry.litFlash = Math.max(0, entry.litFlash - safeDt * 1.35);
      }

      // Celebration wave impulse across the age number
      let waveImpulse = 0;
      if (this.waveActive) {
        const normX = (entry.homePos.x + halfW) / (halfW * 2);
        const waveCenter = this.waveElapsed / 1.15 - 0.1;
        const dist = Math.abs(normX - waveCenter);
        waveImpulse =
          Math.exp(-dist * dist * 24) * Math.max(0, 1 - this.waveElapsed / 1.65);
      }

      // Home floating pose with gentle organic breathing
      const haloDamp = entry.slot.isHalo ? 0.72 : 1.0;
      const floatY = Math.sin(elapsed * 0.92 + entry.phase) * 0.036 * haloDamp;
      const floatZ = Math.cos(elapsed * 0.74 + entry.phase) * 0.025 * haloDamp;
      const guidedLift = isGuided ? 0.12 + Math.sin(elapsed * 2.4) * 0.05 : 0;
      const hoverLift = entry.hoverBlend * 0.24;
      const waveLift = waveImpulse * 0.42;

      this.tmpVecB.set(
        entry.homePos.x,
        entry.homePos.y + floatY + waveImpulse * 0.12,
        entry.homePos.z + floatZ + guidedLift + hoverLift + waveLift,
      );

      if (entry.focusBlend > 0.002) {
        const flipArcZ = Math.sin(entry.flipAngle) * 0.28 * entry.focusBlend;
        this.tmpVecC.copy(focusPosWorld);
        if (flipArcZ > 0.001) {
          this.tmpVecC.addScaledVector(this.tmpForward, -flipArcZ);
        }

        entry.currentPos.lerpVectors(this.tmpVecB, this.tmpVecC, entry.focusBlend);

        // Camera-facing quaternion + smooth 180° Y flip + tactile collector-card micro-tilt
        const microTiltX = -this.smoothTiltY * 0.08 * tiltMotion;
        const microTiltY = this.smoothTiltX * 0.095 * tiltMotion;
        this.tmpEuler.set(
          Math.sin(elapsed * 0.95) * 0.015 * tiltMotion + microTiltX,
          entry.flipAngle + Math.cos(elapsed * 0.72) * 0.018 * tiltMotion + microTiltY,
          0,
        );
        this.tmpQuatB.setFromEuler(this.tmpEuler);
        this.tmpQuatA.copy(camera.quaternion).multiply(this.tmpQuatB);
        entry.currentQuat.copy(entry.homeQuat).slerp(this.tmpQuatA, entry.focusBlend);

        const homeScale = 1 + entry.hoverBlend * 0.09 + waveImpulse * 0.12;
        entry.currentScale = homeScale + (focusScale - homeScale) * entry.focusBlend;
      } else {
        entry.currentPos.copy(this.tmpVecB);
        entry.currentQuat.copy(entry.homeQuat);
        const homeScale =
          1 +
          entry.hoverBlend * 0.09 +
          (isGuided ? 0.04 + Math.sin(elapsed * 2.4) * 0.02 : 0) +
          waveImpulse * 0.13;
        entry.currentScale = homeScale;
      }

      entry.root.position.copy(entry.currentPos);
      entry.root.quaternion.copy(entry.currentQuat);
      entry.root.scale.setScalar(entry.currentScale * Math.max(0.01, globalAlpha));

      const dimFactor =
        hasFocus && !isFocused
          ? 0.42
          : isBlessingBackdrop
            ? 0.72
            : 1.0;
      const targetAlpha = globalAlpha * dimFactor;
      entry.currentAlpha = damp(entry.currentAlpha, targetAlpha, 7.5, safeDt);
      this.applyCardMaterials(entry, entry.currentAlpha);

      const targetCol = this.tmpColor;
      if (isFocused) {
        targetCol.copy(this.colFocused);
      } else if (isGuided) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.8);
        targetCol.copy(this.colMemoryUnlit).lerp(this.colGuided, 0.55 + pulse * 0.45);
      } else if (isHovered) {
        targetCol.copy(this.colHover);
      } else if (isLit) {
        const shimmer = 0.05 * Math.sin(elapsed * 2.0 + entry.phase);
        targetCol.copy(this.colMemoryLit).multiplyScalar(1 + shimmer);
      } else if (entry.slot.kind === 'memory') {
        targetCol.copy(this.colMemoryUnlit);
      } else {
        targetCol.copy(this.colPresetIdle);
      }

      if (entry.litFlash > 0.005) {
        targetCol.lerp(this.colWavePeak, entry.litFlash * 0.85);
      }
      if (waveImpulse > 0.005) {
        targetCol.lerp(this.colWavePeak, clamp(waveImpulse * 1.1, 0, 1));
      }
      if (isBlessingBackdrop && isLit) {
        targetCol.multiplyScalar(1.04 + 0.05 * Math.sin(elapsed * 1.6 + entry.phase));
      }

      entry.frameMat.color.r = damp(entry.frameMat.color.r, targetCol.r, 8, safeDt);
      entry.frameMat.color.g = damp(entry.frameMat.color.g, targetCol.g, 8, safeDt);
      entry.frameMat.color.b = damp(entry.frameMat.color.b, targetCol.b, 8, safeDt);
    }

    // ─── Update Focus Rim Glow (restrained, strictly non-washout) ────
    this.focusGlowAlpha = damp(this.focusGlowAlpha, hasFocus ? 1 : 0, 7.5, safeDt);
    this.focusGlowGroup.visible = this.focusGlowAlpha > 0.01;
    if (this.focusGlowGroup.visible && hasFocus) {
      this.focusGlowGroup.position
        .copy(focusPosWorld)
        .addScaledVector(this.tmpForward, 0.34);
      this.focusGlowGroup.quaternion.copy(camera.quaternion);
      this.focusGlowGroup.scale.setScalar(focusScale * 0.88);
      this.focusHaloMat.uniforms.uOpacity.value = 0.11 * this.focusGlowAlpha;
      this.focusHaloMat.uniforms.uTime.value = elapsed;
      this.focusLight.intensity = 0.38 * this.focusGlowAlpha;
    } else {
      this.focusLight.intensity = 0;
    }

    // ─── Update Lit-Memory Golden Constellation Threads ──────────────
    const showConstellation =
      (act === 'MEMORY_EXPLORE' || act === 'BLESSING_LETTER') &&
      !hasFocus &&
      this.litIds.size >= 2;
    this.constellationVisibility = damp(
      this.constellationVisibility,
      showConstellation ? 1 : 0,
      4.5,
      safeDt,
    );
    if (this.constellationVisibility > 0.01) {
      let writeIdx = 0;
      let prevPos: THREE.Vector3 | null = null;
      for (const slot of this.memorySlotsOrdered) {
        if (!slot.memory || !this.litIds.has(slot.memory.id)) continue;
        const entry = this.entryBySlotIndex.get(slot.index);
        if (!entry) continue;
        if (prevPos) {
          this.constellationPositions[writeIdx++] = prevPos.x;
          this.constellationPositions[writeIdx++] = prevPos.y;
          this.constellationPositions[writeIdx++] = prevPos.z - 0.06;
          this.constellationPositions[writeIdx++] = entry.currentPos.x;
          this.constellationPositions[writeIdx++] = entry.currentPos.y;
          this.constellationPositions[writeIdx++] = entry.currentPos.z - 0.06;
        }
        prevPos = entry.currentPos;
      }
      const vertexCount = writeIdx / 3;
      this.constellationLines.visible = vertexCount >= 2;
      if (vertexCount >= 2) {
        const posAttr = this.constellationLines.geometry.getAttribute(
          'position',
        ) as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
        this.constellationLines.geometry.setDrawRange(0, vertexCount);
        const pulse = 0.85 + 0.15 * Math.sin(elapsed * 1.8);
        this.constellationMat.opacity =
          (isBlessingBackdrop ? 0.18 : 0.24) *
          pulse *
          this.constellationVisibility *
          globalAlpha;
      }
    } else {
      this.constellationLines.visible = false;
    }

    // ─── Update Guided Double Halo & 3D Shooting-Star Filament ───────
    const showGuide =
      act === 'MEMORY_EXPLORE' &&
      !hasFocus &&
      guidedSlot !== null &&
      globalAlpha > 0.5;
    this.guideVisibility = damp(this.guideVisibility, showGuide ? 1 : 0, 5.5, safeDt);

    if (this.guideVisibility > 0.01 && guidedSlot) {
      const guidedEntry = this.entryBySlotIndex.get(guidedSlot.index);
      if (guidedEntry) {
        this.guidedHaloGroup.visible = true;
        this.guidedHaloGroup.position.lerp(
          guidedEntry.currentPos,
          clamp(safeDt * 8, 0, 1),
        );
        this.guidedHaloGroup.quaternion.slerp(
          guidedEntry.currentQuat,
          clamp(safeDt * 8, 0, 1),
        );

        const breathe = 1 + Math.sin(elapsed * 2.5) * 0.05;
        this.guidedHaloGroup.scale.setScalar(breathe);
        this.guidedOuterRingMat.opacity =
          (0.32 + 0.18 * Math.sin(elapsed * 2.5)) * this.guideVisibility;
        this.guidedInnerRingMat.opacity =
          (0.44 + 0.16 * Math.cos(elapsed * 3.1)) * this.guideVisibility;
        this.guidedAuraMat.uniforms.uOpacity.value = 0.22 * this.guideVisibility;
        this.guidedAuraMat.uniforms.uTime.value = elapsed;

        this.filamentPoints.visible = true;
        const startPt = this.hasLastLit
          ? this.lastLitPos
          : this.tmpVecB.set(0, -this.layout.bounds.height * 0.52, 0.5);
        const endPt = guidedEntry.currentPos;

        this.tmpVecC.addVectors(startPt, endPt).multiplyScalar(0.5);
        this.tmpVecC.y += 0.65;
        this.tmpVecC.z += 1.35;

        this.filamentCurve.v0.copy(startPt);
        this.filamentCurve.v1.copy(this.tmpVecC);
        this.filamentCurve.v2.copy(endPt);

        const posAttr = this.filamentPoints.geometry.getAttribute(
          'position',
        ) as THREE.BufferAttribute;
        const sizeAttr = this.filamentPoints.geometry.getAttribute(
          'aSize',
        ) as THREE.BufferAttribute;
        const alphaAttr = this.filamentPoints.geometry.getAttribute(
          'aAlpha',
        ) as THREE.BufferAttribute;

        const headCycle = (elapsed * 0.42) % 1;
        for (let i = 0; i < FILAMENT_COUNT; i++) {
          const frac = i / (FILAMENT_COUNT - 1);
          const u = (frac + elapsed * 0.16) % 1;
          this.filamentCurve.getPoint(u, this.tmpVecA);

          const wave = Math.sin(u * Math.PI) * 0.05;
          this.filamentPositions[i * 3] =
            this.tmpVecA.x + Math.sin(elapsed * 2.2 + i) * wave;
          this.filamentPositions[i * 3 + 1] =
            this.tmpVecA.y + Math.cos(elapsed * 1.9 + i) * wave;
          this.filamentPositions[i * 3 + 2] = this.tmpVecA.z;

          const edgeFade = Math.sin(u * Math.PI);
          let headDist = Math.abs(u - headCycle);
          if (headDist > 0.5) headDist = 1 - headDist;
          const headBoost = Math.exp(-headDist * headDist * 55);

          this.filamentSizes[i] = 0.07 + edgeFade * 0.09 + headBoost * 0.2;
          this.filamentAlphas[i] = edgeFade * (0.24 + headBoost * 0.68);
        }

        posAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
        this.filamentMat.uniforms.uOpacity.value = 0.72 * this.guideVisibility;
      }
    } else {
      this.guidedHaloGroup.visible = false;
      this.filamentPoints.visible = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const geo of this.sharedGeometries) {
      geo.dispose();
    }
    for (const mat of this.extraMaterials) {
      mat.dispose();
    }
    for (const entry of this.entries) {
      entry.frontMat.dispose();
      entry.backMat.dispose();
      entry.bodyMat.dispose();
      entry.frameMat.dispose();
    }
    for (const tex of this.ownedTextures) {
      tex.dispose();
    }
    for (const tex of this.sharedPresetFrontTex.values()) {
      tex.dispose();
    }
    for (const tex of this.sharedPresetBackTex.values()) {
      tex.dispose();
    }
    this.sharedGeometries.length = 0;
    this.extraMaterials.length = 0;
    this.entries.length = 0;
    this.entryBySlotIndex.clear();
    this.ownedTextures.clear();
    this.sharedPresetFrontTex.clear();
    this.sharedPresetBackTex.clear();
    this.presetImageFetched.clear();
    this.hitMeshes.length = 0;
  }

  private hydrateSlot(slotArrIdx: number): void {
    const slot = this.layout.slots[slotArrIdx];
    if (!slot || this.entryBySlotIndex.has(slot.index)) return;

    const totalSlots = Math.max(1, this.layout.slots.length);
    const root = new THREE.Group();
    root.name = `MosaicCard_${slot.index}`;

    let frontTex: THREE.CanvasTexture;
    let backTex: THREE.CanvasTexture;
    let sharesPresetTex = false;

    if (slot.kind === 'memory' && slot.memory) {
      frontTex = this.createOwnedCanvasTex(
        createMemoryFallbackCanvas(slot.memory, slot.memoryOrder ?? slotArrIdx, 512, 680),
      );
      backTex = this.createOwnedCanvasTex(
        createMemoryBackCanvas(slot.memory, 640, 860),
      );
    } else {
      const preset: PresetCardMeta = slot.preset ?? {
        id: `preset-default`,
        name: '星光徽章',
        subtitle: 'Birthday Keepsake',
        motif: 'starlight-cake',
      };
      const pooled = this.getOrCreatePresetTextures(preset);
      frontTex = pooled.frontTex;
      backTex = pooled.backTex;
      sharesPresetTex = true;
    }

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xeae5dc,
      emissive: 0x34312c,
      emissiveIntensity: 0.35,
      roughness: 0.82,
      metalness: 0.02,
      transparent: true,
      opacity: 1,
    });

    const frontMat = new THREE.MeshBasicMaterial({
      map: frontTex,
      color: 0xe0deda,
      transparent: true,
      opacity: 1,
    });

    const backMat = new THREE.MeshBasicMaterial({
      map: backTex,
      color: 0xdfddd8,
      transparent: true,
      opacity: 1,
    });

    const initialFrameColor =
      slot.kind === 'memory' ? this.colMemoryUnlit.clone() : this.colPresetIdle.clone();
    const frameMat = new THREE.MeshBasicMaterial({
      color: initialFrameColor,
      transparent: true,
      opacity: 1,
    });

    // Remaining placeholders are decorative only: never clickable, always dimmed
    // by the same fixed factor so they never outshine a real photo.
    const isFiller = slot.kind !== 'memory';

    const bodyMesh = new THREE.Mesh(this.bodyGeo, bodyMat);
    root.add(bodyMesh);

    const frontMesh = new THREE.Mesh(this.faceGeo, frontMat);
    frontMesh.position.z = this.cardThickness * 0.5 + 0.0025;
    root.add(frontMesh);

    const backMesh = new THREE.Mesh(this.faceGeo, backMat);
    backMesh.position.z = -this.cardThickness * 0.5 - 0.0025;
    backMesh.rotation.y = Math.PI;
    root.add(backMesh);

    const frameMesh = new THREE.Mesh(this.frameGeo, frameMat);
    root.add(frameMesh);

    const hitMesh = new THREE.Mesh(this.hitGeo, this.hitMat);
    hitMesh.userData.slotIndex = slot.index;
    // Filler slots beyond the photo count are decorative: no click target at all,
    // so they cannot be focused, flipped or lit.
    if (slot.kind === 'memory') {
      root.add(hitMesh);
      this.hitMeshes.push(hitMesh);
    }

    const homePos = new THREE.Vector3(slot.position.x, slot.position.y, slot.position.z);
    const homeQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(slot.rotation.x, slot.rotation.y, slot.rotation.z),
    );

    const seed = (slot.index + 1) * 1.6180339;
    const randA = Math.sin(seed * 12.9898) * 43758.5453;
    const r1 = randA - Math.floor(randA);
    const randB = Math.sin(seed * 78.233) * 43758.5453;
    const r2 = randB - Math.floor(randB);

    const startsVisible = this.mode === 'visible';
    const entry: CardEntry = {
      slot,
      root,
      hitMesh,
      frontMat,
      backMat,
      bodyMat,
      frameMat,
      frontTex,
      backTex,
      sharesPresetTex,
      hasRealImage: false,
      isFiller,
      homePos,
      homeQuat,
      assemblyStart: new THREE.Vector3(0, -this.layout.bounds.height * 0.6, 0),
      assemblyCtrl: new THREE.Vector3(),
      assemblyDelay: (slotArrIdx / totalSlots) * 0.58 + r1 * 0.08,
      assemblyDuration: 0.94 + r2 * 0.16,
      disperseDrift: new THREE.Vector3(
        (r1 - 0.5) * 2.6,
        2.8 + r2 * 2.8,
        (r2 - 0.5) * 1.8,
      ),
      disperseSpin: new THREE.Vector3(
        (r1 - 0.5) * 1.4,
        (r2 - 0.5) * 2.2,
        (r1 - 0.5) * 0.9,
      ),
      phase: slotArrIdx * 0.73 + r1 * Math.PI * 2,
      focusBlend: 0,
      flipAngle: 0,
      hoverBlend: 0,
      litFlash: 0,
      currentPos: homePos.clone(),
      currentQuat: homeQuat.clone(),
      currentScale: startsVisible ? 1 : 0.001,
      currentAlpha: startsVisible ? 1 : 0,
    };

    root.position.copy(homePos);
    root.quaternion.copy(homeQuat);
    root.scale.setScalar(entry.currentScale);
    this.applyCardMaterials(entry, entry.currentAlpha);
    this.group.add(root);
    this.entries.push(entry);
    this.entryBySlotIndex.set(slot.index, entry);

    // Async off-main-thread decode for user photos (or custom preset images once per preset)
    if (slot.kind === 'memory' && slot.memory?.image?.trim()) {
      void this.loadRealImageForEntry(entry, slot.memory.image.trim());
    } else if (slot.kind === 'preset' && slot.preset?.image?.trim()) {
      const presetId = slot.preset.id;
      if (!this.presetImageFetched.has(presetId)) {
        this.presetImageFetched.add(presetId);
        void this.loadRealImageForSharedPreset(presetId, slot.preset.image.trim());
      }
    }
  }

  private getOrCreatePresetTextures(preset: PresetCardMeta): {
    frontTex: THREE.CanvasTexture;
    backTex: THREE.CanvasTexture;
  } {
    let frontTex = this.sharedPresetFrontTex.get(preset.id);
    if (!frontTex) {
      frontTex = this.createCanvasTex(createPresetArtCanvas(preset, 512, 680));
      this.sharedPresetFrontTex.set(preset.id, frontTex);
    }

    let backTex = this.sharedPresetBackTex.get(preset.id);
    if (!backTex) {
      backTex = this.createCanvasTex(createPresetBackCanvas(preset, 640, 860));
      this.sharedPresetBackTex.set(preset.id, backTex);
    }

    return { frontTex, backTex };
  }

  private async decodeImageSource(
    url: string,
  ): Promise<ImageBitmap | HTMLImageElement | null> {
    if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          if (this.disposed) return null;
          return await createImageBitmap(blob);
        }
      } catch {
        // Fall through to HTMLImageElement loader
      }
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  private async loadRealImageForEntry(entry: CardEntry, url: string): Promise<void> {
    const decoded = await this.decodeImageSource(url);
    if (!decoded) return;

    if (this.disposed) {
      if ('close' in decoded) decoded.close();
      return;
    }

    const cropped = drawCoverPhotoCanvas(decoded, 768, 1024);
    if ('close' in decoded) decoded.close();

    const nextTex = this.createOwnedCanvasTex(cropped);
    const oldTex = entry.frontTex;
    entry.hasRealImage = true;
    entry.frontTex = nextTex;
    entry.frontMat.map = nextTex;
    entry.frontMat.needsUpdate = true;

    if (!entry.sharesPresetTex && this.ownedTextures.has(oldTex)) {
      this.ownedTextures.delete(oldTex);
      oldTex.dispose();
    }
  }

  private async loadRealImageForSharedPreset(
    presetId: string,
    url: string,
  ): Promise<void> {
    const decoded = await this.decodeImageSource(url);
    if (!decoded) return;

    if (this.disposed) {
      if ('close' in decoded) decoded.close();
      return;
    }

    const cropped = drawCoverPhotoCanvas(decoded, 768, 1024);
    if ('close' in decoded) decoded.close();

    const nextTex = this.createCanvasTex(cropped);
    const oldTex = this.sharedPresetFrontTex.get(presetId);
    this.sharedPresetFrontTex.set(presetId, nextTex);

    for (const entry of this.entries) {
      if (entry.slot.kind === 'preset' && entry.slot.preset?.id === presetId) {
        entry.frontTex = nextTex;
        entry.frontMat.map = nextTex;
        entry.frontMat.needsUpdate = true;
      }
    }
    oldTex?.dispose();
  }

  private markSlotLitIfUnlit(entry: CardEntry): void {
    if (entry.slot.kind !== 'memory' || !entry.slot.memory) return;
    const id = entry.slot.memory.id;
    if (this.litIds.has(id)) return;

    this.litIds.add(id);
    this.lastLitPos.copy(entry.homePos);
    this.hasLastLit = true;
    entry.litFlash = 1.0;

    this.callbacks?.onMemoryLit?.(id, this.litIds.size, this.totalMemories);
  }

  private applyCardMaterials(entry: CardEntry, alpha: number): void {
    const a = clamp(alpha, 0, 1);

    // Placeholder cards are effectively removed from the scene: fully invisible
    // and non-interactive, so only the creator's photos remain on screen. They
    // still exist as slots to keep indices (and pinned positions) stable.
    if (entry.isFiller) {
      entry.frontMat.opacity = 0;
      entry.backMat.opacity = 0;
      entry.bodyMat.opacity = 0;
      entry.frameMat.opacity = 0;
      entry.root.visible = false;
      return;
    }

    entry.frontMat.opacity = a;
    entry.backMat.opacity = a;
    entry.bodyMat.opacity = a;
    entry.frameMat.opacity = a;
    entry.root.visible = a > 0.01;
  }

  private createCanvasTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  private createOwnedCanvasTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = this.createCanvasTex(canvas);
    this.ownedTextures.add(tex);
    return tex;
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.sharedGeometries.push(geo);
    return geo;
  }
}
