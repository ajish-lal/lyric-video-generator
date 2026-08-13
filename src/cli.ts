#!/usr/bin/env node
import { Pipeline } from './application/orchestration/pipeline.js';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { BackgroundTheme, MusicVizConfig, MusicVizMode, MusicVizPosition } from './core/models/render.js';
import {
  applyCliOverrides,
  applyPresetToConfig,
  loadConfig,
  parseWordStyleFlag,
  saveConfig,
  type CliOverrides,
} from './customization/config-loader.js';
import { validateConfig } from './customization/validation.js';
import { getPresetRaw, listAllPresets, suggestAny, type PresetCategory } from './customization/presets/index.js';
import {
  applyTemplateByName,
  getTemplate,
  listTemplates,
} from './customization/templates/index.js';
import { LocalWhisperTranscriber } from './providers/transcription/local-whisper-transcriber.js';
import { parseLyricsFile, lyricsFromTranscript } from './application/lyrics/lyrics-parser.js';
import { alignLyricsToTranscript } from './application/lyrics/align.js';
import { buildProjectConfig } from './application/orchestration/config-generator.js';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']);
const SUBCOMMANDS = new Set(['create', 'viz', 'render', 'preview', 'presets', 'preset', 'validate', 'templates', 'template']);

function findSingleInputAudio(): string | undefined {
  try {
    const files = readdirSync('input', { withFileTypes: true })
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()));
    return files.length === 1 ? join('input', files[0].name) : undefined;
  } catch {
    return undefined;
  }
}

function parseTheme(value: string | undefined): BackgroundTheme {
  switch ((value ?? '').toLowerCase()) {
    case 'white':
    case 'light':
      return 'white';
    default:
      return 'dark';
  }
}

function valueFor(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * Selects the video encoder from CLI flags before any render runs. `--gpu` (or
 * `--encoder nvenc`) switches the renderer to the NVIDIA hardware encoder by
 * setting VIDEO_ENCODER, which the renderer reads. `--encoder cpu` forces
 * libx264. No flag leaves the environment untouched.
 */
function applyEncoderFlags(args: string[]): void {
  const encoder = valueFor(args, '--encoder');
  if (args.includes('--gpu')) {
    process.env.VIDEO_ENCODER = 'nvenc';
  }
  if (encoder) {
    const normalized = encoder.trim().toLowerCase();
    if (normalized === 'nvenc' || normalized === 'gpu') process.env.VIDEO_ENCODER = 'nvenc';
    else if (normalized === 'cpu' || normalized === 'libx264') process.env.VIDEO_ENCODER = 'cpu';
  }
}

/**
 * Enables the audio-reactive visualizer. `--viz` alone uses the default bottom
 * neon wave; `--viz wave|bars|spectrum` picks the style. `--viz-color`
 * (repeatable) sets the wave/bar colours; `--viz-reflect` adds a reflection.
 * Sets MUSIC_VIZ / MUSIC_VIZ_COLORS / MUSIC_VIZ_REFLECT, which the renderer
 * reads. Requires the render to have an audio track.
 */
function applyVizFlag(args: string[]): void {
  const index = args.indexOf('--viz');
  if (index < 0) return;
  const next = args[index + 1];
  const mode = next && !next.startsWith('--') ? next.trim().toLowerCase() : 'wave';
  process.env.MUSIC_VIZ = ['wave', 'bars', 'spectrum'].includes(mode) ? mode : 'wave';
  const colors = allValuesFor(args, '--viz-color');
  if (colors.length > 0) process.env.MUSIC_VIZ_COLORS = colors.join('|');
  if (args.includes('--viz-reflect')) process.env.MUSIC_VIZ_REFLECT = '1';
}

function allValuesFor(args: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && i + 1 < args.length) out.push(args[i + 1]);
  }
  return out;
}

/** Reconstructs a MusicVizConfig from the MUSIC_VIZ* env set by applyVizFlag. */
function vizConfigFromEnv(): MusicVizConfig | undefined {
  const raw = process.env.MUSIC_VIZ?.trim().toLowerCase();
  if (!raw || ['0', 'off', 'false'].includes(raw)) return undefined;
  const mode = (['wave', 'bars', 'spectrum'].includes(raw) ? raw : 'wave') as MusicVizMode;
  const colorsEnv = process.env.MUSIC_VIZ_COLORS?.trim();
  const colors = colorsEnv ? colorsEnv.split(/[,|]/).map((c) => c.trim()).filter(Boolean) : undefined;
  const reflection = ['1', 'on', 'true', 'yes'].includes((process.env.MUSIC_VIZ_REFLECT ?? '').trim().toLowerCase());
  return { enabled: true, mode, reflection, ...(colors && colors.length > 0 ? { colors } : {}) };
}

function buildOverrides(args: string[]): CliOverrides {
  const wordStyles: Record<string, string> = {};
  for (const token of allValuesFor(args, '--word-style')) {
    const parsed = parseWordStyleFlag(token);
    if (parsed) wordStyles[parsed.word] = parsed.style;
  }
  const fontSizeRaw = valueFor(args, '--font-size');
  const themeRaw = valueFor(args, '--bg') ?? valueFor(args, '--background');
  return {
    font: valueFor(args, '--font'),
    fontSize: fontSizeRaw !== undefined ? Number(fontSizeRaw) : undefined,
    color: valueFor(args, '--color'),
    animation: valueFor(args, '--animation'),
    preset: valueFor(args, '--preset'),
    audio: valueFor(args, '--audio'),
    lyrics: valueFor(args, '--input') ?? valueFor(args, '--lyrics'),
    output: valueFor(args, '--output'),
    theme: themeRaw !== undefined ? parseTheme(themeRaw) : undefined,
    wordStyles,
  };
}

function reportValidation(config: Parameters<typeof validateConfig>[0]): boolean {
  const result = validateConfig(config);
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  for (const error of result.errors) console.error(`error: ${error}`);
  return result.errors.length === 0;
}

function printPresets(category?: string): void {
  const all = listAllPresets();
  const categories = (category ? [category] : Object.keys(all)) as PresetCategory[];
  for (const cat of categories) {
    const names = all[cat];
    if (!names) {
      console.error(`Unknown preset category "${category}". Categories: ${Object.keys(all).join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n${cat.toUpperCase()} (${names.length})`);
    console.log(`  ${names.join(', ')}`);
  }
}

function printTemplates(): void {
  const templates = listTemplates();
  console.log(`\nTEMPLATES (${templates.length})`);
  for (const template of templates) {
    const sectionTypes = Object.keys(template.sections).join(', ');
    console.log(`  ${template.name} — ${template.description}`);
    console.log(`    sections: ${sectionTypes}`);
  }
}

async function runRender(args: string[], preview: boolean): Promise<void> {
  const configPath = args[0];
  if (!configPath) {
    console.error(`Usage: ${preview ? 'preview' : 'render'} <config.json> [--template ..] [--font ..] [--color ..] [--animation ..] [--preset ..] [--word-style style:WORD] [--gpu] [--output ..]`);
    process.exitCode = 1;
    return;
  }
  let config = loadConfig(configPath);
  const templateName = valueFor(args, '--template');
  if (templateName) {
    if (!getTemplate(templateName)) {
      console.error(`Unknown template "${templateName}". Available: ${listTemplates().map((t) => t.name).join(', ')}.`);
      process.exitCode = 1;
      return;
    }
    config = applyTemplateByName(config, templateName);
  }
  const overrides = buildOverrides(args.slice(1));
  config = applyCliOverrides(config, overrides);

  if (preview) {
    config.resolution = { ...(config.resolution ?? {}), width: 1280, height: 720 };
  }

  if (!reportValidation(config)) {
    console.error('Aborting due to configuration errors.');
    process.exitCode = 1;
    return;
  }

  const output = overrides.output
    ?? (config.audio ? join('output', `${basename(config.audio, extname(config.audio))}.mp4`) : 'output/lyric-video.mp4');
  const options = preview ? { maxDuration: 12 } : undefined;
  const result = await new Pipeline().generateFromConfig(config, output, options);
  console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
}

/**
 * `create` builds a full, re-editable project from audio: it transcribes the
 * audio for word timings, aligns them onto a supplied lyrics file when given
 * (so the words stay 100% yours while the timing is real), inlines a template's
 * look, writes a self-contained ProjectConfig JSON, and renders the video.
 */
async function runCreate(args: string[]): Promise<void> {
  const audio = valueFor(args, '--audio') ?? findSingleInputAudio();
  if (!audio) {
    console.error('Usage: create --audio <file> [--input lyrics.txt] [--template nu-metal] [--viz bars] [--config out.json] [--output out.mp4] [--width ..] [--height ..] [--fps ..]');
    process.exitCode = 1;
    return;
  }

  const templateName = valueFor(args, '--template');
  const template = templateName ? getTemplate(templateName) : undefined;
  if (templateName && !template) {
    console.error(`Unknown template "${templateName}". Available: ${listTemplates().map((t) => t.name).join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  const lyricsPath = valueFor(args, '--input') ?? valueFor(args, '--lyrics');
  console.log(`Transcribing ${audio} …`);
  const segments = await new LocalWhisperTranscriber().transcribe(audio);
  const doc = lyricsPath
    ? alignLyricsToTranscript(parseLyricsFile(readFileSync(lyricsPath, 'utf8')), segments)
    : lyricsFromTranscript(segments);

  const num = (flag: string): number | undefined => {
    const value = valueFor(args, flag);
    return value !== undefined ? Number(value) : undefined;
  };
  const config = buildProjectConfig(doc, {
    title: template ? `${template.name} project` : undefined,
    audio,
    resolution: { width: num('--width'), height: num('--height'), fps: num('--fps') },
    template,
    musicViz: vizConfigFromEnv(),
  });

  if (!reportValidation(config)) {
    console.error('Aborting due to configuration errors.');
    process.exitCode = 1;
    return;
  }

  const base = basename(audio, extname(audio));
  const configPath = valueFor(args, '--config') ?? join('output', `${base}.json`);
  saveConfig(configPath, config);
  console.log(`Wrote config ${configPath}`);

  if (args.includes('--no-render')) {
    console.log(`Skipped rendering. Render it with: render ${configPath}`);
    return;
  }

  const output = valueFor(args, '--output') ?? join('output', `${base}.mp4`);
  const result = await new Pipeline().generateFromConfig(config, output);
  console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
  console.log(`Tweak ${configPath} and re-render with: render ${configPath}`);
}

/**
 * `viz` writes (or updates, or with `--off` removes) the `musicViz` block on an
 * existing config JSON, so the visualizer can be added as a separate step after
 * the base video looks right. It only edits the JSON — run `render` afterwards.
 */
async function runViz(args: string[]): Promise<void> {
  const configPath = args[0];
  if (!configPath) {
    console.error('Usage: viz <config.json> [wave|bars|spectrum] [--viz-color #fff] [--viz-reflect] [--glow N] [--viz-height 0-1] [--viz-position top|center|bottom] [--off]');
    process.exitCode = 1;
    return;
  }
  const config = loadConfig(configPath);

  if (args.includes('--off')) {
    delete config.musicViz;
    saveConfig(configPath, config);
    console.log(`Disabled visualizer in ${configPath}. Re-render with: render ${configPath}`);
    return;
  }

  const existing = config.musicViz;
  const modeArg = args[1] && !args[1].startsWith('--') ? args[1].trim().toLowerCase() : undefined;
  const mode = (['wave', 'bars', 'spectrum'].includes(modeArg ?? '') ? modeArg : existing?.mode ?? 'wave') as MusicVizMode;
  const positionArg = valueFor(args, '--viz-position')?.trim().toLowerCase();
  const position = (['top', 'center', 'bottom'].includes(positionArg ?? '') ? positionArg : existing?.position ?? 'bottom') as MusicVizPosition;
  const colors = allValuesFor(args, '--viz-color');
  const glowArg = valueFor(args, '--glow');
  const heightArg = valueFor(args, '--viz-height');

  const viz: MusicVizConfig = {
    enabled: true,
    mode,
    position,
    reflection: args.includes('--viz-reflect') ? true : existing?.reflection ?? false,
  };
  const resolvedColors = colors.length > 0 ? colors : existing?.colors;
  if (resolvedColors && resolvedColors.length > 0) viz.colors = resolvedColors;
  const glow = glowArg !== undefined ? Number(glowArg) : existing?.glow;
  if (glow !== undefined && !Number.isNaN(glow)) viz.glow = glow;
  const height = heightArg !== undefined ? Number(heightArg) : existing?.height;
  if (height !== undefined && !Number.isNaN(height)) viz.height = height;

  config.musicViz = viz;
  if (!reportValidation(config)) {
    console.error('Aborting due to configuration errors.');
    process.exitCode = 1;
    return;
  }
  saveConfig(configPath, config);
  console.log(`Set ${mode} visualizer in ${configPath}. Re-render with: render ${configPath}`);
}

async function runSubcommand(sub: string, rest: string[]): Promise<void> {
  switch (sub) {
    case 'create':
      await runCreate(rest);
      return;
    case 'viz':
      await runViz(rest);
      return;
    case 'render':
      await runRender(rest, false);
      return;
    case 'preview':
      await runRender(rest, true);
      return;
    case 'validate': {
      const configPath = rest[0];
      if (!configPath) {
        console.error('Usage: validate <config.json>');
        process.exitCode = 1;
        return;
      }
      const ok = reportValidation(loadConfig(configPath));
      if (ok) console.log('Configuration is valid.');
      else process.exitCode = 1;
      return;
    }
    case 'presets':
      printPresets(rest[0]);
      return;
    case 'templates':
      printTemplates();
      return;
    case 'template': {
      const action = rest[0];
      if (action === 'show') {
        const name = rest[1];
        const found = name ? getTemplate(name) : undefined;
        if (!found) {
          console.error(`Template "${name ?? ''}" not found. Available: ${listTemplates().map((t) => t.name).join(', ')}.`);
          process.exitCode = 1;
          return;
        }
        console.log(JSON.stringify(found, null, 2));
        return;
      }
      console.error('Usage: templates | template show <name>');
      process.exitCode = 1;
      return;
    }
    case 'preset': {
      const action = rest[0];
      if (action === 'show') {
        const name = rest[1];
        const found = name ? getPresetRaw(name) : undefined;
        if (!found) {
          const hint = name ? suggestAny(name) : undefined;
          console.error(`Preset "${name ?? ''}" not found.` + (hint ? ` Did you mean "${hint}"?` : ''));
          process.exitCode = 1;
          return;
        }
        console.log(`# ${name} (${found.category})`);
        console.log(JSON.stringify(found.data, null, 2));
        return;
      }
      if (action === 'apply') {
        const name = rest[1];
        const configPath = rest[2];
        if (!name || !configPath) {
          console.error('Usage: preset apply <name> <config.json>');
          process.exitCode = 1;
          return;
        }
        const updated = applyPresetToConfig(loadConfig(configPath), name);
        saveConfig(configPath, updated);
        console.log(`Applied preset "${name}" to ${configPath}.`);
        return;
      }
      console.error('Usage: preset show <name> | preset apply <name> <config.json>');
      process.exitCode = 1;
      return;
    }
    default:
      process.exitCode = 1;
  }
}

async function runLegacy(args: string[]): Promise<void> {
  const input = valueFor(args, '--input') ?? (args[0] === 'create' ? args[1] : undefined);
  const audio = valueFor(args, '--audio') ?? (args[0] === 'create' ? args[2] : undefined) ?? findSingleInputAudio();
  const theme = parseTheme(valueFor(args, '--bg') ?? valueFor(args, '--background'));
  const output = valueFor(args, '--output') ?? (audio ? join('output', `${basename(audio, extname(audio))}.mp4`) : undefined);
  const templateName = valueFor(args, '--template');

  if (output && (input || audio)) {
    if (templateName) {
      if (!getTemplate(templateName)) {
        console.error(`Unknown template "${templateName}". Available: ${listTemplates().map((t) => t.name).join(', ')}.`);
        process.exitCode = 1;
        return;
      }
      const config = applyTemplateByName(
        { audio, lyrics: input, theme },
        templateName,
      );
      const result = await new Pipeline().generateFromConfig(config, output);
      console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
      return;
    }
    const result = await new Pipeline().generate(output, audio, input, theme);
    console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
    return;
  }

  console.log('Put one audio file in input/ and run npm run dev, or use: npm run dev -- --audio input/song.mp3 --output output/video.mp4 [--input input/lyrics.txt] [--bg dark|white] [--template nu-metal] [--gpu]');
  console.log('Customization: render <config.json> | preview <config.json> | validate <config.json> | presets | preset show <name> | preset apply <name> <config.json>');
  console.log('Templates: templates | template show <name>');
}

async function main() {
  const args = process.argv.slice(2);
  applyEncoderFlags(args);
  applyVizFlag(args);
  const sub = args[0];
  if (sub && SUBCOMMANDS.has(sub)) {
    await runSubcommand(sub, args.slice(1));
    return;
  }
  await runLegacy(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
