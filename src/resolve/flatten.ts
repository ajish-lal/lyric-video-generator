/**
 * Flattens a fully-resolved {@link Project} into the {@link ResolveExport}
 * intermediate: one entry per on-screen word with a baked, per-frame animation
 * track in Resolve coordinates.
 */

import type { Project } from '../core/models/project.js';
import { sampleAnimation } from './animation-sampler.js';
import type { ResolveExport, ResolveKeyframe, ResolveWord } from './schema.js';

/** Normalize a resolved color (`#rrggbb`, `0xrrggbb`, `rrggbb`) to `#rrggbb`. */
function normalizeHex(color: string): string {
  let c = color.trim().toLowerCase();
  if (c.startsWith('#')) c = c.slice(1);
  else if (c.startsWith('0x')) c = c.slice(2);
  if (/^[0-9a-f]{6}$/.test(c)) return `#${c}`;
  if (/^[0-9a-f]{3}$/.test(c)) return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  return '#ffffff';
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Bake a single word's per-frame animation samples into Resolve keyframes.
 * `f` is comp-local (0 = clip start). Positions are converted from FFmpeg's
 * top-left / y-down pixel space to Resolve's normalized / y-up Center space.
 */
function bakeKeys(
  word: NonNullable<Project['lyrics']['sections'][number]['lines'][number]['words'][number]>,
  fps: number,
  width: number,
  height: number,
  durFrames: number,
): ResolveKeyframe[] {
  const render = word.render!;
  const startSec = word.start;
  const durationSec = Math.max(1 / fps, word.end - word.start);
  const keys: ResolveKeyframe[] = [];

  for (let f = 0; f <= durFrames; f += 1) {
    const tRel = f / fps;
    const s = sampleAnimation(render.animation, tRel, durationSec, render.opacity, startSec + tRel);
    const cx = render.xNorm + s.dxPx / width;
    const cy = 1 - render.yNorm - s.dyPx / height;
    const key: ResolveKeyframe = {
      f,
      cx: round(cx, 5),
      cy: round(cy, 5),
      size: round(s.scale, 4),
      blend: round(s.alpha, 4),
    };
    if (s.blur > 0.0001) key.blur = round(s.blur, 4);
    keys.push(key);
  }
  return keys;
}

/** Convert a resolved project into the Resolve export structure. */
export function flattenProjectToResolve(project: Project): ResolveExport {
  const { width, height, fps } = project.renderConfig;
  const words: ResolveWord[] = [];

  for (const section of project.lyrics.sections) {
    for (const line of section.lines) {
      for (const word of line.words) {
        if (!word.render || !word.text.trim()) continue;
        const startFrame = Math.round(word.start * fps);
        const endFrame = Math.round(word.end * fps);
        const durFrames = Math.max(1, endFrame - startFrame);
        words.push({
          text: word.text,
          startFrame,
          endFrame,
          durFrames,
          font: word.render.fontFamily,
          sizePx: Math.round(word.render.fontSizePx),
          colorHex: normalizeHex(word.render.color),
          sectionType: section.type,
          keys: bakeKeys(word, fps, width, height, durFrames),
        });
      }
    }
  }

  return {
    version: 1,
    title: project.lyrics.song ?? project.title ?? 'lyric-video',
    fps,
    width,
    height,
    words,
  };
}
