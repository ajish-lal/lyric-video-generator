import { describe, expect, it } from 'vitest';
import { lyricsFromTranscript, parseLyricsText } from '../src/application/lyrics/lyrics-parser.js';

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
