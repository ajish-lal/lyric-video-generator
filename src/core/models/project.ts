import type { RenderConfig, WordAnimation } from './render.js';
import type { ResolvedWordRender } from './customization.js';

export type SectionType =
  | 'chorus'
  | 'verse'
  | 'bridge'
  | 'breakdown'
  | 'intro'
  | 'outro'
  | 'unknown';

export interface Word {
  text: string;
  start: number;
  end: number;
  fontFamily?: string;
  color?: string;
  animation?: WordAnimation;
  /** Fully-resolved per-word render instruction (only set when customized). */
  render?: ResolvedWordRender;
}

export interface LyricLine {
  id: string;
  text: string;
  start: number;
  end: number;
  words: Word[];
}

export interface LyricSection {
  id: string;
  type: SectionType;
  start: number;
  end: number;
  lines: LyricLine[];
}

export interface LyricsDocument {
  song: string;
  sections: LyricSection[];
}

export interface Scene {
  id: string;
  start: number;
  end: number;
  visualConcept: string;
  emotion: string;
  intensity: number;
  lyricLines: string[];
}

export interface Project {
  id: string;
  title: string;
  audioPath: string;
  lyrics: LyricsDocument;
  scenes: Scene[];
  renderConfig: RenderConfig;
}
