import type { ResolvedBackground, ResolvedEffects } from './customization.js';

export type GradientType = 'linear' | 'radial' | 'circular' | 'spiral';

export type TextCase = 'original' | 'upper' | 'lower' | 'title';

/** Preset background/text treatments. `dark`/`white` are standalone; a background video can be layered behind either. */
export type BackgroundTheme = 'dark' | 'white';

export type LyricPosition = 'top' | 'center' | 'bottom';

export type LyricAnimationType = 'word-by-word' | 'fade';

export type WordDisplayMode = 'single-word' | 'cumulative';

export type WordDisplayHold = 'word-end' | 'next-word';

export type WordAnimationType = 'smog-fade' | 'slash-vibrate';

export interface WordAnimation {
  type: WordAnimationType;
  duration: number;
  easing: string;
  intensity: number;
}

export interface BackgroundConfig {
  palette: string[];
  gradientType: GradientType;
  motionSpeed: number;
  grain: number;
  vignette: number;
  showFrame: boolean;
}

export interface RenderStyle {
  theme: string;
  fontFamily: string;
  textCase?: TextCase;
  primaryColor: string;
  accentColor: string;
  lyricPosition: LyricPosition;
  background: BackgroundConfig;
}

export interface LyricAnimation {
  type: LyricAnimationType;
  duration: number;
  easing: string;
  intensity: number;
}

export interface WordDisplay {
  mode: WordDisplayMode;
  hold: WordDisplayHold;
}

export interface DynamicWordEffect {
  name: string;
  minDuration?: number;
  maxDuration?: number;
  fontFamily: string;
  color: string;
  animation: WordAnimation;
}

export type MusicVizMode = 'wave' | 'bars' | 'spectrum';
export type MusicVizPosition = 'top' | 'center' | 'bottom';

export interface MusicVizConfig {
  enabled: boolean;
  mode?: MusicVizMode;
  position?: MusicVizPosition;
  /** Strip height as a fraction of frame height (0-1). */
  height?: number;
  /** Gap from the frame edge as a fraction of frame height (0-1). */
  margin?: number;
  /** Colours cycled across the waveform/bars. */
  colors?: string[];
  /** Neon glow strength (gblur sigma); 0 disables the glow. */
  glow?: number;
  /** Adds a fading mirrored reflection beneath the visualizer. */
  reflection?: boolean;
}

export interface RenderConfig {
  width: number;
  height: number;
  fps: number;
  format: string;
  style: RenderStyle;
  lyricAnimation: LyricAnimation;
  wordDisplay?: WordDisplay;
  dynamicWordEffects?: DynamicWordEffect[];
  /** Set when a customization config is applied; triggers the custom render path. */
  customized?: boolean;
  /** Resolved cinematic grade (defaults to the built-in look when absent). */
  effects?: ResolvedEffects;
  /** Resolved background from a customization config. */
  customBackground?: ResolvedBackground;
  /** Audio-reactive visualizer drawn over the frame (needs an audio track). */
  musicViz?: MusicVizConfig;
}
