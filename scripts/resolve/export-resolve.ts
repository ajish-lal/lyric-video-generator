#!/usr/bin/env node
/**
 * Export a customization config JSON into a DaVinci Resolve intermediate
 * (`*.resolve.json`) with baked per-frame animation. This is the TypeScript
 * half of the Resolve plugin; the companion `resolve_import.py` runs inside
 * DaVinci Resolve to build the timeline of animated Text+ titles.
 *
 * Usage:
 *   npm run export:resolve -- --config output/quick.config.json
 *   npm run export:resolve -- --config output/quick.config.json --output output/quick.resolve.json
 */
import { exportResolveProject } from '../../src/resolve/index.js';

function valueFor(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configPath = valueFor(args, '--config') ?? valueFor(args, '-c');
  if (!configPath) {
    console.error('Usage: export:resolve -- --config <path/to/config.json> [--output <path.resolve.json>]');
    process.exit(1);
    return;
  }
  const outputPath = valueFor(args, '--output') ?? valueFor(args, '-o');

  const { outputPath: written, export: data } = await exportResolveProject(configPath, outputPath);
  console.log(`Wrote ${written} (${data.words.length} words, ${data.fps} fps, ${data.width}x${data.height})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
