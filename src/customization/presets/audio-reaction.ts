/**
 * Audio/beat reactivity presets.
 *
 * The current pipeline does NOT perform audio analysis, so these are stored and
 * validated but have no runtime effect yet. They are defined as data so that a
 * future beat-detection stage can drive them without changing the config schema
 * or the CLI. This deliberately does not block any other feature.
 */
export interface AudioReactionPresetData {
  defaultIntensity: number;
  /** which resolved property a future beat driver would modulate. */
  target: 'scale' | 'opacity' | 'shake' | 'glow';
  description: string;
}

export const AUDIO_REACTION_PRESETS: Record<string, AudioReactionPresetData> = {
  kick_punch: { defaultIntensity: 0.7, target: 'scale', description: 'Punch scale on kick drum hits.' },
  bass_breath: { defaultIntensity: 0.5, target: 'scale', description: 'Slow scale swell with the bass.' },
  snare_flash: { defaultIntensity: 0.6, target: 'glow', description: 'Glow flash on snare hits.' },
  vocal_energy: { defaultIntensity: 0.5, target: 'opacity', description: 'Opacity tracks vocal loudness.' },
  drop_impact: { defaultIntensity: 1.0, target: 'shake', description: 'Big shake on the drop.' },
};
