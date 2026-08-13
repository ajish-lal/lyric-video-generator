import type { BackgroundConfigUser } from '../../core/models/customization.js';

/** Background presets. Values feed the resolved background + frame effects. */
export const BACKGROUND_PRESETS: Record<string, BackgroundConfigUser> = {
  blackout: { color: '#000000', grain: 0.05, vignette: 0.85 },
  industrial: { color: '#0b0c10', gradient: ['0x050506', '0x121419', '0x060607'], grain: 0.25, vignette: 0.6 },
  crt: { color: '#050805', grain: 0.35, vignette: 0.7, overlayColor: '#0aff0a', overlayOpacity: 0.04 },
  static: { color: '#0a0a0a', grain: 0.5, vignette: 0.65 },
  red_room: { color: '#140406', gradient: ['0x1a0406', '0x2a0608', '0x0a0203'], grain: 0.2, vignette: 0.7, overlayColor: '#ff1020', overlayOpacity: 0.06 },
  dark_grain: { color: '#070708', grain: 0.4, vignette: 0.75 },
  camcorder: { color: '#0a0a0c', grain: 0.3, vignette: 0.6, overlayColor: '#1030ff', overlayOpacity: 0.03 },
  distorted: { color: '#08080a', grain: 0.45, vignette: 0.7, blur: 0.1 },
};
