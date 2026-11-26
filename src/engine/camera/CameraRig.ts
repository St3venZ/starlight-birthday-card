import * as THREE from 'three';
import type { SceneAct } from '../../config/types';
import { clamp, damp } from '../utils/math';

export interface MosaicBounds {
  width: number;
  height: number;
  depth: number;
}

export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly reducedMotion: boolean;

  private bounds: MosaicBounds = { width: 11, height: 7.5, depth: 2.2 };
  private aspect = 16 / 9;
  private act: SceneAct = 'ENTRANCE';
  private orbitEnabled = false;

  // Derived safe framing distances
  private mosaicDist = 16;
  private closedCardDist = 8.4;
  private openCardDist = 9.8;

  // User interactive orbit & zoom offsets
  private targetAzimuth = 0;
  private targetElevation = 0;
  private targetZoom = 1.0;

  private currentAzimuth = 0;
  private currentElevation = 0;
  private currentZoom = 1.0;

  // Subtle pointer parallax for hero card acts
  private pointerNdcX = 0;
  private pointerNdcY = 0;
  private smoothParallaxX = 0;
  private smoothParallaxY = 0;

  // Multi-pointer tracking (drag orbit + two-finger pinch zoom)
  private readonly activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDistance: number | null = null;

  // Damped camera position & lookAt target
  private readonly currentPos = new THREE.Vector3(0, 0.9, 13.5);
  private readonly currentLookAt = new THREE.Vector3(0, 0, 0);
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredLookAt = new THREE.Vector3();

  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onWheelBound: (e: WheelEvent) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.aspect = camera.aspect || 16 / 9;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.recomputeDistances();
    this.currentPos.set(0, 0.9, this.closedCardDist * 1.42);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);

    this.onPointerDownBound = this.handlePointerDown.bind(this);
    this.onPointerMoveBound = this.handlePointerMove.bind(this);
    this.onPointerUpBound = this.handlePointerUp.bind(this);
    this.onWheelBound = this.handleWheel.bind(this);

    domElement.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);
    domElement.addEventListener('wheel', this.onWheelBound, { passive: false });
  }

  setMosaicBounds(bounds: MosaicBounds): void {
    this.bounds = { ...bounds };
    this.recomputeDistances();
  }

  setAct(act: SceneAct): void {
    this.act = act;
    if (
      act === 'ENTRANCE' ||
      act === 'OPENING' ||
      act === 'CONSTELLATION_FORM' ||
      act === 'BLESSING_LETTER' ||
      act === 'CLOSING_CARD'
    ) {
      this.resetUserOffset();
    }
  }

  setOrbitEnabled(enabled: boolean): void {
    this.orbitEnabled = enabled;
    if (!enabled) {
      this.activePointers.clear();
      this.lastPinchDistance = null;
    }
  }

  resetUserOffset(): void {
    this.targetAzimuth = 0;
    this.targetElevation = 0;
    this.targetZoom = 1.0;
  }

  onResize(aspect: number): void {
    this.aspect = Math.max(0.3, aspect);
    this.recomputeDistances();
  }

  update(elapsed: number, dt: number): void {
    const safeDt = Math.min(dt, 0.05);
    const motionScale = this.reducedMotion ? 0.25 : 1.0;

    // Gentle elastic return toward hero framing when user releases drag on card showcase acts
    const isHeroCardAct =
      this.act === 'AWAITING_OPEN' ||
      this.act === 'PROLOGUE' ||
      this.act === 'FIREWORKS_FINALE';
    if (isHeroCardAct && this.activePointers.size === 0) {
      this.targetAzimuth = damp(this.targetAzimuth, 0, 1.35, safeDt);
      this.targetElevation = damp(this.targetElevation, 0, 1.35, safeDt);
    }

    this.currentAzimuth = damp(this.currentAzimuth, this.targetAzimuth, 6.2, safeDt);
    this.currentElevation = damp(this.currentElevation, this.targetElevation, 6.2, safeDt);
    this.currentZoom = damp(this.currentZoom, this.targetZoom, 6.5, safeDt);

    this.smoothParallaxX = damp(this.smoothParallaxX, this.pointerNdcX, 4.5, safeDt);
    this.smoothParallaxY = damp(this.smoothParallaxY, this.pointerNdcY, 4.5, safeDt);

    const pX = this.smoothParallaxX * motionScale;
    const pY = this.smoothParallaxY * motionScale;
    let posDamp = 3.8;
    let lookDamp = 4.6;

    switch (this.act) {
      case 'ENTRANCE': {
        this.desiredPos.set(
          Math.sin(elapsed * 0.4) * 0.35 * motionScale,
          0.35,
          this.closedCardDist * 1.18,
        );
        this.desiredLookAt.set(0, -0.04, 0);
        posDamp = 2.6;
        break;
      }

      case 'AWAITING_OPEN': {
        const az = clamp(this.currentAzimuth, -0.68, 0.68);
        const el = clamp(this.currentElevation, -0.32, 0.36);
        const radius = this.closedCardDist;
        const cosEl = Math.cos(el);
        const swayX = Math.sin(elapsed * 0.45) * 0.2 * motionScale + pX * 0.48;
        const swayY = Math.cos(elapsed * 0.38) * 0.1 * motionScale + pY * 0.26;
        this.desiredPos.set(
          Math.sin(az) * cosEl * radius + swayX,
          Math.sin(el) * radius + 0.1 + swayY,
          Math.cos(az) * cosEl * radius,
        );
        this.desiredLookAt.set(0, -0.02, 0);
        posDamp = this.activePointers.size > 0 ? 6.5 : 3.6;
        break;
      }

      case 'OPENING': {
        this.desiredPos.set(
          pX * 0.35,
          1.22 + pY * 0.18,
          this.openCardDist * 1.02,
        );
        this.desiredLookAt.set(0, 0.1, 0.15);
        posDamp = 3.2;
        break;
      }

      case 'PROLOGUE': {
        const az = clamp(this.currentAzimuth, -0.64, 0.64);
        const el = clamp(this.currentElevation, -0.26, 0.34);
        const radius = this.openCardDist * 1.18;
        const cosEl = Math.cos(el);
        const swayX = Math.sin(elapsed * 0.35) * 0.2 * motionScale + pX * 0.34;
        const swayY = Math.cos(elapsed * 0.3) * 0.08 * motionScale + pY * 0.16;
        this.desiredPos.set(
          Math.sin(az) * cosEl * radius + swayX,
          Math.sin(el) * radius + 1.56 + swayY,
          Math.cos(az) * cosEl * radius,
        );
        this.desiredLookAt.set(0, -0.62, 0.05);
        posDamp = this.activePointers.size > 0 ? 6.0 : 3.2;
        break;
      }

      case 'CONSTELLATION_FORM': {
        const sweepX = Math.sin(elapsed * 0.3) * 0.5 * motionScale;
        this.desiredPos.set(sweepX, 0.45, this.mosaicDist * 1.07);
        this.desiredLookAt.set(0, 0.05, 0);
        posDamp = 2.8;
        break;
      }

      case 'MEMORY_EXPLORE': {
        const breathAz = Math.sin(elapsed * 0.22) * 0.065 * motionScale;
        const breathEl = Math.cos(elapsed * 0.18) * 0.028 * motionScale;
        const az = this.currentAzimuth + breathAz;
        const el = clamp(this.currentElevation + breathEl, -0.52, 0.56);
        const radius = this.mosaicDist * this.currentZoom;

        const cosEl = Math.cos(el);
        this.desiredPos.set(
          Math.sin(az) * cosEl * radius,
          Math.sin(el) * radius + 0.08,
          Math.cos(az) * cosEl * radius,
        );
        this.desiredLookAt.set(0, 0.04, 0);
        posDamp = 5.4;
        lookDamp = 6.2;
        break;
      }

      case 'PHOTO_FOCUS': {
        // Hold camera steady while card flies cleanly in front of lens
        const az = this.currentAzimuth;
        const el = clamp(this.currentElevation, -0.52, 0.56);
        const radius = this.mosaicDist * this.currentZoom;
        const cosEl = Math.cos(el);
        this.desiredPos.set(
          Math.sin(az) * cosEl * radius,
          Math.sin(el) * radius + 0.08,
          Math.cos(az) * cosEl * radius,
        );
        this.desiredLookAt.set(0, 0.04, 0);
        posDamp = 4.0;
        lookDamp = 5.0;
        break;
      }

      case 'BLESSING_LETTER': {
        const driftAz = Math.sin(elapsed * 0.16) * 0.08 * motionScale;
        const radius = this.mosaicDist * 1.22;
        this.desiredPos.set(
          Math.sin(driftAz) * radius,
          0.18 + Math.cos(elapsed * 0.14) * 0.12 * motionScale,
          Math.cos(driftAz) * radius,
        );
        this.desiredLookAt.set(0, -0.22, 0.2);
        posDamp = 2.6;
        break;
      }

      case 'CLOSING_CARD': {
        this.desiredPos.set(0, 0.18, this.closedCardDist * 1.04);
        this.desiredLookAt.set(0, -0.14, 0);
        posDamp = 3.6;
        break;
      }

      case 'FIREWORKS_FINALE': {
        const az = clamp(this.currentAzimuth, -0.58, 0.58);
        const el = clamp(this.currentElevation, -0.24, 0.32);
        const radius = this.closedCardDist * 1.32;
        const cosEl = Math.cos(el);
        const swayX = Math.sin(elapsed * 0.28) * 0.24 * motionScale + pX * 0.42;
        const swayY = Math.cos(elapsed * 0.24) * 0.09 * motionScale + pY * 0.2;
        this.desiredPos.set(
          Math.sin(az) * cosEl * radius + swayX,
          Math.sin(el) * radius + 0.65 + swayY,
          Math.cos(az) * cosEl * radius,
        );
        this.desiredLookAt.set(0, 1.05, -2.5);
        posDamp = this.activePointers.size > 0 ? 5.8 : 2.8;
        break;
      }
    }

    this.currentPos.x = damp(this.currentPos.x, this.desiredPos.x, posDamp, safeDt);
    this.currentPos.y = damp(this.currentPos.y, this.desiredPos.y, posDamp, safeDt);
    this.currentPos.z = damp(this.currentPos.z, this.desiredPos.z, posDamp, safeDt);

    this.currentLookAt.x = damp(this.currentLookAt.x, this.desiredLookAt.x, lookDamp, safeDt);
    this.currentLookAt.y = damp(this.currentLookAt.y, this.desiredLookAt.y, lookDamp, safeDt);
    this.currentLookAt.z = damp(this.currentLookAt.z, this.desiredLookAt.z, lookDamp, safeDt);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);
    this.domElement.removeEventListener('wheel', this.onWheelBound);
    this.activePointers.clear();
  }

  private recomputeDistances(): void {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const tanHalfV = Math.tan(vFov * 0.5);
    const tanHalfH = tanHalfV * this.aspect;
    const isPortrait = this.aspect < 0.85;

    // Fit full 3D Age Number with generous top/bottom margins for progress bar & breathing room
    const vFill = isPortrait ? 0.58 : 0.65;
    const hFill = isPortrait ? 0.84 : 0.74;
    const distV = (this.bounds.height * 0.5) / (tanHalfV * vFill);
    const distH = (this.bounds.width * 0.5) / (tanHalfH * hFill);
    this.mosaicDist = Math.max(8.5, Math.max(distV, distH) + this.bounds.depth * 0.5 + 1.45);

    // Safe framing for half-open / closed luxury keepsake card
    const closedDistV = (4.8 * 0.5) / (tanHalfV * (isPortrait ? 0.62 : 0.72));
    const closedDistH = (3.8 * 0.5) / (tanHalfH * (isPortrait ? 0.82 : 0.68));
    this.closedCardDist = Math.max(7.2, Math.max(closedDistV, closedDistH) + 0.8);

    // Safe framing for wide open pop-up book stage
    const openDistV = (5.0 * 0.5) / (tanHalfV * (isPortrait ? 0.6 : 0.72));
    const openDistH = (5.6 * 0.5) / (tanHalfH * (isPortrait ? 0.86 : 0.74));
    this.openCardDist = Math.max(8.2, Math.max(openDistV, openDistH) + 1.0);
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.orbitEnabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2) {
      this.lastPinchDistance = this.computePinchDistance();
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    // Update gentle parallax coordinates regardless of orbit mode
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.pointerNdcX = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
      this.pointerNdcY = clamp(-(((e.clientY - rect.top) / rect.height) * 2 - 1), -1, 1);
    }

    if (!this.orbitEnabled) return;
    const prev = this.activePointers.get(e.pointerId);
    if (!prev) return;

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.activePointers.size === 1) {
      const isHeroCardAct =
        this.act === 'AWAITING_OPEN' ||
        this.act === 'PROLOGUE' ||
        this.act === 'FIREWORKS_FINALE';
      const maxAz = isHeroCardAct ? 0.66 : 0.88;
      const minEl = isHeroCardAct ? -0.3 : -0.46;
      const maxEl = isHeroCardAct ? 0.34 : 0.5;
      const sensitivity = e.pointerType === 'touch' ? 0.0052 : 0.0042;
      this.targetAzimuth = clamp(this.targetAzimuth - dx * sensitivity, -maxAz, maxAz);
      this.targetElevation = clamp(
        this.targetElevation + dy * sensitivity * 0.82,
        minEl,
        maxEl,
      );
    } else if (this.activePointers.size === 2 && this.act === 'MEMORY_EXPLORE') {
      const dist = this.computePinchDistance();
      if (this.lastPinchDistance !== null && dist > 10) {
        const ratio = this.lastPinchDistance / dist;
        this.targetZoom = clamp(this.targetZoom * ratio, 0.68, 1.52);
      }
      this.lastPinchDistance = dist;
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.lastPinchDistance = null;
    }
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.orbitEnabled || this.act !== 'MEMORY_EXPLORE') return;
    e.preventDefault();
    const step = clamp(e.deltaY, -120, 120) * 0.0012;
    this.targetZoom = clamp(this.targetZoom + step, 0.68, 1.52);
  }

  private computePinchDistance(): number {
    const pts = Array.from(this.activePointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }
}
