import { lyricsFromTranscript, parseLyricsFile } from '../lyrics/lyrics-parser.js';
import { RulesScenePlanner } from '../../providers/planning/rules-scene-planner.js';
import { ProjectBuilder } from './project-builder.js';
import { LyricVideoRenderer } from '../../providers/renderers/lyric-video-renderer.js';
import { readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { LyricLine, LyricSection, LyricsDocument, Project, SectionType, Word } from '../../core/models/project.js';
import type { BackgroundTheme } from '../../core/models/render.js';
import type { RenderOptions, RenderResult } from '../../core/interfaces/renderer.js';
import { LocalWhisperTranscriber } from '../../providers/transcription/local-whisper-transcriber.js';
import type { AudioTranscriber } from '../../core/interfaces/transcriber.js';
import type { LineConfig, ProjectConfig } from '../../core/models/customization.js';
import { applyCustomizationToProject } from '../../customization/apply.js';

const SECTION_TYPES = new Set<SectionType>(['chorus', 'pre-chorus', 'verse', 'rap', 'bridge', 'breakdown', 'intro', 'outro', 'unknown']);

function toSectionType(value: string | undefined): SectionType {
  const v = (value ?? '').trim().toLowerCase();
  return SECTION_TYPES.has(v as SectionType) ? (v as SectionType) : 'unknown';
}

function splitWords(text: string, start: number, end: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const span = Math.max(0.01, end - start) / tokens.length;
  return tokens.map((token, i) => ({ text: token, start: start + i * span, end: start + (i + 1) * span }));
}

function buildLineFromConfig(lc: LineConfig, sIdx: number, lIdx: number): LyricLine {
  const start = lc.start ?? lIdx * 3;
  const end = lc.end ?? start + 3;
  const text = lc.text ?? (lc.words ?? []).map((w) => w.text ?? '').join(' ').trim();
  let words: Word[];
  if (lc.words && lc.words.length > 0) {
    const span = Math.max(0.01, end - start) / lc.words.length;
    words = lc.words.map((wc, wi) => ({
      text: wc.text ?? '',
      start: wc.start ?? start + wi * span,
      end: wc.end ?? start + (wi + 1) * span,
    }));
  } else {
    words = splitWords(text, start, end);
  }
  return { id: `line-${sIdx}-${lIdx}`, text, start, end, words };
}

/** Build a lyrics document from inline config text (no external file/transcription). */
function buildLyricsFromConfig(config: ProjectConfig): LyricsDocument | undefined {
  const src = config.sections?.length
    ? config.sections
    : config.lines?.length
      ? [{ lines: config.lines }]
      : [];
  const hasText = src.some((s) => (s.lines ?? []).some((l) => l.text || (l.words && l.words.length > 0)));
  if (!hasText) return undefined;

  const sections: LyricSection[] = src.map((sc, si) => {
    const lines = (sc.lines ?? []).map((lc, li) => buildLineFromConfig(lc, si, li));
    return {
      id: `section-${si + 1}`,
      type: toSectionType('type' in sc ? sc.type : undefined),
      start: lines[0]?.start ?? 0,
      end: lines.at(-1)?.end ?? 0,
      lines,
    };
  });
  return { song: config.title ?? 'Custom project', sections };
}

export class Pipeline {
  constructor(
    private readonly scenePlanner = new RulesScenePlanner(),
    private readonly projectBuilder = new ProjectBuilder(),
    private readonly renderer = new LyricVideoRenderer(),
    private readonly transcriber: AudioTranscriber = new LocalWhisperTranscriber(),
  ) {}

  createProjectFromLyricsFile(lyricsPath: string, audioPath = 'input/demo.mp3', theme: BackgroundTheme = 'dark'): Project {
    const lyricsContent = readFileSync(lyricsPath, 'utf8');
    const lyrics = parseLyricsFile(lyricsContent);
    return this.buildProject(lyrics, audioPath, theme);
  }

  private buildProject(lyrics: Project['lyrics'], audioPath: string, theme: BackgroundTheme = 'dark'): Project {
    const plan = this.scenePlanner.createPlan(lyrics);
    return this.projectBuilder.build({
      id: 'demo-project',
      title: 'Demo project',
      audioPath,
      lyrics,
      scenes: plan.scenes,
      theme,
    });
  }

  async generate(outputPath: string, audioPath?: string, lyricsPath?: string, theme: BackgroundTheme = 'dark'): Promise<{ project: Project; render: RenderResult }> {
    const project = lyricsPath
      ? this.createProjectFromLyricsFile(lyricsPath, audioPath, theme)
      : this.buildProject(lyricsFromTranscript(await this.transcriber.transcribe(audioPath ?? 'input/demo.mp3')), audioPath ?? 'input/demo.mp3', theme);
    return { project, render: await this.renderer.render(project, outputPath) };
  }

  /**
   * Config-driven render. Lyrics come from (in order): inline config text, an
   * external lyrics file, or transcription. The customization config is then
   * applied before rendering.
   */
  async generateFromConfig(
    config: ProjectConfig,
    outputPath?: string,
    options?: RenderOptions,
  ): Promise<{ project: Project; render: RenderResult }> {
    const project = await this.resolveProjectFromConfig(config);
    const audioPath = config.audio ?? 'input/demo.mp3';
    const output = outputPath
      ?? join('output', `${basename(audioPath, extname(audioPath))}.mp4`);
    return { project, render: await this.renderer.render(project, output, options) };
  }

  /**
   * Build a fully-resolved {@link Project} from a config (lyrics resolved and
   * customization applied) WITHOUT rendering. Used by non-FFmpeg exporters.
   */
  async resolveProjectFromConfig(config: ProjectConfig): Promise<Project> {
    const audioPath = config.audio ?? 'input/demo.mp3';
    const theme: BackgroundTheme = config.theme === 'white' ? 'white' : 'dark';

    const inlineLyrics = buildLyricsFromConfig(config);
    const lyrics = inlineLyrics
      ? inlineLyrics
      : config.lyrics
        ? parseLyricsFile(readFileSync(config.lyrics, 'utf8'))
        : lyricsFromTranscript(await this.transcriber.transcribe(audioPath));

    const project = this.buildProject(lyrics, audioPath, theme);
    applyCustomizationToProject(project, config);
    return project;
  }
}
