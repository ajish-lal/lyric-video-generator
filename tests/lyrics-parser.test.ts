import { describe, expect, it } from 'vitest';
import { lyricsFromTranscript, parseLyricsFile, parseLyricsText } from '../src/application/lyrics/lyrics-parser.js';

describe('parseLyricsText', () => {
  it('parses plain text into structured lyric sections and lines', () => {
    const input = ['Verse 1', 'Hello world', 'This is a test'].join('\n');

    const result = parseLyricsText(input);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].type).toBe('verse');
    expect(result.sections[0].lines).toHaveLength(2);
    expect(result.sections[0].lines[0].text).toBe('Hello world');
  });
});

describe('parseLyricsFile', () => {
  it('parses a file with [Section] headers into typed sections', () => {
    const result = parseLyricsFile('[Verse]\nfirst line\n[Chorus]\nhook line');
    expect(result.sections.map((s) => s.type)).toEqual(['verse', 'chorus']);
    expect(result.sections[1].lines[0].text).toBe('hook line');
  });

  it('treats a header-less file as a single verse instead of dropping it', () => {
    const result = parseLyricsFile('first line without header\nsecond line');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].type).toBe('verse');
    expect(result.sections[0].lines.map((l) => l.text)).toEqual(['first line without header', 'second line']);
  });
});

describe('lyricsFromTranscript', () => {
  it('preserves timestamped transcription segments for rendering', () => {
    const result = lyricsFromTranscript([{
      text: 'Rise again', start: 3.2, end: 4.4,
      words: [{ text: 'Rise', start: 3.2, end: 3.7 }, { text: 'again', start: 3.7, end: 4.4 }],
    }]);
    expect(result.sections[0].lines[0]).toMatchObject({ text: 'Rise again', start: 3.2, end: 4.4 });
    expect(result.sections[0].lines[0].words).toHaveLength(2);
    expect(result.sections[0].lines[0].words[0].end).toBe(3.7);
  });
});
