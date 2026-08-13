import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import type { ProjectConfig, SectionStyle, StyleProperties } from '../core/models/customization.js';
import { getEmphasisPreset, getSectionPreset, suggestAny } from './presets/index.js';

/** CLI convenience flags that override whatever the config file specifies. */
export interface CliOverrides {
  font?: string;
  fontSize?: number;
  color?: string;
  animation?: string;
  preset?: string;
  /** word text -> emphasis/style name (from `--word-style shout:BREAK`). */
  wordStyles?: Record<string, string>;
  audio?: string;
  lyrics?: string;
  output?: string;
  theme?: 'dark' | 'white';
  resolution?: { width?: number; height?: number; fps?: number };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge where `override` wins. Arrays are replaced, not concatenated. */
function deepMerge<T>(base: T, override: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override ?? base) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = out[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = deepMerge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Load a project configuration file. JSON only — YAML is intentionally not
 * supported to avoid an extra dependency.
 */
export function loadConfig(path: string): ProjectConfig {
  const abs = isAbsolute(path) ? path : resolve(path);
  const ext = extname(abs).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') {
    throw new Error(`YAML config is not supported. Please convert "${path}" to JSON (.json).`);
  }
  if (!existsSync(abs)) {
    throw new Error(`Config file not found: ${path}`);
  }
  const raw = readFileSync(abs, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error('top-level value must be a JSON object');
    }
    return parsed as ProjectConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Config file "${path}" is not valid JSON: ${message}`);
  }
}

export function saveConfig(path: string, config: ProjectConfig): void {
  const abs = isAbsolute(path) ? path : resolve(path);
  writeFileSync(abs, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/**
 * Apply a named preset (or a user preset file) to a config as a *base* layer.
 * Explicit config values still win over the preset.
 */
export function applyPresetToConfig(config: ProjectConfig, presetRef: string): ProjectConfig {
  // A path to a user preset file: deep-merge as the base.
  const looksLikeFile = presetRef.toLowerCase().endsWith('.json') || existsSync(resolve(presetRef));
  if (looksLikeFile) {
    const base = loadConfig(presetRef);
    return deepMerge(base, config);
  }

  const section = getSectionPreset(presetRef);
  if (section) {
    const { background, preset: _p, ...typography } = section as SectionStyle;
    const base: ProjectConfig = {
      typography: typography as StyleProperties,
      ...(background ? { background } : {}),
      ...(section.animation ? { animation: section.animation } : {}),
    };
    return deepMerge(base, config);
  }

  const emphasis = getEmphasisPreset(presetRef);
  if (emphasis) {
    const base: ProjectConfig = { typography: emphasis };
    return deepMerge(base, config);
  }

  const hint = suggestAny(presetRef);
  throw new Error(
    `Unknown preset "${presetRef}".` + (hint ? ` Did you mean "${hint}"?` : ' Run "presets" to list available presets.'),
  );
}

/** Merge CLI convenience flags over a config (flags win). */
export function applyCliOverrides(config: ProjectConfig, overrides: CliOverrides): ProjectConfig {
  let out: ProjectConfig = { ...config };

  if (overrides.preset) {
    out = applyPresetToConfig(out, overrides.preset);
  }

  const typography: StyleProperties = { ...(out.typography ?? {}) };
  if (overrides.font) typography.font = overrides.font;
  if (overrides.fontSize !== undefined) typography.fontSize = overrides.fontSize;
  if (overrides.color) typography.color = overrides.color;
  if (Object.keys(typography).length > 0) out.typography = typography;

  if (overrides.animation) out.animation = { preset: overrides.animation };
  if (overrides.audio) out.audio = overrides.audio;
  if (overrides.lyrics) out.lyrics = overrides.lyrics;
  if (overrides.theme) out.theme = overrides.theme;
  if (overrides.resolution) out.resolution = { ...(out.resolution ?? {}), ...overrides.resolution };

  if (overrides.wordStyles && Object.keys(overrides.wordStyles).length > 0) {
    out.wordStyles = { ...(out.wordStyles ?? {}), ...overrides.wordStyles };
  }

  return out;
}

/** Parse a `--word-style style:WORD` token into a `{ WORD: style }` entry. */
export function parseWordStyleFlag(token: string): { word: string; style: string } | undefined {
  const idx = token.indexOf(':');
  if (idx <= 0 || idx >= token.length - 1) return undefined;
  const style = token.slice(0, idx).trim();
  const word = token.slice(idx + 1).trim();
  if (!style || !word) return undefined;
  return { word, style };
}
