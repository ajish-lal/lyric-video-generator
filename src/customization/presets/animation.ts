import type { AnimationMotion } from '../../core/models/customization.js';

/** Data-only description of an animation preset. The resolver turns this into a
 * concrete AnimationBehavior; the renderer never sees the preset name. */
export interface AnimationPresetData {
  motion: AnimationMotion;
  inDuration: number;
  translatePx?: number;
  overshoot?: number;
  shakePx?: number;
  shakeHz?: number;
  glitch?: boolean;
  opacityMul?: number;
  description: string;
}

/**
 * Built-in animation presets. Keys are normalized (see normalizeKey in index).
 * Note: drawtext cannot animate font size per-frame, so "scale/overshoot" is
 * approximated with a short positional bounce; glitch presets add jitter and are
 * complemented by the frame-level glitch effect.
 */
export const ANIMATION_PRESETS: Record<string, AnimationPresetData> = {
  none: { motion: 'none', inDuration: 0, description: 'No animation; appears instantly.' },
  fade: { motion: 'fade', inDuration: 0.35, description: 'Simple opacity fade in/out.' },
  fade_up: { motion: 'fade-up', inDuration: 0.4, translatePx: 40, description: 'Fade while drifting upward.' },
  slide_up: { motion: 'slide-up', inDuration: 0.35, translatePx: 80, description: 'Slide in from below.' },
  slide_down: { motion: 'slide-down', inDuration: 0.35, translatePx: 80, description: 'Slide in from above.' },
  typewriter: { motion: 'typewriter', inDuration: 0.5, description: 'Reveal (approximated as a quick stepped fade).' },
  pop: { motion: 'pop', inDuration: 0.18, overshoot: 0.15, description: 'Quick pop with a small bounce.' },
  blur_in: { motion: 'blur-in', inDuration: 0.4, description: 'Soft focus-in (approximated via fade).' },

  punch_in: { motion: 'pop', inDuration: 0.12, overshoot: 0.22, shakePx: 4, shakeHz: 40, description: 'Hard punch with a jab of shake.' },
  impact: { motion: 'pop', inDuration: 0.1, overshoot: 0.28, shakePx: 10, shakeHz: 36, description: 'Heavy impact hit.' },
  smash: { motion: 'pop', inDuration: 0.09, overshoot: 0.32, shakePx: 10, shakeHz: 30, description: 'Violent smash-in.' },
  rage: { motion: 'shake', inDuration: 0.12, overshoot: 0.2, shakePx: 12, shakeHz: 42, description: 'Aggressive sustained shake.' },
  scream: { motion: 'shake', inDuration: 0.1, overshoot: 0.25, shakePx: 9, shakeHz: 55, description: 'Frantic high-frequency shake.' },
  shake: { motion: 'shake', inDuration: 0.12, shakePx: 8, shakeHz: 48, description: 'General camera-shake style jitter.' },

  whisper: { motion: 'fade', inDuration: 0.9, opacityMul: 0.6, description: 'Slow, faint fade.' },
  ghost: { motion: 'fade', inDuration: 1.2, opacityMul: 0.45, description: 'Very slow, translucent fade.' },
  void: { motion: 'fade', inDuration: 1.4, opacityMul: 0.35, description: 'Barely-there slow fade.' },
  burn_in: { motion: 'fade', inDuration: 0.6, description: 'Lingering burn-in fade.' },

  glitch: { motion: 'glitch', inDuration: 0.14, shakePx: 6, shakeHz: 60, glitch: true, description: 'Digital glitch jitter.' },
  corrupted: { motion: 'glitch', inDuration: 0.16, shakePx: 8, shakeHz: 70, glitch: true, description: 'Corrupted signal jitter.' },
  static_burst: { motion: 'glitch', inDuration: 0.1, shakePx: 5, shakeHz: 80, glitch: true, description: 'Sharp static burst.' },
  crt: { motion: 'glitch', inDuration: 0.2, shakePx: 3, shakeHz: 30, glitch: true, description: 'CRT wobble.' },
  distort: { motion: 'glitch', inDuration: 0.18, shakePx: 7, shakeHz: 50, glitch: true, description: 'Distorted judder.' },
  distortion: { motion: 'glitch', inDuration: 0.18, shakePx: 7, shakeHz: 50, glitch: true, description: 'Alias of distort.' },
  static: { motion: 'glitch', inDuration: 0.12, shakePx: 4, shakeHz: 75, glitch: true, description: 'Noisy static jitter.' },

  breakdown: { motion: 'shake', inDuration: 0.1, overshoot: 0.3, shakePx: 14, shakeHz: 26, description: 'Heavy low-frequency breakdown slam.' },
  hard_cut: { motion: 'none', inDuration: 0, description: 'Instant hard cut, no ease.' },
};
