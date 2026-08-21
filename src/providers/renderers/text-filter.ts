import type { AnimationBehavior, ResolvedEffects } from '../../core/models/customization.js';
import type { MusicVizConfig } from '../../core/models/render.js';

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
  /** Optional fade-in override in seconds (0 = snap on). */
  fadeInDuration?: number;
  /** Optional fade-out override in seconds (0 = hard cut). */
  fadeOutDuration?: number;
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
  // Cap the entrance so slow fades still fully appear inside a short slot.
  const wordDuration = Math.max(0.05, end - start);
  const effIn = input.fadeInDuration != null
    ? Math.max(0.001, Math.min(input.fadeInDuration, wordDuration * 0.9))
    : Math.max(0.06, Math.min(a.inDuration || 0.3, wordDuration * 0.5));
  const dIn = effIn.toFixed(3);
  const dOut = (input.fadeOutDuration != null
    ? Math.max(0.001, Math.min(input.fadeOutDuration, wordDuration * 0.9))
    : Math.max(0.08, Math.min(effIn, 0.35))).toFixed(3);
  const tt = `(t-${ts})`;
  const prog = `min(1,${tt}/${dIn})`;
  const easeOut = `(1-pow(1-${prog},3))`;
  const decay = `exp(-7*${tt})`;

  const noFade = a.motion === 'slide-up' || a.motion === 'slide-down';

  let x = baseX;
  let y = baseY;

  switch (a.motion) {
    case 'fade-up':
      y = `${baseY}+${a.translatePx.toFixed(1)}*(1-${easeOut})`;
      break;
    case 'slide-up':
      y = `${baseY}+${Math.max(60, a.translatePx).toFixed(1)}*(1-${easeOut})`;
      break;
    case 'slide-down':
      y = `${baseY}-${Math.max(60, a.translatePx).toFixed(1)}*(1-${easeOut})`;
      break;
    case 'pop': {
      // drawtext can't scale, so a pop is a pronounced drop-in with a settle bounce.
      const drop = (a.overshoot * 160 + 48).toFixed(1);
      const settle = (a.overshoot * 160 * 0.22 + 10).toFixed(1);
      y = `${baseY}-${drop}*(1-${easeOut})+${settle}*sin(46*${tt})*${decay}`;
      if (a.shakePx > 0 && a.shakeHz > 0) {
        const wx = (2 * Math.PI * a.shakeHz).toFixed(3);
        const wy = (2 * Math.PI * a.shakeHz * 1.3).toFixed(3);
        x = `${baseX}+${a.shakePx.toFixed(1)}*sin(${wx}*${tt})*${decay}`;
        y = `${y}+${(a.shakePx * 0.6).toFixed(1)}*cos(${wy}*${tt})*${decay}`;
      }
      break;
    }
    case 'shake': {
      if (a.shakePx > 0 && a.shakeHz > 0) {
        const wx = (2 * Math.PI * a.shakeHz).toFixed(3);
        const wy = (2 * Math.PI * a.shakeHz * 1.3).toFixed(3);
        const entrance = a.overshoot > 0 ? `-${(a.overshoot * 70).toFixed(1)}*(1-${easeOut})` : '';
        x = `${baseX}+${a.shakePx.toFixed(1)}*sin(${wx}*${tt})*${decay}`;
        y = `${baseY}+${(a.shakePx * 0.6).toFixed(1)}*cos(${wy}*${tt})*${decay}${entrance}`;
      }
      break;
    }
    case 'glitch': {
      // Sustained buzz plus discrete horizontal jumps, distinct from a plain shake.
      const amp = Math.max(4, a.shakePx).toFixed(1);
      const wx = (2 * Math.PI * a.shakeHz).toFixed(3);
      const wy = (2 * Math.PI * a.shakeHz * 1.3).toFixed(3);
      const jumpAmp = Math.max(8, a.shakePx * 1.8).toFixed(1);
      const jumpFreq = Math.max(7, Math.min(20, a.shakeHz / 3)).toFixed(2);
      x = `${baseX}+${amp}*sin(${wx}*${tt})+${jumpAmp}*(mod(floor(${jumpFreq}*${tt}),2)*2-1)`;
      y = `${baseY}+${(a.shakePx * 0.5).toFixed(1)}*cos(${wy}*${tt})`;
      break;
    }
    case 'typewriter':
      break;
    default:
      break;
  }

  let alpha: string;
  if (a.motion === 'none' && a.inDuration === 0) {
    alpha = opacity.toFixed(3);
  } else if (noFade) {
    const outRamp = `clip((${te}-t)/${dOut},0,1)`;
    alpha = `${opacity.toFixed(3)}*(${outRamp})*(${outRamp})*(3-2*(${outRamp}))`;
  } else {
    const ramp = `clip(min((t-${ts})/${dIn},(${te}-t)/${dOut}),0,1)`;
    alpha = `${opacity.toFixed(3)}*(${ramp})*(${ramp})*(3-2*(${ramp}))`;
  }
  if (a.glitch) {
    alpha = `${alpha}*(0.55+0.45*abs(sin(47*t)))*(if(gt(sin(13*t),0.92),0.15,1))`;
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
  outLabel = 'outv',
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
        `:d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}[${outLabel}]`,
    );
  } else {
    nodes.push(`[graded]null[${outLabel}]`);
  }

  return nodes;
}

/**
 * Builds an audio-reactive visualizer that sits over the finished frame. The
 * waveform/bars are given a two-pass bloom (tight + wide glow) and, optionally,
 * a fading mirrored reflection beneath, then screen-blended onto `baseLabel` so
 * the black background drops out. All blending happens in planar RGB (`gbrp`);
 * doing it in YUV injects a false magenta cast. The audio input is split so one
 * copy still feeds the output track, returned as `audioOutLabel`.
 */
export function buildMusicVizNodes(input: {
  audioInputIndex: number;
  width: number;
  height: number;
  fps: number;
  viz: MusicVizConfig;
  baseLabel: string;
  outLabel: string;
}): { nodes: string[]; audioOutLabel: string } {
  const { audioInputIndex, width: W, height: H, fps, viz, baseLabel, outLabel } = input;
  const stripH = Math.max(24, Math.round(H * (viz.height ?? 0.18)));
  const margin = Math.max(0, Math.round(H * (viz.margin ?? 0.05)));
  const colors = (viz.colors && viz.colors.length > 0 ? viz.colors : ['#00e5ff', '#ff2fd0'])
    .map(colorToFfmpeg)
    .join('|');
  const glow = Math.max(0, viz.glow ?? 8);
  const reflect = viz.reflection === true;
  const reflH = reflect ? Math.round(stripH * 0.55) : 0;
  const gapH = reflect ? Math.max(2, Math.round(stripH * 0.04)) : 0;
  const totalH = stripH + gapH + reflH;
  const yTop = viz.position === 'top'
    ? margin
    : viz.position === 'center'
      ? Math.round((H - totalH) / 2)
      : H - totalH - margin;

  const nodes: string[] = [`[${audioInputIndex}:a]asplit=2[aout][aviz]`];
  switch (viz.mode) {
    case 'bars':
      nodes.push(`[aviz]showfreqs=s=${W}x${stripH}:mode=bar:ascale=log:colors=${colors}:rate=${fps},format=gbrp[strip]`);
      break;
    case 'spectrum':
      nodes.push(`[aviz]showspectrum=s=${W}x${stripH}:mode=combined:color=intensity:scale=cbrt:slide=scroll:fps=${fps},format=gbrp[strip]`);
      break;
    case 'wave':
    default:
      nodes.push(`[aviz]showwaves=s=${W}x${stripH}:mode=line:colors=${colors}:rate=${fps}:scale=sqrt,format=gbrp[strip]`);
      break;
  }

  // Optional reflection: a vertically-flipped, squashed copy of the strip that
  // fades out downward (multiplied by a grey→black vertical gradient), stacked
  // below the strip with a small gap.
  if (reflect) {
    nodes.push(`[strip]split[sMain][sRef]`);
    nodes.push(`[sRef]vflip,scale=${W}:${reflH},format=gbrp[sRefS]`);
    nodes.push(`gradients=s=${W}x${reflH}:c0=0x707070:c1=0x000000:x0=0:y0=0:x1=0:y1=${reflH}:n=2:speed=0,format=gbrp[refGrad]`);
    nodes.push(`[sRefS][refGrad]blend=all_mode=multiply,format=gbrp[sRefF]`);
    nodes.push(`color=c=black:s=${W}x${gapH}:r=${fps},format=gbrp[refGap]`);
    nodes.push(`[sMain][refGap][sRefF]vstack=inputs=3,format=gbrp[stripFull]`);
  } else {
    nodes.push(`[strip]null[stripFull]`);
  }

  nodes.push(`[stripFull]pad=${W}:${H}:0:${yTop}:color=black,format=gbrp[vpad]`);
  if (glow > 0) {
    // Two-pass bloom: a tight core glow and a wide soft halo, screen-stacked.
    nodes.push(`[vpad]split=3[vp0][vp1][vp2]`);
    nodes.push(`[vp1]gblur=sigma=${(glow * 0.6).toFixed(2)},format=gbrp[vglowa]`);
    nodes.push(`[vp2]gblur=sigma=${(glow * 1.8).toFixed(2)},format=gbrp[vglowb]`);
    nodes.push(`[vp0][vglowa]blend=all_mode=screen,format=gbrp[vbloom0]`);
    nodes.push(`[vbloom0][vglowb]blend=all_mode=screen,format=gbrp[vizfull]`);
  } else {
    nodes.push(`[vpad]null[vizfull]`);
  }
  nodes.push(`[${baseLabel}]format=gbrp[vbase]`);
  nodes.push(`[vbase][vizfull]blend=all_mode=screen,format=yuv420p[${outLabel}]`);

  return { nodes, audioOutLabel: 'aout' };
}
