/**
 * Numeric animation sampler for the DaVinci Resolve exporter.
 *
 * This is a deliberate, self-contained mirror of the FFmpeg-side motion math in
 * `src/providers/renderers/text-filter.ts` (`animationExpressions`). Instead of
 * emitting FFmpeg expression strings, it evaluates the same curves numerically
 * so the exporter can bake per-frame keyframes for Resolve.
 *
 * Two motions are intentionally *richer* than the FFmpeg version because Text+
 * can do things `drawtext` cannot:
 *   - `pop` uses a real scale bounce (FFmpeg faked it with a vertical drop).
 *   - `blur-in` produces a real softness ramp (FFmpeg had no glyph blur).
 *
 * Output is in FFmpeg's screen convention (pixel offsets from the base center,
 * y pointing down). The flatten step converts to Resolve's normalized, y-up
 * Center coordinates.
 */

import type { AnimationBehavior } from '../core/models/customization.js';

export interface AnimationSample {
  /** Horizontal pixel offset from the base center (right = +). */
  dxPx: number;
  /** Vertical pixel offset from the base center (down = +, FFmpeg convention). */
  dyPx: number;
  /** Opacity 0..1. */
  alpha: number;
  /** Scale multiplier relative to the base font size (1 = unchanged). */
  scale: number;
  /** Softness 0..1 (blur-in); 0 for all other motions. */
  blur: number;
}

function smoothstep(r: number): number {
  const c = Math.min(1, Math.max(0, r));
  return c * c * (3 - 2 * c);
}

/**
 * Sample a word's animation at time `tRel` seconds after the word appears.
 *
 * @param a          Resolved animation behavior for the word.
 * @param tRel       Seconds since the word's start (clamped to >= 0).
 * @param durationSec Word on-screen duration in seconds.
 * @param baseOpacity Resolved word opacity (0..1); the alpha envelope scales it.
 * @param tAbs       Absolute timeline time in seconds (used by glitch flicker).
 */
export function sampleAnimation(
  a: AnimationBehavior,
  tRel: number,
  durationSec: number,
  baseOpacity: number,
  tAbs: number,
): AnimationSample {
  const t = Math.max(0, tRel);
  const duration = Math.max(0.05, durationSec);

  const effIn = Math.max(0.06, Math.min(a.inDuration || 0.3, duration * 0.5));
  const dIn = effIn;
  const dOut = Math.max(0.08, Math.min(effIn, 0.35));
  const prog = Math.min(1, t / dIn);
  const easeOut = 1 - Math.pow(1 - prog, 3);
  const decay = Math.exp(-7 * t);

  const wx = 2 * Math.PI * a.shakeHz;
  const wy = 2 * Math.PI * a.shakeHz * 1.3;

  let dxPx = 0;
  let dyPx = 0;
  let scale = 1;
  let blur = 0;

  const noFade = a.motion === 'slide-up' || a.motion === 'slide-down';

  switch (a.motion) {
    case 'fade-up':
      dyPx = a.translatePx * (1 - easeOut);
      break;
    case 'slide-up':
      dyPx = Math.max(60, a.translatePx) * (1 - easeOut);
      break;
    case 'slide-down':
      dyPx = -Math.max(60, a.translatePx) * (1 - easeOut);
      break;
    case 'pop': {
      // Real scale bounce: grow into place then a small decaying overshoot.
      const grow = 0.7 + 0.3 * easeOut;
      const bounce = a.overshoot * 0.25 * Math.sin(46 * t) * decay;
      scale = grow + bounce;
      if (a.shakePx > 0 && a.shakeHz > 0) {
        dxPx = a.shakePx * Math.sin(wx * t) * decay;
        dyPx = a.shakePx * 0.6 * Math.cos(wy * t) * decay;
      }
      break;
    }
    case 'shake': {
      if (a.shakePx > 0 && a.shakeHz > 0) {
        dxPx = a.shakePx * Math.sin(wx * t) * decay;
        dyPx = a.shakePx * 0.6 * Math.cos(wy * t) * decay;
        if (a.overshoot > 0) dyPx += -(a.overshoot * 70) * (1 - easeOut);
      }
      break;
    }
    case 'glitch': {
      const amp = Math.max(4, a.shakePx);
      const jumpAmp = Math.max(8, a.shakePx * 1.8);
      const jumpFreq = Math.max(7, Math.min(20, a.shakeHz / 3));
      dxPx = amp * Math.sin(wx * t) + jumpAmp * ((Math.floor(jumpFreq * t) % 2) * 2 - 1);
      dyPx = a.shakePx * 0.5 * Math.cos(wy * t);
      break;
    }
    case 'blur-in':
      blur = 1 - easeOut;
      break;
    default:
      break;
  }

  let alpha: number;
  if (a.motion === 'none' && a.inDuration === 0) {
    alpha = baseOpacity;
  } else if (noFade) {
    const outRamp = Math.min(1, Math.max(0, (duration - t) / dOut));
    alpha = baseOpacity * smoothstep(outRamp);
  } else {
    const ramp = Math.min(1, Math.max(0, Math.min(t / dIn, (duration - t) / dOut)));
    alpha = baseOpacity * smoothstep(ramp);
  }
  if (a.glitch) {
    const flicker = 0.55 + 0.45 * Math.abs(Math.sin(47 * tAbs));
    const dropout = Math.sin(13 * tAbs) > 0.92 ? 0.15 : 1;
    alpha *= flicker * dropout;
  }

  return { dxPx, dyPx, alpha: Math.min(1, Math.max(0, alpha)), scale, blur };
}
