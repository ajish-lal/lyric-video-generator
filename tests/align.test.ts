import { describe, it, expect } from 'vitest';
import { parseLyricsFile } from '../src/application/lyrics/lyrics-parser.js';
import { alignLyricsToTranscript } from '../src/application/lyrics/align.js';
import { buildProjectConfig } from '../src/application/orchestration/config-generator.js';
import type { TranscriptSegment } from '../src/core/interfaces/transcriber.js';
import type { SongTemplate } from '../src/customization/templates/index.js';

const LYRICS = `[Verse]\nrise again we rise\nfeel the fire burn`;

function words(text: string, start: number, step: number): TranscriptSegment['words'] {
  return text.split(' ').map((t, i) => ({ text: t, start: start + i * step, end: start + (i + 1) * step }));
}

describe('alignLyricsToTranscript', () => {
  it('keeps the user words but adopts transcript timings', () => {
    const doc = parseLyricsFile(LYRICS);
    const segments: TranscriptSegment[] = [
      { text: 'rise again we rise', start: 10, end: 14, words: words('rise again we rise', 10, 1) },
      { text: 'feel the fire burn', start: 20, end: 24, words: words('feel the fire burn', 20, 1) },
    ];

    const aligned = alignLyricsToTranscript(doc, segments);
    const flat = aligned.sections.flatMap((s) => s.lines.flatMap((l) => l.words));

    // Words are unchanged (100% the user's lyrics).
    expect(flat.map((w) => w.text)).toEqual(['rise', 'again', 'we', 'rise', 'feel', 'the', 'fire', 'burn']);
    // Timings come from the transcript, not the parser's fake 3s-per-line spacing.
    expect(flat[0].start).toBeCloseTo(10, 5);
    expect(flat[4].start).toBeCloseTo(20, 5);
    // Line spans are recomputed from the retimed words.
    expect(aligned.sections[0].lines[0].start).toBeCloseTo(10, 5);
    expect(aligned.sections[0].lines[1].end).toBeCloseTo(24, 5);
  });

  it('still times a user word that the transcript missed (interpolation)', () => {
    const doc = parseLyricsFile(`[Verse]\nrise up again`);
    // Transcript is missing "up".
    const segments: TranscriptSegment[] = [
      { text: 'rise again', start: 5, end: 7, words: words('rise again', 5, 1) },
    ];
    const aligned = alignLyricsToTranscript(doc, segments);
    const flat = aligned.sections.flatMap((s) => s.lines.flatMap((l) => l.words));
    expect(flat.map((w) => w.text)).toEqual(['rise', 'up', 'again']);
    // "up" is placed between "rise" (ends 6) and "again" (starts 6).
    expect(flat[1].start).toBeGreaterThanOrEqual(flat[0].start);
    expect(flat[1].end).toBeLessThanOrEqual(flat[2].end);
  });
});

describe('buildProjectConfig', () => {
  it('emits a self-contained, re-editable config with per-word timings', () => {
    const doc = alignLyricsToTranscript(parseLyricsFile(LYRICS), [
      { text: 'rise again we rise', start: 0, end: 4, words: words('rise again we rise', 0, 1) },
      { text: 'feel the fire burn', start: 4, end: 8, words: words('feel the fire burn', 4, 1) },
    ]);

    const template: SongTemplate = {
      name: 'test',
      description: 'test template',
      theme: 'dark',
      typography: { font: 'Impact' },
      sections: { verse: { fontSize: 100, animation: 'fade_up' } },
    };

    const config = buildProjectConfig(doc, { audio: 'input/demo.mp3', template });
    expect(config.audio).toBe('input/demo.mp3');
    expect(config.typography).toEqual({ font: 'Impact' });
    const verse = config.sections?.find((s) => s.type === 'verse');
    expect(verse?.style).toEqual({ fontSize: 100, animation: 'fade_up' });
    expect(verse?.lines?.[0].words?.[0]).toMatchObject({ text: 'rise', start: 0 });
  });
});
