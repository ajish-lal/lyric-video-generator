import type { StyleProperties } from '../../core/models/customization.js';

/**
 * Word emphasis presets. Each resolves into several style properties (and often
 * an animation). Users can override any individual property after applying one.
 */
export const EMPHASIS_PRESETS: Record<string, StyleProperties> = {
  normal: {},
  subtle: { fontScale: 0.9, opacity: 0.85 },
  emphasis: { fontScale: 1.15, fontWeight: 700 },
  strong: { fontScale: 1.3, fontWeight: 800, animation: 'impact' },
  shout: { fontScale: 1.5, fontWeight: 900, scale: 1.1, animation: 'smash' },
  scream: { fontScale: 1.6, fontWeight: 900, color: '#ff304f', animation: 'scream' },
  whisper: { fontScale: 0.8, opacity: 0.55, animation: 'whisper' },
  anger: { fontScale: 1.35, fontWeight: 900, color: '#ff2530', animation: 'impact' },
  cold: { fontScale: 1.0, color: '#9fdcff', animation: 'ghost' },
  corrupted: { fontScale: 1.15, color: '#c8ffd0', treatment: 'glitch', animation: 'corrupted' },
};
