import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { LyricVideoRenderer } from '../src/providers/renderers/lyric-video-renderer.js';

describe('LyricVideoRenderer', () => {
  it('returns a polished render target using the project render config', async () => {
    const renderer = new LyricVideoRenderer();
    const directory = mkdtempSync(join(tmpdir(), 'lyric-video-test-'));
    const result = await renderer.render({
      id: 'demo',
      title: 'Demo',
      audioPath: 'audio.mp3',
      lyrics: {
        song: 'demo',
        sections: [{ id: 'section-1', type: 'verse', start: 0, end: 1, lines: [{ id: 'line-1', text: 'Hello', start: 0, end: 1, words: [] }] }],
      },
      scenes: [],
      renderConfig: {
        width: 1920,
        height: 1080,
        fps: 30,
        format: 'mp4',
        style: {
          theme: 'cinematic-dark',
          fontFamily: 'Montserrat',
          primaryColor: '#ffffff',
          accentColor: '#7cff4f',
          lyricPosition: 'center',
          background: {
            palette: ['0x060816', '0x172554'], gradientType: 'radial', motionSpeed: 0.004,
            grain: 3, vignette: 0.55, showFrame: true,
          },
        },
        lyricAnimation: {
          type: 'word-by-word',
          duration: 0.3,
          easing: 'easeOut',
          intensity: 0.8,
        },
        wordDisplay: {
          mode: 'single-word',
          hold: 'word-end',
        },
      },
    }, join(directory, 'video.mp4'));

    try {
      expect(result.outputPath).toContain('.mp4');
      expect(result.format).toBe('mp4');
      expect(existsSync(result.outputPath)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
