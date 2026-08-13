import { describe, expect, it } from 'vitest';
import { RulesScenePlanner } from '../src/providers/planning/rules-scene-planner.js';
import { parseLyricsText } from '../src/application/lyrics/lyrics-parser.js';

describe('RulesScenePlanner', () => {
  it('creates scenes from lyric sections', () => {
    const lyrics = parseLyricsText(['Verse 1', 'Hello world', 'We are testing', 'Chorus', 'Rise again'].join('\n'));
    const planner = new RulesScenePlanner();

    const plan = planner.createPlan(lyrics);

    expect(plan.scenes.length).toBeGreaterThan(0);
    expect(plan.scenes[0].visualConcept).toContain('scene');
  });
});
