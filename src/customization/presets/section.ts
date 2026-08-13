import type { SectionStyle } from '../../core/models/customization.js';

/** Section-level presets: typography + default animation + a background preset. */
export const SECTION_PRESETS: Record<string, SectionStyle> = {
  nu_metal_verse: { font: 'Impact', fontSize: 78, color: '#e9edf2', animation: 'fade_up', background: 'industrial' },
  heavy_chorus: { font: 'Impact', fontSize: 104, fontWeight: 900, color: '#ffffff', animation: 'impact', background: 'red_room' },
  scream_section: { fontSize: 120, fontWeight: 900, color: '#ff304f', animation: 'scream', background: 'static' },
  breakdown: { fontSize: 132, fontWeight: 900, color: '#ffffff', animation: 'breakdown', background: 'blackout' },
  dark_bridge: { fontSize: 82, color: '#aab4c2', animation: 'ghost', background: 'dark_grain' },
  dreamy_bridge: { fontSize: 84, color: '#d8f7ff', animation: 'fade', background: 'dark_grain' },
  final_chorus: { fontSize: 112, fontWeight: 900, color: '#ffffff', animation: 'smash', background: 'red_room' },
};
