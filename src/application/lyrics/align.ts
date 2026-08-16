import type { LyricLine, LyricSection, LyricsDocument, Word } from '../../core/models/project.js';
import type { TranscriptSegment } from '../../core/interfaces/transcriber.js';

interface TimedToken {
  start: number;
  end: number;
}

/** Lowercase and drop punctuation so "Rise!" and "rise" compare equal. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

/**
 * Rough syllable count used to share time between un-matched words. Counting
 * vowel groups (minus a silent trailing "e") places long words like
 * "everything" proportionally longer than "the", which is far closer to how a
 * line is actually sung than an even split.
 */
function syllableWeight(text: string): number {
  const w = normalize(text);
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  if (count > 1 && /e$/.test(w)) count -= 1;
  return Math.max(1, count);
}

/** Flatten a transcript into an ordered list of timed word tokens. */
function hypothesisWords(segments: TranscriptSegment[]): Array<{ text: string } & TimedToken> {
  const out: Array<{ text: string } & TimedToken> = [];
  for (const segment of segments) {
    if (segment.words && segment.words.length > 0) {
      for (const word of segment.words) {
        if (word.text.trim()) out.push({ text: word.text, start: word.start, end: word.end });
      }
    } else {
      const tokens = segment.text.split(/\s+/).filter(Boolean);
      const span = Math.max(0.01, segment.end - segment.start) / Math.max(tokens.length, 1);
      tokens.forEach((text, i) => out.push({ text, start: segment.start + i * span, end: segment.start + (i + 1) * span }));
    }
  }
  return out;
}

/**
 * Needleman–Wunsch alignment of reference tokens (the user's lyrics) against
 * hypothesis tokens (whisper output). Returns, per reference token, the index
 * of the hypothesis token it aligns to, or -1 when it has no counterpart.
 */
function alignTokens(ref: string[], hyp: string[]): number[] {
  const n = ref.length;
  const m = hyp.length;
  const MATCH = 2;
  const MISMATCH = -1;
  const GAP = -1;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const bt: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) { dp[i][0] = i * GAP; bt[i][0] = 1; }
  for (let j = 1; j <= m; j += 1) { dp[0][j] = j * GAP; bt[0][j] = 2; }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const sub = dp[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? MATCH : MISMATCH);
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;
      let best = sub;
      let dir = 0;
      if (up > best) { best = up; dir = 1; }
      if (left > best) { best = left; dir = 2; }
      dp[i][j] = best;
      bt[i][j] = dir;
    }
  }
  const mapped = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const dir = i > 0 && j > 0 ? bt[i][j] : i > 0 ? 1 : 2;
    if (dir === 0) { mapped[i - 1] = j - 1; i -= 1; j -= 1; }
    else if (dir === 1) { i -= 1; }
    else { j -= 1; }
  }
  return mapped;
}

/**
 * Fill in timings for reference words that had no hypothesis match by spreading
 * them across the gap between the surrounding anchored words, giving each word a
 * share proportional to its syllable weight (so long words get more time).
 */
function interpolate(timings: Array<TimedToken | null>, weights: number[]): TimedToken[] {
  const n = timings.length;
  const result: TimedToken[] = new Array(n);
  let i = 0;
  while (i < n) {
    if (timings[i]) { result[i] = timings[i] as TimedToken; i += 1; continue; }
    let j = i;
    while (j < n && !timings[j]) j += 1;
    const runLength = j - i;
    const runWeights = weights.slice(i, j).map((w) => Math.max(0.1, w));
    const totalWeight = runWeights.reduce((sum, w) => sum + w, 0);
    const before = i > 0 ? result[i - 1] : undefined;
    const after = j < n ? (timings[j] as TimedToken) : undefined;
    // ~0.3s per syllable when one edge is open, so leading/trailing unmatched
    // runs still land at a plausible pace instead of piling onto one instant.
    const lo = before ? before.end : after ? Math.max(0, after.start - totalWeight * 0.3) : i * 0.3;
    const hi = after ? after.start : before ? before.end + totalWeight * 0.3 : (i + runLength) * 0.3;
    const span = Math.max(0.01, hi - lo);
    let cursor = lo;
    for (let k = 0; k < runLength; k += 1) {
      const share = span * (runWeights[k] / totalWeight);
      result[i + k] = { start: cursor, end: cursor + share };
      cursor += share;
    }
    i = j;
  }
  return result;
}

/**
 * Attach real audio timings from a whisper transcript onto the user's own
 * lyrics text. The words stay exactly as written (100% accurate), while their
 * start/end times come from the aligned transcript. Line and section spans are
 * recomputed from the retimed words.
 */
export function alignLyricsToTranscript(doc: LyricsDocument, segments: TranscriptSegment[]): LyricsDocument {
  const hyp = hypothesisWords(segments);
  if (hyp.length === 0) return doc;

  const refWords: Word[] = [];
  doc.sections.forEach((section) => {
    section.lines.forEach((line) => {
      line.words.forEach((word) => refWords.push(word));
    });
  });
  if (refWords.length === 0) return doc;

  const mapped = alignTokens(refWords.map((w) => normalize(w.text)), hyp.map((w) => normalize(w.text)));
  const rawTimings: Array<TimedToken | null> = mapped.map((hi) =>
    hi >= 0 ? { start: hyp[hi].start, end: hyp[hi].end } : null,
  );
  const weights = refWords.map((word) => syllableWeight(word.text));
  const timings = enforceMonotonic(interpolate(rawTimings, weights));

  let flat = 0;
  const sections: LyricSection[] = doc.sections.map((section) => {
    const lines: LyricLine[] = section.lines.map((line) => {
      const words: Word[] = line.words.map((word) => {
        const t = timings[flat];
        flat += 1;
        return { ...word, start: t.start, end: t.end };
      });
      return {
        ...line,
        words,
        start: round(words[0]?.start ?? line.start),
        end: round(words.at(-1)?.end ?? line.end),
      };
    });
    return {
      ...section,
      lines,
      start: round(lines[0]?.start ?? section.start),
      end: round(lines.at(-1)?.end ?? section.end),
    };
  });

  return { ...doc, sections };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Final safety sweep over the flattened word timings: rounds to 2 decimals and
 * forces strictly increasing, non-overlapping words with a minimum duration, so
 * interpolation + rounding can never yield `end <= start` (which would abort
 * config validation) or overlaps (which would warn).
 */
function enforceMonotonic(timings: TimedToken[]): TimedToken[] {
  const MIN = 0.01;
  let cursor = 0;
  return timings.map((t, idx) => {
    const start = idx === 0 ? Math.max(0, round(t.start)) : Math.max(cursor, round(t.start));
    const end = Math.max(round(t.end), round(start + MIN));
    cursor = end;
    return { start, end };
  });
}
