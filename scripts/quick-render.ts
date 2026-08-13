#!/usr/bin/env node
/**
 * Quick lyrics-only render.
 *
 * Turns a plain lyrics .txt into a ProjectConfig where every word gets a fixed
 * time slot (default 1s), then renders a SILENT video (no audio, no viz) using
 * the existing pipeline. One word shows at a time — handy for fast editing
 * while the audio/alignment path is being sorted out.
 *
 * `[Section]` headings (e.g. `[Chorus]`) are preserved and mapped to typed
 * sections so a template's per-section styling engages. By default the
 * `nu-metal` template is applied; pass `--template none` for the plain look.
 *
 * Usage:
 *   npm run quick -- --input input/sample-lyrics.txt --output output/quick.mp4
 *   npm run quick -- --sec 1 --bg dark --template nu-metal
 *   npm run quick -- --template none          # skip templating
 *   npm run quick -- --config-only            # only write the config JSON
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { Pipeline } from '../src/application/orchestration/pipeline.js';
import type { SectionConfig, ProjectConfig } from '../src/core/models/customization.js';
import { applyTemplateByName, getTemplate, listTemplateNames } from '../src/customization/templates/index.js';

function valueFor(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Matches a `[Section]` heading line and returns the inner label. */
function sectionHeading(line: string): string | undefined {
  const match = line.trim().match(/^\[(.+)\]$/);
  return match ? match[1] : undefined;
}

/** Normalize a heading label to a known section type (else 'unknown'). */
function toSectionType(label: string): string {
  const v = label.trim().toLowerCase();
  if (v.includes('chorus')) return 'chorus';
  if (v.includes('verse')) return 'verse';
  if (v.includes('bridge')) return 'bridge';
  if (v.includes('breakdown')) return 'breakdown';
  if (v.includes('intro')) return 'intro';
  if (v.includes('outro')) return 'outro';
  return 'unknown';
}

/**
 * Build typed sections whose words each get a fixed `secPerWord` slot, laid out
 * sequentially across the whole song so exactly one word is on screen at a time.
 * Lyrics before the first heading start an implicit `verse` section.
 */
function buildSections(lyrics: string, secPerWord: number): SectionConfig[] {
  const rawLines = lyrics.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections: SectionConfig[] = [];
  let current: SectionConfig | undefined;
  let clock = 0;

  const ensureSection = (type: string) => {
    current = { type, lines: [] };
    sections.push(current);
  };

  for (const line of rawLines) {
    const heading = sectionHeading(line);
    if (heading) {
      ensureSection(toSectionType(heading));
      continue;
    }
    if (!current) ensureSection('verse');
    const tokens = line.split(/\s+/).filter(Boolean);
    const words = tokens.map((token) => {
      const start = clock;
      const end = clock + secPerWord;
      clock = end;
      return { text: token, start, end };
    });
    current!.lines!.push({
      text: line,
      start: words[0]?.start ?? clock,
      end: words.at(-1)?.end ?? clock,
      words,
    });
  }

  return sections.filter((s) => (s.lines ?? []).length > 0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const input = valueFor(args, '--input') ?? valueFor(args, '--lyrics') ?? 'input/sample-lyrics.txt';
  const secPerWord = Number(valueFor(args, '--sec') ?? '1');
  const theme = (valueFor(args, '--bg') ?? 'dark').toLowerCase() === 'white' ? 'white' : 'dark';
  const output = valueFor(args, '--output') ?? join('output', `${basename(input, extname(input))}.mp4`);
  const templateName = valueFor(args, '--template') ?? 'nu-metal';
  const configOnly = args.includes('--config-only');

  if (!Number.isFinite(secPerWord) || secPerWord <= 0) {
    console.error(`Invalid --sec "${valueFor(args, '--sec')}"; must be a positive number.`);
    process.exitCode = 1;
    return;
  }

  const useTemplate = templateName.toLowerCase() !== 'none';
  if (useTemplate && !getTemplate(templateName)) {
    console.error(`Unknown template "${templateName}". Available: ${listTemplateNames().join(', ')} (or "none").`);
    process.exitCode = 1;
    return;
  }

  const lyrics = readFileSync(input, 'utf8');
  const sections = buildSections(lyrics, secPerWord);
  if (sections.length === 0) {
    console.error(`No lyric lines found in ${input}.`);
    process.exitCode = 1;
    return;
  }

  // No `audio` field => silent video. No `musicViz` => no visualizer.
  let config: ProjectConfig = {
    title: basename(input, extname(input)),
    theme,
    sections,
  };
  if (useTemplate) config = applyTemplateByName(config, templateName);

  const configPath = output.replace(/\.mp4$/i, '') + '.config.json';
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Wrote config ${configPath}${useTemplate ? ` (template: ${templateName})` : ''}`);

  if (configOnly) return;

  const result = await new Pipeline().generateFromConfig(config, output);
  console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
