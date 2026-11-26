import * as THREE from 'three';
import { clamp, damp } from '../utils/math';

const NEBULA_VERTEX_SHADER = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = normalize(position);
  vec3 rotatedOffset = mat3(modelMatrix) * position;
  vec4 worldPos = vec4(cameraPosition + rotatedOffset, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const NEBULA_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIntensity;

varying vec3 vDir;

float hash31(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  mat3 rot = mat3(
     0.80,  0.60,  0.00,
    -0.60,  0.80,  0.00,
     0.00,  0.00,  1.00
  );
  for (int i = 0; i < 4; i++) {
    value += amp * noise3D(p);
    p = rot * (p * 2.03 + vec3(1.7, -2.3, 1.1));
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vDir);

  // Linear-space Celestial Atelier midnight palette (kept well under bloom threshold 0.92)
  vec3 deepAbyss      = vec3(0.0022, 0.0034, 0.0108); // ~ #050712
  vec3 midnightVelvet = vec3(0.0085, 0.0148, 0.0460); // ~ #0B1026
  vec3 nebulaIndigo   = vec3(0.0240, 0.0420, 0.1320); // ~ #1A244D
  vec3 twilightViolet = vec3(0.0360, 0.0230, 0.1050);
  vec3 astralSlate    = vec3(0.0150, 0.0480, 0.1020);
  vec3 champagneMist  = vec3(0.1450, 0.1020, 0.0440);

  // Smooth zenith-to-horizon velvety cosmic gradient
  float elev = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBand = exp(-pow((dir.y + 0.06) * 2.15, 2.0));
  vec3 col = mix(deepAbyss, midnightVelvet, smoothstep(0.05, 0.85, elev) * 0.65 + horizonBand * 0.45);

  // Tilted galactic band plane
  vec3 bandNormal = normalize(vec3(0.28, 0.84, -0.46));
  float bandDist = abs(dot(dir, bandNormal));
  float galacticBand = exp(-bandDist * bandDist * 5.2);

  // Slow domain-warped 3D nebula wisps (completely seam-free on sphere)
  float t = uTime * 0.018;
  vec3 q = dir * 2.15 + vec3(t * 0.7, -t * 0.45, t * 0.55);
  float warp = fbm(q);
  float wispA = fbm(dir * 3.1 + vec3(warp * 1.45, -warp * 1.1 + t * 0.6, warp * 0.85));
  float wispB = fbm(dir * 4.4 - vec3(t * 0.5, warp * 1.25, -warp * 0.9));

  // Softly sculpted nebula ribbons — smooth, never banded or neon
  float nebulaMask = smoothstep(0.32, 0.82, wispA) * (0.35 + 0.65 * galacticBand);
  float auroraVeil = smoothstep(0.42, 0.86, wispB) * (0.28 + 0.72 * horizonBand);
  float goldenDust = smoothstep(0.58, 0.90, wispA * 0.6 + wispB * 0.4) * galacticBand;

  float intensity = clamp(uIntensity, 0.55, 1.65);

  col = mix(col, nebulaIndigo, nebulaMask * 0.68 * intensity);
  col += twilightViolet * auroraVeil * 0.48 * intensity;
  col += astralSlate * smoothstep(0.45, 0.85, warp) * galacticBand * 0.34 * intensity;
  col += champagneMist * goldenDust * 0.22 * intensity;

  // Subtle dark cosmic dust lanes carving gentle depth through the band
  float dustLane = smoothstep(0.56, 0.82, fbm(dir * 5.2 + vec3(2.4, t * 0.3, -1.7)));
  col *= 1.0 - dustLane * galacticBand * 0.32;

  // Triangular micro-dither to eliminate 8-bit dark sky color banding
  float dither = (hash21(gl_FragCoord.xy) + hash21(gl_FragCoord.xy + vec2(17.3, 41.9)) - 1.0) / 255.0;
  col = max(col + dither * 0.65, vec3(0.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

const STARFIELD_VERTEX_SHADER = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
attribute float aSpeed;
attribute float aHero;

uniform float uTime;
uniform float uPixelRatio;
uniform float uIntensity;

varying vec3 vColor;
varying float vAlpha;
varying float vHero;
varying float vTwinkle;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mvPosition.z, 0.5);

  // Organic multi-harmonic twinkle
  float waveA = sin(uTime * aSpeed + aPhase);
  float waveB = sin(uTime * aSpeed * 1.91 + aPhase * 1.63);
  float twinkle = 0.62 + 0.26 * waveA + 0.12 * waveB;

  float intensityScale = mix(0.86, 1.24, clamp((uIntensity - 0.6) / 1.0, 0.0, 1.0));
  float camFade = smoothstep(3.0, 11.5, dist);

  vTwinkle = twinkle;
  vHero = aHero;
  vAlpha = camFade * mix(0.55, 1.0, twinkle);
  vColor = aColor * mix(0.82, 1.26, twinkle) * intensityScale;

  float pointSize = aSize * uPixelRatio * (185.0 / dist) * mix(0.88, 1.14, twinkle);
  gl_PointSize = clamp(pointSize, 1.0, 26.0 * uPixelRatio);

  gl_Position = projectionMatrix * mvPosition;
}
`;

const STARFIELD_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;
varying float vHero;
varying float vTwinkle;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  // Soft Gaussian corona + crisp starlight core
  float halo = exp(-r2 * 8.5) * 0.48;
  float core = exp(-r2 * 36.0) * 1.12;

  // Delicate 4-point diffraction cross glint on brightest hero stars
  float glint = 0.0;
  if (vHero > 0.62) {
    float heroStrength = smoothstep(0.62, 1.0, vHero);
    float crossX = exp(-abs(p.y) * 20.0 - abs(p.x) * 3.4);
    float crossY = exp(-abs(p.x) * 20.0 - abs(p.y) * 3.4);
    glint = (crossX + crossY) * 0.36 * heroStrength * (0.7 + 0.3 * vTwinkle);
  }

  float shape = (halo + core + glint) * smoothstep(1.0, 0.25, r2);
  float weight = shape * vAlpha;
  if (weight < 0.003) discard;

  // Warm-white incandescent lift right at the pinpoint core
  vec3 finalColor = mix(vColor, vColor * 1.18 + vec3(0.16, 0.14, 0.12), clamp(core * 0.5, 0.0, 1.0));
  float a = min(weight, 1.0);

  // Exact HDR-preserving additive blend output (SRC_ALPHA * rgb = finalColor * weight)
  gl_FragColor = vec4(finalColor * (weight / a), a);
}
`;

const BOKEH_VERTEX_SHADER = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aPhase;
attribute float aSpeed;

uniform float uTime;
uniform float uPixelRatio;
uniform float uIntensity;

varying vec3 vColor;
varying float vAlpha;

void main() {
  // Gentle slow candlelit drift deep behind the starfield
  vec3 pos = position;
  pos.x += sin(uTime * aSpeed * 0.65 + aPhase) * 1.4;
  pos.y += cos(uTime * aSpeed * 0.52 + aPhase * 1.31) * 1.15;
  pos.z += sin(uTime * aSpeed * 0.44 + aPhase * 0.77) * 0.85;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float dist = max(-mvPosition.z, 1.0);

  // Subtle breathing warmth; fade completely if camera ever orbits near
  float pulse = 0.76 + 0.24 * sin(uTime * aSpeed + aPhase * 2.1);
  float camFade = smoothstep(14.0, 26.0, dist);
  float intensityScale = mix(0.88, 1.16, clamp((uIntensity - 0.6) / 1.0, 0.0, 1.0));

  vColor = aColor;
  vAlpha = aAlpha * pulse * camFade * intensityScale;

  float ptSize = aSize * uPixelRatio * (520.0 / dist);
  gl_PointSize = clamp(ptSize, 14.0 * uPixelRatio, 112.0 * uPixelRatio);

  gl_Position = projectionMatrix * mvPosition;
}
`;

const BOKEH_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  if (vAlpha <= 0.001) discard;

  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  float r = sqrt(r2);

  // Velvety cinema-lens candlelight bokeh disc with whisper-soft edge ring (strictly non-HDR)
  float body = smoothstep(1.0, 0.18, r) * 0.78;
  float softRing = exp(-pow((r - 0.68) * 5.0, 2.0)) * 0.24;
  float edgeFeather = smoothstep(1.0, 0.68, r);

  float shape = (body + softRing) * edgeFeather;
  float alpha = clamp(shape * vAlpha, 0.0, 0.22);
  if (alpha < 0.002) discard;

  // Non-HDR additive contribution: vColor * alpha stays ~0.04..0.14 (well below bloom threshold 0.92)
  gl_FragColor = vec4(vColor, alpha);
}
`;

const SHOOTING_STAR_VERTEX_SHADER = /* glsl */ `
attribute vec3 aTailPos;
attribute float aSide;
attribute float aAlong;
attribute float aAlpha;
attribute float aWidth;
attribute vec3 aColor;

varying float vAlong;
varying float vSide;
varying float vAlpha;
varying vec3 vColor;

void main() {
  vAlong = aAlong;
  vSide = aSide;
  vAlpha = aAlpha;
  vColor = aColor;

  vec3 headWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 tailWorld = (modelMatrix * vec4(aTailPos, 1.0)).xyz;
  vec3 seg = headWorld - tailWorld;
  float segLen = length(seg);

  if (aAlpha <= 0.001 || segLen <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 worldPos = mix(tailWorld, headWorld, aAlong);
  vec3 tangent = seg / segLen;
  vec3 toCam = normalize(cameraPosition - worldPos);
  vec3 sideDir = cross(tangent, toCam);
  float sideLen = length(sideDir);
  sideDir = sideLen > 0.0001 ? sideDir / sideLen : vec3(0.0, 1.0, 0.0);

  // Gracefully taper from gossamer tail to radiant comet head
  float width = aWidth * mix(0.16, 1.0, pow(aAlong, 0.7));
  worldPos += sideDir * aSide * width;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

const SHOOTING_STAR_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying float vAlong;
varying float vSide;
varying float vAlpha;
varying vec3 vColor;

void main() {
  if (vAlpha <= 0.001) discard;

  float crossFade = exp(-vSide * vSide * 5.8);
  float tailFade = pow(clamp(vAlong, 0.0, 1.0), 2.35);
  float headGlow = exp(-pow((1.0 - vAlong) * 14.0, 2.0)) * 1.45;
  float tipCutoff = smoothstep(1.0, 0.96, vAlong);

  float lum = (tailFade * 0.65 + headGlow * 1.1) * crossFade * tipCutoff * vAlpha;
  if (lum < 0.003) discard;

  vec3 col = mix(vColor, vColor * 1.28 + vec3(0.30, 0.26, 0.18), clamp(headGlow * 0.55, 0.0, 1.0));
  float a = min(lum, 1.0);
  gl_FragColor = vec4(col * (lum / a), a);
}
`;

interface ShootingStarSlot {
  active: boolean;
  elapsed: number;
  duration: number;
  cooldown: number;
  startPos: THREE.Vector3;
  velocity: THREE.Vector3;
  tailLength: number;
  width: number;
  color: THREE.Color;
}

function getSafePixelRatio(): number {
  return typeof window !== 'undefined'
    ? Math.min(window.devicePixelRatio || 1, 2)
    : 1;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Deep celestial sky dome, multi-layer twinkling HDR starfield,
 * and occasional distant shooting stars.
 */
export class CosmicBackdrop {
  readonly group: THREE.Group;

  private readonly domeMesh: THREE.Mesh;
  private readonly domeGeometry: THREE.SphereGeometry;
  private readonly domeMaterial: THREE.ShaderMaterial;

  private readonly bokehPoints: THREE.Points;
  private readonly bokehGeometry: THREE.BufferGeometry;
  private readonly bokehMaterial: THREE.ShaderMaterial;

  private readonly starPoints: THREE.Points;
  private readonly starGeometry: THREE.BufferGeometry;
  private readonly starMaterial: THREE.ShaderMaterial;

  private readonly shootingMesh: THREE.Mesh;
  private readonly shootingGeometry: THREE.BufferGeometry;
  private readonly shootingMaterial: THREE.ShaderMaterial;
  private readonly shootingSlots: ShootingStarSlot[];
  private readonly shootHeadAttr: THREE.BufferAttribute;
  private readonly shootTailAttr: THREE.BufferAttribute;
  private readonly shootAlphaAttr: THREE.BufferAttribute;
  private readonly shootWidthAttr: THREE.BufferAttribute;
  private readonly shootColorAttr: THREE.BufferAttribute;

  private readonly tempHead = new THREE.Vector3();
  private readonly tempTail = new THREE.Vector3();
  private readonly tempDir = new THREE.Vector3();
  private readonly tempHoriz = new THREE.Vector3();
  private readonly tempDown = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  private simTime = 0;
  private smoothedIntensity = 1.0;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'CosmicBackdrop';

    const pixelRatio = getSafePixelRatio();

    // 1. Inverted celestial nebula dome (camera-centered, depthTest disabled)
    this.domeGeometry = new THREE.SphereGeometry(45, 48, 32);
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX_SHADER,
      fragmentShader: NEBULA_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      transparent: false,
    });
    this.domeMesh = new THREE.Mesh(this.domeGeometry, this.domeMaterial);
    this.domeMesh.renderOrder = -100;
    this.domeMesh.frustumCulled = false;
    this.group.add(this.domeMesh);

    // 2. Distant warm candlelight bokeh orbs drifting softly behind the starfield
    this.bokehGeometry = this.createBokehGeometry(32);
    this.bokehMaterial = new THREE.ShaderMaterial({
      vertexShader: BOKEH_VERTEX_SHADER,
      fragmentShader: BOKEH_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uIntensity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.bokehPoints = new THREE.Points(this.bokehGeometry, this.bokehMaterial);
    this.bokehPoints.renderOrder = -65;
    this.bokehPoints.frustumCulled = false;
    this.group.add(this.bokehPoints);

    // 3. Multi-layer GPU starfield (~4600 stars across far / mid / near shells)
    this.starGeometry = this.createStarfieldGeometry(4600);
    this.starMaterial = new THREE.ShaderMaterial({
      vertexShader: STARFIELD_VERTEX_SHADER,
      fragmentShader: STARFIELD_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uIntensity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.starPoints = new THREE.Points(this.starGeometry, this.starMaterial);
    this.starPoints.renderOrder = -50;
    this.starPoints.frustumCulled = false;
    this.group.add(this.starPoints);

    // 3. Distant shooting stars (3 pooled billboarded light streaks)
    const slotCount = 3;
    const vertCount = slotCount * 4;
    const headPositions = new Float32Array(vertCount * 3);
    const tailPositions = new Float32Array(vertCount * 3);
    const sides = new Float32Array(vertCount);
    const alongs = new Float32Array(vertCount);
    const alphas = new Float32Array(vertCount);
    const widths = new Float32Array(vertCount);
    const colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    for (let i = 0; i < slotCount; i++) {
      const vBase = i * 4;
      // 0: tail-left, 1: tail-right, 2: head-left, 3: head-right
      alongs[vBase + 0] = 0;
      sides[vBase + 0] = -1;
      alongs[vBase + 1] = 0;
      sides[vBase + 1] = 1;
      alongs[vBase + 2] = 1;
      sides[vBase + 2] = -1;
      alongs[vBase + 3] = 1;
      sides[vBase + 3] = 1;

      indices.push(
        vBase + 0,
        vBase + 1,
        vBase + 2,
        vBase + 2,
        vBase + 1,
        vBase + 3,
      );
    }

    this.shootingGeometry = new THREE.BufferGeometry();
    this.shootHeadAttr = new THREE.BufferAttribute(headPositions, 3);
    this.shootTailAttr = new THREE.BufferAttribute(tailPositions, 3);
    this.shootAlphaAttr = new THREE.BufferAttribute(alphas, 1);
    this.shootWidthAttr = new THREE.BufferAttribute(widths, 1);
    this.shootColorAttr = new THREE.BufferAttribute(colors, 3);

    this.shootingGeometry.setAttribute('position', this.shootHeadAttr);
    this.shootingGeometry.setAttribute('aTailPos', this.shootTailAttr);
    this.shootingGeometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    this.shootingGeometry.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1));
    this.shootingGeometry.setAttribute('aAlpha', this.shootAlphaAttr);
    this.shootingGeometry.setAttribute('aWidth', this.shootWidthAttr);
    this.shootingGeometry.setAttribute('aColor', this.shootColorAttr);
    this.shootingGeometry.setIndex(indices);

    this.shootingMaterial = new THREE.ShaderMaterial({
      vertexShader: SHOOTING_STAR_VERTEX_SHADER,
      fragmentShader: SHOOTING_STAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.shootingMesh = new THREE.Mesh(this.shootingGeometry, this.shootingMaterial);
    this.shootingMesh.renderOrder = -40;
    this.shootingMesh.frustumCulled = false;
    this.group.add(this.shootingMesh);

    this.shootingSlots = [];
    for (let i = 0; i < slotCount; i++) {
      this.shootingSlots.push({
        active: false,
        elapsed: 0,
        duration: 1.2,
        cooldown: 2.2 + i * 3.4 + randomRange(0.4, 2.2),
        startPos: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        tailLength: 9.0,
        width: 0.14,
        color: new THREE.Color(),
      });
    }
  }

  private createBokehGeometry(count: number): THREE.BufferGeometry {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);

    // Warm candlelight bokeh palette (strictly non-HDR so zero bloom washout)
    const bokehPalette = [
      new THREE.Color(0xffb85c), // Candlelight Amber
      new THREE.Color(0xf3d38c), // Champagne Gold
      new THREE.Color(0xf2b8c6), // Whisper Rose-Gold
      new THREE.Color(0xf7dfae), // Soft Honey-Ivory
    ];

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Place deep behind the stage in a wide panoramic crescent so the sky glows
      // with romantic candlelit warmth from both front and orbited viewing angles
      const azimuth =
        i < Math.floor(count * 0.72)
          ? randomRange(-Math.PI * 0.62, Math.PI * 0.62)
          : randomRange(-Math.PI, Math.PI);
      const elevation = randomRange(-0.42, 0.56);
      const radius = randomRange(38, 56);
      const cosEl = Math.cos(elevation);

      positions[i3 + 0] = Math.sin(azimuth) * cosEl * radius;
      positions[i3 + 1] = Math.sin(elevation) * radius * 0.78 + 1.2;
      positions[i3 + 2] = -Math.cos(azimuth) * cosEl * radius;

      const pick = Math.random();
      const col =
        pick < 0.38
          ? bokehPalette[0]
          : pick < 0.72
            ? bokehPalette[1]
            : pick < 0.90
              ? bokehPalette[2]
              : bokehPalette[3];

      const warmth = randomRange(0.76, 0.94);
      colors[i3 + 0] = col.r * warmth;
      colors[i3 + 1] = col.g * warmth;
      colors[i3 + 2] = col.b * warmth;

      sizes[i] = randomRange(3.2, 7.6);
      alphas[i] = randomRange(0.06, 0.135);
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = randomRange(0.18, 0.42);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    return geometry;
  }

  private createStarfieldGeometry(count: number): THREE.BufferGeometry {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const heroes = new Float32Array(count);

    // Harmonious star temperatures (converted to linear RGB by THREE.Color)
    const palette = [
      new THREE.Color(0xf5f2eb), // Starlight Ivory
      new THREE.Color(0xf3d38c), // Champagne Gold
      new THREE.Color(0xffd9a0), // Soft Warm Gold
      new THREE.Color(0xc7dcff), // Cool Starlight Blue
      new THREE.Color(0xe9e6ff), // Pearlescent Astral White
      new THREE.Color(0xf2c6d2), // Faint Rose-Pearl
    ];

    // Tilted galactic basis vectors to gently cluster ~34% of far stars along the Milky Way arc
    const bandNormal = new THREE.Vector3(0.28, 0.84, -0.46).normalize();
    const tangentA = new THREE.Vector3(1, 0, 0).cross(bandNormal).normalize();
    const tangentB = bandNormal.clone().cross(tangentA).normalize();
    const pos = new THREE.Vector3();

    const farCutoff = Math.floor(count * 0.50);
    const midCutoff = Math.floor(count * 0.85);

    for (let i = 0; i < count; i++) {
      const isFar = i < farCutoff;
      const isMid = !isFar && i < midCutoff;

      const radius = isFar
        ? randomRange(60, 84)
        : isMid
          ? randomRange(40, 60)
          : randomRange(24, 40);

      // Distribute on sphere, with tasteful galactic-band density boost for far/mid layers
      if ((isFar || isMid) && Math.random() < 0.34) {
        const theta = Math.random() * Math.PI * 2;
        const lat = (Math.random() + Math.random() + Math.random() - 1.5) * 0.36;
        const cosLat = Math.cos(lat);
        pos
          .copy(tangentA)
          .multiplyScalar(Math.cos(theta) * cosLat)
          .addScaledVector(tangentB, Math.sin(theta) * cosLat)
          .addScaledVector(bandNormal, Math.sin(lat))
          .normalize()
          .multiplyScalar(radius);
      } else {
        const u = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const sinPhi = Math.sqrt(Math.max(0, 1 - u * u));
        pos.set(
          sinPhi * Math.cos(theta) * radius,
          u * radius,
          sinPhi * Math.sin(theta) * radius,
        );
      }

      const i3 = i * 3;
      positions[i3 + 0] = pos.x;
      positions[i3 + 1] = pos.y;
      positions[i3 + 2] = pos.z;

      // Pick harmonious color weighting toward ivory, champagne gold & subtle starlight blue
      const rColor = Math.random();
      const baseColor =
        rColor < 0.38
          ? palette[0]
          : rColor < 0.64
            ? palette[1]
            : rColor < 0.77
              ? palette[2]
              : rColor < 0.90
                ? palette[3]
                : rColor < 0.96
                  ? palette[4]
                  : palette[5];

      // Determine hero status for selective HDR bloom sparkle
      const isHero = !isFar && Math.random() < (isMid ? 0.06 : 0.22);
      const heroVal = isHero ? randomRange(0.7, 1.0) : randomRange(0.0, 0.35);

      // Selective HDR luminance: ordinary stars softly glimmer below/near threshold,
      // hero stars rise smoothly into 1.25..1.65 so UnrealBloomPass halos them cleanly.
      const brightness = isHero
        ? randomRange(1.22, 1.65)
        : isFar
          ? randomRange(0.42, 0.88)
          : randomRange(0.68, 1.15);

      colors[i3 + 0] = baseColor.r * brightness;
      colors[i3 + 1] = baseColor.g * brightness;
      colors[i3 + 2] = baseColor.b * brightness;

      sizes[i] = isHero
        ? randomRange(2.2, 3.6)
        : isFar
          ? randomRange(0.75, 1.55)
          : isMid
            ? randomRange(1.0, 2.0)
            : randomRange(1.2, 2.4);

      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = randomRange(0.55, 2.35);
      heroes[i] = heroVal;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aHero', new THREE.BufferAttribute(heroes, 1));
    return geometry;
  }

  private spawnShootingStar(slot: ShootingStarSlot): void {
    // Spawn on the far upper celestial dome, primarily behind & around the viewer's horizon
    const azimuth = randomRange(-Math.PI * 0.92, Math.PI * 0.92);
    const elevation = randomRange(0.18, 0.68);
    const radius = randomRange(58, 74);

    const cosEl = Math.cos(elevation);
    // Bias z toward negative (far sky behind the floating card & constellation)
    const sx = Math.sin(azimuth) * cosEl * radius;
    const sy = Math.sin(elevation) * radius;
    const sz = -Math.abs(Math.cos(azimuth) * cosEl * radius) * 0.85 - 10;

    slot.startPos.set(sx, sy, sz);

    // Compute a graceful tangent glide angled diagonally downward across the sky
    const radial = this.tempDir.copy(slot.startPos).normalize();
    this.tempHoriz.crossVectors(this.worldUp, radial).normalize();
    if (Math.random() < 0.5) this.tempHoriz.negate();
    this.tempDown.crossVectors(radial, this.tempHoriz).normalize();
    if (this.tempDown.y > 0) this.tempDown.negate();

    const speed = randomRange(22, 34);
    slot.velocity
      .copy(this.tempHoriz)
      .multiplyScalar(randomRange(0.72, 0.95))
      .addScaledVector(this.tempDown, randomRange(0.32, 0.58))
      .normalize()
      .multiplyScalar(speed);

    slot.duration = randomRange(0.95, 1.55);
    slot.elapsed = 0;
    slot.tailLength = randomRange(8.5, 13.5);
    slot.width = randomRange(0.12, 0.19);
    slot.active = true;

    // Warm champagne-gold or pearlescent starlight hue with HDR boost
    const warmPick = Math.random();
    if (warmPick < 0.55) {
      slot.color.setHex(0xf3d38c).multiplyScalar(1.75);
    } else if (warmPick < 0.85) {
      slot.color.setHex(0xf5f2eb).multiplyScalar(1.7);
    } else {
      slot.color.setHex(0xcce2ff).multiplyScalar(1.65);
    }
  }

  private updateShootingStars(dt: number): void {
    let anyDirty = false;
    const headArr = this.shootHeadAttr.array as Float32Array;
    const tailArr = this.shootTailAttr.array as Float32Array;
    const alphaArr = this.shootAlphaAttr.array as Float32Array;
    const widthArr = this.shootWidthAttr.array as Float32Array;
    const colorArr = this.shootColorAttr.array as Float32Array;

    const rateScale = clamp(this.smoothedIntensity, 0.7, 1.6);

    for (let i = 0; i < this.shootingSlots.length; i++) {
      const slot = this.shootingSlots[i];
      const vBase = i * 4;

      if (!slot.active) {
        slot.cooldown -= dt * rateScale;
        if (slot.cooldown <= 0) {
          this.spawnShootingStar(slot);
          anyDirty = true;
        } else {
          continue;
        }
      }

      slot.elapsed += dt;
      const progress = slot.elapsed / slot.duration;
      anyDirty = true;

      if (progress >= 1) {
        slot.active = false;
        slot.cooldown = randomRange(3.6, 7.8);
        for (let k = 0; k < 4; k++) {
          alphaArr[vBase + k] = 0;
        }
        continue;
      }

      // Smooth fade-in and fade-out envelope
      const fadeIn = clamp(progress / 0.16, 0, 1);
      const fadeOut = clamp((1 - progress) / 0.34, 0, 1);
      const alpha = fadeIn * fadeIn * fadeOut;

      this.tempHead
        .copy(slot.startPos)
        .addScaledVector(slot.velocity, slot.elapsed);

      const currentTailLen = slot.tailLength * Math.min(1, progress * 3.8);
      this.tempDir.copy(slot.velocity).normalize();
      this.tempTail
        .copy(this.tempHead)
        .addScaledVector(this.tempDir, -currentTailLen);

      for (let k = 0; k < 4; k++) {
        const vi = vBase + k;
        const vi3 = vi * 3;
        headArr[vi3 + 0] = this.tempHead.x;
        headArr[vi3 + 1] = this.tempHead.y;
        headArr[vi3 + 2] = this.tempHead.z;

        tailArr[vi3 + 0] = this.tempTail.x;
        tailArr[vi3 + 1] = this.tempTail.y;
        tailArr[vi3 + 2] = this.tempTail.z;

        alphaArr[vi] = alpha;
        widthArr[vi] = slot.width;

        colorArr[vi3 + 0] = slot.color.r;
        colorArr[vi3 + 1] = slot.color.g;
        colorArr[vi3 + 2] = slot.color.b;
      }
    }

    if (anyDirty) {
      this.shootHeadAttr.needsUpdate = true;
      this.shootTailAttr.needsUpdate = true;
      this.shootAlphaAttr.needsUpdate = true;
      this.shootWidthAttr.needsUpdate = true;
      this.shootColorAttr.needsUpdate = true;
    }
  }

  update(_elapsed: number, dt: number, intensity = 1.0): void {
    const safeDt = clamp(dt, 0, 0.1);
    this.simTime += safeDt;
    this.smoothedIntensity = damp(this.smoothedIntensity, intensity, 2.8, safeDt);

    const pixelRatio = getSafePixelRatio();

    this.domeMaterial.uniforms.uTime.value = this.simTime;
    this.domeMaterial.uniforms.uIntensity.value = this.smoothedIntensity;

    this.bokehMaterial.uniforms.uTime.value = this.simTime;
    this.bokehMaterial.uniforms.uIntensity.value = this.smoothedIntensity;
    this.bokehMaterial.uniforms.uPixelRatio.value = pixelRatio;

    this.starMaterial.uniforms.uTime.value = this.simTime;
    this.starMaterial.uniforms.uIntensity.value = this.smoothedIntensity;
    this.starMaterial.uniforms.uPixelRatio.value = pixelRatio;

    // Very slow majestic celestial sphere drift
    this.starPoints.rotation.y = this.simTime * 0.0085;
    this.starPoints.rotation.x = Math.sin(this.simTime * 0.012) * 0.025;
    this.bokehPoints.rotation.y = this.simTime * 0.0055;
    this.domeMesh.rotation.y = this.simTime * 0.004;

    this.updateShootingStars(safeDt);
  }

  dispose(): void {
    this.domeGeometry.dispose();
    this.domeMaterial.dispose();
    this.bokehGeometry.dispose();
    this.bokehMaterial.dispose();
    this.starGeometry.dispose();
    this.starMaterial.dispose();
    this.shootingGeometry.dispose();
    this.shootingMaterial.dispose();
    this.group.clear();
  }
}
