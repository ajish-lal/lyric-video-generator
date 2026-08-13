/**
 * DaVinci Resolve export plugin — public API.
 *
 * Self-contained module: nothing in the core app imports it, and it only reads
 * from the shared pipeline/models. Removing `src/resolve/` leaves the FFmpeg
 * render path untouched.
 *
 * Flow: read a customization config JSON → resolve it into a fully-styled
 * project (no FFmpeg) → bake per-frame animation into a `*.resolve.json` that
 * `scripts/resolve/resolve_import.py` turns into animated Text+ titles.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { Pipeline } from '../application/orchestration/pipeline.js';
import type { ProjectConfig } from '../core/models/customization.js';
import { flattenProjectToResolve } from './flatten.js';
import type { ResolveExport } from './schema.js';

export type { ResolveExport, ResolveWord, ResolveKeyframe } from './schema.js';
export { flattenProjectToResolve } from './flatten.js';
export { sampleAnimation } from './animation-sampler.js';

/** Build the Resolve export structure from an in-memory config. */
export async function buildResolveExport(
  config: ProjectConfig,
  pipeline = new Pipeline(),
): Promise<ResolveExport> {
  const project = await pipeline.resolveProjectFromConfig(config);
  return flattenProjectToResolve(project);
}

/**
 * Read a config JSON file, build the Resolve export, and write it next to the
 * config as `<name>.resolve.json` (or to `outputPath`). Returns the written
 * path and the export payload.
 */
export async function exportResolveProject(
  configPath: string,
  outputPath?: string,
): Promise<{ outputPath: string; export: ResolveExport }> {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as ProjectConfig;
  const data = await buildResolveExport(config);

  const base = basename(configPath, extname(configPath)).replace(/\.config$/, '');
  const out = outputPath ?? join(dirname(configPath), `${base}.resolve.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2));
  return { outputPath: out, export: data };
}
