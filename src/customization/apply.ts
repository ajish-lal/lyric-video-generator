import type {
  BackgroundConfigUser,
  EffectsConfig,
  LineConfig,
  ProjectConfig,
  ResolvedBackground,
  ResolvedEffects,
  SectionConfig,
  SectionStyle,
  StyleProperties,
  WordConfig,
} from '../core/models/customization.js';
import type { LyricLine, LyricSection, Project, Word } from '../core/models/project.js';
import { getBackgroundPreset, getSectionPreset } from './presets/index.js';
import { DEFAULT_RESOLVE_DEFAULTS, resolveWordStyle } from './style-resolver.js';

/** Defaults for the cinematic grade — chosen to reproduce the built-in look. */
export const DEFAULT_EFFECTS: ResolvedEffects = {
  bloom: 0.38,
  chromaticAberration: 2,
  vignette: 0.72,
  grain: 4,
  saturation: 0.55,
  contrast: 1.18,
  glitch: 0,
  scanlines: false,
  pushIn: 0.06,
  // Baked-in cool look of the built-in grade (equivalent to temperature ~ -0.6).
  colorBalance: {
    shadows: { r: -0.03, g: 0, b: 0.05 },
    mids: { r: 0, g: 0, b: 0.02 },
  },
};

/** Map friendly temperature/tint scalars onto shadows/mids colour offsets. */
function colorBalanceFromTintControls(temperature: number, tint: number): ResolvedEffects['colorBalance'] {
  return {
    shadows: { r: 0.05 * temperature, g: -0.05 * tint, b: -0.08 * temperature },
    mids: { r: 0.02 * temperature, g: -0.05 * tint, b: -0.04 * temperature },
  };
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function coerceStyle(value: StyleProperties | string | undefined): StyleProperties | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? { emphasis: value } : value;
}

/** Build the global style layer from typography + top-level animation. */
function globalStyle(config: ProjectConfig): StyleProperties {
  const base: StyleProperties = { ...(config.typography ?? {}) };
  if (config.animation !== undefined && base.animation === undefined) {
    base.animation = config.animation;
  }
  return base;
}

/** Expand a section's `preset` into its style, keeping explicit props on top. */
function sectionStyle(section: SectionConfig): StyleProperties {
  const style = section.style;
  if (!style) return {};
  let base: StyleProperties = {};
  if (style.preset) {
    const preset = getSectionPreset(style.preset);
    if (preset) {
      const { background: _b, preset: _p, ...rest } = preset as SectionStyle;
      base = { ...rest };
    }
  }
  const { background: _bg, preset: _pp, ...explicit } = style;
  return { ...base, ...explicit };
}

/** Pick section configs that apply to a given lyric section. */
function matchingSectionConfigs(
  config: ProjectConfig,
  section: LyricSection,
  positionalIndex: number,
): SectionConfig[] {
  const sections = config.sections ?? [];
  const matches: SectionConfig[] = [];
  sections.forEach((sc, i) => {
    const hasSelector = Boolean(sc.type || sc.name);
    if (!hasSelector) {
      if (i === positionalIndex) matches.push(sc);
      return;
    }
    const typeOk = sc.type ? normalizeText(sc.type) === normalizeText(section.type) : true;
    const nameOk = sc.name
      ? normalizeText(sc.name) === normalizeText(section.type) || normalizeText(sc.name) === normalizeText(section.id)
      : true;
    if (typeOk && nameOk) matches.push(sc);
  });
  return matches;
}

/** Pick line configs (from a section config) that apply to a lyric line. */
function matchingLineConfigs(lineConfigs: LineConfig[] | undefined, line: LyricLine, index: number): LineConfig[] {
  if (!lineConfigs) return [];
  return lineConfigs.filter((lc, i) => {
    if (lc.index !== undefined) return lc.index === index;
    if (lc.text) return normalizeText(lc.text) === normalizeText(line.text);
    return i === index;
  });
}

/** Pick word configs (from a line config) that apply to a word. */
function matchingWordConfigs(wordConfigs: WordConfig[] | undefined, word: Word, index: number): WordConfig[] {
  if (!wordConfigs) return [];
  return wordConfigs.filter((wc, i) => {
    if (wc.index !== undefined) return wc.index === index;
    if (wc.text) return normalizeText(wc.text) === normalizeText(word.text);
    return i === index;
  });
}

function wordStyleFromGlobalMap(config: ProjectConfig, word: Word): StyleProperties | undefined {
  if (!config.wordStyles) return undefined;
  for (const [key, style] of Object.entries(config.wordStyles)) {
    if (normalizeText(key) === normalizeText(word.text)) return coerceStyle(style);
  }
  return undefined;
}

function resolveBackground(config: ProjectConfig, project: Project): ResolvedBackground {
  const existing = project.renderConfig.style.background;
  const user = normalizeBackground(config.background);

  const gradient = user?.gradient ?? existing.palette;
  let kind: ResolvedBackground['kind'] = gradient && gradient.length > 0 ? 'gradient' : 'solid';
  if (user?.image) kind = 'image';
  else if (user?.video) kind = 'video';

  return {
    kind,
    color: user?.color ?? existing.palette[0] ?? '#000000',
    gradient,
    imagePath: user?.image,
    videoPath: user?.video,
    blur: user?.blur ?? 0,
    vignette: user?.vignette ?? existing.vignette,
    grain: user?.grain ?? clamp01((existing.grain ?? 4) / 20),
    overlayColor: user?.overlayColor,
    overlayOpacity: user?.overlayOpacity ?? 0,
  };
}

function normalizeBackground(bg: BackgroundConfigUser | string | undefined): BackgroundConfigUser | undefined {
  if (bg === undefined) return undefined;
  if (typeof bg === 'string') return getBackgroundPreset(bg) ?? {};
  if (bg.preset) {
    const preset = getBackgroundPreset(bg.preset);
    if (preset) {
      const { preset: _p, ...rest } = bg;
      return { ...preset, ...rest };
    }
  }
  return bg;
}

function resolveEffects(effects: EffectsConfig | undefined, background: ResolvedBackground): ResolvedEffects {
  const out: ResolvedEffects = { ...DEFAULT_EFFECTS, vignette: background.vignette };
  if (background.grain) out.grain = background.grain * 20;
  if (!effects) return out;

  if (typeof effects.bloom === 'number') out.bloom = effects.bloom;
  if (typeof effects.chromaticAberration === 'number') out.chromaticAberration = effects.chromaticAberration;
  else if (typeof effects.rgbSplit === 'number') out.chromaticAberration = effects.rgbSplit;
  if (typeof effects.vignette === 'number') out.vignette = effects.vignette;
  if (typeof effects.grain === 'number') out.grain = effects.grain;
  if (typeof effects.saturation === 'number') out.saturation = effects.saturation;
  if (typeof effects.contrast === 'number') out.contrast = effects.contrast;
  if (typeof effects.glitch === 'number') out.glitch = effects.glitch;
  if (typeof effects.scanlines === 'boolean') out.scanlines = effects.scanlines;
  if (typeof effects.pushIn === 'number') out.pushIn = effects.pushIn;
  if (typeof effects.temperature === 'number' || typeof effects.tint === 'number') {
    out.colorBalance = colorBalanceFromTintControls(effects.temperature ?? 0, effects.tint ?? 0);
  }
  return out;
}

/**
 * Apply a customization config to an already-built project. Attaches a resolved
 * render instruction to every word and sets the resolved background/effects.
 *
 * Mutates and returns the same project for convenience.
 */
export function applyCustomizationToProject(project: Project, config: ProjectConfig): Project {
  const height = project.renderConfig.height;
  const g = globalStyle(config);

  project.lyrics.sections.forEach((section, sIdx) => {
    const sectionConfigs = matchingSectionConfigs(config, section, sIdx);
    const sectionLayers = sectionConfigs.map(sectionStyle);
    const sectionLineConfigs = sectionConfigs.flatMap((sc) => sc.lines ?? []);

    section.lines.forEach((line, lIdx) => {
      const lineConfigs = [
        ...matchingLineConfigs(sectionLineConfigs, line, lIdx),
        ...matchingLineConfigs(config.lines, line, lIdx),
      ];
      const lineLayers = lineConfigs.map((lc) => lc.style ?? {});
      const wordConfigs = lineConfigs.flatMap((lc) => lc.words ?? []);

      line.words.forEach((word, wIdx) => {
        const wordLayers: StyleProperties[] = [];
        const globalWord = wordStyleFromGlobalMap(config, word);
        if (globalWord) wordLayers.push(globalWord);
        matchingWordConfigs(wordConfigs, word, wIdx).forEach((wc) => {
          if (wc.style) wordLayers.push(wc.style);
        });

        word.render = resolveWordStyle(
          [g, ...sectionLayers, ...lineLayers, ...wordLayers],
          { height, defaults: DEFAULT_RESOLVE_DEFAULTS },
        );
      });
    });
  });

  const background = resolveBackground(config, project);
  project.renderConfig.customBackground = background;
  project.renderConfig.effects = resolveEffects(config.effects, background);
  project.renderConfig.customized = true;
  if (config.musicViz) project.renderConfig.musicViz = config.musicViz;
  if (config.wordDisplay) project.renderConfig.wordDisplay = config.wordDisplay;

  if (config.resolution) {
    if (config.resolution.width) project.renderConfig.width = config.resolution.width;
    if (config.resolution.height) project.renderConfig.height = config.resolution.height;
    if (config.resolution.fps) project.renderConfig.fps = config.resolution.fps;
  }

  return project;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
