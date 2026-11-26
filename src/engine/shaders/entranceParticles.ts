import * as THREE from 'three';
import { clamp } from '../utils/math';

const ENTRANCE_VERTEX_SHADER = /* glsl */ `
attribute vec3 aTargetPos;
attribute vec3 aBurstTarget;
attribute vec3 aColor;
attribute vec4 aRandom; // x: order (0..1), y: size, z: phase, w: swirlTurns

uniform float uTime;
uniform float uProgress;
uniform float uBurstActive;
uniform float uBurstTime;
uniform float uBurstOriginProgress;
uniform float uPixelRatio;

varying vec3 vColor;
varying float vAlpha;
varying float vSoftness;

vec2 rotate2D(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main() {
  float order = aRandom.x;
  float baseSize = aRandom.y;
  float phase = aRandom.z;
  float swirlTurns = aRandom.w;

  // Use snapshot progress once burst starts so particles launch seamlessly from current shape
  float effProgress = mix(uProgress, uBurstOriginProgress, uBurstActive);

  // Staggered wave convergence: guaranteed 0 at effProgress=0 and 1 at effProgress=1
  float startT = order * 0.30;
  float endT = 0.70 + order * 0.30;
  float localT = smoothstep(startT, endT, effProgress);

  // Base interpolation from sweeping vortex to golden card silhouette halo
  vec3 pos = mix(position, aTargetPos, localT);

  // Sweeping 3D spiral curl during vortex & convergence, vanishing cleanly at localT = 1
  float vortexWeight = 1.0 - localT;
  float midArc = sin(localT * 3.14159265);
  float spiralAngle = vortexWeight * swirlTurns + vortexWeight * uTime * (0.28 + order * 0.22);
  pos.xy = rotate2D(pos.xy, spiralAngle);

  // Gentle 3D orbital tilt while spiraling in
  pos.xz = rotate2D(pos.xz, vortexWeight * 0.45 * sin(phase + uTime * 0.22));

  // Silky curl ribbon lift during mid-convergence
  vec3 curlOffset = vec3(
    sin(phase * 2.3 + localT * 6.28318 + uTime * 0.9),
    cos(phase * 1.9 - localT * 5.2 + uTime * 0.75),
    sin(phase * 3.1 + localT * 4.5)
  ) * (0.85 * midArc);
  pos += curlOffset;

  // Alive golden halo breathing around the floating card once converged
  float haloDriftAmp = mix(0.14, 0.045, localT);
  pos += vec3(
    sin(uTime * 1.15 + phase) * haloDriftAmp,
    cos(uTime * 0.92 + phase * 1.37) * haloDriftAmp * 1.25,
    sin(uTime * 0.80 + phase * 0.71) * haloDriftAmp
  );

  // Sparkle shimmer
  float twinkle = 0.72 + 0.28 * sin(uTime * (2.0 + order * 2.2) + phase * 3.0);

  float burstFlash = 0.0;
  float alphaScale = mix(0.46, 0.30, localT);
  float sizeScale = mix(0.92, 0.72, localT);
  vSoftness = mix(0.45, 0.18, localT);

  // Ambient ember burst when the card opens
  if (uBurstActive > 0.5) {
    float bT = max(uBurstTime, 0.0);
    // Smooth exponential outward bloom into wide ambient scene volume
    float spread = 1.0 - exp(-bT * (1.6 + order * 0.8));
    float swirlOut = exp(-bT * 1.15) * sin(min(bT, 2.5) * 1.6) * 0.48;

    // Serene slow ambient ember currents once dispersed
    vec3 emberCurrent = vec3(
      sin(uTime * 0.24 + phase * 1.7 + order * 6.28) * 0.85,
      cos(uTime * 0.20 + phase * 1.13) * 0.65 + sin(uTime * 0.13 + phase) * 0.38,
      cos(uTime * 0.22 + phase * 0.89) * 0.75
    );

    vec3 targetEmber = aBurstTarget + emberCurrent;
    pos = mix(pos, targetEmber, spread);
    pos.xy = rotate2D(pos.xy, swirlOut * (order - 0.5));
    pos.y += (1.0 - exp(-bT * 0.9)) * 0.42;

    burstFlash = exp(-bT * 3.4) * 0.36;
    alphaScale = mix(0.44, 0.16, smoothstep(0.30, 2.2, bT));
    sizeScale = mix(0.86, 0.40, smoothstep(0.18, 2.0, bT));
    vSoftness = mix(0.22, 0.10, smoothstep(0.2, 1.5, bT));
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float dist = max(-mvPosition.z, 0.8);
  float camFade = smoothstep(2.2, 6.2, dist);

  vAlpha = camFade * alphaScale * twinkle;
  vColor = aColor * (mix(0.88, 1.12, twinkle) + burstFlash);

  float ptSize = baseSize * sizeScale * uPixelRatio * (82.0 / dist);
  gl_PointSize = clamp(ptSize, 1.0, 15.0 * uPixelRatio);

  gl_Position = projectionMatrix * mvPosition;
}
`;

const ENTRANCE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vAlpha;
varying float vSoftness;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  // Fine pinpoint stardust core + delicate Gaussian whisper halo (no heavy fuzzy bokeh discs)
  float core = exp(-r2 * 22.0) * 0.96;
  float glow = exp(-r2 * 7.2) * mix(0.30, 0.46, vSoftness);

  float intensity = (core + glow) * smoothstep(1.0, 0.35, r2);
  float weight = intensity * vAlpha;
  if (weight < 0.003) discard;

  vec3 col = mix(vColor, vColor * 1.12 + vec3(0.10, 0.08, 0.04), clamp(core * 0.42, 0.0, 1.0));
  float a = min(weight, 1.0);
  gl_FragColor = vec4(col * (weight / a), a);
}
`;

function getSafePixelRatio(): number {
  return typeof window !== 'undefined'
    ? Math.min(window.devicePixelRatio || 1, 2)
    : 1;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Samples a point along a rounded rectangle silhouette centered at the origin.
 */
function sampleRoundedRectPerimeter(
  halfW: number,
  halfH: number,
  cornerR: number,
  u: number,
  out: THREE.Vector3,
): void {
  const r = Math.min(cornerR, halfW, halfH);
  const straightW = Math.max(0, (halfW - r) * 2);
  const straightH = Math.max(0, (halfH - r) * 2);
  const arcLen = Math.PI * 0.5 * r;
  const totalLen = 2 * straightW + 2 * straightH + 4 * arcLen;

  let d = ((u % 1) + 1) % 1 * totalLen;

  // Top edge (left -> right)
  if (d < straightW) {
    out.set(-(halfW - r) + d, halfH, 0);
    return;
  }
  d -= straightW;

  // Top-right corner
  if (d < arcLen) {
    const a = Math.PI * 0.5 - (d / arcLen) * Math.PI * 0.5;
    out.set(halfW - r + Math.cos(a) * r, halfH - r + Math.sin(a) * r, 0);
    return;
  }
  d -= arcLen;

  // Right edge (top -> bottom)
  if (d < straightH) {
    out.set(halfW, halfH - r - d, 0);
    return;
  }
  d -= straightH;

  // Bottom-right corner
  if (d < arcLen) {
    const a = -(d / arcLen) * Math.PI * 0.5;
    out.set(halfW - r + Math.cos(a) * r, -(halfH - r) + Math.sin(a) * r, 0);
    return;
  }
  d -= arcLen;

  // Bottom edge (right -> left)
  if (d < straightW) {
    out.set(halfW - r - d, -halfH, 0);
    return;
  }
  d -= straightW;

  // Bottom-left corner
  if (d < arcLen) {
    const a = -Math.PI * 0.5 - (d / arcLen) * Math.PI * 0.5;
    out.set(-(halfW - r) + Math.cos(a) * r, -(halfH - r) + Math.sin(a) * r, 0);
    return;
  }
  d -= arcLen;

  // Left edge (bottom -> top)
  if (d < straightH) {
    out.set(-halfW, -(halfH - r) + d, 0);
    return;
  }
  d -= straightH;

  // Top-left corner
  const a = Math.PI - (d / Math.max(arcLen, 0.0001)) * Math.PI * 0.5;
  out.set(-(halfW - r) + Math.cos(a) * r, halfH - r + Math.sin(a) * r, 0);
}

/**
 * Sweeping cosmic stardust vortex that converges into a shimmering golden
 * silhouette halo hugging the floating 3D card (~3.2 x 4.4), then blossoms
 * into ambient drifting golden embers when the card opens.
 */
export class EntranceParticles {
  readonly points: THREE.Points;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  private simTime = 0;
  private progress = 0;
  private burstActive = false;
  private burstTime = 0;

  constructor(count = 3200) {
    const safeCount = Math.max(100, Math.floor(count));
    this.geometry = this.createGeometry(safeCount);
    this.material = new THREE.ShaderMaterial({
      vertexShader: ENTRANCE_VERTEX_SHADER,
      fragmentShader: ENTRANCE_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uBurstActive: { value: 0 },
        uBurstTime: { value: 0 },
        uBurstOriginProgress: { value: 1 },
        uPixelRatio: { value: getSafePixelRatio() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'EntranceParticles';
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  private createGeometry(count: number): THREE.BufferGeometry {
    const startPositions = new Float32Array(count * 3);
    const targetPositions = new Float32Array(count * 3);
    const burstTargets = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const randoms = new Float32Array(count * 4);

    // Celestial Atelier golden stardust palette
    const champagne = new THREE.Color(0xf3d38c);
    const amber = new THREE.Color(0xffb85c);
    const ivory = new THREE.Color(0xf5f2eb);
    const roseGold = new THREE.Color(0xf2b8c6);

    const tempTarget = new THREE.Vector3();

    // Floating 3D card silhouette dimensions (~3.2 width x ~4.4 height)
    const cardHalfW = 1.66;
    const cardHalfH = 2.26;
    const cornerRadius = 0.22;

    const armCount = 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      const tNorm = i / count;

      // 1. Vortex starting position: grand 3-arm logarithmic spiral framing viewport
      const arm = i % armCount;
      const radialT = Math.pow(Math.random(), 0.72);
      const radius = 3.8 + radialT * 13.5;
      const baseAngle =
        (arm / armCount) * Math.PI * 2 +
        radialT * Math.PI * 2.6 +
        randomRange(-0.42, 0.42);

      const vx = Math.cos(baseAngle) * radius;
      const vy = Math.sin(baseAngle) * radius * 0.78 + randomRange(-1.1, 1.1);
      const vz =
        -11.5 +
        (1.0 - radialT) * 14.5 +
        Math.sin(baseAngle * 2.0) * 1.8 +
        randomRange(-1.6, 1.6);

      startPositions[i3 + 0] = vx;
      startPositions[i3 + 1] = vy;
      startPositions[i3 + 2] = vz;

      // 2. Converged airy golden stardust silhouette hugging the floating 3D card
      const role = Math.random();
      if (role < 0.38) {
        // Feathered gold-leaf perimeter hugging card edges without harsh box glare
        const u = Math.random();
        sampleRoundedRectPerimeter(cardHalfW, cardHalfH, cornerRadius, u, tempTarget);
        const radialSpread = (Math.random() + Math.random() - 1.0) * 0.34;
        const outLen = Math.hypot(tempTarget.x, tempTarget.y) || 1;
        tempTarget.x += (tempTarget.x / outLen) * radialSpread;
        tempTarget.y += (tempTarget.y / outLen) * radialSpread;
        tempTarget.z = randomRange(-0.42, 0.22);
      } else if (role < 0.72) {
        // Ethereal golden aura halo softly framing the card from behind
        const angle = Math.random() * Math.PI * 2;
        const band = randomRange(0.95, 1.38);
        tempTarget.set(
          Math.cos(angle) * (cardHalfW * 1.14) * band,
          Math.sin(angle) * (cardHalfH * 1.10) * band,
          randomRange(-0.85, -0.18),
        );
      } else {
        // Delicate orbiting stardust motes floating loosely around the silhouette
        const angle = Math.random() * Math.PI * 2;
        const band = randomRange(1.25, 1.95);
        tempTarget.set(
          Math.cos(angle) * (cardHalfW * 1.15) * band,
          Math.sin(angle) * (cardHalfH * 1.08) * band,
          randomRange(-1.4, 0.55),
        );
      }

      targetPositions[i3 + 0] = tempTarget.x;
      targetPositions[i3 + 1] = tempTarget.y;
      targetPositions[i3 + 2] = tempTarget.z;

      // 3. Ambient burst destination: wide outer starfield shell keeping the center
      //    camera-to-cake / prologue corridor clean and uncluttered
      const bTheta = Math.random() * Math.PI * 2;
      const bCosPhi = randomRange(-0.85, 0.88);
      const bSinPhi = Math.sqrt(Math.max(0, 1 - bCosPhi * bCosPhi));
      const bRadius = randomRange(9.5, 24.5);

      let bx = bSinPhi * Math.cos(bTheta) * bRadius * 1.22;
      let by = bCosPhi * bRadius * 0.82 + 0.8;
      let bz = bSinPhi * Math.sin(bTheta) * bRadius * 0.92 - 3.5;

      // Push any particles that fall near the foreground center cleanly into periphery
      if (Math.abs(bx) < 5.2 && Math.abs(by) < 4.2 && bz > -4.5) {
        bz -= 9.5;
      }

      burstTargets[i3 + 0] = bx;
      burstTargets[i3 + 1] = by;
      burstTargets[i3 + 2] = bz;

      // 4. Restrained selective HDR golden palette (0.85..1.12 — luminous without neon glare)
      const cPick = Math.random();
      const baseCol =
        cPick < 0.48
          ? champagne
          : cPick < 0.76
            ? amber
            : cPick < 0.93
              ? ivory
              : roseGold;

      const hdrBoost =
        role < 0.38 ? randomRange(0.88, 1.12) : randomRange(0.82, 1.04);

      colors[i3 + 0] = baseCol.r * hdrBoost;
      colors[i3 + 1] = baseCol.g * hdrBoost;
      colors[i3 + 2] = baseCol.b * hdrBoost;

      // 5. Per-particle animation seeds
      randoms[i4 + 0] = clamp(tNorm * 0.4 + Math.random() * 0.6, 0, 1); // order
      randoms[i4 + 1] =
        role < 0.38 ? randomRange(0.68, 1.48) : randomRange(0.75, 1.72); // size
      randoms[i4 + 2] = Math.random() * Math.PI * 2; // phase
      randoms[i4 + 3] = randomRange(1.6, 3.4); // swirl turns
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(startPositions, 3));
    geometry.setAttribute('aTargetPos', new THREE.BufferAttribute(targetPositions, 3));
    geometry.setAttribute('aBurstTarget', new THREE.BufferAttribute(burstTargets, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 4));
    return geometry;
  }

  /**
   * Sets convergence progress:
   * 0 = sweeping cosmic vortex; 1 = shimmering golden silhouette around the floating card.
   */
  setProgress(morphProgress: number): void {
    this.progress = clamp(morphProgress, 0, 1);
    this.material.uniforms.uProgress.value = this.progress;
  }

  /**
   * Launches particles outward into gentle ambient drifting golden embers.
   */
  burst(): void {
    if (this.burstActive) return;
    this.burstActive = true;
    this.burstTime = 0;
    this.material.uniforms.uBurstOriginProgress.value = this.progress;
    this.material.uniforms.uBurstActive.value = 1.0;
    this.material.uniforms.uBurstTime.value = 0.0;
  }

  /**
   * Resets cleanly back to initial vortex state for full replay.
   */
  reset(): void {
    this.progress = 0;
    this.burstActive = false;
    this.burstTime = 0;
    this.material.uniforms.uProgress.value = 0;
    this.material.uniforms.uBurstActive.value = 0;
    this.material.uniforms.uBurstTime.value = 0;
    this.material.uniforms.uBurstOriginProgress.value = 1;
  }

  update(_elapsed: number, dt: number): void {
    const safeDt = clamp(dt, 0, 0.1);
    this.simTime += safeDt;

    this.material.uniforms.uTime.value = this.simTime;
    this.material.uniforms.uPixelRatio.value = getSafePixelRatio();

    if (this.burstActive) {
      this.burstTime += safeDt;
      this.material.uniforms.uBurstTime.value = this.burstTime;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
