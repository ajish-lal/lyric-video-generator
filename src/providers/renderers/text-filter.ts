import type { AnimationBehavior, ResolvedEffects } from '../../core/models/customization.js';

/**
 * Pure FFmpeg filter builders for the customized render path. These functions
 * only ever produce filter strings — no CLI parsing and no config logic reaches
 * here. The renderer resolves fonts/colors and hands over primitives.
 */

/** Convert a CSS-ish color (#RRGGBB / #RGB / 0xRRGGBB / name) to an FFmpeg color. */
export function colorToFfmpeg(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return `0x${v.slice(1)}`;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const [r, g, b] = v.slice(1).split('');
    return `0x${r}${r}${g}${g}${b}${b}`;
  }
  if (/^0x[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^[a-zA-Z]+$/.test(v)) return v.toLowerCase();
  return 'white';
}

export interface WordDrawInput {
  safeText: string;
  fontToken: string;
  fontColor: string;
  fontSizePx: number;
  start: number;
  end: number;
  width: number;
  height: number;
  xNorm: number;
  yNorm: number;
  opacity: number;
  animation: AnimationBehavior;
  stroke?: { width: number; color: string };
  shadow?: { dx: number; dy: number; color: string; alpha: number };
}

/** Build the x/y/alpha expressions for a word given its animation behavior. */
export function animationExpressions(
  input: WordDrawInput,
): { x: string; y: string; alpha: string } {
  const { animation: a, start, end, opacity, xNorm, yNorm } = input;
  const ts = start.toFixed(3);
  const te = end.toFixed(3);
  const baseX = `(w*${xNorm.toFixed(4)}-text_w/2)`;
  const baseY = `(h*${yNorm.toFixed(4)}-text_h/2)`;
  const dIn = Math.max(0.001, a.inDuration).toFixed(3);
  const dOut = Math.max(0.08, Math.min(a.inDuration || 0.3, 0.35)).toFixed(3);
  // Local time since the word appeared, entrance progress (0..1) and an
  // ease-out cubic so every move decelerates into place instead of stopping
  // abruptly. `decay` turns any shake into a burst that settles (~0.3s).
  const tt = `(t-${ts})`;
  const prog = `min(1,${tt}/${dIn})`;
  const easeOut = `(1-pow(1-${prog},3))`;
  const decay = `exp(-7*${tt})`;

  let x = baseX;
  let y = baseY;

  switch (a.motion) {
    case 'slide-up':
    case 'fade-up':
      y = `${baseY}+${a.translatePx.toFixed(1)}*(1-${easeOut})`;
      break;
    case 'slide-down':
      y = `${baseY}-${a.translatePx.toFixed(1)}*(1-${easeOut})`;
      break;
    case 'pop': {
      // Drop-in from just above the baseline, ease-out to rest, then a tiny
      // decaying settle bounce for a premium spring feel.
      const pop = (a.overshoot * 80).toFixed(1);
      const settle = (a.overshoot * 80 * 0.16).toFixed(1);
      y = `${baseY}-${pop}*(1-${easeOut})+${settle}*sin(50.265*${tt})*${decay}`;
      // Optional decaying shake jab on the hit (driven by shakePx/shakeHz). This
      // is what gives an "impact" its punch; amount is fully preset-tunable.
      if (a.shakePx > 0 && a.shakeHz > 0) {
        const wx = (2 * Math.PI * a.shakeHz).toFixed(3);
        const wy = (2 * Math.PI * a.shakeHz * 1.3).toFixed(3);
        x = `${baseX}+${a.shakePx.toFixed(1)}*sin(${wx}*${tt})*${decay}`;
        y = `${y}+${(a.shakePx * 0.6).toFixed(1)}*cos(${wy}*${tt})*${decay}`;
      }
      break;
    }
    case 'shake':
    case 'glitch': {
      if (a.shakePx > 0 && a.shakeHz > 0) {
        const wx = (2 * Math.PI * a.shakeHz).toFixed(3);
        const wy = (2 * Math.PI * a.shakeHz * 1.3).toFixed(3);
        // Phase-locked to word start and enveloped by `decay`: an impact jitter
        // that bursts then settles rather than buzzing for the whole duration.
        const entrance = a.overshoot > 0 ? `-${(a.overshoot * 70).toFixed(1)}*(1-${easeOut})` : '';
        x = `${baseX}+${a.shakePx.toFixed(1)}*sin(${wx}*${tt})*${decay}`;
        y = `${baseY}+${(a.shakePx * 0.6).toFixed(1)}*cos(${wy}*${tt})*${decay}${entrance}`;
      }
      break;
    }
    default:
      break;
  }

  let alpha: string;
  if (a.motion === 'none' && a.inDuration === 0) {
    alpha = opacity.toFixed(3);
  } else {
    // Smoothstep the in/out ramp so fades ease at both ends (no linear edges).
    const ramp = `clip(min((t-${ts})/${dIn},(${te}-t)/${dOut}),0,1)`;
    alpha = `${opacity.toFixed(3)}*(${ramp})*(${ramp})*(3-2*(${ramp}))`;
  }
  if (a.glitch) {
    alpha = `${alpha}*(0.82+0.18*abs(sin(47*t)))`;
  }

  return { x, y, alpha };
}

/** Build a single word's drawtext filter with per-word color, stroke and shadow. */
export function buildWordDrawText(input: WordDrawInput): string {
  const ts = input.start.toFixed(3);
  const te = input.end.toFixed(3);
  const { x, y, alpha } = animationExpressions(input);
  const border = input.stroke
    ? `:borderw=${input.stroke.width}:bordercolor=${colorToFfmpeg(input.stroke.color)}`
    : '';
  const shadow = input.shadow
    ? `:shadowx=${input.shadow.dx}:shadowy=${input.shadow.dy}:shadowcolor=${colorToFfmpeg(input.shadow.color)}@${input.shadow.alpha.toFixed(2)}`
    : '';
  return (
    `drawtext=text='${input.safeText}':${input.fontToken}:fontcolor=${input.fontColor}` +
    `:fontsize=${input.fontSizePx}:x='${x}':y='${y}':alpha='${alpha}'${border}${shadow}` +
    `:enable='between(t,${ts},${te})'`
  );
}

/** Convert a 0..1 vignette amount to the FFmpeg `vignette=PI/angle` divisor. */
export function vignetteAngle(amount: number): number {
  return Math.max(1, Math.round(10 - amount * 8));
}

/** Serialise a colour balance into ffmpeg `colorbalance` arguments. */
function colorBalanceArgs(cb: ResolvedEffects['colorBalance']): string {
  return (
    `rs=${cb.shadows.r.toFixed(3)}:gs=${cb.shadows.g.toFixed(3)}:bs=${cb.shadows.b.toFixed(3)}:` +
    `rm=${cb.mids.r.toFixed(3)}:gm=${cb.mids.g.toFixed(3)}:bm=${cb.mids.b.toFixed(3)}`
  );
}

/**
 * Build the cinematic grade chain from resolved effects. Reads `[in]` and
 * produces `[outv]`. Defaults were chosen so that, with DEFAULT_EFFECTS, this
 * mirrors the built-in look.
 */
export function buildGradeChain(
  effects: ResolvedEffects,
  inLabel: string,
  size: string,
  fps: number,
  totalFrames: number,
): string[] {
  const ca = Math.round(effects.chromaticAberration + effects.glitch * 4);
  const nodes: string[] = [
    // Grade in RGB (gbrp): blending the grayscale bloom in YUV corrupts the
    // chroma planes and injects a false magenta hue on any non-black background.
    `[${inLabel}]format=gbrp,split[cbase][cbloom]`,
    `[cbloom]hue=s=0,curves=m='0/0 0.62/0 0.8/0.45 1/1',gblur=sigma=16[bloom]`,
    `[cbase][bloom]blend=all_mode=screen:all_opacity=${effects.bloom.toFixed(3)}[lit]`,
  ];

  let gradeChain =
    `[lit]colorbalance=${colorBalanceArgs(effects.colorBalance)},` +
    `eq=contrast=${effects.contrast.toFixed(3)}:saturation=${effects.saturation.toFixed(3)}:gamma=0.95,` +
    `vignette=PI/${vignetteAngle(effects.vignette)},rgbashift=rh=${ca}:bh=${-ca}`;
  if (effects.grain > 0) {
    // Unified film grain over the whole frame (background + text). Temporal so
    // it shimmers like real grain; capped at ffmpeg's max noise strength.
    gradeChain += `,noise=alls=${Math.min(100, Math.round(effects.grain))}:allf=t+u`;
  }
  if (effects.scanlines) {
    gradeChain += `,drawgrid=w=iw:h=3:t=1:color=black@0.22`;
  }
  if (effects.glitch > 0) {
    gradeChain += `,noise=alls=${Math.round(effects.glitch * 8)}:allf=t`;
  }
  gradeChain += `[graded]`;
  nodes.push(gradeChain);

  const push = effects.pushIn;
  if (push > 0) {
    nodes.push(
      `[graded]zoompan=z='min(1.0+${push.toFixed(3)}*on/${totalFrames},${(1 + push).toFixed(3)})'` +
        `:d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}[outv]`,
    );
  } else {
    nodes.push(`[graded]null[outv]`);
  }

  return nodes;
}
