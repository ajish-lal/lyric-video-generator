#!/usr/bin/env node
import { Pipeline } from './application/orchestration/pipeline.js';
import { readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { BackgroundTheme } from './core/models/render.js';
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

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']);
const SUBCOMMANDS = new Set(['render', 'preview', 'presets', 'preset', 'validate']);

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

function allValuesFor(args: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && i + 1 < args.length) out.push(args[i + 1]);
  }
  return out;
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

async function runRender(args: string[], preview: boolean): Promise<void> {
  const configPath = args[0];
  if (!configPath) {
    console.error(`Usage: ${preview ? 'preview' : 'render'} <config.json> [--font ..] [--color ..] [--animation ..] [--preset ..] [--word-style style:WORD] [--output ..]`);
    process.exitCode = 1;
    return;
  }
  let config = loadConfig(configPath);
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

async function runSubcommand(sub: string, rest: string[]): Promise<void> {
  switch (sub) {
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

  if (output && (input || audio)) {
    const result = await new Pipeline().generate(output, audio, input, theme);
    console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
    return;
  }

  console.log('Put one audio file in input/ and run npm run dev, or use: npm run dev -- --audio input/song.mp3 --output output/video.mp4 [--input input/lyrics.txt] [--bg dark|white]');
  console.log('Customization: render <config.json> | preview <config.json> | validate <config.json> | presets | preset show <name> | preset apply <name> <config.json>');
}

async function main() {
  const args = process.argv.slice(2);
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
