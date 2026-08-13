import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpegStaticPath from 'ffmpeg-static';
import type { Renderer, RenderResult, RenderOptions } from '../../core/interfaces/renderer.js';
import type { Project, Word } from '../../core/models/project.js';
import type { ResolvedWordRender } from '../../core/models/customization.js';
import { DEFAULT_EFFECTS } from '../../customization/apply.js';
import { buildGradeChain, buildMusicVizNodes, buildWordDrawText, colorToFfmpeg } from './text-filter.js';
import type { MusicVizConfig, MusicVizMode } from '../../core/models/render.js';

const DEFAULT_OUTPUT = 'output/lyric-video.mp4';

/**
 * Resolves the music visualizer config. An explicit `config.musicViz` wins;
 * otherwise `MUSIC_VIZ=wave|bars|spectrum` (or `1`/`on`) enables a default
 * bottom neon wave so the CLI and scripts can toggle it without deep config.
 */
function resolveMusicViz(musicViz: MusicVizConfig | undefined): MusicVizConfig | undefined {
  if (musicViz?.enabled) return musicViz;
  const env = process.env.MUSIC_VIZ?.trim().toLowerCase();
  if (!env || env === '0' || env === 'off' || env === 'false') return undefined;
  const mode = (['wave', 'bars', 'spectrum'].includes(env) ? env : 'wave') as MusicVizMode;
  const colorsEnv = process.env.MUSIC_VIZ_COLORS?.trim();
  const colors = colorsEnv ? colorsEnv.split(/[,|]/).map((c) => c.trim()).filter(Boolean) : undefined;
  const reflection = ['1', 'on', 'true', 'yes'].includes((process.env.MUSIC_VIZ_REFLECT ?? '').trim().toLowerCase());
  return { enabled: true, mode, reflection, ...(colors && colors.length > 0 ? { colors } : {}) };
}

/**
 * Resolves the FFmpeg binary to use. The bundled `ffmpeg-static` build does not
 * include the `drawtext` filter on every platform, so prefer an explicit
 * `FFMPEG_PATH` override, then a known full Homebrew build, before falling back
 * to the bundled binary.
 */
function resolveFfmpegPath(): string | null {
  const override = process.env.FFMPEG_PATH?.trim();
  if (override) return override;
  const fullBuilds = [
    '/usr/local/opt/ffmpeg-full/bin/ffmpeg',
    '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  ];
  const fullBuild = fullBuilds.find((candidate) => existsSync(candidate));
  if (fullBuild) return fullBuild;
  return ffmpegStaticPath;
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

/** Windows fonts directory (honours a relocated SystemRoot), forward-slashed. */
const WIN_FONTS = `${(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows').replace(/\\/g, '/')}/Fonts`;

/**
 * Known font files by family name across macOS, Windows and common Linux paths,
 * so `drawtext` gets a real `fontfile=` and never needs fontconfig (which the
 * bundled FFmpeg builds may lack). Families without a native match fall back to
 * a close equivalent on that OS.
 */
const FONT_FILE_CANDIDATES: Record<string, string[]> = {
  impact: [
    '/System/Library/Fonts/Supplemental/Impact.ttf',
    `${WIN_FONTS}/impact.ttf`,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ],
  'arial black': [
    '/System/Library/Fonts/Supplemental/Arial Black.ttf',
    `${WIN_FONTS}/ariblk.ttf`,
    `${WIN_FONTS}/impact.ttf`,
  ],
  'din condensed bold': [
    '/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf',
    `${WIN_FONTS}/BebasNeue.ttf`,
    `${WIN_FONTS}/impact.ttf`,
  ],
  baskerville: [
    '/System/Library/Fonts/Supplemental/Baskerville.ttc',
    `${WIN_FONTS}/georgia.ttf`,
    `${WIN_FONTS}/times.ttf`,
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
  ],
  arial: [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    `${WIN_FONTS}/arial.ttf`,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ],
};

/**
 * Universal last-resort font files (first existing wins). Guarantees a real
 * fontfile on any OS so drawtext never falls back to a fontconfig name.
 */
const FALLBACK_FONT_FILES: string[] = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  `${WIN_FONTS}/arial.ttf`,
  `${WIN_FONTS}/segoeui.ttf`,
  `${WIN_FONTS}/impact.ttf`,
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

/** Resolves a concrete font file for a family so drawtext works without fontconfig. */
function resolveFontFile(family: string | undefined): string | undefined {
  const overrideDir = process.env.FONT_DIR?.trim().replace(/\\/g, '/');
  const key = family?.trim().toLowerCase();
  const candidates = [
    ...(overrideDir && family ? [`${overrideDir}/${family}.ttf`, `${overrideDir}/${family}.otf`] : []),
    ...(key ? FONT_FILE_CANDIDATES[key] ?? [] : []),
    // Always fall back to a guaranteed-present font file rather than fontconfig.
    ...FALLBACK_FONT_FILES,
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

/** Builds the drawtext font token, preferring an explicit fontfile over a fontconfig name. */
function fontToken(family: string | undefined): string {
  const file = resolveFontFile(family);
  return file ? `fontfile='${escapeFilterValue(file)}'` : `font='${escapeFilterValue(family ?? 'sans')}'`;
}

/**
 * Shrinks a font size so the word never exceeds ~92% of the frame width, so the
 * larger default sizes stay legible for short words but long words auto-fit
 * instead of clipping off-screen. Only shrinks, never enlarges. Impact-like
 * glyph aspect ~0.6.
 */
function fitFontSize(fontSizePx: number, displayText: string, width: number): number {
  const glyphs = Math.max(1, displayText.replace(/\s+/g, ' ').trim().length);
  const fitted = Math.floor((width * 0.92) / (glyphs * 0.6));
  return Math.max(1, Math.min(fontSizePx, fitted));
}

/**
 * Resolves a grunge/scratch texture image used to carve the letters. Drop any
 * grayscale texture (white = keep, black = carve) at `assets/grunge-texture.png`
 * or point `TEXTURE_FILE` at one to swap the look without touching code.
 */
function resolveTextureFile(): string | undefined {
  const override = process.env.TEXTURE_FILE?.trim();
  const candidates = [
    ...(override ? [override] : []),
    resolve('assets/grunge-texture.png'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function asFfmpegColor(value: string): string {
  return /^(#[0-9a-f]{6}|0x[0-9a-f]{6})$/i.test(value) ? value : '#111827';
}

/**
 * Selects the output video encoder args. Set `VIDEO_ENCODER=nvenc` (or `GPU=1`)
 * to use the NVIDIA hardware encoder (`h264_nvenc`) instead of the CPU
 * `libx264` encoder. NVENC requires an FFmpeg build compiled with NVENC support
 * and up-to-date NVIDIA drivers; point `FFMPEG_PATH` at such a build if the
 * default one lacks it. Falls back to CPU encoding when not requested.
 */
function videoEncoderArgs(): string[] {
  const choice = (process.env.VIDEO_ENCODER ?? (process.env.GPU ? 'nvenc' : '')).trim().toLowerCase();
  if (choice === 'nvenc' || choice === 'h264_nvenc' || choice === 'gpu') {
    // p5 ~ medium; VBR with a constant-quality target keeps quality close to crf 20.
    return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '20', '-b:v', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  }
  return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
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

/**
 * Runs FFmpeg with the filtergraph read from a temp file instead of inline. The
 * per-word graph can be tens of thousands of chars, which overflows the OS
 * command-line limit (Windows throws `spawn ENAMETOOLONG`). The `-/filter_complex
 * <file>` syntax (FFmpeg 5.1+) reads the option value from a file, keeping the
 * argv small on every platform.
 */
async function runWithFilterComplex(
  binary: string,
  inputArgs: string[],
  complex: string,
  tailArgs: string[],
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'lyric-video-filter-'));
  const scriptPath = join(directory, 'filtergraph.txt');
  writeFileSync(scriptPath, complex);
  try {
    await run(binary, ['-y', ...inputArgs, '-/filter_complex', scriptPath, ...tailArgs]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
  async render(project: Project, requestedOutputPath = DEFAULT_OUTPUT, options: RenderOptions = {}): Promise<RenderResult> {
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) throw new Error('FFmpeg binary is unavailable. Reinstall dependencies with npm install, or set FFMPEG_PATH to a full FFmpeg build.');
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
    const rawDuration = Math.max(1, allLines.at(-1)?.end ?? 0, audioDuration ?? 0);
    const duration = options.maxDuration ? Math.min(rawDuration, options.maxDuration) : rawDuration;
    const y = config.style.lyricPosition === 'top' ? 'h*0.20' : config.style.lyricPosition === 'bottom' ? 'h*0.78' : 'h/2';
    const applyCase = (input: string) => {
      const mode = config.style?.textCase ?? 'original';
      if (!input) return input;
      if (mode === 'upper') return input.toUpperCase();
      if (mode === 'lower') return input.toLowerCase();
      if (mode === 'title') return input.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      return input;
    };

    // Customized path: draw each word directly with its own colour/size/effects.
    // Kept entirely separate so the default look is byte-for-byte unchanged.
    if (config.customized) {
      return this.renderCustomized({ ffmpegPath, outputPath, project, duration, hasAudio, applyCase });
    }

    const createTextFilter = (text: string, start: number, end: number, fade = false, effect?: Project['lyrics']['sections'][number]['lines'][number]['words'][number]) => {
      const cased = applyCase(text);
      const safeText = escapeFilterValue(cased);
      const formattedStart = start.toFixed(3);
      const formattedEnd = end.toFixed(3);
      const isSmog = effect?.animation?.type === 'smog-fade';
      const isSlash = effect?.animation?.type === 'slash-vibrate';
      // Auto-size so a word roughly fills the frame width without clipping (Impact-like glyph aspect ~0.6).
      const glyphs = Math.max(1, cased.replace(/\s+/g, ' ').length);
      const maxSize = Math.round(config.height / 3.6);
      const minSize = Math.round(config.height / 14);
      const fitted = Math.round((config.width * 0.86) / (glyphs * 0.62));
      const fontSize = Math.max(minSize, Math.min(maxSize, fitted));
      const alpha = fade
        ? `if(lt(t,${formattedStart}+0.35),(t-${formattedStart})/0.35,if(gt(t,${formattedEnd}-0.35),(${formattedEnd}-t)/0.35,1))`
        : isSmog
          ? `min(1,(t-${formattedStart})/0.18)`
        : `min(1,(t-${formattedStart})/0.12)`;
      const x = isSlash ? `(w-text_w)/2+${Math.round((effect.animation?.intensity ?? 0.8) * 12)}*sin(95*t)` : '(w-text_w)/2';
      const wordY = isSmog ? `${y}-text_h/2+${Math.round((effect?.animation?.intensity ?? 0.7) * 18)}*sin(3*t)` : `${y}-text_h/2`;
      const font = fontToken(effect?.fontFamily ?? config.style.fontFamily);
      // White glyphs only: the drop shadow and carved grunge texture are composited later.
      return `drawtext=text='${safeText}':${font}:fontcolor=white:fontsize=${fontSize}:x=${x}:y=${wordY}:alpha='${alpha}':enable='between(t,${formattedStart},${formattedEnd})'`;
    };
    const filters = allLines.flatMap((line) => {
      if (config.lyricAnimation.type === 'word-by-word' && line.words.length > 0) {
        return line.words.map((word, index) => {
          const end = wordDisplay.hold === 'next-word'
            ? line.words[index + 1]?.start ?? line.end
            : word.end;
          const rawText = wordDisplay.mode === 'single-word'
            ? word.text
            : line.words.slice(0, index + 1).map((item) => item.text).join(' ');
          const text = applyCase(rawText);
          return createTextFilter(
          text,
          word.start,
          Math.max(word.start + 0.01, end),
          false,
          word,
          );
        });
      }
      const cased = applyCase(line.text);
      const safeText = escapeFilterValue(cased);
      const start = line.start.toFixed(3);
      const end = line.end.toFixed(3);
      const alpha = config.lyricAnimation.type === 'fade'
        ? `if(lt(t,${start}+0.35),(t-${start})/0.35,if(gt(t,${end}-0.35),(${end}-t)/0.35,1))`
        : '1';
      const font = fontToken(config.style.fontFamily);
      return `drawtext=text='${safeText}':${font}:fontcolor=white:fontsize=h/12:x=(w-text_w)/2:y=${y}-text_h/2:alpha='${alpha}':enable='between(t,${start},${end})'`;
    });

    const palette = background.palette.slice(0, 8).map(asFfmpegColor);
    while (palette.length < 2) palette.push('0x111827');
    const gradientInput = [
      `gradients=s=${config.width}x${config.height}:r=${config.fps}`,
      ...palette.map((color, index) => `c${index}=${color}`),
      `n=${palette.length}:t=${gradientType(background.gradientType)}:speed=${background.motionSpeed}:seed=104729`,
    ].join(':');
    const W = config.width;
    const H = config.height;
    const fps = config.fps;
    const size = `${W}x${H}`;
    const vignetteAngle = Math.max(1, Math.round(10 - background.vignette * 8));
    const backgroundFilters = [
      `noise=alls=${Math.max(0, Math.round(background.grain))}:allf=t+u`,
      ...(background.showFrame ? ['drawbox=x=54:y=54:w=iw-108:h=ih-108:color=white@0.10:t=2'] : []),
    ];
    // Amount of grit for the generated fallback texture; scales with grain.
    const grungeAmount = Math.min(90, Math.max(40, Math.round(background.grain * 12)));
    // Low-res, vertically-stretched STATIC noise reads as chunky scratches after
    // upscaling. `allf=u` (no `t`) keeps it fixed so the scratches don't crawl.
    const grungeW = Math.max(2, Math.round(W / 2));
    const grungeH = Math.max(2, Math.round(H / 14));
    // Prefer a real grunge/scratch image (assets/grunge-texture.png or
    // $TEXTURE_FILE); it is static and trivial to swap. Otherwise generate noise.
    const textureFile = resolveTextureFile();
    // Assemble inputs, tracking stream indices as optional inputs are added.
    const inputArgs: string[] = ['-f', 'lavfi', '-i', gradientInput];
    let nextInput = 1;
    let textureIndex: number | undefined;
    if (textureFile) {
      inputArgs.push('-loop', '1', '-i', textureFile);
      textureIndex = nextInput++;
    }
    let audioIndex: number | undefined;
    if (hasAudio) {
      inputArgs.push('-stream_loop', '-1', '-i', project.audioPath);
      audioIndex = nextInput++;
    }
    const grungeNode = textureIndex !== undefined
      ? `[${textureIndex}:v]scale=${W}:${H},fps=${fps},format=gray,eq=contrast=1.25:brightness=0.04[grunge]`
      : `color=c=gray:s=${grungeW}x${grungeH}:r=${fps},noise=alls=${grungeAmount}:allf=u:all_seed=8675309,scale=${W}:${H}:flags=bilinear,eq=contrast=9:brightness=0.30,gblur=sigma=0.6,format=gray[grunge]`;
    // Final letter colour (white on dark surfaces, dark on light surfaces). The
    // drawtext mask is always white; this fill colour is what the viewer sees.
    const fillColor = asFfmpegColor(config.style.primaryColor).replace(/^#/, '0x');
    // Composite pipeline. Texture only lightly distresses the glyphs (mixed back
    // with the clean mask) so a busy texture reads as wear, not static. The look
    // is carried by the grade: bloom glow, cold desaturation, vignette, a touch
    // of chromatic aberration, and a slow push-in for energy.
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const viz = audioIndex !== undefined ? resolveMusicViz(config.musicViz) : undefined;
    const finalVideoLabel = viz ? 'basev' : 'outv';
    const complexParts = [
      `[0:v]${backgroundFilters.join(',')}[bg]`,
      `color=c=black:s=${size}:r=${fps},${[...filters, 'format=gray'].join(',')},split=3[txtA][txtB][txtC]`,
      grungeNode,
      `[txtA][grunge]blend=all_mode=multiply[eroded0]`,
      `[eroded0][txtC]blend=all_mode=normal:all_opacity=0.4[eroded]`,
      `[txtB]boxblur=12:1,format=gray[shadowmask]`,
      `color=c=${fillColor}:s=${size}:r=${fps},format=rgba[fill]`,
      `[fill][eroded]alphamerge[textrgba]`,
      `color=c=black:s=${size}:r=${fps},format=rgba[shadowfill]`,
      `[shadowfill][shadowmask]alphamerge[shadowrgba]`,
      `[bg][shadowrgba]overlay=x=6:y=14:shortest=1[bgs]`,
      `[bgs][textrgba]overlay=shortest=1[comp]`,
      `[comp]split[cbase][cbloom]`,
      `[cbloom]hue=s=0,curves=m='0/0 0.62/0 0.8/0.45 1/1',gblur=sigma=16[bloom]`,
      `[cbase][bloom]blend=all_mode=screen:all_opacity=0.38[lit]`,
      `[lit]colorbalance=rs=-0.03:bs=0.05:bm=0.02,eq=contrast=1.18:saturation=0.55:gamma=0.95,vignette=PI/${vignetteAngle},rgbashift=rh=2:bh=-2[graded]`,
      `[graded]zoompan=z='min(1.0+0.06*on/${totalFrames},1.06)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}[${finalVideoLabel}]`,
    ];
    let audioMap: string[] = audioIndex !== undefined ? ['-map', `${audioIndex}:a:0`] : [];
    if (viz && audioIndex !== undefined) {
      const vizNodes = buildMusicVizNodes({ audioInputIndex: audioIndex, width: W, height: H, fps, viz, baseLabel: 'basev', outLabel: 'outv' });
      complexParts.push(...vizNodes.nodes);
      audioMap = ['-map', `[${vizNodes.audioOutLabel}]`];
    }
    const complex = complexParts.join(';');
    await runWithFilterComplex(ffmpegPath, inputArgs, complex, [
      '-map', '[outv]',
      ...(audioIndex !== undefined ? [...audioMap, '-c:a', 'aac', '-b:a', '192k'] : []),
      '-t', String(duration),
      ...videoEncoderArgs(), outputPath,
    ]);

    if (!existsSync(outputPath)) throw new Error('FFmpeg reported success but no output file was created.');
    // Write a copy of the project with applied casing so metadata reflects the rendered text
    const projectForOutput: Project = JSON.parse(JSON.stringify(project));
    for (const section of projectForOutput.lyrics.sections) {
      for (const line of section.lines) {
        line.text = applyCase(line.text);
        for (const word of line.words ?? []) {
          word.text = applyCase(word.text);
        }
      }
    }
    writeFileSync(`${outputPath}.json`, JSON.stringify({ project: projectForOutput, outputPath, duration }, null, 2));
    return { outputPath, format: 'mp4', duration };
  }

  /**
   * Customized render path. Each word is drawn directly with its own resolved
   * colour, size, position, stroke, shadow and animation, so per-word styling is
   * preserved. Texture is applied as a light global overlay and the cinematic
   * grade is driven by the resolved effects.
   */
  private async renderCustomized(params: {
    ffmpegPath: string;
    outputPath: string;
    project: Project;
    duration: number;
    hasAudio: boolean;
    applyCase: (input: string) => string;
  }): Promise<RenderResult> {
    const { ffmpegPath, outputPath, project, duration, hasAudio, applyCase } = params;
    const config = project.renderConfig;
    const W = config.width;
    const H = config.height;
    const fps = config.fps;
    const size = `${W}x${H}`;
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const bg = config.customBackground ?? {
      kind: 'gradient' as const, color: '#000000', gradient: config.style.background.palette,
      blur: 0, vignette: config.style.background.vignette, grain: 0.2, overlayOpacity: 0,
    };
    const effects = config.effects ?? DEFAULT_EFFECTS;

    // --- inputs (index-tracked) ---
    const inputArgs: string[] = [];
    let nextInput = 0;
    if (bg.kind === 'image' && bg.imagePath) {
      inputArgs.push('-loop', '1', '-i', bg.imagePath);
    } else if (bg.kind === 'video' && bg.videoPath) {
      inputArgs.push('-stream_loop', '-1', '-i', bg.videoPath);
    } else if (bg.kind === 'solid') {
      inputArgs.push('-f', 'lavfi', '-i', `color=c=${colorToFfmpeg(bg.color)}:s=${size}:r=${fps}`);
    } else {
      const palette = (bg.gradient && bg.gradient.length > 0 ? bg.gradient : [bg.color]).slice(0, 8).map(colorToFfmpeg);
      while (palette.length < 2) palette.push(colorToFfmpeg(bg.color));
      const gradientInput = [
        `gradients=s=${size}:r=${fps}`,
        ...palette.map((color, index) => `c${index}=${color}`),
        `n=${palette.length}:t=${gradientType(config.style.background.gradientType)}:speed=${config.style.background.motionSpeed}:seed=104729`,
      ].join(':');
      inputArgs.push('-f', 'lavfi', '-i', gradientInput);
    }
    const bgIndex = nextInput++;

    const textureFile = resolveTextureFile();
    let textureIndex: number | undefined;
    if (textureFile) {
      inputArgs.push('-loop', '1', '-i', textureFile);
      textureIndex = nextInput++;
    }
    let audioIndex: number | undefined;
    if (hasAudio) {
      inputArgs.push('-stream_loop', '-1', '-i', project.audioPath);
      audioIndex = nextInput++;
    }
    const viz = audioIndex !== undefined ? resolveMusicViz(config.musicViz) : undefined;

    // --- background node ---
    // Grain is intentionally NOT applied here; it is added once over the whole
    // graded frame in buildGradeChain so it sits on the text too (a unified
    // film-grain layer rather than grain only behind the letters).
    const bgParts = [`scale=${W}:${H}`, 'setsar=1'];
    if (bg.blur > 0) bgParts.push(`gblur=sigma=${(bg.blur * 10).toFixed(2)}`);
    if (bg.overlayColor && bg.overlayOpacity > 0) {
      bgParts.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${colorToFfmpeg(bg.overlayColor)}@${bg.overlayOpacity.toFixed(3)}:t=fill`);
    }
    bgParts.push('format=yuv420p');
    const nodes: string[] = [`[${bgIndex}:v]${bgParts.join(',')}[bg]`];

    // --- per-word drawtext ---
    const wordDisplay = config.wordDisplay ?? { mode: 'single-word' as const, hold: 'word-end' as const };
    const allLines = project.lyrics.sections.flatMap((section) => section.lines);
    const fallbackRender = (): ResolvedWordRender => ({
      fontFamily: config.style.fontFamily, fontSizePx: Math.round(H / 11), color: config.style.primaryColor,
      opacity: 1, xNorm: 0.5, yNorm: 0.5,
      animation: { motion: 'fade', inDuration: 0.3, translatePx: 0, overshoot: 0, shakePx: 0, shakeHz: 0, glitch: false, opacityMul: 1 },
    });
    const draws: string[] = [];
    for (const line of allLines) {
      if (config.lyricAnimation.type === 'word-by-word' && line.words.length > 0) {
        line.words.forEach((word, index) => {
          const end = wordDisplay.hold === 'next-word' ? line.words[index + 1]?.start ?? line.end : word.end;
          const rawText = wordDisplay.mode === 'single-word'
            ? word.text
            : line.words.slice(0, index + 1).map((item) => item.text).join(' ');
          draws.push(this.drawWord(word, applyCase(rawText), word.start, Math.max(word.start + 0.01, end), W, H, fallbackRender));
        });
      } else {
        const synthetic: Word = { text: line.text, start: line.start, end: line.end, render: fallbackRender() };
        draws.push(this.drawWord(synthetic, applyCase(line.text), line.start, Math.max(line.start + 0.01, line.end), W, H, fallbackRender));
      }
    }

    let preGrade = 'bg';
    if (draws.length > 0) {
      nodes.push(`[bg]${draws.join(',')}[drawn]`);
      preGrade = 'drawn';
    }
    if (textureIndex !== undefined) {
      nodes.push(`[${textureIndex}:v]scale=${W}:${H},format=gray,eq=contrast=1.2:brightness=0.05,format=yuv420p[tex]`);
      nodes.push(`[${preGrade}][tex]blend=all_mode=softlight:all_opacity=0.12[textured]`);
      preGrade = 'textured';
    }
    nodes.push(...buildGradeChain(effects, preGrade, size, fps, totalFrames, viz ? 'basev' : 'outv'));

    let audioMap: string[] = audioIndex !== undefined ? ['-map', `${audioIndex}:a:0`] : [];
    if (viz && audioIndex !== undefined) {
      const vizNodes = buildMusicVizNodes({ audioInputIndex: audioIndex, width: W, height: H, fps, viz, baseLabel: 'basev', outLabel: 'outv' });
      nodes.push(...vizNodes.nodes);
      audioMap = ['-map', `[${vizNodes.audioOutLabel}]`];
    }

    const complex = nodes.join(';');
    await runWithFilterComplex(ffmpegPath, inputArgs, complex, [
      '-map', '[outv]',
      ...(audioIndex !== undefined ? [...audioMap, '-c:a', 'aac', '-b:a', '192k'] : []),
      '-t', String(duration),
      ...videoEncoderArgs(), outputPath,
    ]);
    if (!existsSync(outputPath)) throw new Error('FFmpeg reported success but no output file was created.');

    const projectForOutput: Project = JSON.parse(JSON.stringify(project));
    for (const section of projectForOutput.lyrics.sections) {
      for (const line of section.lines) {
        line.text = applyCase(line.text);
        for (const word of line.words ?? []) word.text = applyCase(word.text);
      }
    }
    writeFileSync(`${outputPath}.json`, JSON.stringify({ project: projectForOutput, outputPath, duration }, null, 2));
    return { outputPath, format: 'mp4', duration };
  }

  private drawWord(
    word: Word,
    displayText: string,
    start: number,
    end: number,
    W: number,
    H: number,
    fallback: () => ResolvedWordRender,
  ): string {
    const r = word.render ?? fallback();
    const fontSizePx = fitFontSize(r.fontSizePx, displayText, W);
    if (r.animation.motion === 'typewriter' && displayText.length > 1) {
      return this.drawTypewriter(r, displayText, start, end, W, H, fontSizePx);
    }
    return buildWordDrawText({
      safeText: escapeFilterValue(displayText),
      fontToken: fontToken(r.fontFamily),
      fontColor: colorToFfmpeg(r.color),
      fontSizePx,
      start,
      end,
      width: W,
      height: H,
      xNorm: r.xNorm,
      yNorm: r.yNorm,
      opacity: r.opacity,
      animation: r.animation,
      stroke: r.stroke,
      shadow: r.shadow,
    });
  }

  /** Reveals the word one letter at a time (real typewriter), left-anchored. */
  private drawTypewriter(r: ResolvedWordRender, displayText: string, start: number, end: number, W: number, H: number, fontSizePx = r.fontSizePx): string {
    const chars = [...displayText];
    const n = chars.length;
    const interval = Math.min(0.07, Math.max(0.03, ((end - start) * 0.7) / n));
    // Fixed left edge so letters extend rightward from a stable origin.
    const fullWidth = fontSizePx * 0.6 * n;
    const left = (W * r.xNorm - fullWidth / 2).toFixed(1);
    const y = `(h*${r.yNorm.toFixed(4)}-text_h/2)`;
    const border = r.stroke ? `:borderw=${r.stroke.width}:bordercolor=${colorToFfmpeg(r.stroke.color)}` : '';
    const shadow = r.shadow
      ? `:shadowx=${r.shadow.dx}:shadowy=${r.shadow.dy}:shadowcolor=${colorToFfmpeg(r.shadow.color)}@${r.shadow.alpha.toFixed(2)}`
      : '';
    const token = fontToken(r.fontFamily);
    const color = colorToFfmpeg(r.color);
    const alpha = r.opacity.toFixed(3);
    const draws: string[] = [];
    for (let k = 1; k <= n; k += 1) {
      const tStart = (start + (k - 1) * interval).toFixed(3);
      const tEnd = (k < n ? start + k * interval : end).toFixed(3);
      const prefix = escapeFilterValue(chars.slice(0, k).join(''));
      draws.push(
        `drawtext=text='${prefix}':${token}:fontcolor=${color}:fontsize=${fontSizePx}` +
        `:x='${left}':y='${y}':alpha='${alpha}'${border}${shadow}:enable='between(t,${tStart},${tEnd})'`,
      );
    }
    return draws.join(',');
  }
}
