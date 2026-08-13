import type {
  AnimationSpec,
  BackgroundConfigUser,
  SectionStyle,
  StyleProperties,
} from '../../core/models/customization.js';
import { ANIMATION_PRESETS, type AnimationPresetData } from './animation.js';
import { EMPHASIS_PRESETS } from './emphasis.js';
import { SECTION_PRESETS } from './section.js';
import { BACKGROUND_PRESETS } from './background.js';
import { TREATMENT_PRESETS } from './treatment.js';
import { AUDIO_REACTION_PRESETS } from './audio-reaction.js';

export type PresetCategory = 'animation' | 'word' | 'section' | 'background' | 'treatment' | 'audio';

/** Normalizes a preset name so `fade-up`, `fade_up`, `Fade Up` all match. */
export function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const REGISTRIES: Record<PresetCategory, Record<string, unknown>> = {
  animation: ANIMATION_PRESETS,
  word: EMPHASIS_PRESETS,
  section: SECTION_PRESETS,
  background: BACKGROUND_PRESETS,
  treatment: TREATMENT_PRESETS,
  audio: AUDIO_REACTION_PRESETS,
};

export function hasPreset(category: PresetCategory, name: string): boolean {
  return normalizeKey(name) in REGISTRIES[category];
}

export function listPresetNames(category: PresetCategory): string[] {
  return Object.keys(REGISTRIES[category]);
}

export function listAllPresets(): Record<PresetCategory, string[]> {
  return {
    animation: listPresetNames('animation'),
    word: listPresetNames('word'),
    section: listPresetNames('section'),
    background: listPresetNames('background'),
    treatment: listPresetNames('treatment'),
    audio: listPresetNames('audio'),
  };
}

export function getAnimationPreset(name: string): AnimationPresetData | undefined {
  return ANIMATION_PRESETS[normalizeKey(name)];
}
export function getEmphasisPreset(name: string): StyleProperties | undefined {
  return EMPHASIS_PRESETS[normalizeKey(name)];
}
export function getSectionPreset(name: string): SectionStyle | undefined {
  return SECTION_PRESETS[normalizeKey(name)];
}
export function getBackgroundPreset(name: string): BackgroundConfigUser | undefined {
  return BACKGROUND_PRESETS[normalizeKey(name)];
}
export function getTreatmentPreset(name: string): StyleProperties | undefined {
  return TREATMENT_PRESETS[normalizeKey(name)];
}

/** Raw preset payload for inspection (`preset show`). */
export function getPresetRaw(name: string): { category: PresetCategory; data: unknown } | undefined {
  const key = normalizeKey(name);
  for (const category of Object.keys(REGISTRIES) as PresetCategory[]) {
    if (key in REGISTRIES[category]) return { category, data: REGISTRIES[category][key] };
  }
  return undefined;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[cols - 1];
}

/** Closest known preset name in a category (for "did you mean" hints). */
export function suggest(category: PresetCategory, name: string): string | undefined {
  const key = normalizeKey(name);
  let best: string | undefined;
  let bestScore = Infinity;
  for (const candidate of listPresetNames(category)) {
    const score = levenshtein(key, candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  // Only suggest when reasonably close.
  return best && bestScore <= Math.max(2, Math.floor(key.length / 3)) ? best : undefined;
}

/** Suggest across every category (used when the category is unknown). */
export function suggestAny(name: string): string | undefined {
  const categories: PresetCategory[] = ['animation', 'word', 'section', 'background', 'treatment', 'audio'];
  let best: string | undefined;
  for (const category of categories) {
    const candidate = suggest(category, name);
    if (candidate) {
      best = candidate;
      break;
    }
  }
  return best;
}

export function coerceAnimation(value: AnimationSpec | string | undefined): AnimationSpec | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? { preset: value } : value;
}
