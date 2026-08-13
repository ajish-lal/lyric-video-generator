/**
 * Customization model.
 *
 * This describes the *user-facing* configuration (what the person writing a
 * project JSON file cares about) and the *resolved* style the FFmpeg renderer
 * ultimately consumes. The two are deliberately separate: users describe the
 * desired visual result, the resolver turns it into concrete render parameters.
 *
 * Everything here is optional/opt-in. A project with no customization renders
 * exactly like before.
 */

import type { MusicVizConfig } from './render.js';

/** Normalized 0..1 position (resolution independent). */
export interface Position {
  x?: number;
  y?: number;
}

export interface AnimationSpec {
  preset?: string;
  duration?: number;
  intensity?: number;
  speed?: number;
}

export interface AudioReactionSpec {
  preset?: string;
  intensity?: number;
}

/**
 * Flat bag of style properties. Every level of the hierarchy (global, section,
 * line, word) contributes a partial of this; only explicit overrides are set,
 * and later levels win. Preset names (`emphasis`, `animation`, `treatment`)
 * expand into more of these before explicit props are applied.
 */
export interface StyleProperties {
  // typography
  font?: string;
  /** px at the 1080p reference height; scaled to the real output height. */
  fontSize?: number;
  /** multiplier applied on top of fontSize (used by emphasis presets). */
  fontScale?: number;
  fontWeight?: number;
  color?: string;
  opacity?: number;
  position?: Position;

  // transforms
  scale?: number;

  // stroke / outline
  stroke?: boolean;
  strokeWidth?: number;
  strokeColor?: string;

  // shadow
  shadow?: boolean;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowBlur?: number;

  // stackable presets (resolved into the properties above + animation)
  animation?: AnimationSpec | string;
  emphasis?: string;
  treatment?: string;
  /** reserved: validated but not yet applied at render time (needs beat detection). */
  audioReaction?: AudioReactionSpec | string;
}

export interface BackgroundConfigUser {
  preset?: string;
  color?: string;
  gradient?: string[];
  image?: string;
  video?: string;
  blur?: number;
  vignette?: number;
  grain?: number;
  overlayColor?: string;
  overlayOpacity?: number;
}

export interface EffectsConfig {
  grain?: number;
  /** alias for chromaticAberration. */
  rgbSplit?: number;
  chromaticAberration?: number;
  glitch?: number;
  vignette?: number;
  scanlines?: boolean;
  saturation?: number;
  contrast?: number;
  bloom?: number;
  /** subtle zoom over the whole clip (e.g. 0.06 = +6%). */
  pushIn?: number;
  /** colour temperature of the grade: -1 cool/blue .. 0 neutral .. +1 warm/orange. */
  temperature?: number;
  /** green–magenta tint of the grade: -1 green .. 0 neutral .. +1 magenta. */
  tint?: number;
}

export interface SectionStyle extends StyleProperties {
  preset?: string;
  background?: BackgroundConfigUser | string;
}

export interface WordConfig {
  text?: string;
  index?: number;
  start?: number;
  end?: number;
  style?: StyleProperties;
}

export interface LineConfig {
  text?: string;
  index?: number;
  start?: number;
  end?: number;
  style?: StyleProperties;
  words?: WordConfig[];
}

export interface SectionConfig {
  name?: string;
  type?: string;
  start?: number;
  end?: number;
  style?: SectionStyle;
  lines?: LineConfig[];
}

/** Top-level project configuration file (JSON). */
export interface ProjectConfig {
  title?: string;
  audio?: string;
  lyrics?: string;
  resolution?: { width?: number; height?: number; fps?: number };
  theme?: 'dark' | 'white';
  /** project-wide preset applied as the base global style. */
  preset?: string;
  typography?: StyleProperties;
  animation?: AnimationSpec | string;
  background?: BackgroundConfigUser | string;
  effects?: EffectsConfig;
  sections?: SectionConfig[];
  /** inline lyric/override lines (used when not relying on an external lyrics file). */
  lines?: LineConfig[];
  /** match by exact (case-insensitive) word text; value may be an emphasis name or a style. */
  wordStyles?: Record<string, StyleProperties | string>;
  /** audio-reactive visualizer drawn over the frame (needs an audio track). */
  musicViz?: MusicVizConfig;
}

// ---------------------------------------------------------------------------
// Resolved types (what the FFmpeg renderer receives)
// ---------------------------------------------------------------------------

export type AnimationMotion =
  | 'none'
  | 'fade'
  | 'fade-up'
  | 'slide-up'
  | 'slide-down'
  | 'typewriter'
  | 'pop'
  | 'blur-in'
  | 'shake'
  | 'glitch';

export interface AnimationBehavior {
  motion: AnimationMotion;
  inDuration: number;
  translatePx: number;
  overshoot: number;
  shakePx: number;
  shakeHz: number;
  glitch: boolean;
  opacityMul: number;
}

/** Fully resolved per-word render instruction. Absolute pixels / concrete values. */
export interface ResolvedWordRender {
  fontFamily: string;
  fontSizePx: number;
  color: string;
  opacity: number;
  xNorm: number;
  yNorm: number;
  stroke?: { width: number; color: string };
  shadow?: { dx: number; dy: number; color: string; alpha: number };
  animation: AnimationBehavior;
}

/** Resolved background used by the custom render path. */
export interface ResolvedBackground {
  kind: 'solid' | 'gradient' | 'image' | 'video';
  color: string;
  gradient?: string[];
  imagePath?: string;
  videoPath?: string;
  blur: number;
  vignette: number;
  grain: number;
  overlayColor?: string;
  overlayOpacity: number;
}

/** Shadows/midtones colour offsets fed to ffmpeg `colorbalance`. */
export interface ColorBalance {
  shadows: { r: number; g: number; b: number };
  mids: { r: number; g: number; b: number };
}

/** Resolved frame-level effects (the cinematic grade). */
export interface ResolvedEffects {
  bloom: number;
  chromaticAberration: number;
  vignette: number;
  grain: number;
  saturation: number;
  contrast: number;
  glitch: number;
  scanlines: boolean;
  pushIn: number;
  /** colour grade tint. Defaults reproduce the built-in cool look. */
  colorBalance: ColorBalance;
}
