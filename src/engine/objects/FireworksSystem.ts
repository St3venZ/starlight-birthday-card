import * as THREE from 'three';
import { clamp } from '../utils/math';

const MAX_PARTICLES = 6400;
const MAX_ROCKETS = 24;

const FIREWORKS_VERTEX_SHADER = /* glsl */ `
attribute vec3 aVelocity;
attribute vec3 aColor;
attribute vec4 aParams; // x: spawnTime, y: life, z: size, w: drag
attribute vec4 aMeta;   // x: gravity, y: sparkleSeed, z: hdrBoost, w: kind

uniform float uTime;
uniform float uPixelRatio;

varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vLifeT;
varying float vSparkle;

void main() {
  float spawnTime = aParams.x;
  float life = aParams.y;
  float age = uTime - spawnTime;

  if (life <= 0.0 || age < 0.0 || age > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }

  float t = age / life;
  float drag = max(aParams.w, 0.05);
  float gravity = aMeta.x;
  float seed = aMeta.y;
  float hdrBoost = aMeta.z;
  float kind = aMeta.w;

  // Closed-form physical drag + gravitational droop:
  // v(t) = v0 * e^(-k*t) - (g/k) * (1 - e^(-k*t))
  float expFactor = (1.0 - exp(-drag * age)) / drag;
  vec3 pos = position + aVelocity * expFactor;
  pos.y -= (gravity / drag) * (age - expFactor);

  // Subtle ambient breeze shimmer on late-stage willow/spark embers
  float breeze = t * t * (kind > 1.5 && kind < 2.5 ? 0.24 : 0.08);
  pos.x += sin(uTime * 1.9 + seed * 31.4) * breeze;
  pos.z += cos(uTime * 1.6 + seed * 23.7) * breeze;

  // Smooth ignition and burn-out opacity curve
  float fadeIn = smoothstep(0.0, 0.045, t);
  float fadeOut = pow(max(1.0 - t, 0.0), kind > 0.5 && kind < 1.5 ? 1.85 : 1.32);

  // Delicate diamond-dust strobe twinkle during the tail end of life
  float strobeWave = 0.5 + 0.5 * sin(uTime * (15.0 + seed * 18.0) + seed * 62.83);
  float tailMask = smoothstep(0.32, 0.78, t);
  float twinkle = kind > 1.5 && kind < 2.5
    ? mix(1.0, 0.35 + 0.95 * strobeWave, tailMask)
    : mix(1.0, 0.70 + 0.38 * strobeWave, tailMask);

  // Incandescent white-gold flash right at birth, cooling into true palette color
  float hotBirth = exp(-t * 16.0);
  vec3 warmCore = vec3(1.0, 0.94, 0.84);
  vec3 cooledColor = mix(aColor, aColor * vec3(1.04, 0.84, 0.68), smoothstep(0.55, 1.0, t) * 0.45);
  vec3 baseCol = mix(cooledColor, warmCore, hotBirth * 0.42);

  vColor = baseCol * hdrBoost * mix(1.0, 0.72, t * t);
  vAlpha = fadeIn * fadeOut * twinkle;
  vKind = kind;
  vLifeT = t;
  vSparkle = strobeWave;

  // Restrained size envelope (prevents oversized white snowballs on mobile)
  float sizeEnv = kind > 0.5 && kind < 1.5
    ? mix(0.60, 1.10, smoothstep(0.0, 0.20, t)) * (1.0 - t * 0.55)
    : mix(1.06, 0.32, t * t);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float dist = max(-mvPosition.z, 0.8);
  float ptSize = aParams.z * sizeEnv * uPixelRatio * (126.0 / dist);
  gl_PointSize = clamp(ptSize, 1.0, 30.0 * uPixelRatio);

  gl_Position = projectionMatrix * mvPosition;
}
`;

const FIREWORKS_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vLifeT;
varying float vSparkle;

void main() {
  if (vAlpha <= 0.002) discard;

  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  float shape = 0.0;

  if (vKind > 0.5 && vKind < 1.5) {
    // Refined warm luminous flash / comet head glow (no oversized white blobs)
    float broad = exp(-r2 * 5.4) * 0.40;
    float center = exp(-r2 * 18.0) * 0.86;
    shape = (broad + center) * smoothstep(1.0, 0.22, r2);
  } else {
    // Crisp incandescent firework spark with silky Gaussian aura
    float core = exp(-r2 * 19.0) * 1.10;
    float aura = exp(-r2 * 5.8) * 0.40;
    // Delicate star glint on brightest / twinkling sparks
    float glint = 0.0;
    if (vSparkle > 0.65) {
      float cx = exp(-abs(p.y) * 16.0 - abs(p.x) * 3.8);
      float cy = exp(-abs(p.x) * 16.0 - abs(p.y) * 3.8);
      glint = (cx + cy) * 0.22 * (vSparkle - 0.65) * 2.8;
    }
    shape = (core + aura + glint) * smoothstep(1.0, 0.25, r2);
  }

  float weight = shape * vAlpha;
  if (weight < 0.003) discard;

  float a = min(weight, 1.0);
  gl_FragColor = vec4(vColor * (weight / a), a);
}
`;

type BurstStyle =
  | 'chrysanthemum'
  | 'double-ring'
  | 'willow'
  | 'palm'
  | 'starburst';

interface ColorPair {
  primary: number;
  secondary: number;
}

interface PooledRocket {
  active: boolean;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  swayOffset: THREE.Vector3;
  elapsed: number;
  duration: number;
  primaryHex: number;
  secondaryHex: number;
  style: BurstStyle;
}

interface PendingAutoLaunch {
  active: boolean;
  delay: number;
  x: number;
  y: number;
  z: number;
}

interface PooledBurstLight {
  light: THREE.PointLight;
  elapsed: number;
  duration: number;
  peakIntensity: number;
  active: boolean;
}

const PALETTES: readonly ColorPair[] = [
  { primary: 0xf3d38c, secondary: 0xf5f2eb }, // Champagne Gold + Starlight Ivory
  { primary: 0xffb85c, secondary: 0xf3d38c }, // Candlelight Amber + Champagne Gold
  { primary: 0xf2b8c6, secondary: 0xfff0dc }, // Soft Rose-Gold + Warm Pearl
  { primary: 0xa9d0ff, secondary: 0xf3d38c }, // Celestial Ice-Blue + Champagne Gold
  { primary: 0xf2b8c6, secondary: 0xffb85c }, // Rose-Gold + Candlelight Amber
];

const BURST_STYLES: readonly BurstStyle[] = [
  'chrysanthemum',
  'double-ring',
  'willow',
  'palm',
  'starburst',
];

function getSafePixelRatio(): number {
  return typeof window !== 'undefined'
    ? Math.min(window.devicePixelRatio || 1, 2)
    : 1;
}

function isPortraitViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.innerWidth > 0 &&
    window.innerHeight > window.innerWidth
  );
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Pooled GPU 3D Fireworks & Stardust Burst System.
 * Supports rising comet rockets with trailing sparks, multi-layered 3D bursts
 * (chrysanthemum, double-ring, golden willow, palm, celestial starburst),
 * subtle dynamic light reflection pulses on detonation, instant stardust
 * sparkles for memory highlights, and rhythmic auto-launch.
 */
export class FireworksSystem {
  readonly group: THREE.Group;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly points: THREE.Points;

  private readonly posAttr: THREE.BufferAttribute;
  private readonly velAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly paramsAttr: THREE.BufferAttribute;
  private readonly metaAttr: THREE.BufferAttribute;

  private readonly rockets: PooledRocket[];
  private readonly burstLights: PooledBurstLight[];
  private lightCursor = 0;

  private readonly pendingSecondary: PendingAutoLaunch = {
    active: false,
    delay: 0,
    x: 0,
    y: 0,
    z: 0,
  };

  private readonly tempColorA = new THREE.Color();
  private readonly tempColorB = new THREE.Color();
  private readonly tempColorMix = new THREE.Color();
  private readonly tempVecA = new THREE.Vector3();
  private readonly tempVecB = new THREE.Vector3();
  private readonly tempVecC = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();
  private readonly tempEuler = new THREE.Euler();

  private writeCursor = 0;
  private buffersDirty = false;
  private simTime = 0;

  private autoLaunchEnabled = false;
  private autoLaunchCooldown = 0.25;
  private lastZoneIndex = -1;
  private lastPaletteIndex = -1;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'FireworksSystem';

    const positions = new Float32Array(MAX_PARTICLES * 3);
    const velocities = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const params = new Float32Array(MAX_PARTICLES * 4);
    const meta = new Float32Array(MAX_PARTICLES * 4);

    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.velAttr = new THREE.BufferAttribute(velocities, 3);
    this.colorAttr = new THREE.BufferAttribute(colors, 3);
    this.paramsAttr = new THREE.BufferAttribute(params, 4);
    this.metaAttr = new THREE.BufferAttribute(meta, 4);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aVelocity', this.velAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.setAttribute('aParams', this.paramsAttr);
    this.geometry.setAttribute('aMeta', this.metaAttr);

    this.material = new THREE.ShaderMaterial({
      vertexShader: FIREWORKS_VERTEX_SHADER,
      fragmentShader: FIREWORKS_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: getSafePixelRatio() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.group.add(this.points);

    // Pre-allocate rocket pool (zero runtime allocations)
    this.rockets = [];
    for (let i = 0; i < MAX_ROCKETS; i++) {
      this.rockets.push({
        active: false,
        startPos: new THREE.Vector3(),
        targetPos: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        swayOffset: new THREE.Vector3(),
        elapsed: 0,
        duration: 0.75,
        primaryHex: 0xf3d38c,
        secondaryHex: 0xf5f2eb,
        style: 'chrysanthemum',
      });
    }

    // Pre-allocate 2 subtle PointLights so finale fireworks cast gentle
    // champagne/rose-gold reflection pulses onto the closed keepsake card below
    this.burstLights = [];
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xf3d38c, 0, 32, 2);
      this.group.add(light);
      this.burstLights.push({
        light,
        elapsed: 0,
        duration: 0.65,
        peakIntensity: 14,
        active: false,
      });
    }
  }

  /**
   * Enables or disables automatic choreographed sky fireworks (used in FIREWORKS_FINALE).
   */
  setAutoLaunch(enabled: boolean): void {
    const wasEnabled = this.autoLaunchEnabled;
    this.autoLaunchEnabled = enabled;
    if (enabled && !wasEnabled) {
      this.autoLaunchCooldown = 0.2;
    } else if (!enabled) {
      this.pendingSecondary.active = false;
    }
  }

  /**
   * Launches a rising glowing comet rocket that arcs up from off-center below
   * and detonates into a multi-layered 3D firework burst at (x, y, z).
   */
  launchAt(x?: number, y?: number, z?: number): void {
    const fallback = this.pickBalancedSkyTarget();
    const targetX = x !== undefined ? x : fallback.x;
    const targetY = y !== undefined ? y : fallback.y;
    const targetZ = z !== undefined ? z : fallback.z;

    const rocket = this.acquireRocketSlot();
    const palette = this.pickPalette();
    const style = BURST_STYLES[Math.floor(Math.random() * BURST_STYLES.length)];

    // Launch gracefully from off-center below so rising trails never collide
    // straight behind the closed card or bottom finale caption
    const climbHeight = randomRange(6.8, 9.8);
    let startX = targetX + randomRange(-1.4, 1.4);
    if (Math.abs(startX) < 2.2) {
      const side =
        targetX < 0 ? -1 : targetX > 0 ? 1 : Math.random() < 0.5 ? -1 : 1;
      startX = side * randomRange(2.35, 3.4);
    }
    const startY = Math.min(targetY - climbHeight, -7.2);
    const startZ = targetZ + randomRange(-1.2, 0.8);

    rocket.active = true;
    rocket.startPos.set(startX, startY, startZ);
    rocket.targetPos.set(targetX, targetY, targetZ);
    rocket.pos.copy(rocket.startPos);
    rocket.prevPos.copy(rocket.startPos);
    rocket.swayOffset.set(
      randomRange(-0.75, 0.75),
      randomRange(0.45, 1.1),
      randomRange(-0.45, 0.45),
    );
    rocket.elapsed = 0;
    rocket.duration = randomRange(0.62, 0.88);
    rocket.primaryHex = palette.primary;
    rocket.secondaryHex = palette.secondary;
    rocket.style = style;
  }

  /**
   * Spawns an instant luminous 3D stardust burst at (x, y, z).
   * Tastefully scaled for both celebratory moments (seal break) and subtle golden
   * illumination sparkles when a memory photo card is lit.
   */
  burstAt(x: number, y: number, z: number, colorHex?: number): void {
    const primary = colorHex !== undefined ? colorHex : 0xf3d38c;
    this.tempColorA.setHex(primary);
    this.tempColorB.setHex(colorHex !== undefined ? 0xf5f2eb : 0xffb85c);

    // Subtle radiant center glint (restrained to avoid bloom blobs)
    this.emitParticle(
      x,
      y,
      z,
      0,
      0,
      0,
      this.tempColorA,
      0.22,
      4.2,
      2.0,
      0.0,
      1.32,
      1,
    );

    // Luminous inner golden stardust bloom
    const coreCount = 72;
    for (let i = 0; i < coreCount; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
      const speed = randomRange(1.9, 4.4);

      const vx = sinPhi * Math.cos(theta) * speed;
      const vy = u * speed + 0.35;
      const vz = sinPhi * Math.sin(theta) * speed;

      const mixT = Math.random();
      this.tempColorMix.copy(this.tempColorA).lerp(this.tempColorB, mixT * 0.55);

      this.emitParticle(
        x,
        y,
        z,
        vx,
        vy,
        vz,
        this.tempColorMix,
        randomRange(0.75, 1.42),
        randomRange(1.35, 2.45),
        randomRange(2.1, 3.0),
        randomRange(0.55, 1.15),
        randomRange(1.18, 1.48),
        i % 3 === 0 ? 2 : 0,
      );
    }

    // Delicate shimmering equatorial sparkle halo
    const ringCount = 36;
    const tiltX = randomRange(-0.55, 0.55);
    const tiltY = randomRange(-0.55, 0.55);
    this.tempEuler.set(tiltX, tiltY, 0);
    this.tempQuat.setFromEuler(this.tempEuler);

    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2 + randomRange(-0.08, 0.08);
      const speed = randomRange(3.2, 4.3);
      this.tempVecA
        .set(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          randomRange(-0.25, 0.25),
        )
        .applyQuaternion(this.tempQuat);

      this.tempColorMix.copy(this.tempColorB).lerp(this.tempColorA, 0.45);
      this.emitParticle(
        x,
        y,
        z,
        this.tempVecA.x,
        this.tempVecA.y,
        this.tempVecA.z,
        this.tempColorMix,
        randomRange(0.88, 1.5),
        randomRange(1.4, 2.35),
        randomRange(2.2, 2.8),
        0.75,
        randomRange(1.22, 1.5),
        2,
      );
    }
  }

  /**
   * Immediately clears all active rockets, burst lights, and firework particles.
   */
  clear(): void {
    for (let i = 0; i < this.rockets.length; i++) {
      this.rockets[i].active = false;
    }
    for (let i = 0; i < this.burstLights.length; i++) {
      this.burstLights[i].active = false;
      this.burstLights[i].light.intensity = 0;
    }
    this.pendingSecondary.active = false;

    const paramsArr = this.paramsAttr.array as Float32Array;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      paramsArr[i * 4 + 1] = 0;
    }
    this.paramsAttr.needsUpdate = true;
    this.buffersDirty = false;
  }

  private acquireRocketSlot(): PooledRocket {
    for (let i = 0; i < this.rockets.length; i++) {
      if (!this.rockets[i].active) {
        return this.rockets[i];
      }
    }
    let oldest = this.rockets[0];
    for (let i = 1; i < this.rockets.length; i++) {
      if (this.rockets[i].elapsed > oldest.elapsed) {
        oldest = this.rockets[i];
      }
    }
    return oldest;
  }

  private pickPalette(): ColorPair {
    let idx = Math.floor(Math.random() * PALETTES.length);
    if (idx === this.lastPaletteIndex) {
      idx =
        (idx + 1 + Math.floor(Math.random() * (PALETTES.length - 1))) %
        PALETTES.length;
    }
    this.lastPaletteIndex = idx;
    return PALETTES[idx];
  }

  private pickBalancedSkyTarget(): { x: number; y: number; z: number } {
    // Frame the floating closed card at origin across left, right, and high crown zones,
    // adapting horizontal spread cleanly for both desktop and portrait mobile viewports
    let zone = Math.floor(Math.random() * 3);
    if (zone === this.lastZoneIndex) {
      zone = (zone + 1 + Math.floor(Math.random() * 2)) % 3;
    }
    this.lastZoneIndex = zone;

    const portrait = isPortraitViewport();

    if (zone === 0) {
      return {
        x: portrait ? randomRange(-3.5, -1.9) : randomRange(-6.6, -2.7),
        y: portrait ? randomRange(2.8, 6.4) : randomRange(2.0, 6.4),
        z: portrait ? randomRange(-12.2, -8.2) : randomRange(-11.2, -5.8),
      };
    }
    if (zone === 1) {
      return {
        x: portrait ? randomRange(1.9, 3.5) : randomRange(2.7, 6.6),
        y: portrait ? randomRange(2.8, 6.4) : randomRange(2.0, 6.4),
        z: portrait ? randomRange(-12.2, -8.2) : randomRange(-11.2, -5.8),
      };
    }
    return {
      x: portrait ? randomRange(-2.1, 2.1) : randomRange(-3.2, 3.2),
      y: portrait ? randomRange(4.8, 7.6) : randomRange(4.4, 7.8),
      z: portrait ? randomRange(-13.4, -9.0) : randomRange(-12.8, -7.2),
    };
  }

  private triggerBurstLight(
    x: number,
    y: number,
    z: number,
    colorHex: number,
  ): void {
    const slot = this.burstLights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.burstLights.length;
    slot.light.position.set(x, y, z);
    slot.light.color.setHex(colorHex);
    slot.elapsed = 0;
    slot.duration = 0.68;
    slot.peakIntensity = 15;
    slot.active = true;
    slot.light.intensity = slot.peakIntensity;
  }

  private emitParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    life: number,
    size: number,
    drag: number,
    gravity: number,
    hdrBoost: number,
    kind: number,
  ): void {
    const idx = this.writeCursor;
    this.writeCursor = (this.writeCursor + 1) % MAX_PARTICLES;

    const i3 = idx * 3;
    const i4 = idx * 4;

    const posArr = this.posAttr.array as Float32Array;
    const velArr = this.velAttr.array as Float32Array;
    const colArr = this.colorAttr.array as Float32Array;
    const parArr = this.paramsAttr.array as Float32Array;
    const metArr = this.metaAttr.array as Float32Array;

    posArr[i3 + 0] = x;
    posArr[i3 + 1] = y;
    posArr[i3 + 2] = z;

    velArr[i3 + 0] = vx;
    velArr[i3 + 1] = vy;
    velArr[i3 + 2] = vz;

    colArr[i3 + 0] = color.r;
    colArr[i3 + 1] = color.g;
    colArr[i3 + 2] = color.b;

    parArr[i4 + 0] = this.simTime;
    parArr[i4 + 1] = life;
    parArr[i4 + 2] = size;
    parArr[i4 + 3] = drag;

    metArr[i4 + 0] = gravity;
    metArr[i4 + 1] = Math.random();
    metArr[i4 + 2] = hdrBoost;
    metArr[i4 + 3] = kind;

    this.buffersDirty = true;
  }

  private detonateRocket(rocket: PooledRocket): void {
    const { x, y, z } = rocket.targetPos;
    this.tempColorA.setHex(rocket.primaryHex);
    this.tempColorB.setHex(rocket.secondaryHex);

    // Subtle dynamic reflection pulse on the floating keepsake card below
    this.triggerBurstLight(x, y, z, rocket.primaryHex);

    // Refined warm ignition flash core (no oversized white snowballs)
    this.emitParticle(
      x,
      y,
      z,
      0,
      0,
      0,
      this.tempColorB,
      0.26,
      5.2,
      1.8,
      0.0,
      1.38,
      1,
    );

    switch (rocket.style) {
      case 'chrysanthemum':
        this.spawnChrysanthemum(x, y, z);
        break;
      case 'double-ring':
        this.spawnDoubleRing(x, y, z);
        break;
      case 'willow':
        this.spawnWillow(x, y, z);
        break;
      case 'palm':
        this.spawnPalm(x, y, z);
        break;
      case 'starburst':
        this.spawnStarburst(x, y, z);
        break;
    }
  }

  private spawnChrysanthemum(x: number, y: number, z: number): void {
    const outerCount = 190;
    const baseSpeed = randomRange(6.4, 8.6);

    for (let i = 0; i < outerCount; i++) {
      const u = 1 - (2 * (i + 0.5)) / outerCount + randomRange(-0.04, 0.04);
      const clampedU = clamp(u, -1, 1);
      const theta = i * 2.3999632 + randomRange(-0.09, 0.09);
      const sinPhi = Math.sqrt(Math.max(0, 1 - clampedU * clampedU));

      const speed = baseSpeed * randomRange(0.84, 1.12);
      const vx = sinPhi * Math.cos(theta) * speed;
      const vy = clampedU * speed;
      const vz = sinPhi * Math.sin(theta) * speed;

      this.tempColorMix
        .copy(this.tempColorA)
        .lerp(this.tempColorB, randomRange(0, 0.35));

      this.emitParticle(
        x,
        y,
        z,
        vx,
        vy,
        vz,
        this.tempColorMix,
        randomRange(1.45, 2.25),
        randomRange(1.8, 3.0),
        randomRange(1.6, 2.05),
        randomRange(1.5, 2.2),
        randomRange(1.24, 1.52),
        i % 4 === 0 ? 2 : 0,
      );
    }

    const innerCount = 75;
    const innerSpeed = baseSpeed * 0.48;
    for (let i = 0; i < innerCount; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
      const speed = innerSpeed * randomRange(0.75, 1.15);

      this.emitParticle(
        x,
        y,
        z,
        sinPhi * Math.cos(theta) * speed,
        u * speed,
        sinPhi * Math.sin(theta) * speed,
        this.tempColorB,
        randomRange(1.05, 1.65),
        randomRange(1.5, 2.5),
        randomRange(1.9, 2.4),
        randomRange(1.2, 1.7),
        randomRange(1.28, 1.55),
        2,
      );
    }
  }

  private spawnDoubleRing(x: number, y: number, z: number): void {
    const ringRadiusSpeedA = randomRange(7.0, 8.8);
    const ringRadiusSpeedB = ringRadiusSpeedA * 0.62;

    this.tempEuler.set(
      randomRange(-0.6, 0.6),
      randomRange(-0.6, 0.6),
      randomRange(0, Math.PI),
    );
    this.tempQuat.setFromEuler(this.tempEuler);

    const outerRingCount = 120;
    for (let i = 0; i < outerRingCount; i++) {
      const a = (i / outerRingCount) * Math.PI * 2 + randomRange(-0.03, 0.03);
      const speed = ringRadiusSpeedA * randomRange(0.93, 1.07);
      this.tempVecA
        .set(Math.cos(a) * speed, Math.sin(a) * speed, randomRange(-0.35, 0.35))
        .applyQuaternion(this.tempQuat);

      this.emitParticle(
        x,
        y,
        z,
        this.tempVecA.x,
        this.tempVecA.y,
        this.tempVecA.z,
        this.tempColorA,
        randomRange(1.55, 2.2),
        randomRange(1.9, 3.0),
        randomRange(1.65, 2.05),
        randomRange(1.35, 1.85),
        randomRange(1.26, 1.54),
        i % 3 === 0 ? 2 : 0,
      );
    }

    this.tempEuler.set(
      this.tempEuler.x + Math.PI * 0.46,
      this.tempEuler.y + 0.55,
      this.tempEuler.z,
    );
    this.tempQuat.setFromEuler(this.tempEuler);

    const innerRingCount = 90;
    for (let i = 0; i < innerRingCount; i++) {
      const a = (i / innerRingCount) * Math.PI * 2 + randomRange(-0.04, 0.04);
      const speed = ringRadiusSpeedB * randomRange(0.92, 1.08);
      this.tempVecA
        .set(Math.cos(a) * speed, Math.sin(a) * speed, randomRange(-0.28, 0.28))
        .applyQuaternion(this.tempQuat);

      this.emitParticle(
        x,
        y,
        z,
        this.tempVecA.x,
        this.tempVecA.y,
        this.tempVecA.z,
        this.tempColorB,
        randomRange(1.35, 2.0),
        randomRange(1.65, 2.7),
        randomRange(1.75, 2.15),
        randomRange(1.2, 1.65),
        randomRange(1.26, 1.54),
        2,
      );
    }

    for (let i = 0; i < 42; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
      const speed = randomRange(1.2, 3.0);
      this.emitParticle(
        x,
        y,
        z,
        sinPhi * Math.cos(theta) * speed,
        u * speed,
        sinPhi * Math.sin(theta) * speed,
        this.tempColorB,
        randomRange(1.1, 1.75),
        randomRange(1.3, 2.15),
        2.3,
        1.1,
        1.38,
        2,
      );
    }
  }

  private spawnWillow(x: number, y: number, z: number): void {
    const strandCount = 34;
    const beadsPerStrand = 7;
    const baseSpeed = randomRange(5.5, 7.4);

    this.tempColorA.setHex(0xf3d38c);
    this.tempColorB.setHex(0xffb85c);

    for (let s = 0; s < strandCount; s++) {
      const u = 1 - (2 * (s + 0.5)) / strandCount + randomRange(-0.08, 0.08);
      const clampedU = clamp(u, -0.85, 0.95);
      const theta = s * 2.3999632 + randomRange(-0.15, 0.15);
      const sinPhi = Math.sqrt(Math.max(0, 1 - clampedU * clampedU));

      const dirX = sinPhi * Math.cos(theta);
      const dirY = clampedU + 0.16;
      const dirZ = sinPhi * Math.sin(theta);

      const strandSpeed = baseSpeed * randomRange(0.86, 1.15);

      for (let b = 0; b < beadsPerStrand; b++) {
        const frac = 1.0 - b * 0.105;
        const speed = strandSpeed * frac;
        const jitter = b === 0 ? 0.04 : 0.16;

        this.tempColorMix
          .copy(this.tempColorA)
          .lerp(this.tempColorB, b / (beadsPerStrand - 1));

        this.emitParticle(
          x,
          y,
          z,
          dirX * speed + randomRange(-jitter, jitter),
          dirY * speed + randomRange(-jitter, jitter),
          dirZ * speed + randomRange(-jitter, jitter),
          this.tempColorMix,
          randomRange(2.15, 3.05) - b * 0.09,
          b === 0 ? 2.8 : randomRange(1.4, 2.2),
          randomRange(1.28, 1.58),
          randomRange(2.65, 3.25),
          b === 0 ? 1.48 : randomRange(1.18, 1.42),
          2,
        );
      }
    }
  }

  private spawnPalm(x: number, y: number, z: number): void {
    const frondCount = 11;
    const beadsPerFrond = 16;
    const baseSpeed = randomRange(7.0, 9.0);

    for (let f = 0; f < frondCount; f++) {
      const angle = (f / frondCount) * Math.PI * 2 + randomRange(-0.14, 0.14);
      const elev = randomRange(-0.28, 0.72);
      const cosE = Math.cos(elev);

      const dx = Math.cos(angle) * cosE;
      const dy = Math.sin(elev) + 0.15;
      const dz = Math.sin(angle) * cosE;

      for (let b = 0; b < beadsPerFrond; b++) {
        const ratio = 1.0 - (b / beadsPerFrond) * 0.62;
        const speed = baseSpeed * ratio;
        const spread = 0.08 + (b / beadsPerFrond) * 0.42;

        this.tempColorMix
          .copy(this.tempColorA)
          .lerp(this.tempColorB, b / beadsPerFrond);

        this.emitParticle(
          x,
          y,
          z,
          dx * speed + randomRange(-spread, spread),
          dy * speed + randomRange(-spread, spread),
          dz * speed + randomRange(-spread, spread),
          this.tempColorMix,
          randomRange(1.5, 2.35) * (0.75 + 0.25 * ratio),
          b < 2 ? 2.9 : randomRange(1.4, 2.3),
          randomRange(1.5, 1.9),
          randomRange(2.1, 2.7),
          b < 2 ? 1.5 : randomRange(1.2, 1.44),
          b % 3 === 0 ? 2 : 0,
        );
      }
    }
  }

  private spawnStarburst(x: number, y: number, z: number): void {
    const pointsCount = 5;
    const outerR = randomRange(7.0, 8.8);
    const innerR = outerR * 0.42;

    this.tempEuler.set(
      randomRange(-0.28, 0.28),
      randomRange(-0.36, 0.36),
      randomRange(-0.25, 0.25),
    );
    this.tempQuat.setFromEuler(this.tempEuler);

    const totalVertices = pointsCount * 2;
    const samplesPerEdge = 16;

    for (let e = 0; e < totalVertices; e++) {
      const a0 = (e / totalVertices) * Math.PI * 2 + Math.PI * 0.5;
      const a1 = ((e + 1) / totalVertices) * Math.PI * 2 + Math.PI * 0.5;
      const r0 = e % 2 === 0 ? outerR : innerR;
      const r1 = (e + 1) % 2 === 0 ? outerR : innerR;

      this.tempVecB.set(Math.cos(a0) * r0, Math.sin(a0) * r0, 0);
      this.tempVecC.set(Math.cos(a1) * r1, Math.sin(a1) * r1, 0);

      for (let s = 0; s < samplesPerEdge; s++) {
        const frac = s / samplesPerEdge;
        this.tempVecA
          .copy(this.tempVecB)
          .lerp(this.tempVecC, frac)
          .applyQuaternion(this.tempQuat);

        this.tempColorMix
          .copy(this.tempColorA)
          .lerp(this.tempColorB, s % 2 === 0 ? 0.15 : 0.6);

        this.emitParticle(
          x,
          y,
          z,
          this.tempVecA.x + randomRange(-0.18, 0.18),
          this.tempVecA.y + randomRange(-0.18, 0.18),
          this.tempVecA.z + randomRange(-0.22, 0.22),
          this.tempColorMix,
          randomRange(1.45, 2.15),
          randomRange(1.8, 2.8),
          randomRange(1.68, 2.08),
          randomRange(1.25, 1.75),
          randomRange(1.28, 1.54),
          s % 3 === 0 ? 2 : 0,
        );
      }
    }

    for (let i = 0; i < 65; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
      const speed = randomRange(2.4, 5.0);
      this.emitParticle(
        x,
        y,
        z,
        sinPhi * Math.cos(theta) * speed,
        u * speed,
        sinPhi * Math.sin(theta) * speed,
        this.tempColorB,
        randomRange(1.15, 1.85),
        randomRange(1.35, 2.15),
        2.0,
        1.3,
        1.34,
        2,
      );
    }
  }

  private updateRockets(dt: number): void {
    for (let i = 0; i < this.rockets.length; i++) {
      const rocket = this.rockets[i];
      if (!rocket.active) continue;

      rocket.prevPos.copy(rocket.pos);
      rocket.elapsed += dt;
      const t = clamp(rocket.elapsed / rocket.duration, 0, 1);

      const easedT = 1 - Math.pow(1 - t, 2.15);
      const sway = Math.sin(t * Math.PI);

      rocket.pos
        .lerpVectors(rocket.startPos, rocket.targetPos, easedT)
        .addScaledVector(rocket.swayOffset, sway);

      this.tempColorA.setHex(0xffe6b3);
      this.tempColorB.setHex(rocket.primaryHex);

      // Sleek glowing comet tip (no white snowball blob on mobile)
      this.emitParticle(
        rocket.pos.x,
        rocket.pos.y,
        rocket.pos.z,
        0,
        -0.4,
        0,
        this.tempColorA,
        0.075,
        3.2,
        2.0,
        0.2,
        1.42,
        1,
      );

      // Sub-step trail sparks along previous -> current segment for silky continuity
      const segDist = rocket.prevPos.distanceTo(rocket.pos);
      const steps = Math.min(8, Math.max(2, Math.ceil(segDist * 3.2)));
      for (let s = 0; s < steps; s++) {
        const frac = s / steps;
        this.tempVecA.lerpVectors(rocket.prevPos, rocket.pos, frac);
        this.tempColorMix
          .copy(this.tempColorA)
          .lerp(this.tempColorB, randomRange(0.2, 0.85));

        this.emitParticle(
          this.tempVecA.x + randomRange(-0.04, 0.04),
          this.tempVecA.y + randomRange(-0.04, 0.04),
          this.tempVecA.z + randomRange(-0.04, 0.04),
          randomRange(-0.42, 0.42),
          randomRange(-1.35, -0.35),
          randomRange(-0.42, 0.42),
          this.tempColorMix,
          randomRange(0.30, 0.54),
          randomRange(1.1, 2.0),
          2.6,
          1.4,
          randomRange(1.18, 1.44),
          3,
        );
      }

      if (t >= 1) {
        rocket.active = false;
        this.detonateRocket(rocket);
      }
    }
  }

  private updateAutoLaunch(dt: number): void {
    if (!this.autoLaunchEnabled) return;

    if (this.pendingSecondary.active) {
      this.pendingSecondary.delay -= dt;
      if (this.pendingSecondary.delay <= 0) {
        this.pendingSecondary.active = false;
        this.launchAt(
          this.pendingSecondary.x,
          this.pendingSecondary.y,
          this.pendingSecondary.z,
        );
      }
    }

    this.autoLaunchCooldown -= dt;
    if (this.autoLaunchCooldown <= 0) {
      const target = this.pickBalancedSkyTarget();
      this.launchAt(target.x, target.y, target.z);

      // Occasional grand symmetric double burst (~28% chance)
      if (!this.pendingSecondary.active && Math.random() < 0.28) {
        const portrait = isPortraitViewport();
        const maxX = portrait ? 3.5 : 6.6;
        this.pendingSecondary.active = true;
        this.pendingSecondary.delay = randomRange(0.18, 0.34);
        this.pendingSecondary.x = clamp(
          -target.x + randomRange(-0.75, 0.75),
          -maxX,
          maxX,
        );
        this.pendingSecondary.y = clamp(
          target.y + randomRange(-0.9, 1.0),
          2.4,
          7.6,
        );
        this.pendingSecondary.z = target.z + randomRange(-1.0, 1.0);
        this.autoLaunchCooldown = randomRange(1.2, 1.55);
      } else {
        this.autoLaunchCooldown = randomRange(0.85, 1.55);
      }
    }
  }

  private updateBurstLights(dt: number): void {
    for (let i = 0; i < this.burstLights.length; i++) {
      const slot = this.burstLights[i];
      if (!slot.active) continue;
      slot.elapsed += dt;
      const t = slot.elapsed / slot.duration;
      if (t >= 1) {
        slot.active = false;
        slot.light.intensity = 0;
      } else {
        slot.light.intensity = slot.peakIntensity * Math.pow(1 - t, 2.2);
      }
    }
  }

  update(_elapsed: number, dt: number): void {
    const safeDt = clamp(dt, 0, 0.1);
    this.simTime += safeDt;

    this.material.uniforms.uTime.value = this.simTime;
    this.material.uniforms.uPixelRatio.value = getSafePixelRatio();

    this.updateAutoLaunch(safeDt);
    this.updateRockets(safeDt);
    this.updateBurstLights(safeDt);

    if (this.buffersDirty) {
      this.posAttr.needsUpdate = true;
      this.velAttr.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
      this.paramsAttr.needsUpdate = true;
      this.metaAttr.needsUpdate = true;
      this.buffersDirty = false;
    }
  }

  dispose(): void {
    this.autoLaunchEnabled = false;
    this.pendingSecondary.active = false;
    for (let i = 0; i < this.burstLights.length; i++) {
      this.burstLights[i].active = false;
      this.burstLights[i].light.intensity = 0;
    }
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }
}
