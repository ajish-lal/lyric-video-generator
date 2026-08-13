import type { ScenePlanner, ScenePlan } from '../../core/interfaces/scene-planner.js';
import type { LyricsDocument } from '../../core/models/project.js';

export class RulesScenePlanner implements ScenePlanner {
  createPlan(lyrics: LyricsDocument): ScenePlan {
    return {
      scenes: lyrics.sections.filter((section) => section.lines.length > 0).map((section, index) => ({
        id: `scene-${index + 1}`,
        start: section.start,
        end: section.end,
        visualConcept: `scene ${index + 1} based on ${section.type}`,
        emotion: this.emotionForSection(section.type),
        intensity: this.intensityForSection(section.type),
        lyricLines: section.lines.map((line) => line.text),
      })),
    };
  }

  private emotionForSection(type: LyricsDocument['sections'][number]['type']): string {
    switch (type) {
      case 'chorus':
        return 'uplifted';
      case 'bridge':
        return 'reflective';
      case 'breakdown':
        return 'intense';
      default:
        return 'calm';
    }
  }

  private intensityForSection(type: LyricsDocument['sections'][number]['type']): number {
    switch (type) {
      case 'chorus':
        return 0.9;
      case 'bridge':
        return 0.4;
      case 'breakdown':
        return 1;
      default:
        return 0.6;
    }
  }
}
