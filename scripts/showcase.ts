/**
 * Showcase generator.
 *
 * Builds a config where every animation / emphasis / treatment / background
 * preset is shown one at a time, word-by-word, with the word text being the
 * exact preset name — so the clip is self-labeling. Run with:
 *
 *   npx tsx scripts/showcase.ts            # render output/showcase.mp4
 *   npx tsx scripts/showcase.ts --gpu      # use NVENC (needs an NVENC ffmpeg)
 *
 * The generated config is also written to examples/showcase.json for reference.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { Pipeline } from '../src/application/orchestration/pipeline.js';
import { listPresetNames } from '../src/customization/presets/index.js';
import type { LineConfig, ProjectConfig, SectionConfig } from '../src/core/models/customization.js';

const SLOT = 1.2; // seconds each word is on screen
const HEADER_SLOT = 1.6; // seconds for a group header

let clock = 0;

/** A single word occupying one time slot; the word text is the preset name. */
function wordLine(text: string, style: LineConfig['style'], slot = SLOT): LineConfig {
  const start = clock;
  clock += slot;
  return { text, start, end: clock, style, words: [{ text, style }] };
}

/** A bold group header word (e.g. "— ANIMATIONS —"). */
function headerLine(label: string): LineConfig {
  return wordLine(`— ${label} —`, { emphasis: 'emphasis', color: '#ffd24a', animation: 'fade_up' }, HEADER_SLOT);
}

/** A section on the neutral industrial backdrop. */
function neutralSection(lines: LineConfig[]): SectionConfig {
  return { style: { background: 'industrial' }, lines };
}

// --- Animations ---------------------------------------------------------
const animationSection = neutralSection([
  headerLine('ANIMATIONS'),
  ...listPresetNames('animation').map((name) => wordLine(name, { animation: name, color: '#e9edf2', fontSize: 72 })),
]);

// --- Emphasis -----------------------------------------------------------
const emphasisSection = neutralSection([
  headerLine('EMPHASIS'),
  ...listPresetNames('word').map((name) => wordLine(name, { emphasis: name, fontSize: 72 })),
]);

// --- Treatments ---------------------------------------------------------
const treatmentSection = neutralSection([
  headerLine('TREATMENTS'),
  ...listPresetNames('treatment').map((name) => wordLine(name, { treatment: name, color: '#c8ffd0', fontSize: 72 })),
]);

// --- Backgrounds (one section each so the backdrop actually changes) -----
const backgroundSections: SectionConfig[] = [
  neutralSection([headerLine('BACKGROUNDS')]),
  ...listPresetNames('background').map((name) => ({
    style: { background: name },
    lines: [wordLine(name, { emphasis: 'emphasis', color: '#ffffff', fontSize: 84, animation: 'fade' }, SLOT + 0.4)],
  })),
];

const config: ProjectConfig = {
  title: 'FX Showcase',
  theme: 'dark',
  resolution: { width: 1280, height: 720, fps: 24 },
  typography: { font: 'Impact', position: { x: 0.5, y: 0.5 } },
  sections: [
    animationSection,
    emphasisSection,
    treatmentSection,
    ...backgroundSections,
  ],
};

async function main(): Promise<void> {
  mkdirSync('examples', { recursive: true });
  writeFileSync('examples/showcase.json', JSON.stringify(config, null, 2));

  const outputPath = 'output/showcase.mp4';
  console.log(`Rendering ${clock.toFixed(1)}s showcase to ${outputPath} …`);
  const { render } = await new Pipeline().generateFromConfig(config, outputPath);
  console.log(`Done: ${render.outputPath} (${render.duration.toFixed(1)}s)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
