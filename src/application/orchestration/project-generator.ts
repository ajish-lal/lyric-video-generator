import { parseLyricsFile } from '../lyrics/lyrics-parser.js';
import { RulesScenePlanner } from '../../providers/planning/rules-scene-planner.js';
import { ProjectBuilder } from './project-builder.js';
import type { Project } from '../../core/models/project.js';

export function createProjectFromLyricsContent(lyricsContent: string, audioPath = 'audio.mp3'): Project {
  const lyrics = parseLyricsFile(lyricsContent);
  const planner = new RulesScenePlanner();
  const builder = new ProjectBuilder();

  return builder.build({
    id: 'generated-project',
    title: 'Generated project',
    audioPath,
    lyrics,
    scenes: planner.createPlan(lyrics).scenes,
  });
}
