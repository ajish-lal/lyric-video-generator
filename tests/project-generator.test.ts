import { describe, expect, it } from 'vitest';
import { createProjectFromLyricsContent } from '../src/application/orchestration/project-generator.js';

describe('createProjectFromLyricsContent', () => {
  it('builds a project with render config from lyrics content', () => {
    const project = createProjectFromLyricsContent('[Verse]\nHello world\n[Chorus]\nRise again', 'demo.mp3');

    expect(project.lyrics.sections).toHaveLength(2);
    expect(project.renderConfig.lyricAnimation.type).toBe('word-by-word');
    expect(project.renderConfig.wordDisplay).toEqual({ mode: 'single-word', hold: 'word-end' });
    expect(project.scenes.length).toBeGreaterThan(0);
  });
});
