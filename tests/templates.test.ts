import { describe, expect, it } from 'vitest';
import {
  applyTemplateByName,
  applyTemplateToConfig,
  getTemplate,
  listTemplateNames,
} from '../src/customization/templates/index.js';
import { createProjectFromLyricsContent } from '../src/application/orchestration/project-generator.js';
import { applyCustomizationToProject } from '../src/customization/apply.js';
import type { ProjectConfig } from '../src/core/models/customization.js';

describe('templates registry', () => {
  it('exposes the predefined genre templates', () => {
    const names = listTemplateNames();
    expect(names).toEqual(expect.arrayContaining(['nu-metal', 'rock', 'pop', 'cinematic', 'clean-light']));
  });

  it('resolves names case- and separator-insensitively', () => {
    expect(getTemplate('Nu Metal')?.name).toBe('nu-metal');
    expect(getTemplate('nu_metal')?.name).toBe('nu-metal');
    expect(getTemplate('unknown-genre')).toBeUndefined();
  });

  it('throws a helpful error for an unknown template', () => {
    expect(() => applyTemplateByName({}, 'does-not-exist')).toThrow(/Unknown template/);
  });
});

describe('applyTemplateToConfig', () => {
  it('turns section-type styles into type-selected section configs', () => {
    const config = applyTemplateByName({}, 'nu-metal');
    const types = (config.sections ?? []).map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining(['verse', 'chorus', 'bridge']));
    expect(config.theme).toBe('dark');
  });

  it('lets explicit config win over the template', () => {
    const base: ProjectConfig = { theme: 'white', typography: { font: 'Arial' } };
    const merged = applyTemplateToConfig(base, getTemplate('nu-metal')!);
    expect(merged.theme).toBe('white');
    expect(merged.typography?.font).toBe('Arial');
  });

  it('places template sections before user sections so user styling overrides', () => {
    const base: ProjectConfig = { sections: [{ type: 'chorus', style: { color: '#123456' } }] };
    const merged = applyTemplateToConfig(base, getTemplate('rock')!);
    const chorusIndexes = (merged.sections ?? [])
      .map((s, i) => ({ i, type: s.type }))
      .filter((s) => s.type === 'chorus')
      .map((s) => s.i);
    // template chorus comes first, user chorus last (last wins in the resolver)
    expect(chorusIndexes.length).toBe(2);
    expect(chorusIndexes[0]).toBeLessThan(chorusIndexes[1]);
    expect(merged.sections?.at(-1)?.style?.color).toBe('#123456');
  });
});

describe('template applied to generated lyrics', () => {
  it('styles each section type from the template', () => {
    const project = createProjectFromLyricsContent('[Verse]\nHello world\n[Chorus]\nRise again', 'demo.mp3');
    const config = applyTemplateByName({}, 'nu-metal');
    applyCustomizationToProject(project, config);

    const verse = project.lyrics.sections.find((s) => s.type === 'verse');
    const chorus = project.lyrics.sections.find((s) => s.type === 'chorus');
    expect(project.renderConfig.customized).toBe(true);
    // chorus preset uses a larger font than the verse preset
    const verseSize = verse?.lines[0]?.words[0]?.render?.fontSizePx ?? 0;
    const chorusSize = chorus?.lines[0]?.words[0]?.render?.fontSizePx ?? 0;
    expect(chorusSize).toBeGreaterThan(verseSize);
  });
});
