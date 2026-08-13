import type { SectionType } from '../../core/models/project.js';
import type {
  AnimationSpec,
  BackgroundConfigUser,
  EffectsConfig,
  ProjectConfig,
  SectionConfig,
  SectionStyle,
  StyleProperties,
} from '../../core/models/customization.js';

/**
 * A song template describes a reusable "look" keyed by section type. When
 * lyrics are parsed into typed sections (`[Verse]`, `[Chorus]`, `[Bridge]`, …)
 * the matching section style is applied automatically, so a whole song is
 * styled consistently without hand-writing a config per section.
 *
 * A template is essentially a partial {@link ProjectConfig}: it fills in the
 * global look plus a style for each section type, and any explicit config the
 * user supplies still wins.
 */
export interface SongTemplate {
  /** Unique, human-friendly identifier (normalized on lookup). */
  name: string;
  description: string;
  theme?: 'dark' | 'white';
  /** Project-wide base preset applied as the global style. */
  preset?: string;
  typography?: StyleProperties;
  animation?: AnimationSpec | string;
  background?: BackgroundConfigUser | string;
  effects?: EffectsConfig;
  /** Per-section-type styling. Section types with no entry fall back to global. */
  sections: Partial<Record<SectionType, SectionStyle>>;
}

/** Shallow-merge two partials, keeping already-set (override) keys. */
function mergeDefined<T extends object>(base: T | undefined, override: T | undefined): T | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Expand a template into a {@link ProjectConfig}, layering it *under* an
 * existing config so explicit user settings always win. The template's
 * per-section-type styles are turned into `type`-selected section configs and
 * placed before the user's own sections (later sections override earlier ones
 * in the customization resolver).
 */
export function applyTemplateToConfig(config: ProjectConfig, template: SongTemplate): ProjectConfig {
  const templateSections: SectionConfig[] = (Object.entries(template.sections) as [SectionType, SectionStyle][])
    .filter(([, style]) => Boolean(style))
    .map(([type, style]) => ({ type, style }));

  return {
    ...config,
    theme: config.theme ?? template.theme,
    preset: config.preset ?? template.preset,
    typography: mergeDefined(template.typography, config.typography),
    animation: config.animation ?? template.animation,
    background: config.background ?? template.background,
    effects: mergeDefined(template.effects, config.effects),
    sections: [...templateSections, ...(config.sections ?? [])],
  };
}
