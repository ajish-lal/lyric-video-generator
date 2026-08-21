#!/usr/bin/env node
/**
 * One-shot generator driven entirely by a JSON file (default
 * `generate.config.json`). It replaces the multi-flag CLI: put the audio,
 * lyrics, output, template, transcription flags (WhisperX/Demucs) and
 * visualizer settings in one file and run `npm run generate`.
 *
 * Usage:
 *   npm run generate                     # uses ./generate.config.json
 *   npm run generate -- my-song.config.json
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { Pipeline } from '../src/application/orchestration/pipeline.js';
import { LocalWhisperTranscriber } from '../src/providers/transcription/local-whisper-transcriber.js';
import { parseLyricsFile, lyricsFromTranscript } from '../src/application/lyrics/lyrics-parser.js';
import { alignLyricsToTranscript } from '../src/application/lyrics/align.js';
import { buildProjectConfig } from '../src/application/orchestration/config-generator.js';
import { saveConfig } from '../src/customization/config-loader.js';
import { validateConfig } from '../src/customization/validation.js';
import { getTemplate, listTemplates } from '../src/customization/templates/index.js';
import type { ExportRange, MusicVizConfig, WordDisplay } from '../src/core/models/render.js';

interface GenerateConfig {
  audio?: string;
  lyrics?: string;
  output?: string;
  config?: string;
  render?: boolean;
  template?: string;
  resolution?: { width?: number; height?: number; fps?: number };
  encoder?: string;
  transcription?: {
    model?: string;
    separateVocals?: boolean;
    wordAlign?: boolean;
    demucsModel?: string;
    holdSeconds?: number;
    leadSeconds?: number;
    interpolateWords?: boolean;
  };
  viz?: Partial<MusicVizConfig> & { enabled?: boolean };
  wordDisplay?: Partial<WordDisplay>;
  exportRange?: ExportRange;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** faster-whisper reads these from the environment when the script spawns. */
function applyTranscriptionEnv(t: GenerateConfig['transcription']): void {
  if (!t) return;
  if (t.model) process.env.WHISPER_MODEL = t.model;
  if (t.demucsModel) process.env.DEMUCS_MODEL = t.demucsModel;
  if (t.separateVocals !== undefined) process.env.SEPARATE_VOCALS = t.separateVocals ? '1' : '0';
  if (t.wordAlign !== undefined) process.env.WORD_ALIGN = t.wordAlign ? '1' : '0';
  if (t.holdSeconds !== undefined) process.env.WORD_HOLD = String(t.holdSeconds);
  if (t.leadSeconds !== undefined) process.env.WORD_LEAD = String(t.leadSeconds);
  if (t.interpolateWords !== undefined) process.env.WORD_INTERPOLATE = t.interpolateWords ? '1' : '0';
}

function applyEncoderEnv(encoder?: string): void {
  const value = encoder?.trim().toLowerCase();
  if (value === 'nvenc' || value === 'gpu') process.env.VIDEO_ENCODER = 'nvenc';
  else if (value === 'cpu' || value === 'libx264') process.env.VIDEO_ENCODER = 'cpu';
}

function buildViz(viz: GenerateConfig['viz']): MusicVizConfig | undefined {
  if (!viz || !viz.enabled) return undefined;
  const out: MusicVizConfig = { enabled: true, mode: viz.mode ?? 'wave' };
  if (viz.position) out.position = viz.position;
  if (viz.colors && viz.colors.length > 0) out.colors = viz.colors;
  if (viz.reflection !== undefined) out.reflection = viz.reflection;
  if (viz.height !== undefined) out.height = viz.height;
  if (viz.margin !== undefined) out.margin = viz.margin;
  if (viz.glow !== undefined) out.glow = viz.glow;
  return out;
}

async function main(): Promise<void> {
  const configFile = process.argv[2] ?? 'generate.config.json';
  if (!existsSync(configFile)) fail(`config file not found: ${configFile}`);

  let cfg: GenerateConfig;
  try {
    cfg = JSON.parse(readFileSync(configFile, 'utf8')) as GenerateConfig;
  } catch (error) {
    return fail(`could not parse ${configFile}: ${(error as Error).message}`);
  }

  const audio = cfg.audio?.trim();
  if (!audio) fail('`audio` is required in the config file.');
  if (!existsSync(audio)) fail(`audio file not found: ${audio}`);

  const template = cfg.template?.trim() ? getTemplate(cfg.template.trim()) : undefined;
  if (cfg.template?.trim() && !template) {
    fail(`unknown template "${cfg.template}". Available: ${listTemplates().map((t) => t.name).join(', ')}.`);
  }

  applyTranscriptionEnv(cfg.transcription);
  applyEncoderEnv(cfg.encoder);

  console.log(`Transcribing ${audio} …`);
  const segments = await new LocalWhisperTranscriber().transcribe(audio);

  const lyricsPath = cfg.lyrics?.trim();
  if (lyricsPath && !existsSync(lyricsPath)) fail(`lyrics file not found: ${lyricsPath}`);
  const doc = lyricsPath
    ? alignLyricsToTranscript(parseLyricsFile(readFileSync(lyricsPath, 'utf8')), segments)
    : lyricsFromTranscript(segments);

  const projectConfig = buildProjectConfig(doc, {
    title: template ? `${template.name} project` : undefined,
    audio,
    resolution: cfg.resolution,
    template,
    musicViz: buildViz(cfg.viz),
    wordDisplay: cfg.wordDisplay?.mode
      ? {
          mode: cfg.wordDisplay.mode,
          hold: cfg.wordDisplay.hold ?? 'next-word',
          ...(cfg.wordDisplay.spacing !== undefined ? { spacing: cfg.wordDisplay.spacing } : {}),
        }
      : undefined,
    exportRange: cfg.exportRange,
  });

  const validation = validateConfig(projectConfig);
  for (const warning of validation.warnings) console.warn(`warning: ${warning}`);
  for (const error of validation.errors) console.error(`error: ${error}`);
  if (validation.errors.length > 0) fail('aborting due to configuration errors.');

  const base = basename(audio, extname(audio));
  const configOut = cfg.config?.trim() || join('output', `${base}.json`);
  saveConfig(configOut, projectConfig);
  console.log(`Wrote config ${configOut}`);

  if (cfg.render === false) {
    console.log(`Skipped rendering (\`render\`: false). Set it to true to render.`);
    return;
  }

  const output = cfg.output?.trim() || join('output', `${base}.mp4`);
  const result = await new Pipeline().generateFromConfig(projectConfig, output);
  console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
  console.log(`Tweak ${configOut} or ${resolve(configFile)} and run \`npm run generate\` again.`);
}

main().catch((error) => fail((error as Error).message));
