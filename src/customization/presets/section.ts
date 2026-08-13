import type { SectionStyle } from '../../core/models/customization.js';

/** Section-level presets: typography + default animation + a background preset. */
export const SECTION_PRESETS: Record<string, SectionStyle> = {
  nu_metal_verse: { font: 'Impact', fontSize: 150, color: '#e9edf2', animation: 'fade_up', background: 'industrial' },
  heavy_chorus: { font: 'Impact', fontSize: 200, fontWeight: 900, color: '#ffffff', animation: 'impact', background: 'red_room' },
  scream_section: { fontSize: 224, fontWeight: 900, color: '#ff304f', animation: 'scream', background: 'static' },
  breakdown: { fontSize: 240, fontWeight: 900, color: '#ffffff', animation: 'breakdown', background: 'blackout' },
  dark_bridge: { fontSize: 152, color: '#aab4c2', animation: 'ghost', background: 'dark_grain' },
  dreamy_bridge: { fontSize: 156, color: '#d8f7ff', animation: 'fade', background: 'dark_grain' },
  final_chorus: { fontSize: 208, fontWeight: 900, color: '#ffffff', animation: 'smash', background: 'red_room' },
};
