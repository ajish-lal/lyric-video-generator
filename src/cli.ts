#!/usr/bin/env node
import { Pipeline } from './application/orchestration/pipeline.js';
import { readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']);

function findSingleInputAudio(): string | undefined {
  try {
    const files = readdirSync('input', { withFileTypes: true })
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()));
    return files.length === 1 ? join('input', files[0].name) : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const valueFor = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const input = valueFor('--input') ?? (args[0] === 'create' ? args[1] : undefined);
  const audio = valueFor('--audio') ?? (args[0] === 'create' ? args[2] : undefined) ?? findSingleInputAudio();
  const output = valueFor('--output') ?? (audio ? join('output', `${basename(audio, extname(audio))}.mp4`) : undefined);

  if (output && (input || audio)) {
    const result = await new Pipeline().generate(output, audio, input);
    console.log(`Created ${result.render.outputPath} (${result.render.duration.toFixed(1)}s)`);
    return;
  }

  console.log('Put one audio file in input/ and run npm run dev, or use: npm run dev -- --audio input/song.mp3 --output output/video.mp4 [--input input/lyrics.txt]');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
