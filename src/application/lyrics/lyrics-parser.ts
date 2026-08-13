import type { LyricLine, LyricSection, LyricsDocument } from '../../core/models/project.js';
import type { TranscriptSegment } from '../../core/interfaces/transcriber.js';

function styleTranscribedWord(text: string, start: number, end: number) {
  const duration = end - start;
  if (duration >= 0.7) return {
    text, start, end, fontFamily: 'Georgia', color: '#d8f7ff',
    animation: { type: 'smog-fade' as const, duration: 0.5, easing: 'easeOut', intensity: 0.7 },
  };
  if (duration <= 0.28) return {
    text, start, end, fontFamily: 'Impact', color: '#7cff4f',
    animation: { type: 'slash-vibrate' as const, duration: 0.15, easing: 'easeOut', intensity: 0.9 },
  };
  return { text, start, end };
}

function toSectionType(value: string): LyricSection['type'] {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('chorus')) return 'chorus';
  if (normalized.includes('verse')) return 'verse';
  if (normalized.includes('bridge')) return 'bridge';
  if (normalized.includes('intro')) return 'intro';
  if (normalized.includes('outro')) return 'outro';
  return 'unknown';
}

function isSectionHeading(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return Boolean(
    normalized.match(/^(verse|chorus|pre-chorus|bridge|breakdown|intro|outro)(\s+\d+)?$/) ||
    normalized.match(/^\[(.+)\]$/),
  );
}

export function parseLyricsText(input: string): LyricsDocument {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSectionHeading(line));

  const section: LyricSection = {
    id: 'section-1',
    type: 'verse',
    start: 0,
    end: 0,
    lines: lines.map((text, index) => ({
      id: `line-${index + 1}`,
      text,
      start: index,
      end: index + 1,
      words: text.split(/(\s+)/).filter(Boolean).map((word, wordIndex) => ({
        text: word,
        start: index + wordIndex * 0.1,
        end: index + wordIndex * 0.1 + 0.1,
      })),
    })),
  };

  if (lines[0] && lines[0].toLowerCase().includes('chorus')) {
    section.type = 'chorus';
  }

  return {
    song: 'parsed-song',
    sections: [section],
  };
}

export function parseLyricsFile(content: string): LyricsDocument {
  const sectionHeadingPattern = /^\[(.+)\]$/;
  const lines = content.split(/\r?\n/);
  const sections: LyricSection[] = [];
  let currentSection: LyricSection | null = null;
  let currentLines: LyricLine[] = [];
  let lineNumber = 0;

  const flushSection = () => {
    if (!currentSection) return;
    currentSection.lines = currentLines;
    currentSection.start = currentLines[0]?.start ?? 0;
    currentSection.end = currentLines.at(-1)?.end ?? currentSection.start;
    sections.push(currentSection);
    currentSection = null;
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(sectionHeadingPattern);
    if (headingMatch) {
      flushSection();
      currentSection = {
        id: `section-${sections.length + 1}`,
        type: toSectionType(headingMatch[1]),
        start: 0,
        end: 0,
        lines: [],
      };
      continue;
    }

    const start = lineNumber * 3;
    const words = line.split(/\s+/).filter(Boolean);
    currentLines.push({
      id: `line-${lineNumber + 1}`,
      text: line,
      start,
      end: start + 3,
      words: words.map((word, wordIndex) => ({
        text: word,
        start: start + (wordIndex * 3) / words.length,
        end: start + ((wordIndex + 1) * 3) / words.length,
      })),
    });
    lineNumber += 1;
  }

  flushSection();

  return {
    song: 'parsed-song',
    sections: sections.length > 0 ? sections : [
      {
        id: 'section-1',
        type: 'verse',
        start: 0,
        end: 0,
        lines: [],
      },
    ],
  };
}

export function lyricsFromTranscript(segments: TranscriptSegment[]): LyricsDocument {
  const lines: LyricLine[] = segments.map((segment, index) => {
    const words = segment.text.split(/\s+/).filter(Boolean);
    const wordDuration = (segment.end - segment.start) / Math.max(words.length, 1);
    return {
      id: `line-${index + 1}`,
      text: segment.text,
      start: segment.start,
      end: segment.end,
      words: segment.words?.length
        ? segment.words.map((word) => styleTranscribedWord(word.text, word.start, word.end))
        : words.map((text, wordIndex) => ({
            text,
            start: segment.start + wordIndex * wordDuration,
            end: segment.start + (wordIndex + 1) * wordDuration,
          })),
    };
  });
  return {
    song: 'transcribed-song',
    sections: [{
      id: 'section-1', type: 'verse', start: lines[0]?.start ?? 0,
      end: lines.at(-1)?.end ?? 0, lines,
    }],
  };
}
