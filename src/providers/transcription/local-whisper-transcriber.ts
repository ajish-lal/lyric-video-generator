import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { AudioTranscriber, TranscriptSegment } from '../../core/interfaces/transcriber.js';

type WhisperJson = {
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    words?: Array<{ text: string; start: number; end: number }>;
  }>;
};

function run(python: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const process = spawn(python, args, { windowsHide: true });
    let stderr = '';
    process.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      // The script logs its optional-stage progress (Demucs/WhisperX) to stderr.
      // Forward it live so a silent WhisperX fallback is actually visible.
      globalThis.process.stderr.write(text);
    });
    process.on('error', () => reject(new Error('Local Whisper is not installed. Run scripts\\setup-local-whisper.ps1 first.')));
    process.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`Local Whisper failed: ${stderr.slice(-1200)}`)));
  });
}

/** Smallest allowed word/segment duration; Whisper often reports 0 or overlaps. */
const MIN_DURATION = 0.05;

/**
 * Whisper word timestamps are noisy: some report `end <= start` (zero/negative
 * duration) and consecutive words can overlap. Both make the downstream config
 * fail validation ("end must be greater than start") or warn about overlaps.
 * This forces each segment's words to be strictly increasing and non-overlapping
 * with a minimum duration, and keeps the segment span consistent with them.
 */
export function sanitizeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map((segment) => {
    const segStart = Math.max(0, segment.start);
    let words: TranscriptSegment['words'];
    if (segment.words && segment.words.length > 0) {
      let cursor = segStart;
      words = segment.words.map((word) => {
        const start = Math.max(cursor, word.start, 0);
        const end = Math.max(word.end, start + MIN_DURATION);
        cursor = end;
        return { ...word, start, end };
      });
    }
    const start = words && words.length > 0 ? Math.min(segStart, words[0].start) : segStart;
    const end = words && words.length > 0
      ? Math.max(segment.end, words.at(-1)!.end)
      : Math.max(segment.end, start + MIN_DURATION);
    return { ...segment, start, end, words };
  });
}

/** Offline adapter for faster-whisper. It uses CUDA automatically when available. */
export class LocalWhisperTranscriber implements AudioTranscriber {
  async transcribe(audioPath: string): Promise<TranscriptSegment[]> {
    const python = existsSync('.venv/Scripts/python.exe')
      ? '.venv/Scripts/python.exe'
      : existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python';
    const directory = mkdtempSync(join(tmpdir(), 'lyric-video-whisper-'));
    const outputPath = join(directory, 'transcript.json');
    try {
      await run(python, [resolve('scripts/transcribe.py'), '--audio', resolve(audioPath), '--output', outputPath]);
      const result = JSON.parse(readFileSync(outputPath, 'utf8')) as WhisperJson;
      const segments = result.segments?.filter((segment) => segment.text.trim()) ?? [];
      if (segments.length === 0) throw new Error('Local Whisper did not detect any sung or spoken words.');
      return sanitizeSegments(segments.map((segment) => ({
        text: segment.text.trim(), start: segment.start, end: segment.end,
        words: segment.words?.filter((word) => word.text.trim()).map((word) => ({ ...word, text: word.text.trim() })),
      })));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
