import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type {
  AnimationSpec,
  LineConfig,
  ProjectConfig,
  SectionConfig,
  StyleProperties,
  WordConfig,
} from '../core/models/customization.js';
import { hasPreset, suggest, type PresetCategory } from './presets/index.js';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FFMPEG_COLOR = /^0x[0-9a-fA-F]{6}$/;
const NAMED_COLORS = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 'gray', 'grey', 'orange',
]);

function isValidColor(value: string): boolean {
  return HEX_COLOR.test(value) || FFMPEG_COLOR.test(value) || NAMED_COLORS.has(value.toLowerCase());
}

function checkPreset(
  category: PresetCategory,
  name: string | undefined,
  where: string,
  result: ValidationResult,
): void {
  if (!name) return;
  if (hasPreset(category, name)) return;
  const hint = suggest(category, name);
  result.errors.push(
    `Invalid ${category} preset "${name}" at ${where}.` + (hint ? ` Did you mean "${hint}"?` : ''),
  );
}

function checkColor(value: string | undefined, where: string, result: ValidationResult): void {
  if (value === undefined) return;
  if (!isValidColor(value)) {
    result.errors.push(
      `Invalid color "${value}" at ${where}. Use #RRGGBB, #RGB, 0xRRGGBB, or a basic color name.`,
    );
  }
}

function checkRange(
  value: number | undefined,
  min: number,
  max: number,
  where: string,
  result: ValidationResult,
): void {
  if (value === undefined) return;
  if (Number.isNaN(value) || value < min || value > max) {
    result.errors.push(`Value ${value} at ${where} is out of range (${min}..${max}).`);
  }
}

function animationName(a: AnimationSpec | string | undefined): string | undefined {
  if (a === undefined) return undefined;
  return typeof a === 'string' ? a : a.preset;
}

function validateStyle(style: StyleProperties | undefined, where: string, result: ValidationResult): void {
  if (!style) return;
  checkColor(style.color, `${where}.color`, result);
  checkColor(style.strokeColor, `${where}.strokeColor`, result);
  checkColor(style.shadowColor, `${where}.shadowColor`, result);
  checkRange(style.opacity, 0, 1, `${where}.opacity`, result);
  checkRange(style.shadowOpacity, 0, 1, `${where}.shadowOpacity`, result);
  checkRange(style.position?.x, 0, 1, `${where}.position.x`, result);
  checkRange(style.position?.y, 0, 1, `${where}.position.y`, result);
  if (style.fontSize !== undefined && style.fontSize <= 0) {
    result.errors.push(`fontSize must be > 0 at ${where}.fontSize.`);
  }
  checkPreset('animation', animationName(style.animation), `${where}.animation`, result);
  checkPreset('word', style.emphasis, `${where}.emphasis`, result);
  checkPreset('treatment', style.treatment, `${where}.treatment`, result);
  checkPreset('audio', animationName(style.audioReaction), `${where}.audioReaction`, result);
}

function validateTiming(
  start: number | undefined,
  end: number | undefined,
  where: string,
  result: ValidationResult,
): void {
  if (start !== undefined && start < 0) result.errors.push(`start must be >= 0 at ${where}.`);
  if (end !== undefined && end < 0) result.errors.push(`end must be >= 0 at ${where}.`);
  if (start !== undefined && end !== undefined && end <= start) {
    result.errors.push(`end (${end}) must be greater than start (${start}) at ${where}.`);
  }
}

function validateWords(words: WordConfig[] | undefined, where: string, result: ValidationResult): void {
  if (!words) return;
  const timed = words
    .filter((w) => w.start !== undefined && w.end !== undefined)
    .sort((a, b) => (a.start! - b.start!));
  for (let i = 0; i < words.length; i += 1) {
    validateTiming(words[i].start, words[i].end, `${where}.words[${i}]`, result);
    validateStyle(words[i].style, `${where}.words[${i}].style`, result);
  }
  for (let i = 1; i < timed.length; i += 1) {
    if (timed[i].start! < timed[i - 1].end!) {
      result.warnings.push(`Overlapping word timings near "${timed[i].text ?? i}" in ${where}.`);
    }
  }
}

function validateLine(line: LineConfig, where: string, result: ValidationResult): void {
  validateTiming(line.start, line.end, where, result);
  validateStyle(line.style, `${where}.style`, result);
  validateWords(line.words, where, result);
}

function validateSection(section: SectionConfig, where: string, result: ValidationResult): void {
  validateTiming(section.start, section.end, where, result);
  if (section.style) {
    checkPreset('section', section.style.preset, `${where}.style.preset`, result);
    const bg = section.style.background;
    if (typeof bg === 'string') checkPreset('background', bg, `${where}.style.background`, result);
    else if (bg) validateBackground(bg, `${where}.style.background`, result);
    validateStyle(section.style, `${where}.style`, result);
  }
  section.lines?.forEach((line, i) => validateLine(line, `${where}.lines[${i}]`, result));
}

function validateBackground(bg: NonNullable<ProjectConfig['background']>, where: string, result: ValidationResult): void {
  if (typeof bg === 'string') {
    checkPreset('background', bg, where, result);
    return;
  }
  checkPreset('background', bg.preset, `${where}.preset`, result);
  checkColor(bg.color, `${where}.color`, result);
  checkColor(bg.overlayColor, `${where}.overlayColor`, result);
  checkRange(bg.vignette, 0, 1, `${where}.vignette`, result);
  checkRange(bg.overlayOpacity, 0, 1, `${where}.overlayOpacity`, result);
  bg.gradient?.forEach((c, i) => checkColor(c, `${where}.gradient[${i}]`, result));
  for (const key of ['image', 'video'] as const) {
    const p = bg[key];
    if (p && !existsSync(isAbsolute(p) ? p : resolve(p))) {
      result.warnings.push(`Background ${key} "${p}" not found (${where}.${key}). It must exist before rendering.`);
    }
  }
}

/** Validate a project config. Returns collected errors and warnings. */
export function validateConfig(config: ProjectConfig): ValidationResult {
  const result: ValidationResult = { errors: [], warnings: [] };

  checkPreset('section', config.preset, 'preset', result);
  checkPreset('animation', animationName(config.animation), 'animation', result);
  validateStyle(config.typography, 'typography', result);

  if (config.background) validateBackground(config.background, 'background', result);

  if (config.resolution) {
    if (config.resolution.width !== undefined && config.resolution.width <= 0) {
      result.errors.push('resolution.width must be > 0.');
    }
    if (config.resolution.height !== undefined && config.resolution.height <= 0) {
      result.errors.push('resolution.height must be > 0.');
    }
    if (config.resolution.fps !== undefined && config.resolution.fps <= 0) {
      result.errors.push('resolution.fps must be > 0.');
    }
  }

  if (config.audio && !existsSync(isAbsolute(config.audio) ? config.audio : resolve(config.audio))) {
    result.warnings.push(`Audio file "${config.audio}" not found. It must exist before rendering.`);
  }
  if (config.lyrics && !existsSync(isAbsolute(config.lyrics) ? config.lyrics : resolve(config.lyrics))) {
    result.warnings.push(`Lyrics file "${config.lyrics}" not found.`);
  }

  config.sections?.forEach((s, i) => validateSection(s, `sections[${i}]`, result));
  config.lines?.forEach((l, i) => validateLine(l, `lines[${i}]`, result));

  if (config.wordStyles) {
    for (const [word, style] of Object.entries(config.wordStyles)) {
      if (typeof style === 'string') checkPreset('word', style, `wordStyles["${word}"]`, result);
      else validateStyle(style, `wordStyles["${word}"]`, result);
    }
  }

  return result;
}

/** Convenience: true when there are no hard errors. */
export function isValid(result: ValidationResult): boolean {
  return result.errors.length === 0;
}
