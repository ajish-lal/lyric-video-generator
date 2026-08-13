import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, extname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import type { Renderer, RenderResult } from '../../core/interfaces/renderer.js';
import type { Project } from '../../core/models/project.js';

const DEFAULT_OUTPUT = 'output/lyric-video.mp4';

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

function asFfmpegColor(value: string): string {
  return /^(#[0-9a-f]{6}|0x[0-9a-f]{6})$/i.test(value) ? value : '#111827';
}

function gradientType(type: Project['renderConfig']['style']['background']['gradientType']): number {
  return { linear: 0, radial: 1, circular: 2, spiral: 3 }[type];
}

function run(binary: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const process = spawn(binary, args, { windowsHide: true });
    let stderr = '';
    process.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    process.on('error', reject);
    process.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`FFmpeg failed (${code ?? 'unknown error'}): ${stderr.slice(-1200)}`));
    });
  });
}

function readMediaDuration(binary: string, mediaPath: string): Promise<number | undefined> {
  return new Promise((resolvePromise) => {
    const process = spawn(binary, ['-i', mediaPath], { windowsHide: true });
    let stderr = '';
    process.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    process.on('close', () => {
      const match = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) return resolvePromise(undefined);
      resolvePromise(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    });
    process.on('error', () => resolvePromise(undefined));
  });
}

/** Renders a self-contained H.264 MP4; project metadata is written beside it as JSON. */
export class LyricVideoRenderer implements Renderer {
  async render(project: Project, requestedOutputPath = DEFAULT_OUTPUT): Promise<RenderResult> {
    if (!ffmpegPath) throw new Error('FFmpeg binary is unavailable. Reinstall dependencies with npm install.');
    const outputPath = resolve(requestedOutputPath);
    if (extname(outputPath).toLowerCase() !== '.mp4') throw new Error('Output must use the .mp4 extension.');
    mkdirSync(dirname(outputPath), { recursive: true });

    const config = project.renderConfig;
    const background = config.style.background ?? {
      palette: ['0x060816', '0x172554', '0x3B0764'], gradientType: 'radial' as const,
      motionSpeed: 0.004, grain: 3, vignette: 0.55, showFrame: true,
    };
    const wordDisplay = config.wordDisplay ?? { mode: 'single-word' as const, hold: 'word-end' as const };
    const allLines = project.lyrics.sections.flatMap((section) => section.lines);
    const hasAudio = Boolean(project.audioPath && existsSync(project.audioPath));
    const audioDuration = hasAudio ? await readMediaDuration(ffmpegPath, project.audioPath) : undefined;
    const duration = Math.max(1, allLines.at(-1)?.end ?? 0, audioDuration ?? 0);
    const y = config.style.lyricPosition === 'top' ? 'h*0.20' : config.style.lyricPosition === 'bottom' ? 'h*0.78' : 'h/2';
    const createTextFilter = (text: string, start: number, end: number, fade = false, effect?: Project['lyrics']['sections'][number]['lines'][number]['words'][number]) => {
      const safeText = escapeFilterValue(text);
      const formattedStart = start.toFixed(3);
      const formattedEnd = end.toFixed(3);
      const isSmog = effect?.animation?.type === 'smog-fade';
      const isSlash = effect?.animation?.type === 'slash-vibrate';
      const alpha = fade
        ? `if(lt(t,${formattedStart}+0.35),(t-${formattedStart})/0.35,if(gt(t,${formattedEnd}-0.35),(${formattedEnd}-t)/0.35,1))`
        : isSmog
          ? `min(1,(t-${formattedStart})/0.18)`
        : '1';
      const x = isSlash ? `(w-text_w)/2+${Math.round((effect.animation?.intensity ?? 0.8) * 12)}*sin(95*t)` : '(w-text_w)/2';
      const wordY = isSmog ? `${y}+${Math.round((effect?.animation?.intensity ?? 0.7) * 18)}*sin(3*t)` : y;
      const font = escapeFilterValue(effect?.fontFamily ?? config.style.fontFamily);
      const color = asFfmpegColor(effect?.color ?? config.style.primaryColor);
      return `drawtext=text='${safeText}':font='${font}':fontcolor=${color}:fontsize=h/9:x=${x}:y=${wordY}:box=1:boxcolor=black@0.24:boxborderw=32:borderw=2:bordercolor=white@0.12:shadowx=0:shadowy=12:shadowcolor=black@0.72:alpha='${alpha}':enable='between(t,${formattedStart},${formattedEnd})'`;
    };
    const filters = allLines.flatMap((line) => {
      if (config.lyricAnimation.type === 'word-by-word' && line.words.length > 0) {
        return line.words.map((word, index) => {
          const end = wordDisplay.hold === 'next-word'
            ? line.words[index + 1]?.start ?? line.end
            : word.end;
          const text = wordDisplay.mode === 'single-word'
            ? word.text
            : line.words.slice(0, index + 1).map((item) => item.text).join(' ');
          return createTextFilter(
          text,
          word.start,
          Math.max(word.start + 0.01, end),
          false,
          word,
          );
        });
      }
      const text = escapeFilterValue(line.text);
      const start = line.start.toFixed(3);
      const end = line.end.toFixed(3);
      const alpha = config.lyricAnimation.type === 'fade'
        ? `if(lt(t,${start}+0.35),(t-${start})/0.35,if(gt(t,${end}-0.35),(${end}-t)/0.35,1))`
        : '1';
      return `drawtext=text='${text}':fontcolor=${asFfmpegColor(config.style.primaryColor)}:fontsize=h/15:x=(w-text_w)/2:y=${y}:borderw=3:bordercolor=black@0.65:alpha='${alpha}':enable='between(t,${start},${end})'`;
    });

    const palette = background.palette.slice(0, 8).map(asFfmpegColor);
    while (palette.length < 2) palette.push('0x111827');
    const gradientInput = [
      `gradients=s=${config.width}x${config.height}:r=${config.fps}`,
      ...palette.map((color, index) => `c${index}=${color}`),
      `n=${palette.length}:t=${gradientType(background.gradientType)}:speed=${background.motionSpeed}:seed=104729`,
    ].join(':');
    const backgroundFilters = [
      `noise=alls=${Math.max(0, Math.round(background.grain))}:allf=t+u`,
      `vignette=PI/${Math.max(1, Math.round(10 - background.vignette * 8))}`,
      ...(background.showFrame ? ['drawbox=x=54:y=54:w=iw-108:h=ih-108:color=white@0.10:t=2'] : []),
    ];
    const args = [
      '-y', '-f', 'lavfi', '-i', gradientInput,
      ...(hasAudio ? ['-stream_loop', '-1', '-i', project.audioPath] : []),
      '-vf', [...backgroundFilters, ...filters].join(','),
      '-t', String(duration), '-map', '0:v:0',
      ...(hasAudio ? ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k'] : []),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath,
    ];
    await run(ffmpegPath, args);

    if (!existsSync(outputPath)) throw new Error('FFmpeg reported success but no output file was created.');
    writeFileSync(`${outputPath}.json`, JSON.stringify({ project, outputPath, duration }, null, 2));
    return { outputPath, format: 'mp4', duration };
  }
}
