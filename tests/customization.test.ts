import { describe, expect, it } from 'vitest';
import { resolveWordStyle, resolveAnimation } from '../src/customization/style-resolver.js';
import {
  animationExpressions,
  buildGradeChain,
  colorToFfmpeg,
  type WordDrawInput,
} from '../src/providers/renderers/text-filter.js';
import { DEFAULT_EFFECTS, applyCustomizationToProject } from '../src/customization/apply.js';
import { validateConfig } from '../src/customization/validation.js';
import { createProjectFromLyricsContent } from '../src/application/orchestration/project-generator.js';
import type { AnimationBehavior } from '../src/core/models/customization.js';

describe('colorToFfmpeg', () => {
  it('normalizes hex to 0x and passes names through', () => {
    expect(colorToFfmpeg('#ff2530')).toBe('0xff2530');
    expect(colorToFfmpeg('#fff')).toBe('0xffffff');
    expect(colorToFfmpeg('0x101010')).toBe('0x101010');
    expect(colorToFfmpeg('red')).toBe('red');
  });
});

describe('resolveWordStyle', () => {
  it('expands the anger emphasis into red + a pop impact and scales the font', () => {
    const r = resolveWordStyle([{ fontSize: 100, emphasis: 'anger' }], { height: 1080 });
    expect(r.color).toBe('#ff2530');
    expect(r.animation.motion).toBe('pop'); // impact -> pop
    expect(r.fontSizePx).toBe(135); // 100 * fontScale 1.35 at reference height
  });

  it('lets an explicit property override the preset', () => {
    const r = resolveWordStyle([{ emphasis: 'anger', color: '#00ff00' }], { height: 1080 });
    expect(r.color).toBe('#00ff00');
  });
});

describe('resolveAnimation', () => {
  it('impact resolves to a pop with a shake jab', () => {
    const a = resolveAnimation('impact', 1080);
    expect(a.motion).toBe('pop');
    expect(a.shakePx).toBeGreaterThan(0);
    expect(a.shakeHz).toBeGreaterThan(0);
  });

  it('scales shake amplitude by intensity and frequency by speed', () => {
    const base = resolveAnimation({ preset: 'impact' }, 1080);
    const hot = resolveAnimation({ preset: 'impact', intensity: 2, speed: 2 }, 1080);
    expect(hot.shakePx).toBeCloseTo(base.shakePx * 2, 3);
    expect(hot.shakeHz).toBeCloseTo(base.shakeHz * 2, 3);
  });
});

function behavior(over: Partial<AnimationBehavior>): AnimationBehavior {
  return {
    motion: 'pop',
    inDuration: 0.1,
    translatePx: 0,
    overshoot: 0.28,
    shakePx: 10,
    shakeHz: 36,
    glitch: false,
    opacityMul: 1,
    ...over,
  };
}

function drawInput(a: AnimationBehavior): WordDrawInput {
  return {
    safeText: 'RISE',
    fontToken: 'fontfile=x',
    fontColor: '0xffffff',
    fontSizePx: 120,
    start: 1,
    end: 2,
    width: 1920,
    height: 1080,
    xNorm: 0.5,
    yNorm: 0.5,
    opacity: 1,
    animation: a,
  };
}

describe('animationExpressions', () => {
  it('decays shake into a burst instead of buzzing forever', () => {
    const { x } = animationExpressions(drawInput(behavior({ motion: 'shake' })));
    expect(x).toContain('exp(-7*');
    expect(x).toContain('sin(');
  });

  it('adds a decaying shake jab to a pop when shakePx > 0', () => {
    const { x } = animationExpressions(drawInput(behavior({ motion: 'pop', shakePx: 10, shakeHz: 36 })));
    expect(x).toContain('exp(-7*');
  });

  it('leaves a pop horizontally static when shakePx is 0', () => {
    const { x } = animationExpressions(drawInput(behavior({ motion: 'pop', shakePx: 0, shakeHz: 0 })));
    expect(x).not.toContain('sin(');
  });

  it('uses a smoothstep alpha ramp for fades', () => {
    const { alpha } = animationExpressions(drawInput(behavior({ motion: 'fade', shakePx: 0, shakeHz: 0 })));
    expect(alpha).toContain('3-2*');
  });
});

describe('buildGradeChain', () => {
  it('grades in RGB (gbrp), bakes the color balance and unified grain, emits [outv]', () => {
    const chain = buildGradeChain({ ...DEFAULT_EFFECTS, grain: 8 }, 'bg', '1920x1080', 30, 900).join(';');
    expect(chain).toContain('format=gbrp');
    expect(chain).toContain('colorbalance=');
    expect(chain).toContain('noise=alls=8');
    expect(chain).toContain('[outv]');
  });

  it('omits grain when grain is 0', () => {
    const chain = buildGradeChain({ ...DEFAULT_EFFECTS, grain: 0 }, 'bg', '1920x1080', 30, 900).join(';');
    expect(chain).not.toContain('noise=alls');
  });
});

describe('temperature/tint grade mapping', () => {
  it('neutral temperature and tint produce a neutral color balance', () => {
    const project = createProjectFromLyricsContent('[Chorus]\nRise again', 'demo.mp3');
    const out = applyCustomizationToProject(project, { effects: { temperature: 0, tint: 0 } });
    const cb = out.renderConfig.effects!.colorBalance;
    expect(cb.shadows.b).toBeCloseTo(0, 5);
    expect(cb.mids.b).toBeCloseTo(0, 5);
  });

  it('keeps the built-in cool push when temperature/tint are unset', () => {
    const project = createProjectFromLyricsContent('[Chorus]\nRise again', 'demo.mp3');
    const out = applyCustomizationToProject(project, {});
    expect(out.renderConfig.effects!.colorBalance.shadows.b).toBeGreaterThan(0);
  });
});

describe('validateConfig', () => {
  it('accepts a valid config', () => {
    const result = validateConfig({ sections: [{ type: 'chorus', style: { preset: 'heavy_chorus' } }] });
    expect(result.errors).toHaveLength(0);
  });

  it('flags an unknown preset and an out-of-range value', () => {
    const result = validateConfig({ typography: { opacity: 5, emphasis: 'nope' } });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
