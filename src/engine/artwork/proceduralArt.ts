import { resolveMemoryDisplay } from '../../config/templates';
import type { BirthdayCardConfig, MemoryPhotoItem, PresetCardMeta } from '../../config/types';

const FONT_SERIF = '"Noto Serif SC", "Cormorant Garamond", "Songti SC", Georgia, serif';
const FONT_LATIN = '"Cormorant Garamond", "Noto Serif SC", Georgia, serif';
const FONT_SANS = '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif';

const PAPER = {
  bright: '#FCFBF8',
  base: '#FAF8F4',
  warmEdge: '#EFE9DE',
  creaseShadow: 'rgba(145, 132, 114, 0.28)',
  ink: '#22201E',
  inkSoft: '#44403B',
  inkMuted: '#5A544C',
  slate: '#232B42',
  slateSoft: 'rgba(35, 43, 66, 0.2)',
  slateWash: '#BCCAE4',
  gold: '#A87B3A',
  goldDeep: '#845E2A',
  goldLight: '#DCBA7E',
  goldWash: '#EED9B3',
  coral: '#C26B64',
  coralSoft: '#ECBFBA',
  amber: '#DC8E38',
} as const;

/**
 * 确定性哈希，将字符串转化为无符号 32 位整数种子。
 */
function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 确定性 Mulberry32 伪随机数生成器，保证每次生成的棉纸肌理与插画完全一致。
 */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D rendering context for procedural artwork.');
  }
  return { canvas, ctx };
}

/**
 * 绘制干净、明亮、带有细腻纸浆微粒质感的暖白棉纸卡面（#FAF8F4 -> #F1ECE2）。
 */
function drawCottonPaperBase(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  brightInner = false
): () => number {
  const rng = createRng(seed);

  const grad = ctx.createLinearGradient(0, 0, w * 0.25, h);
  grad.addColorStop(0, brightInner ? '#FDFCF9' : PAPER.bright);
  grad.addColorStop(0.55, PAPER.base);
  grad.addColorStop(1, brightInner ? '#F5F1E8' : PAPER.warmEdge);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 柔和微小的棉纸纤维质感（避免脏灰，仅在近观时显出高级纸张触感）
  const speckCount = Math.round((w * h) / 1450);
  for (let i = 0; i < speckCount; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 1 + rng() * 2.2;
    const isLight = rng() > 0.52;
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.45)' : 'rgba(165, 152, 134, 0.055)';
    ctx.fillRect(x, y, len, 1);
  }

  return rng;
}

/**
 * 绘制极简克制的单层香槟金细线框（无复杂塔罗雕花，突出留白高级感）。
 */
function drawMinimalGoldBorder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  marginRatio = 0.058,
  alpha = 0.62
): void {
  const m = w * marginRatio;
  ctx.save();
  ctx.strokeStyle = `rgba(158, 114, 52, ${alpha})`;
  ctx.lineWidth = Math.max(1.6, w * 0.0032);
  ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  ctx.restore();
}

/**
 * 极简小四芒星（用于现代手账与轻贺卡点缀，克制细腻）。
 */
function drawDelicateSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string = PAPER.gold
): void {
  const inner = radius * 0.24;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.quadraticCurveTo(cx + inner * 0.45, cy - inner * 0.45, cx + radius, cy);
  ctx.quadraticCurveTo(cx + inner * 0.45, cy + inner * 0.45, cx, cy + radius);
  ctx.quadraticCurveTo(cx - inner * 0.45, cy + inner * 0.45, cx - radius, cy);
  ctx.quadraticCurveTo(cx - inner * 0.45, cy - inner * 0.45, cx, cy - radius);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawMicroStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
  count: number,
  maxYRatio = 1
): void {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h * maxYRatio;
    const r = 0.5 + rng() * 1.4;
    const alpha = 0.28 + rng() * 0.62;
    ctx.fillStyle =
      rng() < 0.72
        ? `rgba(248, 245, 238, ${alpha})`
        : `rgba(245, 218, 160, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ============================================================================
 * 8 款现代暖白手账风生日元素插画（香槟金 + 柔珊瑚粉 + 黛蓝细线）
 * ========================================================================== */

function drawEditorialCake(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  // 柔和浅暖金背景光晕（淡雅水彩圆斑）
  ctx.fillStyle = 'rgba(245, 234, 214, 0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.04, r * 0.82, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(2.6, r * 0.028);
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 高脚陶瓷蛋糕托盘
  const plateY = cy + r * 0.44;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = PAPER.slate;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.1, plateY + r * 0.04);
  ctx.quadraticCurveTo(cx - r * 0.06, plateY + r * 0.22, cx - r * 0.28, plateY + r * 0.29);
  ctx.lineTo(cx + r * 0.28, plateY + r * 0.29);
  ctx.quadraticCurveTo(cx + r * 0.06, plateY + r * 0.22, cx + r * 0.1, plateY + r * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx, plateY, r * 0.64, r * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 下层奶白蛋糕体与柔珊瑚粉丝带腰线
  const bW = r * 0.5;
  const bTop = cy + r * 0.08;
  const bH = plateY - bTop - r * 0.01;
  ctx.fillStyle = '#FFFDF9';
  ctx.beginPath();
  ctx.roundRect(cx - bW, bTop, bW * 2, bH, [r * 0.06, r * 0.06, r * 0.02, r * 0.02]);
  ctx.fill();
  ctx.stroke();

  // 下层柔和珊瑚粉奶油波浪淋面
  ctx.fillStyle = PAPER.coralSoft;
  ctx.beginPath();
  ctx.moveTo(cx - bW, bTop + r * 0.05);
  ctx.lineTo(cx - bW, bTop + r * 0.13);
  const bumps = 5;
  const step = (bW * 2) / bumps;
  for (let i = 0; i < bumps; i++) {
    const sx = cx - bW + i * step;
    ctx.quadraticCurveTo(sx + step * 0.5, bTop + r * 0.25, sx + step, bTop + r * 0.13);
  }
  ctx.lineTo(cx + bW, bTop + r * 0.05);
  ctx.quadraticCurveTo(cx + bW, bTop, cx + bW - r * 0.05, bTop);
  ctx.lineTo(cx - bW + r * 0.05, bTop);
  ctx.quadraticCurveTo(cx - bW, bTop, cx - bW, bTop + r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PAPER.coral;
  ctx.lineWidth = lw * 0.78;
  ctx.stroke();

  // 下层金边底座线
  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = lw * 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - bW + r * 0.04, plateY - r * 0.06);
  ctx.lineTo(cx + bW - r * 0.04, plateY - r * 0.06);
  ctx.stroke();

  // 上层迷你蛋糕体
  const uW = r * 0.33;
  const uTop = cy - r * 0.22;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(cx - uW, uTop, uW * 2, bTop - uTop, [r * 0.05, r * 0.05, 0, 0]);
  ctx.fill();
  ctx.stroke();

  // 上层奶油糖霜波浪与金珠
  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = lw * 0.85;
  ctx.beginPath();
  const uBumps = 4;
  const uStep = (uW * 2) / uBumps;
  ctx.moveTo(cx - uW, uTop + r * 0.11);
  for (let i = 0; i < uBumps; i++) {
    const sx = cx - uW + i * uStep;
    ctx.quadraticCurveTo(sx + uStep * 0.5, uTop + r * 0.21, sx + uStep, uTop + r * 0.11);
  }
  ctx.stroke();

  // 三支极简细长蜡烛与暖烛焰
  const candles = [
    { dx: -r * 0.16, h: r * 0.25, color: PAPER.coral },
    { dx: 0, h: r * 0.33, color: PAPER.gold },
    { dx: r * 0.16, h: r * 0.25, color: PAPER.coral },
  ];

  for (const c of candles) {
    const x = cx + c.dx;
    const top = uTop - c.h;

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = PAPER.slate;
    ctx.lineWidth = lw * 0.82;
    ctx.beginPath();
    ctx.roundRect(x - r * 0.03, top, r * 0.06, c.h, r * 0.015);
    ctx.fill();
    ctx.stroke();

    // 斜条纹
    ctx.strokeStyle = c.color;
    ctx.lineWidth = lw * 0.65;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.025, top + c.h * 0.35);
    ctx.lineTo(x + r * 0.025, top + c.h * 0.22);
    ctx.moveTo(x - r * 0.025, top + c.h * 0.72);
    ctx.lineTo(x + r * 0.025, top + c.h * 0.59);
    ctx.stroke();

    // 柔暖烛火光晕
    const fy = top - r * 0.1;
    const halo = ctx.createRadialGradient(x, fy, 0, x, fy, r * 0.18);
    halo.addColorStop(0, 'rgba(232, 168, 92, 0.42)');
    halo.addColorStop(1, 'rgba(232, 168, 92, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, fy, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // 水滴火焰
    ctx.fillStyle = PAPER.amber;
    ctx.beginPath();
    ctx.moveTo(x, top - r * 0.2);
    ctx.bezierCurveTo(x + r * 0.06, top - r * 0.09, x + r * 0.045, top - r * 0.02, x, top - r * 0.02);
    ctx.bezierCurveTo(x - r * 0.045, top - r * 0.02, x - r * 0.06, top - r * 0.09, x, top - r * 0.2);
    ctx.fill();

    ctx.fillStyle = '#FFF9E8';
    ctx.beginPath();
    ctx.ellipse(x, top - r * 0.08, r * 0.018, r * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDelicateSparkle(ctx, cx - r * 0.58, cy - r * 0.42, r * 0.075, PAPER.gold);
  drawDelicateSparkle(ctx, cx + r * 0.56, cy - r * 0.34, r * 0.06, PAPER.coral);
  ctx.restore();
}

function drawEditorialWishingJar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  // 淡青灰水彩圆底
  ctx.fillStyle = 'rgba(220, 227, 240, 0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.04, r * 0.78, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(2.6, r * 0.028);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 软木塞
  ctx.fillStyle = '#DEC298';
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.15, cy - r * 0.68);
  ctx.lineTo(cx + r * 0.15, cy - r * 0.68);
  ctx.lineTo(cx + r * 0.12, cy - r * 0.48);
  ctx.lineTo(cx - r * 0.12, cy - r * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 玻璃瓶廓形
  const traceJar = () => {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy - r * 0.48);
    ctx.lineTo(cx + r * 0.2, cy - r * 0.48);
    ctx.quadraticCurveTo(cx + r * 0.17, cy - r * 0.39, cx + r * 0.17, cy - r * 0.31);
    ctx.bezierCurveTo(cx + r * 0.52, cy - r * 0.18, cx + r * 0.54, cy + r * 0.36, cx + r * 0.36, cy + r * 0.64);
    ctx.quadraticCurveTo(cx, cy + r * 0.73, cx - r * 0.36, cy + r * 0.64);
    ctx.bezierCurveTo(cx - r * 0.54, cy + r * 0.36, cx - r * 0.52, cy - r * 0.18, cx - r * 0.17, cy - r * 0.31);
    ctx.quadraticCurveTo(cx - r * 0.17, cy - r * 0.39, cx - r * 0.2, cy - r * 0.48);
    ctx.closePath();
  };

  ctx.save();
  traceJar();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.fill();
  ctx.clip();

  // 瓶内柔和暖金光底与纸折星星彩屑
  const fillGrad = ctx.createLinearGradient(cx, cy - r * 0.1, cx, cy + r * 0.72);
  fillGrad.addColorStop(0, 'rgba(245, 234, 214, 0)');
  fillGrad.addColorStop(1, 'rgba(245, 234, 214, 0.75)');
  ctx.fillStyle = fillGrad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  const items = [
    { x: -0.18, y: 0.4, s: 0.1, c: PAPER.gold },
    { x: 0.16, y: 0.44, s: 0.11, c: PAPER.coral },
    { x: -0.01, y: 0.22, s: 0.12, c: PAPER.gold },
    { x: 0.22, y: 0.12, s: 0.08, c: PAPER.goldDeep },
    { x: -0.22, y: 0.05, s: 0.085, c: PAPER.coral },
    { x: 0.06, y: -0.08, s: 0.075, c: PAPER.gold },
  ];
  for (const it of items) {
    drawDelicateSparkle(ctx, cx + it.x * r, cy + it.y * r, it.s * r, it.c);
  }

  // 细小圆点彩屑
  const dots = [
    { x: -0.08, y: 0.52, c: PAPER.slate },
    { x: 0.25, y: 0.32, c: PAPER.gold },
    { x: -0.28, y: 0.24, c: PAPER.gold },
    { x: 0.08, y: 0.06, c: PAPER.coral },
  ];
  for (const d of dots) {
    ctx.fillStyle = d.c;
    ctx.beginPath();
    ctx.arc(cx + d.x * r, cy + d.y * r, r * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 玻璃瓶精致黛蓝外轮廓与高光弧
  traceJar();
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.35, cy + r * 0.02);
  ctx.quadraticCurveTo(cx - r * 0.4, cy + r * 0.3, cx - r * 0.28, cy + r * 0.48);
  ctx.stroke();

  // 瓶颈珊瑚粉细绳结
  ctx.strokeStyle = PAPER.coral;
  ctx.lineWidth = lw * 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.19, cy - r * 0.36);
  ctx.quadraticCurveTo(cx, cy - r * 0.31, cx + r * 0.19, cy - r * 0.36);
  ctx.stroke();

  ctx.lineWidth = lw * 0.95;
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.16, cy - r * 0.34);
  ctx.quadraticCurveTo(cx + r * 0.38, cy - r * 0.44, cx + r * 0.34, cy - r * 0.26);
  ctx.quadraticCurveTo(cx + r * 0.26, cy - r * 0.25, cx + r * 0.16, cy - r * 0.34);
  ctx.moveTo(cx + r * 0.16, cy - r * 0.34);
  ctx.quadraticCurveTo(cx + r * 0.32, cy - r * 0.16, cx + r * 0.36, cy - r * 0.02);
  ctx.stroke();

  drawDelicateSparkle(ctx, cx - r * 0.44, cy - r * 0.44, r * 0.065, PAPER.gold);
  ctx.restore();
}

function drawEditorialWarmCandle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  const flameY = cy - r * 0.46;

  // 暖淡杏色烛光氛围圈
  const glow = ctx.createRadialGradient(cx, flameY, r * 0.04, cx, flameY, r * 0.78);
  glow.addColorStop(0, 'rgba(232, 168, 92, 0.34)');
  glow.addColorStop(0.5, 'rgba(243, 220, 218, 0.28)');
  glow.addColorStop(1, 'rgba(245, 234, 214, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, flameY, r * 0.78, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(2.6, r * 0.028);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 极简现代金色碟形烛台
  const dishY = cy + r * 0.56;
  ctx.fillStyle = PAPER.goldWash;
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw;

  // 烛台环形小握柄
  ctx.beginPath();
  ctx.arc(cx + r * 0.48, dishY - r * 0.04, r * 0.11, -Math.PI * 0.55, Math.PI * 0.65);
  ctx.stroke();

  // 烛台底碟
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.52, dishY - r * 0.02);
  ctx.quadraticCurveTo(cx - r * 0.42, dishY + r * 0.13, cx, dishY + r * 0.13);
  ctx.quadraticCurveTo(cx + r * 0.42, dishY + r * 0.13, cx + r * 0.52, dishY - r * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 烛座小托杯
  ctx.fillStyle = PAPER.goldLight;
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.16, dishY - r * 0.12, r * 0.32, r * 0.12, r * 0.03);
  ctx.fill();
  ctx.stroke();

  // 奶油白细长手工蜡烛主体
  const candleTop = cy - r * 0.24;
  const candleBot = dishY - r * 0.12;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.115, candleTop, r * 0.23, candleBot - candleTop, [r * 0.05, r * 0.05, 0, 0]);
  ctx.fill();
  ctx.stroke();

  // 精致蜡泪波纹装饰
  ctx.fillStyle = PAPER.coralSoft;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.11, candleTop + r * 0.04);
  ctx.quadraticCurveTo(cx - r * 0.04, candleTop + r * 0.22, cx + r * 0.01, candleTop + r * 0.1);
  ctx.quadraticCurveTo(cx + r * 0.06, candleTop + r * 0.28, cx + r * 0.11, candleTop + r * 0.08);
  ctx.lineTo(cx + r * 0.11, candleTop + r * 0.02);
  ctx.lineTo(cx - r * 0.11, candleTop + r * 0.02);
  ctx.closePath();
  ctx.fill();

  // 烛芯与水滴形温暖火焰
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw * 0.75;
  ctx.beginPath();
  ctx.moveTo(cx, candleTop);
  ctx.lineTo(cx, candleTop - r * 0.07);
  ctx.stroke();

  ctx.fillStyle = PAPER.amber;
  ctx.beginPath();
  ctx.moveTo(cx, flameY - r * 0.2);
  ctx.bezierCurveTo(cx + r * 0.13, flameY - r * 0.02, cx + r * 0.11, flameY + r * 0.16, cx, flameY + r * 0.16);
  ctx.bezierCurveTo(cx - r * 0.11, flameY + r * 0.16, cx - r * 0.13, flameY - r * 0.02, cx, flameY - r * 0.2);
  ctx.fill();

  ctx.fillStyle = '#FFFDF5';
  ctx.beginPath();
  ctx.ellipse(cx, flameY + r * 0.03, r * 0.042, r * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();

  // 极简放射光线与星点
  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = lw * 0.75;
  const rays = [-2.2, -1.57, -0.94, -0.25, 3.38];
  for (const a of rays) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.27, flameY + Math.sin(a) * r * 0.27);
    ctx.lineTo(cx + Math.cos(a) * r * 0.39, flameY + Math.sin(a) * r * 0.39);
    ctx.stroke();
  }

  drawDelicateSparkle(ctx, cx - r * 0.46, cy - r * 0.12, r * 0.065, PAPER.gold);
  drawDelicateSparkle(ctx, cx + r * 0.44, cy - r * 0.28, r * 0.055, PAPER.coral);
  ctx.restore();
}

function drawEditorialRibbonGift(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  // 柔珊瑚浅粉水彩底圆
  ctx.fillStyle = 'rgba(243, 220, 218, 0.56)';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.06, r * 0.78, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(2.6, r * 0.028);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const boxW = r * 0.5;
  const boxTop = cy - r * 0.02;
  const boxH = r * 0.64;

  // 礼盒主身
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(cx - boxW, boxTop, boxW * 2, boxH, r * 0.04);
  ctx.fill();
  ctx.stroke();

  // 盒身浅淡香槟竖绸带
  ctx.fillStyle = PAPER.goldLight;
  ctx.fillRect(cx - r * 0.09, boxTop, r * 0.18, boxH);
  ctx.strokeStyle = PAPER.goldDeep;
  ctx.lineWidth = lw * 0.72;
  ctx.strokeRect(cx - r * 0.09, boxTop, r * 0.18, boxH);

  // 横向细金带
  ctx.fillStyle = PAPER.goldWash;
  ctx.fillRect(cx - boxW, boxTop + boxH * 0.44, boxW * 2, r * 0.12);
  ctx.strokeRect(cx - boxW, boxTop + boxH * 0.44, boxW * 2, r * 0.12);

  // 盒盖
  const lidW = boxW * 1.09;
  const lidH = r * 0.19;
  const lidTop = boxTop - lidH + r * 0.02;
  ctx.fillStyle = '#FFFDF9';
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.roundRect(cx - lidW, lidTop, lidW * 2, lidH, r * 0.035);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PAPER.goldLight;
  ctx.fillRect(cx - r * 0.095, lidTop, r * 0.19, lidH);
  ctx.strokeStyle = PAPER.goldDeep;
  ctx.lineWidth = lw * 0.72;
  ctx.strokeRect(cx - r * 0.095, lidTop, r * 0.19, lidH);

  // 轻盈手绘珊瑚玫瑰金蝴蝶结
  ctx.fillStyle = PAPER.coralSoft;
  ctx.strokeStyle = PAPER.coral;
  ctx.lineWidth = lw * 1.05;

  // 左环
  ctx.beginPath();
  ctx.moveTo(cx, lidTop);
  ctx.bezierCurveTo(cx - r * 0.18, lidTop - r * 0.38, cx - r * 0.54, lidTop - r * 0.24, cx - r * 0.36, lidTop - r * 0.02);
  ctx.bezierCurveTo(cx - r * 0.24, lidTop + r * 0.06, cx - r * 0.06, lidTop, cx, lidTop);
  ctx.fill();
  ctx.stroke();

  // 右环
  ctx.beginPath();
  ctx.moveTo(cx, lidTop);
  ctx.bezierCurveTo(cx + r * 0.18, lidTop - r * 0.38, cx + r * 0.54, lidTop - r * 0.24, cx + r * 0.36, lidTop - r * 0.02);
  ctx.bezierCurveTo(cx + r * 0.24, lidTop + r * 0.06, cx + r * 0.06, lidTop, cx, lidTop);
  ctx.fill();
  ctx.stroke();

  // 飘带尾
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.05, lidTop + r * 0.02);
  ctx.quadraticCurveTo(cx - r * 0.26, lidTop + r * 0.18, cx - r * 0.34, lidTop + r * 0.32);
  ctx.moveTo(cx + r * 0.05, lidTop + r * 0.02);
  ctx.quadraticCurveTo(cx + r * 0.26, lidTop + r * 0.18, cx + r * 0.34, lidTop + r * 0.32);
  ctx.stroke();

  // 蝴蝶结中结
  ctx.fillStyle = PAPER.coral;
  ctx.beginPath();
  ctx.arc(cx, lidTop - r * 0.02, r * 0.06, 0, Math.PI * 2);
  ctx.fill();

  drawDelicateSparkle(ctx, cx - r * 0.52, cy - r * 0.44, r * 0.075, PAPER.gold);
  drawDelicateSparkle(ctx, cx + r * 0.48, cy - r * 0.5, r * 0.06, PAPER.gold);
  ctx.restore();
}

function drawEditorialBalloons(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  const lw = Math.max(2.6, r * 0.028);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const knotX = cx;
  const knotY = cy + r * 0.64;

  const balloons = [
    { x: cx - r * 0.34, y: cy - r * 0.14, rx: r * 0.27, ry: r * 0.34, tilt: -0.18, fill: PAPER.slateWash, stroke: PAPER.slate },
    { x: cx + r * 0.33, y: cy - r * 0.08, rx: r * 0.26, ry: r * 0.33, tilt: 0.2, fill: PAPER.coralSoft, stroke: PAPER.coral },
    { x: cx - r * 0.01, y: cy - r * 0.34, rx: r * 0.3, ry: r * 0.38, tilt: 0.02, fill: PAPER.goldWash, stroke: PAPER.gold },
  ];

  // 飘逸气球拉绳
  ctx.strokeStyle = 'rgba(45, 53, 76, 0.58)';
  ctx.lineWidth = lw * 0.78;
  for (const b of balloons) {
    const startY = b.y + b.ry * 0.98;
    ctx.beginPath();
    ctx.moveTo(b.x, startY);
    ctx.bezierCurveTo(
      b.x + (knotX - b.x) * 0.25,
      startY + r * 0.35,
      knotX - (knotX - b.x) * 0.15,
      knotY - r * 0.25,
      knotX,
      knotY
    );
    ctx.stroke();
  }

  // 绘制三只轻盈水彩气球
  for (const b of balloons) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.tilt);

    ctx.fillStyle = b.fill;
    ctx.strokeStyle = b.stroke;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 气球底部小三角嘴
    ctx.fillStyle = b.fill;
    ctx.beginPath();
    ctx.moveTo(-b.rx * 0.14, b.ry * 0.98);
    ctx.lineTo(b.rx * 0.14, b.ry * 0.98);
    ctx.lineTo(0, b.ry * 1.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 柔和白色高光月牙
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.lineWidth = lw * 1.15;
    ctx.beginPath();
    ctx.arc(-b.rx * 0.18, -b.ry * 0.16, b.rx * 0.48, Math.PI * 1.05, Math.PI * 1.48);
    ctx.stroke();
    ctx.restore();
  }

  // 绳结处精致小蝴蝶结
  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = lw * 0.95;
  ctx.beginPath();
  ctx.moveTo(knotX, knotY);
  ctx.quadraticCurveTo(knotX - r * 0.16, knotY - r * 0.08, knotX - r * 0.12, knotY + r * 0.04);
  ctx.quadraticCurveTo(knotX - r * 0.05, knotY + r * 0.05, knotX, knotY);
  ctx.quadraticCurveTo(knotX + r * 0.16, knotY - r * 0.08, knotX + r * 0.12, knotY + r * 0.04);
  ctx.quadraticCurveTo(knotX + r * 0.05, knotY + r * 0.05, knotX, knotY);
  ctx.stroke();

  // 散落极简彩屑星点
  drawDelicateSparkle(ctx, cx - r * 0.62, cy - r * 0.48, r * 0.065, PAPER.gold);
  drawDelicateSparkle(ctx, cx + r * 0.6, cy - r * 0.42, r * 0.055, PAPER.coral);
  ctx.fillStyle = PAPER.gold;
  ctx.beginPath();
  ctx.arc(cx + r * 0.56, cy + r * 0.34, r * 0.025, 0, Math.PI * 2);
  ctx.arc(cx - r * 0.52, cy + r * 0.28, r * 0.022, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEditorialHourglass(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(245, 234, 214, 0.64)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(2.6, r * 0.028);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const topY = cy - r * 0.6;
  const botY = cy + r * 0.6;
  const frameW = r * 0.44;

  // 极简双侧细支架
  ctx.strokeStyle = PAPER.goldDeep;
  ctx.lineWidth = lw * 0.85;
  for (const sx of [-frameW * 0.84, frameW * 0.84]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx, topY);
    ctx.lineTo(cx + sx, botY);
    ctx.stroke();
  }

  // 透明玻璃沙漏双球
  const traceGlass = () => {
    ctx.beginPath();
    ctx.moveTo(cx - frameW * 0.68, topY + r * 0.04);
    ctx.bezierCurveTo(cx - frameW * 0.68, cy - r * 0.16, cx - r * 0.08, cy - r * 0.06, cx - r * 0.03, cy);
    ctx.bezierCurveTo(cx - r * 0.08, cy + r * 0.06, cx - frameW * 0.68, cy + r * 0.16, cx - frameW * 0.68, botY - r * 0.04);
    ctx.lineTo(cx + frameW * 0.68, botY - r * 0.04);
    ctx.bezierCurveTo(cx + frameW * 0.68, cy + r * 0.16, cx + r * 0.08, cy + r * 0.06, cx + r * 0.03, cy);
    ctx.bezierCurveTo(cx + r * 0.08, cy - r * 0.06, cx + frameW * 0.68, cy - r * 0.16, cx + frameW * 0.68, topY + r * 0.04);
    ctx.closePath();
  };

  ctx.save();
  traceGlass();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.84)';
  ctx.fill();
  ctx.clip();

  // 上方余沙与下方温暖香槟金沙丘
  ctx.fillStyle = PAPER.goldLight;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.22, cy - r * 0.28);
  ctx.quadraticCurveTo(cx, cy - r * 0.22, cx + r * 0.22, cy - r * 0.28);
  ctx.lineTo(cx + r * 0.02, cy - r * 0.01);
  ctx.lineTo(cx - r * 0.02, cy - r * 0.01);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PAPER.gold;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.2);
  ctx.quadraticCurveTo(cx + r * 0.24, cy + r * 0.45, cx + r * 0.36, botY);
  ctx.lineTo(cx - r * 0.36, botY);
  ctx.quadraticCurveTo(cx - r * 0.24, cy + r * 0.45, cx, cy + r * 0.2);
  ctx.closePath();
  ctx.fill();

  // 垂直流沙细线
  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = lw * 0.75;
  ctx.setLineDash([r * 0.03, r * 0.025]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + r * 0.24);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  traceGlass();
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw;
  ctx.stroke();

  // 极简上下金边托板
  ctx.fillStyle = PAPER.goldLight;
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw * 0.9;
  ctx.beginPath();
  ctx.roundRect(cx - frameW, topY - r * 0.04, frameW * 2, r * 0.08, r * 0.03);
  ctx.roundRect(cx - frameW, botY - r * 0.04, frameW * 2, r * 0.08, r * 0.03);
  ctx.fill();
  ctx.stroke();

  drawDelicateSparkle(ctx, cx + r * 0.56, cy - r * 0.36, r * 0.065, PAPER.gold);
  drawDelicateSparkle(ctx, cx - r * 0.54, cy + r * 0.32, r * 0.055, PAPER.coral);
  ctx.restore();
}

function drawEditorialSparkler(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  const centerY = cy - r * 0.1;

  // 轻柔浅金水彩中心光晕
  const glow = ctx.createRadialGradient(cx, centerY, 0, cx, centerY, r * 0.85);
  glow.addColorStop(0, 'rgba(245, 234, 214, 0.9)');
  glow.addColorStop(0.55, 'rgba(243, 220, 218, 0.36)');
  glow.addColorStop(1, 'rgba(245, 234, 214, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, centerY, r * 0.85, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(2.4, r * 0.026);
  ctx.lineCap = 'round';

  // 手持仙女棒细杆
  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw * 1.15;
  ctx.beginPath();
  ctx.moveTo(cx, centerY + r * 0.08);
  ctx.lineTo(cx - r * 0.28, cy + r * 0.72);
  ctx.stroke();

  // 16 束纤细利落的烟花光芒（香槟金 + 珊瑚粉交替）
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const isMajor = i % 2 === 0;
    const r0 = r * 0.14;
    const r1 = r * (isMajor ? 0.78 : 0.52);
    ctx.strokeStyle = isMajor ? PAPER.gold : PAPER.coral;
    ctx.lineWidth = isMajor ? lw * 1.1 : lw * 0.85;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, centerY + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, centerY + Math.sin(a) * r1);
    ctx.stroke();

    // 光束末梢点缀小圆珠
    const dotR = r * (isMajor ? 0.028 : 0.02);
    ctx.fillStyle = isMajor ? PAPER.goldDeep : PAPER.coral;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (r1 + r * 0.065), centerY + Math.sin(a) * (r1 + r * 0.065), dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中心精致四芒主星与周围小星屑
  drawDelicateSparkle(ctx, cx, centerY, r * 0.2, PAPER.gold);
  drawDelicateSparkle(ctx, cx - r * 0.56, centerY - r * 0.42, r * 0.075, PAPER.coral);
  drawDelicateSparkle(ctx, cx + r * 0.58, centerY + r * 0.34, r * 0.068, PAPER.gold);
  drawDelicateSparkle(ctx, cx + r * 0.44, centerY - r * 0.54, r * 0.055, PAPER.slate);
  ctx.restore();
}

function drawEditorialMelody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  // 淡雅水彩圆晕
  ctx.fillStyle = 'rgba(220, 227, 240, 0.48)';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.04, r * 0.76, 0, Math.PI * 2);
  ctx.fill();

  const lw = Math.max(2.6, r * 0.028);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 三条轻盈飘逸的金色五线谱丝带弧
  ctx.strokeStyle = 'rgba(197, 155, 95, 0.55)';
  ctx.lineWidth = lw * 0.75;
  for (const dy of [-r * 0.14, 0, r * 0.14]) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.82, cy + dy + r * 0.18);
    ctx.bezierCurveTo(
      cx - r * 0.28,
      cy + dy - r * 0.24,
      cx + r * 0.28,
      cy + dy + r * 0.32,
      cx + r * 0.82,
      cy + dy - r * 0.18
    );
    ctx.stroke();
  }

  // 主双八分音符（黛蓝墨线 + 暖金音符头）
  const n1x = cx - r * 0.2;
  const n1y = cy + r * 0.22;
  const n2x = cx + r * 0.26;
  const n2y = cy + r * 0.08;
  const stemH = r * 0.58;

  ctx.strokeStyle = PAPER.slate;
  ctx.lineWidth = lw * 1.25;
  ctx.beginPath();
  ctx.moveTo(n1x + r * 0.1, n1y - r * 0.02);
  ctx.lineTo(n1x + r * 0.1, n1y - stemH);
  ctx.lineTo(n2x + r * 0.1, n2y - stemH);
  ctx.lineTo(n2x + r * 0.1, n2y - r * 0.02);
  ctx.stroke();

  // 第二根连音横梁
  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = lw * 1.1;
  ctx.beginPath();
  ctx.moveTo(n1x + r * 0.1, n1y - stemH + r * 0.11);
  ctx.lineTo(n2x + r * 0.1, n2y - stemH + r * 0.11);
  ctx.stroke();

  // 音符椭圆头
  ctx.fillStyle = PAPER.slate;
  ctx.beginPath();
  ctx.ellipse(n1x, n1y, r * 0.125, r * 0.09, -0.32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PAPER.coral;
  ctx.beginPath();
  ctx.ellipse(n2x, n2y, r * 0.125, r * 0.09, -0.32, 0, Math.PI * 2);
  ctx.fill();

  // 伴随飘起的小单音符与星芒
  const sX = cx - r * 0.46;
  const sY = cy - r * 0.26;
  ctx.fillStyle = PAPER.gold;
  ctx.beginPath();
  ctx.ellipse(sX, sY, r * 0.07, r * 0.052, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAPER.goldDeep;
  ctx.lineWidth = lw * 0.85;
  ctx.beginPath();
  ctx.moveTo(sX + r * 0.055, sY);
  ctx.lineTo(sX + r * 0.055, sY - r * 0.28);
  ctx.quadraticCurveTo(sX + r * 0.19, sY - r * 0.22, sX + r * 0.15, sY - r * 0.1);
  ctx.stroke();

  drawDelicateSparkle(ctx, cx + r * 0.56, cy - r * 0.36, r * 0.075, PAPER.gold);
  drawDelicateSparkle(ctx, cx - r * 0.52, cy + r * 0.36, r * 0.06, PAPER.coral);
  ctx.restore();
}

/**
 * 生成 8 款现代暖白棉纸生日元素装饰卡正面（清爽简约、高对比度，与纯白贺卡一脉相承）。
 */
export function createPresetArtCanvas(
  preset: PresetCardMeta,
  width = 512,
  height = 680
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  const seed = hashString(`preset-white:${preset.id}:${preset.motif}`);

  drawCottonPaperBase(ctx, width, height, seed);
  drawMinimalGoldBorder(ctx, width, height, 0.052, 0.6);

  const cx = width * 0.5;
  const cy = height * 0.42;
  const motifR = Math.min(width, height) * 0.295;

  switch (preset.motif) {
    case 'starlight-cake':
      drawEditorialCake(ctx, cx, cy, motifR);
      break;
    case 'wishing-bottle':
      drawEditorialWishingJar(ctx, cx, cy, motifR);
      break;
    case 'crescent-lantern':
      drawEditorialWarmCandle(ctx, cx, cy, motifR);
      break;
    case 'gilded-giftbox':
      drawEditorialRibbonGift(ctx, cx, cy, motifR);
      break;
    case 'aurora-balloon':
      drawEditorialBalloons(ctx, cx, cy, motifR);
      break;
    case 'stardust-hourglass':
      drawEditorialHourglass(ctx, cx, cy, motifR);
      break;
    case 'celestial-firework':
      drawEditorialSparkler(ctx, cx, cy, motifR);
      break;
    case 'constellation-musicbox':
      drawEditorialMelody(ctx, cx, cy, motifR);
      break;
  }

  // 底部极简手账铭牌：细短金线 + 黛蓝中文名 + 暖金英文副题
  ctx.save();
  ctx.strokeStyle = 'rgba(158, 114, 52, 0.72)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.11, height * 0.772);
  ctx.lineTo(cx + width * 0.11, height * 0.772);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAPER.slate;
  ctx.font = `600 ${Math.round(width * 0.058)}px ${FONT_SERIF}`;
  ctx.fillText(preset.name, cx, height * 0.834);

  ctx.fillStyle = PAPER.goldDeep;
  ctx.font = `italic 500 ${Math.round(width * 0.034)}px ${FONT_LATIN}`;
  ctx.fillText(preset.subtitle, cx, height * 0.884);
  ctx.restore();

  return canvas;
}

/* ============================================================================
 * 6 款不同氛围的演示风景画面（装裱在干净的暖白拍立得相框中）
 * ========================================================================== */

function drawSceneTwilightSeaside(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  const horizon = h * 0.6;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#2B3A67');
  sky.addColorStop(0.38, '#665378');
  sky.addColorStop(0.7, '#CE7D6A');
  sky.addColorStop(0.92, '#F2B57B');
  sky.addColorStop(1, '#FDE1AF');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  drawMicroStars(ctx, w, h, rng, 18, 0.3);

  const sunX = w * 0.56;
  const sunY = horizon - h * 0.06;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, w * 0.02, sunX, sunY, w * 0.44);
  sunGlow.addColorStop(0, 'rgba(255, 248, 224, 0.95)');
  sunGlow.addColorStop(0.28, 'rgba(255, 198, 132, 0.55)');
  sunGlow.addColorStop(1, 'rgba(255, 160, 112, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, w * 0.44, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFF6DC';
  ctx.beginPath();
  ctx.arc(sunX, sunY, w * 0.075, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#33314F';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.quadraticCurveTo(w * 0.16, horizon - h * 0.07, w * 0.36, horizon);
  ctx.closePath();
  ctx.fill();

  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, '#574568');
  sea.addColorStop(0.32, '#2B3154');
  sea.addColorStop(1, '#191E39');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, h - horizon);

  for (let i = 0; i < 38; i++) {
    const t = i / 38;
    const y = horizon + t * t * (h - horizon) * 0.9 + 4;
    const spread = w * (0.05 + t * 0.24);
    const rw = w * (0.04 + rng() * 0.12) * (1 - t * 0.35);
    const rx = sunX + (rng() - 0.5) * spread - rw * 0.5;
    ctx.fillStyle = `rgba(255, 214, 152, ${0.68 * (1 - t * 0.65)})`;
    ctx.fillRect(rx, y, rw, Math.max(1.5, 3 * (1 - t * 0.45)));
  }
}

function drawSceneStarryAlpine(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  sky.addColorStop(0, '#0C1530');
  sky.addColorStop(0.55, '#1A2D58');
  sky.addColorStop(1, '#2D4373');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w * 0.52, h * 0.32);
  ctx.rotate(-0.56);
  const milky = ctx.createLinearGradient(0, -h * 0.18, 0, h * 0.18);
  milky.addColorStop(0, 'rgba(155, 190, 245, 0)');
  milky.addColorStop(0.5, 'rgba(245, 228, 194, 0.28)');
  milky.addColorStop(1, 'rgba(155, 190, 245, 0)');
  ctx.fillStyle = milky;
  ctx.fillRect(-w, -h * 0.18, w * 2, h * 0.36);
  ctx.restore();

  drawMicroStars(ctx, w, h, rng, 110, 0.68);

  ctx.fillStyle = '#203059';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.66);
  ctx.lineTo(w * 0.24, h * 0.48);
  ctx.lineTo(w * 0.48, h * 0.6);
  ctx.lineTo(w * 0.74, h * 0.44);
  ctx.lineTo(w, h * 0.58);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#121B38';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.75);
  ctx.quadraticCurveTo(w * 0.34, h * 0.64, w * 0.64, h * 0.77);
  ctx.quadraticCurveTo(w * 0.86, h * 0.82, w, h * 0.76);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  const tx = w * 0.37;
  const ty = h * 0.69;
  const tentGlow = ctx.createRadialGradient(tx, ty, 2, tx, ty, w * 0.24);
  tentGlow.addColorStop(0, 'rgba(255, 206, 126, 0.6)');
  tentGlow.addColorStop(1, 'rgba(255, 174, 92, 0)');
  ctx.fillStyle = tentGlow;
  ctx.beginPath();
  ctx.arc(tx, ty, w * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFD38A';
  ctx.beginPath();
  ctx.moveTo(tx, ty - h * 0.048);
  ctx.lineTo(tx + w * 0.056, ty + h * 0.012);
  ctx.lineTo(tx - w * 0.056, ty + h * 0.012);
  ctx.closePath();
  ctx.fill();
}

function drawSceneLanternAlley(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#161C3B');
  sky.addColorStop(0.5, '#2A2B4F');
  sky.addColorStop(1, '#141528');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  drawMicroStars(ctx, w, h, rng, 28, 0.34);

  ctx.fillStyle = '#101226';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.22, 0);
  ctx.lineTo(w * 0.16, h * 0.64);
  ctx.lineTo(0, h * 0.68);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w * 0.78, 0);
  ctx.lineTo(w * 0.84, h * 0.64);
  ctx.lineTo(w, h * 0.68);
  ctx.closePath();
  ctx.fill();

  const groundY = h * 0.64;
  ctx.fillStyle = '#1E1D36';
  ctx.fillRect(0, groundY, w, h - groundY);

  const lanterns = [
    { x: w * 0.28, y: h * 0.31, r: w * 0.036 },
    { x: w * 0.5, y: h * 0.36, r: w * 0.04 },
    { x: w * 0.72, y: h * 0.31, r: w * 0.036 },
    { x: w * 0.38, y: h * 0.48, r: w * 0.026 },
    { x: w * 0.62, y: h * 0.48, r: w * 0.026 },
  ];

  ctx.strokeStyle = 'rgba(20, 20, 38, 0.8)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(w * 0.14, h * 0.25);
  ctx.quadraticCurveTo(w * 0.5, h * 0.4, w * 0.86, h * 0.25);
  ctx.stroke();

  for (const lp of lanterns) {
    const refGrad = ctx.createLinearGradient(lp.x, groundY, lp.x, h);
    refGrad.addColorStop(0, 'rgba(255, 190, 108, 0.38)');
    refGrad.addColorStop(1, 'rgba(255, 160, 82, 0)');
    ctx.fillStyle = refGrad;
    ctx.fillRect(lp.x - lp.r * 0.9, groundY + 4, lp.r * 1.8, h - groundY);

    const glow = ctx.createRadialGradient(lp.x, lp.y, 1, lp.x, lp.y, lp.r * 4);
    glow.addColorStop(0, 'rgba(255, 228, 164, 0.86)');
    glow.addColorStop(0.4, 'rgba(255, 168, 86, 0.34)');
    glow.addColorStop(1, 'rgba(255, 150, 72, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, lp.r * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFC06B';
    ctx.beginPath();
    ctx.ellipse(lp.x, lp.y, lp.r * 0.92, lp.r * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSceneAuroraLake(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  const horizon = h * 0.62;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0D182D');
  sky.addColorStop(0.55, '#173049');
  sky.addColorStop(1, '#234A5E');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  drawMicroStars(ctx, w, h, rng, 70, 0.58);

  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const x = t * w;
    const y = h * 0.42 + Math.sin(t * Math.PI * 2.2 + 0.4) * h * 0.055;
    const rayH = h * 0.24 * (0.7 + 0.3 * Math.sin(t * Math.PI * 3.5));
    const g = ctx.createLinearGradient(x, y, x, y - rayH);
    g.addColorStop(0, 'rgba(130, 228, 202, 0.36)');
    g.addColorStop(0.5, 'rgba(243, 211, 140, 0.16)');
    g.addColorStop(1, 'rgba(130, 228, 202, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / steps, y - rayH, (w / steps) * 2.2, rayH);
  }

  const lake = ctx.createLinearGradient(0, horizon, 0, h);
  lake.addColorStop(0, '#1C3F52');
  lake.addColorStop(0.5, '#13283B');
  lake.addColorStop(1, '#0C1628');
  ctx.fillStyle = lake;
  ctx.fillRect(0, horizon, w, h - horizon);

  ctx.fillStyle = '#0F1B30';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(w * 0.2, horizon - h * 0.1);
  ctx.lineTo(w * 0.42, horizon - h * 0.03);
  ctx.lineTo(w * 0.66, horizon - h * 0.12);
  ctx.lineTo(w, horizon - h * 0.06);
  ctx.lineTo(w, horizon + 4);
  ctx.lineTo(0, horizon + 4);
  ctx.closePath();
  ctx.fill();
}

function drawSceneCloudSeaDawn(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, '#2B3A6B');
  sky.addColorStop(0.35, '#685985');
  sky.addColorStop(0.68, '#D79492');
  sky.addColorStop(0.9, '#F7CCA0');
  sky.addColorStop(1, '#FFF3D4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const halo = ctx.createRadialGradient(w * 0.48, h * 0.56, w * 0.02, w * 0.48, h * 0.56, w * 0.6);
  halo.addColorStop(0, 'rgba(255, 250, 232, 0.85)');
  halo.addColorStop(0.45, 'rgba(255, 206, 152, 0.34)');
  halo.addColorStop(1, 'rgba(255, 190, 140, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(w * 0.48, h * 0.56, w * 0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4B446C';
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.62);
  ctx.lineTo(w * 0.28, h * 0.46);
  ctx.lineTo(w * 0.46, h * 0.62);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#3D3960';
  ctx.beginPath();
  ctx.moveTo(w * 0.56, h * 0.64);
  ctx.lineTo(w * 0.82, h * 0.44);
  ctx.lineTo(w * 1.04, h * 0.64);
  ctx.closePath();
  ctx.fill();

  const layers = [
    { y: h * 0.63, top: 'rgba(255, 238, 212, 0.88)', bot: 'rgba(176, 134, 154, 0.8)' },
    { y: h * 0.77, top: 'rgba(246, 208, 184, 0.82)', bot: 'rgba(90, 78, 118, 0.92)' },
  ];
  for (const layer of layers) {
    const cg = ctx.createLinearGradient(0, layer.y - h * 0.08, 0, h);
    cg.addColorStop(0, layer.top);
    cg.addColorStop(1, layer.bot);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, h);
    ctx.lineTo(-w * 0.1, layer.y);
    for (let i = 0; i <= 7; i++) {
      ctx.arc((i / 7) * w * 1.1, layer.y + (rng() - 0.5) * h * 0.05, w * (0.11 + rng() * 0.07), Math.PI, 0, false);
    }
    ctx.lineTo(w * 1.15, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSceneSkyLanterns(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number
): void {
  const horizon = h * 0.68;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#0F1634');
  sky.addColorStop(0.55, '#1D2954');
  sky.addColorStop(1, '#313863');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  drawMicroStars(ctx, w, h, rng, 65, 0.62);

  const lake = ctx.createLinearGradient(0, horizon, 0, h);
  lake.addColorStop(0, '#232C52');
  lake.addColorStop(1, '#111730');
  ctx.fillStyle = lake;
  ctx.fillRect(0, horizon, w, h - horizon);

  const lanterns: Array<{ x: number; y: number; s: number }> = [];
  for (let i = 0; i < 14; i++) {
    lanterns.push({
      x: w * (0.12 + rng() * 0.76),
      y: h * (0.1 + rng() * 0.5),
      s: w * (0.01 + rng() * 0.016),
    });
  }
  lanterns.push(
    { x: w * 0.34, y: h * 0.44, s: w * 0.04 },
    { x: w * 0.62, y: h * 0.3, s: w * 0.048 },
    { x: w * 0.5, y: h * 0.54, s: w * 0.034 }
  );

  for (const l of lanterns) {
    const glow = ctx.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.s * 3.6);
    glow.addColorStop(0, 'rgba(255, 228, 162, 0.78)');
    glow.addColorStop(0.45, 'rgba(255, 174, 92, 0.25)');
    glow.addColorStop(1, 'rgba(255, 160, 78, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.s * 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFCA78';
    ctx.beginPath();
    ctx.moveTo(l.x - l.s * 0.7, l.y - l.s * 0.85);
    ctx.quadraticCurveTo(l.x, l.y - l.s * 1.18, l.x + l.s * 0.7, l.y - l.s * 0.85);
    ctx.lineTo(l.x + l.s * 0.48, l.y + l.s * 0.85);
    ctx.lineTo(l.x - l.s * 0.48, l.y + l.s * 0.85);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * 为未配置外部图片 URL 的演示回忆生成「暖白拍立得相框 + 摄影感风景画」纹理，
 * 一眼可与白色极简插画预设卡清晰区分。
 */
export function createMemoryFallbackCanvas(
  memory: MemoryPhotoItem,
  index: number,
  width = 512,
  height = 680
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  const seed = hashString(`memory-polaroid:${memory.id}:${index}`);
  const rng = drawCottonPaperBase(ctx, width, height, seed);

  // 经典拍立得留白比例（上/左/右 5.5%，底部手写留白区 18%）
  const pad = Math.round(width * 0.056);
  const bottomChin = Math.round(height * 0.18);
  const photoW = width - pad * 2;
  const photoH = height - pad - bottomChin;

  // 在独立裁剪窗口内绘制摄影风风景画
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad, pad, photoW, photoH);
  ctx.clip();
  ctx.translate(pad, pad);

  const sceneIndex = ((index % 6) + 6) % 6;
  switch (sceneIndex) {
    case 0:
      drawSceneTwilightSeaside(ctx, photoW, photoH, rng);
      break;
    case 1:
      drawSceneStarryAlpine(ctx, photoW, photoH, rng);
      break;
    case 2:
      drawSceneLanternAlley(ctx, photoW, photoH, rng);
      break;
    case 3:
      drawSceneAuroraLake(ctx, photoW, photoH, rng);
      break;
    case 4:
      drawSceneCloudSeaDawn(ctx, photoW, photoH, rng);
      break;
    default:
      drawSceneSkyLanterns(ctx, photoW, photoH, rng);
      break;
  }

  // 极轻柔胶片暗角，保留画面明澈感
  const vig = ctx.createRadialGradient(
    photoW * 0.5,
    photoH * 0.48,
    photoW * 0.34,
    photoW * 0.5,
    photoH * 0.5,
    photoH * 0.72
  );
  vig.addColorStop(0, 'rgba(10, 14, 30, 0)');
  vig.addColorStop(1, 'rgba(10, 14, 30, 0.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, photoW, photoH);
  ctx.restore();

  // 相片内窗极细压痕边线
  ctx.strokeStyle = 'rgba(45, 53, 76, 0.14)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(pad, pad, photoW, photoH);

  // 拍立得纯白底部留白：左侧炭黑标题 + 右侧淡金日期
  const chinCenterY = pad + photoH + bottomChin * 0.52;
  ctx.save();
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER.ink;
  ctx.font = `500 ${Math.round(width * 0.048)}px ${FONT_SERIF}`;
  ctx.fillText(memory.title, pad + 2, chinCenterY, photoW * 0.64);

  if (memory.date) {
    ctx.textAlign = 'right';
    ctx.fillStyle = PAPER.goldDeep;
    ctx.font = `500 ${Math.round(width * 0.032)}px ${FONT_LATIN}`;
    ctx.fillText(memory.date, width - pad - 2, chinCenterY + 1);
  }
  ctx.restore();

  return canvas;
}

/* ============================================================================
 * 文本自动换行助手（兼容中英文混排、显式换行符与中文避头尾标点规则）
 * ========================================================================== */

const NO_LINE_START_PUNCT = /^[，。、；：！？）》」』】”’…—.,;:!?)\]]$/;
const NO_LINE_END_PUNCT = /^[（《「『【“‘(\[]$/;

/**
 * 文本自动换行助手（兼容中英文混排、显式换行符与中文避头尾标点规则），
 * 防止逗号、句号、感叹号、右括号等标点出现在行首。
 */
export function wrapMixedText(
  measureTextWidth: (text: string) => number,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }

    // 1. 按英文词组或单个 CJK / 标点字符切分
    const rawTokens = trimmed.match(/[A-Za-z0-9_.'’"-]+|\s+|[^\sA-Za-z0-9_.'’"-]/g) ?? [trimmed];

    // 2. 应用中文避头尾标点规则，将行首禁则标点与前一字合并为不可拆分的排版单元
    const units: string[] = [];
    for (const token of rawTokens) {
      if (
        NO_LINE_START_PUNCT.test(token) &&
        units.length > 0 &&
        units[units.length - 1].trim().length > 0
      ) {
        units[units.length - 1] += token;
      } else if (
        units.length > 0 &&
        NO_LINE_END_PUNCT.test(units[units.length - 1]) &&
        token.trim().length > 0
      ) {
        units[units.length - 1] += token;
      } else {
        units.push(token);
      }
    }

    let currentLine = '';

    for (const unit of units) {
      const candidate = currentLine ? currentLine + unit : unit.trimStart();
      if (measureTextWidth(candidate) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine.trim()) {
          lines.push(currentLine.trimEnd());
        }
        const cleanUnit = unit.trimStart();
        if (measureTextWidth(cleanUnit) > maxWidth && cleanUnit.length > 2) {
          let chunk = '';
          for (const ch of cleanUnit) {
            if (
              measureTextWidth(chunk + ch) > maxWidth &&
              chunk &&
              !NO_LINE_START_PUNCT.test(ch)
            ) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = cleanUnit;
        }
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trimEnd());
    }
  }

  return lines;
}

/**
 * 生成回忆卡片背面纹理：真实暖白厚棉纸卡背（#FAF8F4）+ 炭黑宋体正文 + 浅金日期，
 * 像真实拍立得背面的手写留念。
 */
export function createMemoryBackCanvas(
  memory: MemoryPhotoItem,
  width = 512,
  height = 680
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  const seed = hashString(`mem-back-white:${memory.id}`);

  drawCottonPaperBase(ctx, width, height, seed, true);
  drawMinimalGoldBorder(ctx, width, height, 0.056, 0.44);

  const cx = width * 0.5;
  const resolved = resolveMemoryDisplay(memory);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 顶部极简暖金小星标
  drawDelicateSparkle(ctx, cx, height * 0.135, width * 0.022, PAPER.gold);

  // 日期与标题
  if (memory.date) {
    ctx.fillStyle = PAPER.goldDeep;
    ctx.font = `600 ${Math.round(width * 0.038)}px ${FONT_LATIN}`;
    ctx.fillText(memory.date, cx, height * 0.2);
  }

  ctx.fillStyle = PAPER.ink;
  ctx.font = `600 ${Math.round(width * 0.064)}px ${FONT_SERIF}`;
  ctx.fillText(memory.title, cx, height * 0.272, width * 0.74);

  // 极细香槟金短分割线
  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.095, height * 0.328);
  ctx.lineTo(cx + width * 0.095, height * 0.328);
  ctx.stroke();

  // 正文自动适配字号 + 中文避头标点换行
  const textMaxWidth = width * 0.72;
  const textBoxTop = height * 0.382;
  const textBoxBottom = height * 0.835;
  const availableHeight = textBoxBottom - textBoxTop;

  const messageText = resolved.backMessage;
  let fontSize = Math.round(width * 0.044);
  let lines: string[] = [];
  let lineHeight = fontSize * 1.82;
  const measureWidth = (sample: string) => ctx.measureText(sample).width;

  while (fontSize >= Math.round(width * 0.03)) {
    ctx.font = `400 ${fontSize}px ${FONT_SERIF}`;
    lines = wrapMixedText(measureWidth, messageText, textMaxWidth);
    lineHeight = fontSize * 1.82;
    if (lines.length * lineHeight <= availableHeight) {
      break;
    }
    fontSize -= 2;
  }

  const totalTextHeight = lines.length * lineHeight;
  let drawY = textBoxTop + Math.max(0, (availableHeight - totalTextHeight) * 0.36) + fontSize * 0.5;

  ctx.fillStyle = '#2B2927';
  ctx.font = `400 ${fontSize}px ${FONT_SERIF}`;
  ctx.textAlign = 'center';

  for (const line of lines) {
    if (drawY > textBoxBottom) break;
    if (line.length > 0) {
      ctx.fillText(line, cx, drawY);
    }
    drawY += lineHeight;
  }

  // 底部极简落款标记
  ctx.fillStyle = PAPER.inkMuted;
  ctx.font = `400 ${Math.round(width * 0.026)}px ${FONT_SANS}`;
  ctx.fillText(resolved.template.badgeLabel ?? '留影', cx, height * 0.892);
  ctx.restore();

  return canvas;
}

/**
 * 生成内置预设装饰卡背面纹理：干净的暖白棉纸卡背，印有极简星标与英文祝语。
 */
export function createPresetBackCanvas(
  preset: PresetCardMeta,
  width = 512,
  height = 680
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  const seed = hashString(`preset-back-white:${preset.id}`);

  drawCottonPaperBase(ctx, width, height, seed, true);
  drawMinimalGoldBorder(ctx, width, height, 0.056, 0.44);

  const cx = width * 0.5;
  const cy = height * 0.46;

  // 极简纸卡中央印记（无繁复星盘）
  ctx.save();
  ctx.strokeStyle = 'rgba(197, 155, 95, 0.42)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy - height * 0.06, width * 0.095, 0, Math.PI * 2);
  ctx.stroke();

  drawDelicateSparkle(ctx, cx, cy - height * 0.06, width * 0.042, PAPER.gold);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAPER.slate;
  ctx.font = `500 ${Math.round(width * 0.058)}px ${FONT_SERIF}`;
  ctx.fillText(preset.name, cx, cy + height * 0.085);

  ctx.fillStyle = PAPER.goldDeep;
  ctx.font = `italic 400 ${Math.round(width * 0.034)}px ${FONT_LATIN}`;
  ctx.fillText(preset.subtitle, cx, cy + height * 0.142);

  ctx.fillStyle = PAPER.inkMuted;
  ctx.font = `italic 400 ${Math.round(width * 0.03)}px ${FONT_LATIN}`;
  ctx.fillText('Happy Birthday', cx, height * 0.882);
  ctx.restore();

  return canvas;
}

/**
 * 生成 3D 纯白对折贺卡封面纹理：
 * 高级暖白棉纸（#FAF8F4 -> #F2EEE6）+ 单条纤细香槟金线框 + 极简克制的
 * `Happy Birthday` 排版与低调年龄数字，在深夜星空中干净通透、一眼高级。
 */
export function createCardCoverCanvas(
  config: BirthdayCardConfig,
  width = 768,
  height = 1024
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  const seed = hashString(`cover-white:${config.recipientName}:${config.age}`);

  drawCottonPaperBase(ctx, width, height, seed);

  // 极轻柔的左侧对折压痕明暗（让贺卡像真实精裁对折纸卡，绝非厚书脊）
  const foldCrease = ctx.createLinearGradient(0, 0, width * 0.045, 0);
  foldCrease.addColorStop(0, 'rgba(155, 143, 126, 0.22)');
  foldCrease.addColorStop(0.45, 'rgba(190, 178, 160, 0.06)');
  foldCrease.addColorStop(1, 'rgba(250, 248, 244, 0)');
  ctx.fillStyle = foldCrease;
  ctx.fillRect(0, 0, width * 0.045, height);

  // 单条纤细香槟金边框（克制留白，零神秘学圆环与繁杂雕花）
  drawMinimalGoldBorder(ctx, width, height, 0.066, 0.72);

  const cx = width * 0.506;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 顶部小小香槟金星点与日期
  drawDelicateSparkle(ctx, cx, height * 0.162, width * 0.02, PAPER.gold);
  if (config.birthdayDate) {
    ctx.fillStyle = PAPER.goldDeep;
    ctx.font = `600 ${Math.round(width * 0.033)}px ${FONT_LATIN}`;
    ctx.fillText(config.birthdayDate, cx, height * 0.214);
  }

  // 核心克制英文衬线主标题：Happy Birthday
  ctx.fillStyle = PAPER.ink;
  ctx.font = `600 ${Math.round(width * 0.114)}px ${FONT_LATIN}`;
  ctx.fillText('Happy', cx, height * 0.37);
  ctx.font = `italic 500 ${Math.round(width * 0.12)}px ${FONT_LATIN}`;
  ctx.fillText('Birthday', cx, height * 0.478);

  // 纤细香槟金水平短线 + 低调优雅的年龄数字
  const ageY = height * 0.586;
  const ageStr = String(config.age);
  ctx.fillStyle = PAPER.goldDeep;
  ctx.font = `600 ${Math.round(width * 0.068)}px ${FONT_LATIN}`;
  ctx.fillText(ageStr, cx, ageY);

  const ageGap = ageStr.length >= 3 ? width * 0.115 : width * 0.086;
  ctx.strokeStyle = 'rgba(158, 114, 52, 0.85)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - ageGap - width * 0.088, ageY);
  ctx.lineTo(cx - ageGap, ageY);
  ctx.moveTo(cx + ageGap, ageY);
  ctx.lineTo(cx + ageGap + width * 0.088, ageY);
  ctx.stroke();

  // 收件人称呼与封面寄语（炭黑宋体 + 温润次级字色，清晰易读）
  const recipientLine =
    config.recipientName === '你' ? '致亲爱的你' : `致 ${config.recipientName}`;
  ctx.fillStyle = PAPER.ink;
  ctx.font = `600 ${Math.round(width * 0.058)}px ${FONT_SERIF}`;
  ctx.fillText(recipientLine, cx, height * 0.708, width * 0.72);

  if (config.coverSubtitle) {
    ctx.fillStyle = PAPER.inkSoft;
    ctx.font = `500 ${Math.round(width * 0.036)}px ${FONT_SERIF}`;
    ctx.fillText(config.coverSubtitle, cx, height * 0.78, width * 0.74);
  }

  // 底部极简署名
  ctx.fillStyle = PAPER.inkMuted;
  ctx.font = `italic 500 ${Math.round(width * 0.033)}px ${FONT_LATIN}`;
  ctx.fillText(`From ${config.senderName}`, cx, height * 0.875);
  ctx.restore();

  return canvas;
}

/**
 * 绘制左内页极简轻奢纪念花环与小枝叶（手工信纸活版压印感，清爽雅致、绝非神秘学风格）。
 */
function drawMinimalBotanicalWreath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();

  // 柔和浅暖金水彩底晕
  const wash = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.05);
  wash.addColorStop(0, 'rgba(238, 217, 179, 0.56)');
  wash.addColorStop(0.62, 'rgba(238, 217, 179, 0.2)');
  wash.addColorStop(1, 'rgba(238, 217, 179, 0)');
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
  ctx.fill();

  // 单圈纤细开放式香槟金圆弧（底部留白衔接枝叶）
  ctx.strokeStyle = 'rgba(168, 123, 58, 0.58)';
  ctx.lineWidth = Math.max(1.5, r * 0.014);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, -Math.PI * 0.88, Math.PI * 0.18, false);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(168, 123, 58, 0.34)';
  ctx.lineWidth = Math.max(1.1, r * 0.009);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.78, Math.PI * 0.24, Math.PI * 1.12, false);
  ctx.stroke();

  // 左右对称极简橄榄/月桂细枝与小叶片（沿花环下缘舒展）
  const drawSprig = (dir: -1 | 1) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(dir, 1);

    ctx.strokeStyle = PAPER.gold;
    ctx.lineWidth = Math.max(1.6, r * 0.015);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, Math.PI * 0.44, Math.PI * 0.06, true);
    ctx.stroke();

    const leafAngles = [0.39, 0.31, 0.23, 0.15];
    for (let i = 0; i < leafAngles.length; i++) {
      const a = Math.PI * leafAngles[i];
      const bx = Math.cos(a) * r * 0.88;
      const by = Math.sin(a) * r * 0.88;
      const len = r * (0.145 - i * 0.014);
      const wid = len * 0.38;

      for (const sideSign of [-1, 1]) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(a - Math.PI * 0.5 + sideSign * 0.56);
        ctx.fillStyle = sideSign > 0 ? 'rgba(220, 186, 126, 0.52)' : 'rgba(188, 202, 228, 0.46)';
        ctx.strokeStyle = sideSign > 0 ? PAPER.goldDeep : 'rgba(35, 43, 66, 0.55)';
        ctx.lineWidth = Math.max(1.1, r * 0.01);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(wid, -len * 0.48, 0, -len);
        ctx.quadraticCurveTo(-wid, -len * 0.48, 0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  };

  drawSprig(-1);
  drawSprig(1);

  // 顶部与底部极简星芒点缀
  drawDelicateSparkle(ctx, cx, cy - r * 0.9, r * 0.11, PAPER.gold);
  drawDelicateSparkle(ctx, cx, cy + r * 0.9, r * 0.08, PAPER.coral);
  drawDelicateSparkle(ctx, cx - r * 0.72, cy - r * 0.62, r * 0.055, PAPER.goldDeep);
  drawDelicateSparkle(ctx, cx + r * 0.74, cy - r * 0.56, r * 0.05, PAPER.coral);

  ctx.restore();
}

/**
 * 生成 3D 纯白对折贺卡左右内页纹理：
 * - 左页：清朗雅致的暖白棉纸纪念版画（香槟金细线框 + 轻奢极简植物星芒花环 + 年龄徽章 + 日期）；
 * - 右页：直接将创作者在步骤一编辑好的开场寄语排版在暖白纸页上（称呼、标题、正文与落款），
 *   打开贺卡即显诚挚丰盈，零额外填写负担。
 */
export function createCardInnerPageCanvas(
  side: 'left' | 'right',
  config: BirthdayCardConfig,
  width = 768,
  height = 1024
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(width, height);
  const seed = hashString(
    `inner-white-v2:${side}:${config.recipientName}:${config.age}:${config.prologue.title}`
  );

  drawCottonPaperBase(ctx, width, height, seed, true);

  // 精致香槟金单层内页框 + 四角极细内角点缀
  const pad = Math.round(width * 0.058);
  ctx.strokeStyle = 'rgba(158, 114, 52, 0.52)';
  ctx.lineWidth = Math.max(1.5, width * 0.0024);
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

  const innerPad = pad + Math.round(width * 0.016);
  ctx.strokeStyle = 'rgba(158, 114, 52, 0.22)';
  ctx.lineWidth = Math.max(1, width * 0.0016);
  ctx.strokeRect(innerPad, innerPad, width - innerPad * 2, height - innerPad * 2);

  // 中央折痕处真实纸张柔影（左页靠右边缘，右页靠左边缘）
  const spineX = side === 'left' ? width : 0;
  const creaseWidth = width * 0.088;
  const crease = ctx.createLinearGradient(
    spineX,
    0,
    side === 'left' ? width - creaseWidth : creaseWidth,
    0
  );
  crease.addColorStop(0, PAPER.creaseShadow);
  crease.addColorStop(0.36, 'rgba(155, 142, 124, 0.09)');
  crease.addColorStop(1, 'rgba(252, 251, 247, 0)');
  ctx.fillStyle = crease;
  ctx.fillRect(side === 'left' ? width - creaseWidth : 0, 0, creaseWidth, height);

  if (side === 'left') {
    // 略偏向左侧留出中缝 3D 立体蛋糕空间，保证整体视觉平衡
    const lx = width * 0.455;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 顶部雅致英文祝语
    ctx.fillStyle = PAPER.goldDeep;
    ctx.font = `italic 500 ${Math.round(width * 0.048)}px ${FONT_LATIN}`;
    ctx.fillText('Happy Birthday', lx, height * 0.175);

    ctx.strokeStyle = 'rgba(158, 114, 52, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(lx - width * 0.11, height * 0.218);
    ctx.lineTo(lx + width * 0.11, height * 0.218);
    ctx.stroke();

    // 中央轻奢极简植物星芒纪念花环 + 年龄徽章
    const emblemY = height * 0.475;
    const emblemR = width * 0.245;
    drawMinimalBotanicalWreath(ctx, lx, emblemY, emblemR);

    const ageStr = String(config.age);
    const ageFontSize =
      ageStr.length >= 3 ? Math.round(width * 0.145) : Math.round(width * 0.185);
    ctx.fillStyle = PAPER.ink;
    ctx.font = `500 ${ageFontSize}px ${FONT_LATIN}`;
    ctx.fillText(ageStr, lx, emblemY - height * 0.008);

    ctx.fillStyle = PAPER.goldDeep;
    ctx.font = `500 ${Math.round(width * 0.03)}px ${FONT_SERIF}`;
    ctx.fillText(`第 ${ageStr} 岁`, lx, emblemY + emblemR * 0.46);

    // 底部纪念日期印章与暖意短句
    const stampY = height * 0.785;
    ctx.strokeStyle = 'rgba(158, 114, 52, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(lx - width * 0.14, stampY - height * 0.045);
    ctx.lineTo(lx + width * 0.14, stampY - height * 0.045);
    ctx.stroke();

    if (config.birthdayDate) {
      ctx.fillStyle = PAPER.goldDeep;
      ctx.font = `600 ${Math.round(width * 0.036)}px ${FONT_LATIN}`;
      ctx.fillText(config.birthdayDate, lx, stampY);
    }

    ctx.fillStyle = PAPER.inkMuted;
    ctx.font = `400 ${Math.round(width * 0.029)}px ${FONT_SERIF}`;
    ctx.fillText(
      config.coverSubtitle || '平安喜乐，万事顺意',
      lx,
      height * 0.855,
      width * 0.68
    );

    ctx.restore();
    return canvas;
  }

  // 右页：直接把创作者的开场寄语排版在暖白棉纸信笺上，留出左边缘中缝呼吸空间
  const leftMargin = Math.round(width * 0.165);
  const rightMargin = Math.round(width * 0.125);
  const contentWidth = width - leftMargin - rightMargin;
  const rightEdge = width - rightMargin;

  ctx.save();
  ctx.textBaseline = 'middle';

  // 1. 顶部称呼行
  const recipientDisplay =
    config.recipientName === '你' ? '亲爱的你' : config.recipientName;
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER.goldDeep;
  ctx.font = `italic 500 ${Math.round(width * 0.04)}px ${FONT_LATIN}`;
  ctx.fillText(`To ${recipientDisplay}`, leftMargin, height * 0.168, contentWidth * 0.86);

  drawDelicateSparkle(ctx, rightEdge - width * 0.02, height * 0.168, width * 0.017, PAPER.gold);

  // 2. 开场标题与纤细暖金短线
  const prologueTitle = config.prologue.title?.trim() || '生日快乐';
  ctx.fillStyle = PAPER.ink;
  ctx.font = `600 ${Math.round(width * 0.062)}px ${FONT_SERIF}`;
  ctx.fillText(prologueTitle, leftMargin, height * 0.242, contentWidth);

  ctx.strokeStyle = PAPER.gold;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(leftMargin, height * 0.292);
  ctx.lineTo(leftMargin + width * 0.125, height * 0.292);
  ctx.stroke();

  // 3. 开场寄语正文（自动字号适配 + 中文避头标点换行）
  const rawLines =
    Array.isArray(config.prologue.lines) && config.prologue.lines.length > 0
      ? config.prologue.lines.map((line) => line.trim()).filter(Boolean)
      : ['把值得记住的几个瞬间收进这张贺卡，祝你生日快乐。'];

  const bodyTop = height * 0.345;
  const bodyBottom = height * 0.775;
  const availableHeight = bodyBottom - bodyTop;

  let fontSize = Math.round(width * 0.041);
  let wrappedParagraphs: string[][] = [];
  let lineHeight = fontSize * 1.88;
  let paraGap = fontSize * 0.65;
  const measureWidth = (sample: string) => ctx.measureText(sample).width;

  while (fontSize >= Math.round(width * 0.027)) {
    ctx.font = `400 ${fontSize}px ${FONT_SERIF}`;
    lineHeight = fontSize * 1.88;
    paraGap = fontSize * 0.65;
    wrappedParagraphs = rawLines.map((p) => wrapMixedText(measureWidth, p, contentWidth));
    const totalLines = wrappedParagraphs.reduce((sum, p) => sum + p.length, 0);
    const totalHeight =
      totalLines * lineHeight + Math.max(0, wrappedParagraphs.length - 1) * paraGap;
    if (totalHeight <= availableHeight) {
      break;
    }
    fontSize -= 2;
  }

  ctx.fillStyle = '#2B2A28';
  ctx.font = `400 ${fontSize}px ${FONT_SERIF}`;
  let cursorY = bodyTop + fontSize * 0.5;

  for (let pIdx = 0; pIdx < wrappedParagraphs.length; pIdx++) {
    const pLines = wrappedParagraphs[pIdx];
    for (const line of pLines) {
      if (cursorY > bodyBottom) break;
      ctx.fillText(line, leftMargin, cursorY);
      cursorY += lineHeight;
    }
    if (pIdx < wrappedParagraphs.length - 1) {
      cursorY += paraGap;
    }
  }

  // 4. 右下角暖意落款与日期
  const sigRuleY = height * 0.812;
  ctx.strokeStyle = 'rgba(158, 114, 52, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(rightEdge - width * 0.16, sigRuleY);
  ctx.lineTo(rightEdge, sigRuleY);
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = PAPER.ink;
  ctx.font = `500 ${Math.round(width * 0.038)}px ${FONT_SERIF}`;
  ctx.fillText(`— ${config.senderName}`, rightEdge, height * 0.852, contentWidth);

  if (config.birthdayDate) {
    ctx.fillStyle = PAPER.inkMuted;
    ctx.font = `400 ${Math.round(width * 0.028)}px ${FONT_LATIN}`;
    ctx.fillText(config.birthdayDate, rightEdge, height * 0.892);
  }

  ctx.restore();
  return canvas;
}
