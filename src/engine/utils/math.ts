/**
 * Clamps a numeric value into the inclusive range [min, max].
 */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Linearly interpolates between a and b by factor t.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential damping from current toward target.
 * Higher lambda converges faster; dt is delta time in seconds.
 */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  const safeDt = dt > 0 ? dt : 0;
  return lerp(current, target, 1 - Math.exp(-lambda * safeDt));
}

/**
 * Cubic ease-out curve (decelerating smoothly to rest).
 */
export function easeOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  const inv = 1 - x;
  return 1 - inv * inv * inv;
}

/**
 * Cubic ease-in-out curve (smooth acceleration then deceleration).
 */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  if (x < 0.5) {
    return 4 * x * x * x;
  }
  const f = -2 * x + 2;
  return 1 - (f * f * f) / 2;
}

/**
 * Overshooting back ease-out curve for graceful tactile pop-up motion.
 */
export function easeOutBack(t: number): number {
  const x = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = x - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/**
 * Exponential ease-out curve with rapid launch and velvety settle.
 */
export function easeOutExpo(t: number): number {
  const x = clamp(t, 0, 1);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}
