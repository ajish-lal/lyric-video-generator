import type { LyricsDocument } from '../models/project.js';

export interface ScenePlan {
  scenes: Array<{
    id: string;
    start: number;
    end: number;
    visualConcept: string;
    emotion: string;
    intensity: number;
    lyricLines: string[];
  }>;
}

export interface ScenePlanner {
  createPlan(lyrics: LyricsDocument): ScenePlan;
}
