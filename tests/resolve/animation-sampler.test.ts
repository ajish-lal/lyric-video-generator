import { describe, expect, it } from 'vitest';
import { sampleAnimation } from '../../src/resolve/animation-sampler.js';
import type { AnimationBehavior } from '../../src/core/models/customization.js';

function behavior(overrides: Partial<AnimationBehavior> = {}): AnimationBehavior {
  return {
    motion: 'fade',
    inDuration: 0.3,
    translatePx: 40,
    overshoot: 0,
    shakePx: 0,
    shakeHz: 0,
    glitch: false,
    opacityMul: 1,
    ...overrides,
  };
}

describe('sampleAnimation', () => {
  it('fades opacity in from 0 to the base opacity', () => {
    const a = behavior({ motion: 'fade' });
    const atStart = sampleAnimation(a, 0, 1, 1, 0);
    const midway = sampleAnimation(a, 0.5, 1, 1, 0.5);
    expect(atStart.alpha).toBeCloseTo(0, 3);
    expect(midway.alpha).toBeGreaterThan(0.9);
    // No positional/scale motion for a plain fade.
    expect(atStart.dxPx).toBe(0);
    expect(atStart.dyPx).toBe(0);
    expect(atStart.scale).toBe(1);
  });

  it('honors the base opacity as the fade ceiling', () => {
    const a = behavior({ motion: 'fade' });
    const mid = sampleAnimation(a, 0.5, 2, 0.5, 0.5);
    expect(mid.alpha).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  it('fade-up starts below the base and settles to it', () => {
    const a = behavior({ motion: 'fade-up', translatePx: 40 });
    const start = sampleAnimation(a, 0, 1, 1, 0);
    const end = sampleAnimation(a, 0.9, 1, 1, 0.9);
    expect(start.dyPx).toBeCloseTo(40, 1); // offset downward at start (y-down)
    expect(end.dyPx).toBeLessThan(1); // arrived
  });

  it('pop uses a real scale bounce that settles toward 1', () => {
    const a = behavior({ motion: 'pop', overshoot: 0.28, shakePx: 10, shakeHz: 36, inDuration: 0.1 });
    const start = sampleAnimation(a, 0, 1, 1, 0);
    const settled = sampleAnimation(a, 0.8, 1, 1, 0.8);
    expect(start.scale).toBeLessThan(1); // grows in
    expect(settled.scale).toBeCloseTo(1, 1); // settles
  });

  it('shake produces bounded oscillating offsets that decay', () => {
    const a = behavior({ motion: 'shake', shakePx: 9, shakeHz: 55, inDuration: 0.1 });
    const early = sampleAnimation(a, 0.02, 1, 1, 0.02);
    const late = sampleAnimation(a, 0.9, 1, 1, 0.9);
    expect(Math.abs(early.dxPx)).toBeLessThanOrEqual(9 + 1e-6);
    expect(Math.abs(late.dxPx)).toBeLessThan(Math.abs(early.dxPx) + 1e-6);
    expect(Math.abs(late.dxPx)).toBeLessThan(0.5); // decayed
  });

  it('glitch flickers opacity via the absolute-time term', () => {
    const a = behavior({ motion: 'glitch', shakePx: 6, shakeHz: 60, glitch: true });
    const s = sampleAnimation(a, 0.2, 1, 1, 0.2);
    expect(s.alpha).toBeLessThan(1); // flicker reduces alpha
    expect(s.alpha).toBeGreaterThanOrEqual(0);
  });

  it('blur-in ramps softness from 1 down to 0', () => {
    const a = behavior({ motion: 'blur-in', inDuration: 0.4 });
    const start = sampleAnimation(a, 0, 1, 1, 0);
    const end = sampleAnimation(a, 0.9, 1, 1, 0.9);
    expect(start.blur).toBeGreaterThan(0.5);
    expect(end.blur).toBeCloseTo(0, 2);
  });

  it('clamps alpha into 0..1', () => {
    const a = behavior({ motion: 'shake', shakePx: 9, shakeHz: 55 });
    for (let t = 0; t <= 1; t += 0.1) {
      const s = sampleAnimation(a, t, 1, 1, t);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
    }
  });
});
