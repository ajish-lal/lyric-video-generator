import type { LyricsDocument } from '../../core/models/project.js';
import type { LineConfig, ProjectConfig, SectionConfig, WordConfig } from '../../core/models/customization.js';
import type { MusicVizConfig, WordDisplay } from '../../core/models/render.js';
import type { SongTemplate } from '../../customization/templates/index.js';

export interface ConfigGenerationOptions {
  title?: string;
  audio: string;
  resolution?: { width?: number; height?: number; fps?: number };
  template?: SongTemplate;
  musicViz?: MusicVizConfig;
  wordDisplay?: WordDisplay;
}

/**
 * Turn a timed lyrics document into a fully self-contained, re-editable
 * {@link ProjectConfig}. Every line and word keeps its own start/end so the
 * emitted JSON can be hand-tweaked and re-rendered. When a template is given
 * its look is *inlined* (global styling + per-section-type styles) so the
 * config no longer depends on the template file.
 */
export function buildProjectConfig(doc: LyricsDocument, options: ConfigGenerationOptions): ProjectConfig {
  const { title, audio, resolution, template, musicViz, wordDisplay } = options;

  const sections: SectionConfig[] = doc.sections
    .filter((section) => section.lines.length > 0)
    .map((section) => {
      const lines: LineConfig[] = section.lines.map((line) => {
        const words: WordConfig[] = line.words.map((word) => ({
          text: word.text,
          start: word.start,
          end: word.end,
        }));
        return { text: line.text, start: line.start, end: line.end, words };
      });
      const style = template?.sections?.[section.type];
      return style ? { type: section.type, style, lines } : { type: section.type, lines };
    });

  const config: ProjectConfig = {
    title: title ?? doc.song,
    audio,
    theme: template?.theme ?? 'dark',
    resolution: {
      width: resolution?.width ?? 1920,
      height: resolution?.height ?? 1080,
      fps: resolution?.fps ?? 30,
    },
    sections,
  };

  if (template?.preset) config.preset = template.preset;
  if (template?.typography) config.typography = template.typography;
  if (template?.animation) config.animation = template.animation;
  if (template?.background) config.background = template.background;
  if (template?.effects) config.effects = template.effects;
  if (musicViz) config.musicViz = musicViz;
  if (wordDisplay) config.wordDisplay = wordDisplay;

  return config;
}
