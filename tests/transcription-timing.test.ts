import { describe, it, expect } from 'vitest';
import { sanitizeSegments } from '../src/providers/transcription/local-whisper-transcriber.js';
import { alignLyricsToTranscript } from '../src/application/lyrics/align.js';
import { parseLyricsFile } from '../src/application/lyrics/lyrics-parser.js';
import { buildProjectConfig } from '../src/application/orchestration/config-generator.js';
import { validateConfig } from '../src/customization/validation.js';
import type { TranscriptSegment } from '../src/core/interfaces/transcriber.js';

describe('sanitizeSegments (Whisper timing guard)', () => {
  it('forces zero-duration and overlapping words to be strictly increasing', () => {
    const segments: TranscriptSegment[] = [
      {
        text: 'rise again we',
        start: 10,
        end: 10, // degenerate segment span
        words: [
          { text: 'rise', start: 10, end: 10 }, // zero duration
          { text: 'again', start: 9.8, end: 10.5 }, // overlaps previous + starts earlier
          { text: 'we', start: 10.4, end: 10.4 }, // zero duration + overlaps
        ],
      },
    ];

    const [seg] = sanitizeSegments(segments);
    const w = seg.words!;
    // Every word has positive duration.
    for (const word of w) expect(word.end).toBeGreaterThan(word.start);
    // Words are non-overlapping and ordered.
    expect(w[1].start).toBeGreaterThanOrEqual(w[0].end);
    expect(w[2].start).toBeGreaterThanOrEqual(w[1].end);
    // Segment span stays consistent with its words.
    expect(seg.end).toBeGreaterThanOrEqual(w.at(-1)!.end);
    expect(seg.start).toBeLessThanOrEqual(w[0].start);
  });

  it('handles segments without word timings', () => {
    const [seg] = sanitizeSegments([{ text: 'hello world', start: 0, end: 0 }]);
    expect(seg.end).toBeGreaterThan(seg.start);
    expect(seg.words).toBeUndefined();
  });
});

describe('config from noisy transcript never fails validation', () => {
  it('produces no timing errors or overlap warnings after sanitize + align', () => {
    const doc = parseLyricsFile('[Verse]\nrise again we rise');
    // Deliberately broken transcript: zero-duration and overlapping words.
    const noisy: TranscriptSegment[] = sanitizeSegments([
      {
        text: 'rise again we rise',
        start: 5,
        end: 5,
        words: [
          { text: 'rise', start: 5, end: 5 },
          { text: 'again', start: 4.9, end: 5 },
          { text: 'we', start: 5, end: 5 },
          { text: 'rise', start: 5, end: 4.8 },
        ],
      },
    ]);

    const aligned = alignLyricsToTranscript(doc, noisy);
    const config = buildProjectConfig(aligned, { audio: 'input/song.mp3' });
    const result = validateConfig(config);

    const timingErrors = result.errors.filter((e) => /must be greater than/.test(e));
    const overlapWarnings = result.warnings.filter((w) => /Overlapping word timings/.test(w));
    expect(timingErrors).toEqual([]);
    expect(overlapWarnings).toEqual([]);

    // All words still end strictly after they start.
    const flat = aligned.sections.flatMap((s) => s.lines.flatMap((l) => l.words));
    for (const word of flat) expect(word.end).toBeGreaterThan(word.start);
  });
});
