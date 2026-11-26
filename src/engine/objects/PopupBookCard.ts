import * as THREE from 'three';
import type { BirthdayCardConfig } from '../../config/types';
import {
  createCardCoverCanvas,
  createCardInnerPageCanvas,
} from '../artwork/proceduralArt';
import { clamp, damp, easeOutCubic } from '../utils/math';

const PAGE_W = 2.58;
const PAGE_H = 3.56;
const CARD_T = 0.022;

interface OpacityEntry {
  material: THREE.Material;
  baseOpacity: number;
  alwaysTransparent: boolean;
  isCake: boolean;
}

interface UniformAlphaEntry {
  uniform: { value: number };
  base: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createSoftGlowShaderMaterial(
  colorHex: number,
  opacity: number,
  power = 2.2,
  hdrBoost = 1.0,
): THREE.ShaderMaterial {
  const color = new THREE.Color(colorHex);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: color },
      uOpacity: { value: opacity },
      uPower: { value: power },
      uHdrBoost: { value: hdrBoost },
      uTime: { value: 0 },
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
      uniform float uPower;
      uniform float uHdrBoost;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float dist = length(centered);
        float falloff = pow(max(0.0, 1.0 - dist), uPower);
        float shimmer = 0.94 + 0.06 * sin(uTime * 2.4 + dist * 4.0);
        float alpha = falloff * uOpacity * shimmer;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor * (uHdrBoost + falloff * 0.25), alpha);
      }
    `,
  });
}

function createCandleFlameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float h = clamp((pos.y + 0.14) / 0.28, 0.0, 1.0);
        vHeight = h;

        float radiusScale = sin(pow(h, 0.72) * 3.14159265) * (1.0 - h * 0.35);
        pos.x *= max(0.08, radiusScale);
        pos.z *= max(0.08, radiusScale);

        float swayX = sin(uTime * 6.4 + h * 3.1) * 0.016 * h * h;
        float swayZ = cos(uTime * 5.2 + h * 2.4) * 0.012 * h * h;
        float stretch = 1.0 + sin(uTime * 9.0) * 0.055 * h;
        pos.x += swayX;
        pos.z += swayZ;
        pos.y *= stretch;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vHeight;
      void main() {
        float flicker = 0.93 + 0.07 * sin(uTime * 10.8 + vHeight * 5.0);
        vec3 core = vec3(1.68, 1.54, 1.24);
        vec3 mid = vec3(1.45, 0.98, 0.42);
        vec3 tip = vec3(1.12, 0.58, 0.24);

        vec3 col = mix(core, mid, smoothstep(0.14, 0.58, vHeight));
        col = mix(col, tip, smoothstep(0.58, 0.98, vHeight));

        float alpha = smoothstep(0.0, 0.16, vHeight) * (1.0 - smoothstep(0.84, 1.0, vHeight));
        gl_FragColor = vec4(col * flicker, alpha * uOpacity);
      }
    `,
  });
}

function createFourPointSparkShape(outerR: number, innerR: number): THREE.Shape {
  const shape = new THREE.Shape();
  const points = 8;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

/**
 * Pure warm-white cotton-paper folded greeting card (slim cardstock leaves,
 * crisp folded spine crease, sleek minimal champagne-gold circular seal sticker,
 * and refined minimalist white-and-gold pop-up birthday cake with dancing flame).
 */
export class PopupBookCard {
  readonly group = new THREE.Group();

  private config: BirthdayCardConfig;
  private readonly bookPivot = new THREE.Group();
  private readonly rightLeafPivot = new THREE.Group();
  private readonly leftLeafPivot = new THREE.Group();
  private readonly sealGroup = new THREE.Group();
  private readonly innerGlowGroup = new THREE.Group();
  private readonly popupStageGroup = new THREE.Group();
  private readonly cakeGroup = new THREE.Group();

  private readonly interactiveMeshes: THREE.Object3D[] = [];
  private readonly cakeInteractiveMeshes: THREE.Object3D[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly opacityEntries: OpacityEntry[] = [];
  private readonly shaderAlphaEntries: UniformAlphaEntry[] = [];

  private readonly innerLight: THREE.PointLight;
  private readonly candleLight: THREE.PointLight;
  private readonly gapGlowMat: THREE.ShaderMaterial;
  private readonly slitGlowMat: THREE.ShaderMaterial;
  private readonly sealHaloMat: THREE.ShaderMaterial;
  private readonly flameAuraMat: THREE.ShaderMaterial;
  private readonly flameMat: THREE.ShaderMaterial;
  private readonly sealStickerMat: THREE.MeshStandardMaterial;
  private readonly sealEmblemMat: THREE.MeshStandardMaterial;
  private readonly frontCoverMat: THREE.MeshStandardMaterial;
  private readonly leftPageMat: THREE.MeshStandardMaterial;
  private readonly rightPageMat: THREE.MeshStandardMaterial;
  private readonly flameAnchor = new THREE.Object3D();

  private coverTex: THREE.CanvasTexture;
  private leftPageTex: THREE.CanvasTexture;
  private rightPageTex: THREE.CanvasTexture;

  private openAmount = 0;
  private cardAlpha = 1;
  private cakeFactor = 0;
  private hoveringSeal = false;
  private hoverBlend = 0;
  private wishPulse = 0;

  // Minimal gold seal sticker state: 1 = intact, 0 = dissolved
  private sealTarget = 1;
  private sealBlend = 1;
  private sealBreakPulse = 0;

  private readonly tempVec = new THREE.Vector3();

  constructor(config: BirthdayCardConfig) {
    this.config = config;
    this.group.name = 'PopupBookCard';
    this.group.add(this.bookPivot);

    // ─── Crisp Warm-White Cardstock Textures ─────────────────────────
    const coverCanvas = createCardCoverCanvas(config, 1024, 1408);
    const leftPageCanvas = createCardInnerPageCanvas('left', config, 1024, 1408);
    const rightPageCanvas = createCardInnerPageCanvas('right', config, 1024, 1408);

    this.coverTex = this.makeCanvasTexture(coverCanvas);
    this.leftPageTex = this.makeCanvasTexture(leftPageCanvas);
    this.rightPageTex = this.makeCanvasTexture(rightPageCanvas);

    // ─── Matte Cotton-Paper & Brushed Champagne-Gold Materials ───────
    const paperEdgeMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd8d3cb,
        emissive: 0x35322d,
        emissiveIntensity: 0.22,
        roughness: 0.96,
        metalness: 0.0,
        envMapIntensity: 0.08,
      }),
      1,
    );

    const paperBackMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xdcd7cf,
        emissive: 0xffffff,
        emissiveIntensity: 0.13,
        roughness: 0.96,
        metalness: 0.0,
        envMapIntensity: 0.08,
      }),
      1,
    );

    const sealGoldRingMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xe2c385,
        emissive: 0x5c4319,
        emissiveIntensity: 0.18,
        roughness: 0.3,
        metalness: 0.72,
      }),
      1,
    );

    // Cake materials kept transparent-ready so closing fade never recompiles WebGL shaders
    const cakeGoldMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xe2c385,
        emissive: 0x5c4319,
        emissiveIntensity: 0.18,
        roughness: 0.3,
        metalness: 0.72,
        transparent: true,
        opacity: 1,
      }),
      1,
      true,
      true,
    );

    const softGoldPearlMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xebd197,
        emissive: 0x805e24,
        emissiveIntensity: 0.22,
        roughness: 0.28,
        metalness: 0.65,
        transparent: true,
        opacity: 1,
      }),
      1,
      true,
      true,
    );

    // Genuinely matte pure warm-white cotton cardstock (zero specular hotspot, strictly below 0.92 bloom)
    this.frontCoverMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: this.coverTex,
        emissiveMap: this.coverTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.14,
        color: 0xdcd7cf,
        roughness: 0.96,
        metalness: 0.0,
        envMapIntensity: 0.08,
      }),
      1,
    );

    this.leftPageMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: this.leftPageTex,
        emissiveMap: this.leftPageTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.12,
        color: 0xd8d3cb,
        roughness: 0.96,
        metalness: 0.0,
        envMapIntensity: 0.08,
      }),
      1,
    );

    this.rightPageMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        map: this.rightPageTex,
        emissiveMap: this.rightPageTex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.12,
        color: 0xd8d3cb,
        roughness: 0.96,
        metalness: 0.0,
        envMapIntensity: 0.08,
      }),
      1,
    );

    // ─── Crisp Folded Paper Crease at Spine (x = 0, no book ribs!) ───
    const creaseGeo = this.trackGeometry(
      new THREE.CylinderGeometry(
        CARD_T * 1.02,
        CARD_T * 1.02,
        PAGE_H,
        16,
        1,
        false,
        Math.PI,
        Math.PI,
      ),
    );
    const creaseMesh = new THREE.Mesh(creaseGeo, paperEdgeMat);
    creaseMesh.position.set(0, 0, 0);
    this.bookPivot.add(creaseMesh);

    // ─── Right Card Leaf (White Back + Right Inner Page) ─────────────
    this.rightLeafPivot.position.set(0, 0, -CARD_T * 0.52);
    this.bookPivot.add(this.rightLeafPivot);

    const cardLeafGeo = this.trackGeometry(new THREE.BoxGeometry(PAGE_W, PAGE_H, CARD_T));
    const rightBoard = new THREE.Mesh(cardLeafGeo, [
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      paperEdgeMat,
      paperBackMat,
    ]);
    rightBoard.position.set(PAGE_W * 0.5, 0, 0);
    this.rightLeafPivot.add(rightBoard);

    const pageFaceGeo = this.trackGeometry(new THREE.PlaneGeometry(PAGE_W - 0.008, PAGE_H - 0.008));
    const rightPage = new THREE.Mesh(pageFaceGeo, this.rightPageMat);
    rightPage.position.set(PAGE_W * 0.5, 0, CARD_T * 0.5 + 0.002);
    this.rightLeafPivot.add(rightPage);

    // ─── Left Card Leaf (Pure White Front Cover + Left Inner Page) ───
    this.leftLeafPivot.position.set(0, 0, CARD_T * 0.52);
    this.bookPivot.add(this.leftLeafPivot);

    const leftBoard = new THREE.Mesh(cardLeafGeo, paperEdgeMat);
    leftBoard.position.set(PAGE_W * 0.5, 0, 0);
    this.leftLeafPivot.add(leftBoard);

    const frontCover = new THREE.Mesh(pageFaceGeo, this.frontCoverMat);
    frontCover.position.set(PAGE_W * 0.5, 0, CARD_T * 0.5 + 0.002);
    frontCover.name = 'CardFrontCover';
    this.leftLeafPivot.add(frontCover);
    this.interactiveMeshes.push(frontCover);

    const leftPage = new THREE.Mesh(pageFaceGeo, this.leftPageMat);
    leftPage.position.set(PAGE_W * 0.5, 0, -CARD_T * 0.5 - 0.002);
    leftPage.rotation.y = Math.PI;
    this.leftLeafPivot.add(leftPage);

    // ─── Sleek Minimal Flat Champagne-Gold Circular Seal Sticker ─────
    this.sealGroup.position.set(PAGE_W - 0.14, 0, CARD_T * 0.5 + 0.008);
    this.leftLeafPivot.add(this.sealGroup);

    this.sealStickerMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xdcb973,
        emissive: 0xc89a4a,
        emissiveIntensity: 0.24,
        roughness: 0.34,
        metalness: 0.62,
      }),
      1,
    );

    const sealStickerGeo = this.trackGeometry(
      new THREE.CylinderGeometry(0.165, 0.165, 0.012, 40),
    );
    const sealSticker = new THREE.Mesh(sealStickerGeo, this.sealStickerMat);
    sealSticker.rotation.x = Math.PI / 2;
    sealSticker.name = 'CardSealSticker';
    this.sealGroup.add(sealSticker);
    this.interactiveMeshes.push(sealSticker);

    const sealRingGeo = this.trackGeometry(new THREE.TorusGeometry(0.132, 0.006, 8, 40));
    const sealRing = new THREE.Mesh(sealRingGeo, sealGoldRingMat);
    sealRing.position.z = 0.008;
    this.sealGroup.add(sealRing);

    const sparkShape = createFourPointSparkShape(0.072, 0.02);
    const sparkGeo = this.trackGeometry(new THREE.ShapeGeometry(sparkShape));
    this.sealEmblemMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfff8e8,
        emissive: 0xffd78a,
        emissiveIntensity: 0.55,
        roughness: 0.24,
        metalness: 0.45,
        side: THREE.DoubleSide,
      }),
      1,
    );
    const sealEmblem = new THREE.Mesh(sparkGeo, this.sealEmblemMat);
    sealEmblem.position.z = 0.01;
    this.sealGroup.add(sealEmblem);

    this.sealHaloMat = createSoftGlowShaderMaterial(0xffd27d, 0.34, 2.2, 0.95);
    this.trackShaderMaterial(this.sealHaloMat, 0.34);
    const sealHaloGeo = this.trackGeometry(new THREE.PlaneGeometry(0.76, 0.76));
    const sealHalo = new THREE.Mesh(sealHaloGeo, this.sealHaloMat);
    sealHalo.position.z = 0.004;
    this.sealGroup.add(sealHalo);

    // Generous invisible hit proxy on front leaf for effortless click/tap in AWAITING_OPEN
    const hitProxyGeo = this.trackGeometry(
      new THREE.BoxGeometry(PAGE_W + 0.42, PAGE_H + 0.32, 0.6),
    );
    const hitProxyMat = this.trackMaterial(
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      0,
      true,
    );
    const hitProxy = new THREE.Mesh(hitProxyGeo, hitProxyMat);
    hitProxy.position.set(PAGE_W * 0.5 + 0.06, 0, 0.08);
    hitProxy.name = 'CardHitProxy';
    this.leftLeafPivot.add(hitProxy);
    this.interactiveMeshes.push(hitProxy);

    // ─── Inner Warm Light & Subtle Half-Open Crease Glow ─────────────
    this.innerGlowGroup.position.set(PAGE_W * 0.42, 0, 0.1);
    this.bookPivot.add(this.innerGlowGroup);

    this.innerLight = new THREE.PointLight(0xffcb7d, 0, 9.0, 1.8);
    this.innerLight.position.set(PAGE_W * 0.35, 0.0, 0.12);
    this.innerGlowGroup.add(this.innerLight);

    this.gapGlowMat = createSoftGlowShaderMaterial(0xffca78, 0.0, 1.9, 1.0);
    this.trackShaderMaterial(this.gapGlowMat, 0.0);
    const gapGlowGeo = this.trackGeometry(new THREE.PlaneGeometry(2.0, 3.4));
    const gapGlow = new THREE.Mesh(gapGlowGeo, this.gapGlowMat);
    gapGlow.position.set(0.32, 0, 0.14);
    gapGlow.rotation.y = -0.35;
    this.innerGlowGroup.add(gapGlow);

    this.slitGlowMat = createSoftGlowShaderMaterial(0xffd890, 0.0, 2.3, 1.05);
    this.trackShaderMaterial(this.slitGlowMat, 0.0);
    const slitGlowGeo = this.trackGeometry(new THREE.PlaneGeometry(0.95, 3.55));
    const slitGlow = new THREE.Mesh(slitGlowGeo, this.slitGlowMat);
    slitGlow.position.set(PAGE_W * 0.48, 0, 0.3);
    slitGlow.rotation.y = -0.82;
    this.innerGlowGroup.add(slitGlow);

    // ─── Refined Minimalist White-and-Gold Pop-Up Birthday Cake ──────
    this.popupStageGroup.position.set(0, -0.36, 0.22);
    this.popupStageGroup.rotation.x = 0.52;
    this.popupStageGroup.visible = false;
    this.bookPivot.add(this.popupStageGroup);
    this.popupStageGroup.add(this.cakeGroup);

    // Slim champagne-gold dessert plate
    const plateGeo = this.trackGeometry(
      new THREE.CylinderGeometry(0.62, 0.56, 0.032, 44),
    );
    const plate = new THREE.Mesh(plateGeo, cakeGoldMat);
    plate.position.y = 0.02;
    this.cakeGroup.add(plate);

    // Clean matte-porcelain warm-white cake material (strictly non-blooming)
    const whiteCakeMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xe6e1d8,
        emissive: 0xffffff,
        emissiveIntensity: 0.11,
        roughness: 0.88,
        metalness: 0.0,
        envMapIntensity: 0.14,
        transparent: true,
        opacity: 1,
      }),
      1,
      true,
      true,
    );

    const tier1Geo = this.trackGeometry(
      new THREE.CylinderGeometry(0.49, 0.5, 0.34, 44),
    );
    const tier1 = new THREE.Mesh(tier1Geo, whiteCakeMat);
    tier1.position.y = 0.206;
    this.cakeGroup.add(tier1);

    const tier1RibbonGeo = this.trackGeometry(new THREE.TorusGeometry(0.498, 0.011, 10, 52));
    const tier1BotRibbon = new THREE.Mesh(tier1RibbonGeo, cakeGoldMat);
    tier1BotRibbon.rotation.x = Math.PI / 2;
    tier1BotRibbon.position.y = 0.048;
    this.cakeGroup.add(tier1BotRibbon);

    const tier1TopRim = new THREE.Mesh(tier1RibbonGeo, cakeGoldMat);
    tier1TopRim.rotation.x = Math.PI / 2;
    tier1TopRim.position.y = 0.376;
    this.cakeGroup.add(tier1TopRim);

    const pearlGeo = this.trackGeometry(new THREE.SphereGeometry(0.022, 10, 10));
    const tier1Pearls = 12;
    for (let i = 0; i < tier1Pearls; i++) {
      const angle = (i / tier1Pearls) * Math.PI * 2;
      const pearl = new THREE.Mesh(pearlGeo, softGoldPearlMat);
      pearl.position.set(Math.cos(angle) * 0.455, 0.388, Math.sin(angle) * 0.455);
      this.cakeGroup.add(pearl);
    }

    // Minimalist second tier
    const tier2Geo = this.trackGeometry(
      new THREE.CylinderGeometry(0.32, 0.33, 0.27, 40),
    );
    const tier2 = new THREE.Mesh(tier2Geo, whiteCakeMat);
    tier2.position.y = 0.51;
    this.cakeGroup.add(tier2);

    const tier2RibbonGeo = this.trackGeometry(new THREE.TorusGeometry(0.325, 0.009, 10, 44));
    const tier2TopRim = new THREE.Mesh(tier2RibbonGeo, cakeGoldMat);
    tier2TopRim.rotation.x = Math.PI / 2;
    tier2TopRim.position.y = 0.646;
    this.cakeGroup.add(tier2TopRim);

    const tier2Pearls = 8;
    for (let i = 0; i < tier2Pearls; i++) {
      const angle = (i / tier2Pearls) * Math.PI * 2;
      const pearl = new THREE.Mesh(pearlGeo, softGoldPearlMat);
      pearl.scale.setScalar(0.82);
      pearl.position.set(Math.cos(angle) * 0.292, 0.656, Math.sin(angle) * 0.292);
      this.cakeGroup.add(pearl);
    }

    // Slim champagne-gold candle + softly glowing animated flame
    const candleGeo = this.trackGeometry(
      new THREE.CylinderGeometry(0.025, 0.028, 0.34, 18),
    );
    const candle = new THREE.Mesh(candleGeo, cakeGoldMat);
    candle.position.y = 0.815;
    this.cakeGroup.add(candle);

    const wickMat = this.trackMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x3b3530,
        roughness: 0.9,
        metalness: 0.0,
        transparent: true,
        opacity: 1,
      }),
      1,
      true,
      true,
    );
    const wickGeo = this.trackGeometry(new THREE.CylinderGeometry(0.005, 0.006, 0.042, 8));
    const wick = new THREE.Mesh(wickGeo, wickMat);
    wick.position.y = 1.005;
    this.cakeGroup.add(wick);

    this.flameMat = createCandleFlameMaterial();
    this.trackShaderMaterial(this.flameMat, 1.0);
    const flameGeo = this.trackGeometry(new THREE.SphereGeometry(0.068, 16, 16));
    const flame = new THREE.Mesh(flameGeo, this.flameMat);
    flame.scale.set(0.84, 1.82, 0.84);
    flame.position.y = 1.115;
    this.cakeGroup.add(flame);

    // Single ultra-delicate warm glow halo strictly around the candle flame
    this.flameAuraMat = createSoftGlowShaderMaterial(0xffcf82, 0.42, 2.4, 1.05);
    this.trackShaderMaterial(this.flameAuraMat, 0.42);
    const flameAuraGeo = this.trackGeometry(new THREE.PlaneGeometry(0.62, 0.62));
    const flameAura = new THREE.Mesh(flameAuraGeo, this.flameAuraMat);
    flameAura.position.y = 1.13;
    this.cakeGroup.add(flameAura);

    this.candleLight = new THREE.PointLight(0xffcf88, 0, 4.4, 2.0);
    this.candleLight.position.set(0, 1.36, 0.36);
    this.cakeGroup.add(this.candleLight);

    this.flameAnchor.position.set(0, 1.15, 0);
    this.cakeGroup.add(this.flameAnchor);

    // Interactive invisible hit sphere around cake & candle for PROLOGUE wish sparkle
    const cakeHitGeo = this.trackGeometry(new THREE.SphereGeometry(0.88, 12, 12));
    const cakeHitMesh = new THREE.Mesh(cakeHitGeo, hitProxyMat);
    cakeHitMesh.position.set(0, 0.62, 0);
    cakeHitMesh.name = 'CakeWishHitProxy';
    this.cakeGroup.add(cakeHitMesh);
    this.cakeInteractiveMeshes.push(cakeHitMesh);

    this.applyOpenKinematics();
  }

  /**
   * Redraws only the 3 greeting card textures (cover + left/right inner pages)
   * when the creator edits Step 1 fields live in Studio.
   */
  updateConfig(config: BirthdayCardConfig): void {
    this.config = config;
    this.redrawCardTextures();
  }

  setOpenAmount(amount: number): void {
    this.openAmount = clamp(amount, 0, 1);
    this.applyOpenKinematics();
  }

  setCardVisibility(alpha: number): void {
    this.cardAlpha = clamp(alpha, 0, 1);
    this.group.visible = this.cardAlpha > 0.004;
    this.syncMaterialOpacities();
  }

  setHoveringSeal(hovering: boolean): void {
    this.hoveringSeal = hovering;
  }

  triggerSealBreak(): void {
    this.sealTarget = 0;
    this.sealBreakPulse = 1.0;
  }

  triggerSealRestore(): void {
    this.sealTarget = 1;
    this.sealBreakPulse = 0;
  }

  getInteractiveMeshes(): THREE.Object3D[] {
    return this.interactiveMeshes;
  }

  getCakeInteractiveMeshes(): THREE.Object3D[] {
    return this.cakeInteractiveMeshes;
  }

  triggerCakeWishPulse(): void {
    this.wishPulse = 1.0;
  }

  getCandleWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.flameAnchor.getWorldPosition(target);
  }

  refreshTypographyTextures(): void {
    this.redrawCardTextures();
  }

  getSealWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.sealGroup.getWorldPosition(target);
  }

  getHearthWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.popupStageGroup.getWorldPosition(target);
  }

  update(elapsed: number, dt: number): void {
    const safeDt = Math.min(dt, 0.05);

    this.hoverBlend = damp(this.hoverBlend, this.hoveringSeal ? 1 : 0, 10, safeDt);
    this.sealBlend = damp(
      this.sealBlend,
      this.sealTarget,
      this.sealTarget === 0 ? 11 : 6.5,
      safeDt,
    );
    if (this.sealBreakPulse > 0) {
      this.sealBreakPulse = Math.max(0, this.sealBreakPulse - safeDt * 2.4);
    }
    if (this.wishPulse > 0) {
      this.wishPulse = Math.max(0, this.wishPulse - safeDt * 1.45);
    }

    // Minimal circular seal sticker gentle pulse & hover response
    const sealPulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4);
    const breakExpand = 1.0 + this.sealBreakPulse * 0.42;
    const sealScale =
      Math.max(0.001, this.sealBlend) *
      (1.0 + this.hoverBlend * 0.14 + sealPulse * 0.025) *
      breakExpand;
    this.sealGroup.scale.setScalar(sealScale);
    this.sealGroup.visible = this.sealBlend > 0.02;

    this.sealStickerMat.emissiveIntensity =
      (0.22 + sealPulse * 0.14 + this.hoverBlend * 0.35 + this.sealBreakPulse * 0.85) *
      this.cardAlpha;
    this.sealEmblemMat.emissiveIntensity =
      (0.5 + sealPulse * 0.22 + this.hoverBlend * 0.48 + this.sealBreakPulse * 1.1) *
      this.cardAlpha;

    const sealHaloBase =
      (0.28 + sealPulse * 0.16 + this.hoverBlend * 0.3) * this.sealBlend;
    this.sealHaloMat.uniforms.uOpacity.value = sealHaloBase * this.cardAlpha;
    this.sealHaloMat.uniforms.uTime.value = elapsed;

    // Warm inner gap light during half-open pose; ultra-soft when open so white pages never blow out
    const halfOpenGlow = Math.sin(clamp(this.openAmount / 0.5, 0, 1) * Math.PI) * 0.72;
    const openAmbient = clamp((this.openAmount - 0.45) / 0.55, 0, 1) * 0.04;
    const flicker = 0.94 + 0.06 * Math.sin(elapsed * 5.2) + 0.03 * Math.sin(elapsed * 11.4);

    this.innerLight.intensity =
      (halfOpenGlow * 0.55 + openAmbient + this.wishPulse * 0.4) *
      flicker *
      this.cardAlpha;

    const gapIntensity = clamp(
      Math.sin(clamp(this.openAmount / 0.52, 0, 1) * Math.PI) * 0.42,
      0,
      0.44,
    );
    this.gapGlowMat.uniforms.uOpacity.value = gapIntensity * flicker * this.cardAlpha;
    this.gapGlowMat.uniforms.uTime.value = elapsed;

    const slitIntensity = clamp(
      Math.sin(clamp(this.openAmount / 0.44, 0, 1) * Math.PI) * 0.5,
      0,
      0.52,
    );
    this.slitGlowMat.uniforms.uOpacity.value = slitIntensity * flicker * this.cardAlpha;
    this.slitGlowMat.uniforms.uTime.value = elapsed;

    // Decoupled zero-clipping cake scale & fade:
    // Cake shrinks & vanishes completely over openAmount [0.90 -> 0.56] BEFORE leaves fold past 0.55 -> 0.0
    const cakeScale = smoothstep(0.56, 0.9, this.openAmount);
    if (Math.abs(cakeScale - this.cakeFactor) > 0.001) {
      this.cakeFactor = cakeScale;
      this.syncMaterialOpacities();
    }

    const showCake = cakeScale > 0.01 && this.cardAlpha > 0.005;
    this.popupStageGroup.visible = showCake;
    this.cakeGroup.visible = showCake;

    if (showCake) {
      const s = Math.max(0.001, cakeScale);
      this.popupStageGroup.scale.set(s, s, s);
      this.popupStageGroup.position.y = -0.54 + 0.22 * cakeScale;

      this.cakeGroup.rotation.y = elapsed * (0.18 + this.wishPulse * 0.35);

      this.flameMat.uniforms.uTime.value = elapsed;
      this.flameMat.uniforms.uOpacity.value = cakeScale * this.cardAlpha;

      this.flameAuraMat.uniforms.uTime.value = elapsed;
      this.flameAuraMat.uniforms.uOpacity.value =
        (0.32 + this.wishPulse * 0.24) * cakeScale * this.cardAlpha;

      this.candleLight.intensity =
        (0.34 + 0.08 * Math.sin(elapsed * 8.2) + this.wishPulse * 0.52) *
        cakeScale *
        this.cardAlpha;
    } else {
      this.candleLight.intensity = 0;
    }

    this.tempVec.set(0, 0, 0);
  }

  dispose(): void {
    for (const geo of this.geometries) {
      geo.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
    this.opacityEntries.length = 0;
    this.shaderAlphaEntries.length = 0;
    this.interactiveMeshes.length = 0;
    this.cakeInteractiveMeshes.length = 0;
  }

  private redrawCardTextures(): void {
    const nextCover = this.makeCanvasTexture(
      createCardCoverCanvas(this.config, 1024, 1408),
    );
    const nextLeft = this.makeCanvasTexture(
      createCardInnerPageCanvas('left', this.config, 1024, 1408),
    );
    const nextRight = this.makeCanvasTexture(
      createCardInnerPageCanvas('right', this.config, 1024, 1408),
    );

    const oldCover = this.coverTex;
    const oldLeft = this.leftPageTex;
    const oldRight = this.rightPageTex;

    this.coverTex = nextCover;
    this.leftPageTex = nextLeft;
    this.rightPageTex = nextRight;

    this.frontCoverMat.map = nextCover;
    this.frontCoverMat.emissiveMap = nextCover;
    this.frontCoverMat.needsUpdate = true;

    this.leftPageMat.map = nextLeft;
    this.leftPageMat.emissiveMap = nextLeft;
    this.leftPageMat.needsUpdate = true;

    this.rightPageMat.map = nextRight;
    this.rightPageMat.emissiveMap = nextRight;
    this.rightPageMat.needsUpdate = true;

    this.disposeReplacedTexture(oldCover);
    this.disposeReplacedTexture(oldLeft);
    this.disposeReplacedTexture(oldRight);
  }

  private syncMaterialOpacities(): void {
    for (const entry of this.opacityEntries) {
      const factor = entry.isCake ? this.cardAlpha * this.cakeFactor : this.cardAlpha;
      const nextOpacity = entry.baseOpacity * factor;
      const needsTransparent = entry.alwaysTransparent || factor < 0.995;
      if (entry.material.transparent !== needsTransparent) {
        entry.material.transparent = needsTransparent;
        entry.material.needsUpdate = true;
      }
      entry.material.opacity = nextOpacity;
    }

    for (const item of this.shaderAlphaEntries) {
      item.uniform.value = item.base * this.cardAlpha;
    }
  }

  private applyOpenKinematics(): void {
    const o = this.openAmount;

    // 0.00 -> crisp flat closed white greeting card
    // 0.22 -> half-open (~40°) inviting peek with warm light along opening edge
    // 1.00 -> unfolded ~146° cradled paper stage with minimalist cake rising inside
    let leftAngle: number;
    let rightAngle: number;
    let bookRotY: number;
    let bookRotX: number;
    let bookPosX: number;

    if (o <= 0.25) {
      const t = o / 0.25;
      const eased = easeOutCubic(t);
      leftAngle = -0.74 * eased;
      rightAngle = -0.07 * eased;
      bookRotY = -0.13 * eased;
      bookRotX = -0.05 * eased;
      bookPosX = -PAGE_W * 0.5 + PAGE_W * 0.14 * eased;
    } else {
      const t = (o - 0.25) / 0.75;
      const eased = easeOutCubic(t);
      leftAngle = -0.74 + (-2.84 + 0.74) * eased;
      rightAngle = -0.07 + (-0.3 + 0.07) * eased;
      bookRotY = -0.13 * (1 - eased);
      bookRotX = -0.05 + (-0.52 + 0.05) * eased;
      bookPosX = -PAGE_W * 0.36 * (1 - eased);
    }

    this.leftLeafPivot.rotation.y = leftAngle;
    this.rightLeafPivot.rotation.y = rightAngle;
    this.bookPivot.rotation.y = bookRotY;
    this.bookPivot.rotation.x = bookRotX;
    this.bookPivot.position.x = bookPosX;
  }

  private makeCanvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this.textures.push(tex);
    return tex;
  }

  private disposeReplacedTexture(tex: THREE.CanvasTexture): void {
    const idx = this.textures.indexOf(tex);
    if (idx !== -1) {
      this.textures.splice(idx, 1);
    }
    tex.dispose();
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMaterial<T extends THREE.Material>(
    mat: T,
    baseOpacity: number,
    alwaysTransparent = false,
    isCake = false,
  ): T {
    this.materials.push(mat);
    this.opacityEntries.push({
      material: mat,
      baseOpacity,
      alwaysTransparent,
      isCake,
    });
    return mat;
  }

  private trackShaderMaterial(mat: THREE.ShaderMaterial, baseOpacity: number): void {
    this.materials.push(mat);
    if (mat.uniforms.uOpacity) {
      this.shaderAlphaEntries.push({
        uniform: mat.uniforms.uOpacity as { value: number },
        base: baseOpacity,
      });
    }
  }
}
