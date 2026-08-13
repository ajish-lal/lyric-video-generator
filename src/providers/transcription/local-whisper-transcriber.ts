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
    process.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    process.on('error', () => reject(new Error('Local Whisper is not installed. Run scripts\\setup-local-whisper.ps1 first.')));
    process.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`Local Whisper failed: ${stderr.slice(-1200)}`)));
  });
}

/** Offline adapter for faster-whisper. It uses CUDA automatically when available. */
export class LocalWhisperTranscriber implements AudioTranscriber {
  async transcribe(audioPath: string): Promise<TranscriptSegment[]> {
    const python = existsSync('.venv/Scripts/python.exe') ? '.venv/Scripts/python.exe' : 'python';
    const directory = mkdtempSync(join(tmpdir(), 'lyric-video-whisper-'));
    const outputPath = join(directory, 'transcript.json');
    try {
      await run(python, [resolve('scripts/transcribe.py'), '--audio', resolve(audioPath), '--output', outputPath]);
      const result = JSON.parse(readFileSync(outputPath, 'utf8')) as WhisperJson;
      const segments = result.segments?.filter((segment) => segment.text.trim()) ?? [];
      if (segments.length === 0) throw new Error('Local Whisper did not detect any sung or spoken words.');
      return segments.map((segment) => ({
        text: segment.text.trim(), start: segment.start, end: segment.end,
        words: segment.words?.filter((word) => word.text.trim()).map((word) => ({ ...word, text: word.text.trim() })),
      }));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
