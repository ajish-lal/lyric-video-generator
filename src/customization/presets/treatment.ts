import type { StyleProperties } from '../../core/models/customization.js';

/**
 * Treatment presets stack on top of animation/emphasis. They mainly nudge the
 * word's look and hint at frame-level effects (glitch treatments raise the
 * frame glitch amount when applied globally — see apply.ts).
 */
export const TREATMENT_PRESETS: Record<string, StyleProperties> = {
  none: {},
  glitch: { animation: 'glitch' },
  corrupted: { color: '#c8ffd0', animation: 'corrupted' },
  ghost: { opacity: 0.5, animation: 'ghost' },
  static: { animation: 'static' },
  distort: { animation: 'distort' },
  rgb_split: { animation: 'corrupted' },
};
