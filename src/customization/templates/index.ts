import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ProjectConfig } from '../../core/models/customization.js';
import { applyTemplateToConfig, type SongTemplate } from './types.js';

export type { SongTemplate } from './types.js';
export { applyTemplateToConfig } from './types.js';

/** Normalizes a template name so `nu-metal`, `nu_metal`, `Nu Metal` all match. */
export function normalizeTemplateKey(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Directory holding template JSON files. Override with TEMPLATES_DIR. */
function templatesDir(): string {
  const override = process.env.TEMPLATES_DIR?.trim();
  const candidates = [...(override ? [override] : []), resolve('templates')];
  return candidates.find((dir) => existsSync(dir)) ?? resolve('templates');
}

let cache: Record<string, SongTemplate> | null = null;

function loadAll(): Record<string, SongTemplate> {
  if (cache) return cache;
  const dir = templatesDir();
  const registry: Record<string, SongTemplate> = {};
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((file) => file.toLowerCase().endsWith('.json'));
  } catch {
    files = [];
  }
  for (const file of files) {
    try {
      const template = JSON.parse(readFileSync(join(dir, file), 'utf8')) as SongTemplate;
      if (template && typeof template.name === 'string' && template.sections) {
        registry[normalizeTemplateKey(template.name)] = template;
      }
    } catch {
      // Skip malformed template files rather than failing the whole registry.
    }
  }
  cache = registry;
  return registry;
}

export function getTemplate(name: string): SongTemplate | undefined {
  return loadAll()[normalizeTemplateKey(name)];
}

export function hasTemplate(name: string): boolean {
  return normalizeTemplateKey(name) in loadAll();
}

export function listTemplates(): SongTemplate[] {
  return Object.values(loadAll());
}

export function listTemplateNames(): string[] {
  return listTemplates().map((template) => template.name);
}

/** Loads a template by name and layers it under the given config. Throws if unknown. */
export function applyTemplateByName(config: ProjectConfig, name: string): ProjectConfig {
  const template = getTemplate(name);
  if (!template) {
    throw new Error(`Unknown template "${name}". Available templates: ${listTemplateNames().join(', ')}.`);
  }
  return applyTemplateToConfig(config, template);
}
