import { describe, expect, it } from 'vitest';
import { buildResolveExport } from '../../src/resolve/index.js';
import type { ProjectConfig } from '../../src/core/models/customization.js';

const config: ProjectConfig = {
  title: 'Test Song',
  resolution: { width: 1920, height: 1080, fps: 30 },
  sections: [
    {
      type: 'chorus',
      style: { fontSize: 120, color: '#ff2530', animation: 'impact' },
      lines: [
        {
          text: 'hello world',
          start: 0,
          end: 2,
          words: [
            { text: 'hello', start: 0, end: 1 },
            { text: 'world', start: 1, end: 2 },
          ],
        },
      ],
    },
  ],
};

describe('flattenProjectToResolve (via buildResolveExport)', () => {
  it('emits one entry per word with frame timing and section type', async () => {
    const data = await buildResolveExport(config);
    expect(data.version).toBe(1);
    expect(data.fps).toBe(30);
    expect(data.width).toBe(1920);
    expect(data.height).toBe(1080);
    expect(data.words).toHaveLength(2);

    const [hello, world] = data.words;
    expect(hello.text).toBe('hello');
    expect(world.text).toBe('world');
    expect(hello.sectionType).toBe('chorus');
    expect(hello.startFrame).toBe(0);
    expect(hello.endFrame).toBe(30);
    expect(hello.durFrames).toBe(30);
    expect(world.startFrame).toBe(30);
    expect(world.endFrame).toBe(60);
  });

  it('normalizes color to #rrggbb and carries the resolved font/size', async () => {
    const data = await buildResolveExport(config);
    const hello = data.words[0];
    expect(hello.colorHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(hello.colorHex).toBe('#ff2530');
    expect(hello.font.length).toBeGreaterThan(0);
    expect(hello.sizePx).toBeGreaterThan(0);
  });

  it('bakes one keyframe per frame in Resolve coordinates', async () => {
    const data = await buildResolveExport(config);
    const hello = data.words[0];
    expect(hello.keys).toHaveLength(hello.durFrames + 1);
    // Comp-local frames start at 0 and increase by 1.
    expect(hello.keys[0].f).toBe(0);
    expect(hello.keys.at(-1)!.f).toBe(hello.durFrames);
    for (const k of hello.keys) {
      expect(k.cx).toBeGreaterThanOrEqual(-0.5);
      expect(k.cx).toBeLessThanOrEqual(1.5);
      expect(k.cy).toBeGreaterThanOrEqual(-0.5);
      expect(k.cy).toBeLessThanOrEqual(1.5);
      expect(k.blend).toBeGreaterThanOrEqual(0);
      expect(k.blend).toBeLessThanOrEqual(1);
    }
    // A fading-in word starts near-invisible.
    expect(hello.keys[0].blend).toBeLessThan(0.3);
  });
});
