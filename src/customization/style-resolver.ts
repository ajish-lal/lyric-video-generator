import type {
  AnimationBehavior,
  AnimationSpec,
  Position,
  ResolvedWordRender,
  StyleProperties,
} from '../core/models/customization.js';
import {
  ANIMATION_PRESETS,
} from './presets/animation.js';
import {
  coerceAnimation,
  getAnimationPreset,
  getEmphasisPreset,
  getTreatmentPreset,
} from './presets/index.js';

/** Fallbacks used when a property is never specified anywhere in the hierarchy. */
export interface ResolveDefaults {
  fontFamily: string;
  /** default font size in px at the 1080p reference height. */
  fontSizePx: number;
  color: string;
}

export const DEFAULT_RESOLVE_DEFAULTS: ResolveDefaults = {
  fontFamily: 'Impact',
  fontSizePx: 92,
  color: '#ffffff',
};

const REFERENCE_HEIGHT = 1080;

/**
 * Expand a style's preset references (emphasis, treatment) into concrete
 * properties. Explicit properties on the style win over preset-derived ones.
 * Nested references (e.g. an emphasis that also names a treatment) are expanded
 * recursively with a small depth guard.
 */
function expandStyle(style: StyleProperties, depth = 0): StyleProperties {
  const out: StyleProperties = {};

  if (depth < 4) {
    if (style.emphasis) {
      const frag = getEmphasisPreset(style.emphasis);
      if (frag) Object.assign(out, expandStyle(frag, depth + 1));
    }
    if (style.treatment) {
      const frag = getTreatmentPreset(style.treatment);
      if (frag) Object.assign(out, expandStyle(frag, depth + 1));
    }
  }

  // Own explicit properties override anything from the presets above. We keep
  // `animation`/`audioReaction` as-is (resolved later); we drop the consumed
  // `emphasis`/`treatment` names.
  const { emphasis: _e, treatment: _t, position, ...rest } = style;
  Object.assign(out, rest);
  if (position) out.position = { ...(out.position ?? {}), ...position };
  return out;
}

/** Deep-merge two positions. */
function mergePosition(a?: Position, b?: Position): Position | undefined {
  if (!a && !b) return undefined;
  return { ...(a ?? {}), ...(b ?? {}) };
}

/**
 * Merge a stack of style layers (defaults → global → section → line → word).
 * Each layer is expanded first, then later layers override earlier ones. Only
 * explicitly-set properties participate, so unset values fall through.
 */
export function mergeStyleLayers(layers: StyleProperties[]): StyleProperties {
  const merged: StyleProperties = {};
  for (const layer of layers) {
    if (!layer) continue;
    const expanded = expandStyle(layer);
    const position = mergePosition(merged.position, expanded.position);
    Object.assign(merged, expanded);
    if (position) merged.position = position;
  }
  return merged;
}

/** Resolve an animation spec/preset name into a concrete behavior. */
export function resolveAnimation(
  value: AnimationSpec | string | undefined,
  height: number,
): AnimationBehavior {
  const spec = coerceAnimation(value) ?? { preset: 'none' };
  const data = getAnimationPreset(spec.preset ?? 'none') ?? ANIMATION_PRESETS.none;
  const intensity = spec.intensity ?? 1;
  const heightScale = height / REFERENCE_HEIGHT;
  return {
    motion: data.motion,
    inDuration: spec.duration ?? data.inDuration,
    translatePx: (data.translatePx ?? 0) * intensity * heightScale,
    overshoot: (data.overshoot ?? 0) * intensity,
    shakePx: (data.shakePx ?? 0) * intensity * heightScale,
    shakeHz: (data.shakeHz ?? 0) * (spec.speed ?? 1),
    glitch: data.glitch ?? false,
    opacityMul: data.opacityMul ?? 1,
  };
}

export interface ResolveContext {
  height: number;
  defaults?: ResolveDefaults;
}

/**
 * Turn a stack of style layers into a fully-resolved, pixel-accurate per-word
 * render instruction. This is the only thing the renderer consumes.
 */
export function resolveWordStyle(
  layers: StyleProperties[],
  ctx: ResolveContext,
): ResolvedWordRender {
  const defaults = ctx.defaults ?? DEFAULT_RESOLVE_DEFAULTS;
  const height = ctx.height;
  const heightScale = height / REFERENCE_HEIGHT;
  const merged = mergeStyleLayers(layers);

  const animation = resolveAnimation(merged.animation, height);

  const baseSizeRef = merged.fontSize ?? defaults.fontSizePx;
  const fontScale = (merged.fontScale ?? 1) * (merged.scale ?? 1);
  const fontSizePx = Math.round(baseSizeRef * heightScale * fontScale);

  const opacity = clamp01((merged.opacity ?? 1) * animation.opacityMul);

  const resolved: ResolvedWordRender = {
    fontFamily: merged.font ?? defaults.fontFamily,
    fontSizePx,
    color: merged.color ?? defaults.color,
    opacity,
    xNorm: merged.position?.x ?? 0.5,
    yNorm: merged.position?.y ?? 0.5,
    animation,
  };

  if (merged.stroke) {
    resolved.stroke = {
      width: Math.max(1, Math.round((merged.strokeWidth ?? 2) * heightScale * (merged.scale ?? 1))),
      color: merged.strokeColor ?? '#000000',
    };
  }

  if (merged.shadow) {
    const offset = Math.max(1, Math.round((merged.shadowBlur ?? 6) * heightScale));
    resolved.shadow = {
      dx: offset,
      dy: offset,
      color: merged.shadowColor ?? '#000000',
      alpha: clamp01(merged.shadowOpacity ?? 0.6),
    };
  }

  return resolved;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
