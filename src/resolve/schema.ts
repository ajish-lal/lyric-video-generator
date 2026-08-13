/**
 * DaVinci Resolve export schema (the "*.resolve.json" intermediate).
 *
 * This is the contract between the TypeScript exporter (which resolves the
 * config and bakes per-frame animation) and the Python importer that runs
 * inside DaVinci Resolve to build a timeline of animated Text+ titles.
 *
 * Coordinates are already in Resolve's convention:
 *   - `cx`/`cy` are normalized Center values (0..1), origin bottom-left, y-up.
 *   - `size` is a scale multiplier (1 = the word's base font size).
 *   - `blend` is opacity in 0..1.
 *   - `blur` is an optional 0..1 softness amount (used by blur-in).
 * Frame numbers are relative to each word's own clip start (comp-local).
 */

/** One baked animation sample for a single frame of a word's clip. */
export interface ResolveKeyframe {
  /** Comp-local frame index (0 = clip start). */
  f: number;
  /** Normalized Center X (0 left .. 1 right). */
  cx: number;
  /** Normalized Center Y (0 bottom .. 1 top). */
  cy: number;
  /** Scale multiplier relative to the base font size. */
  size: number;
  /** Opacity 0..1. */
  blend: number;
  /** Optional softness 0..1 (blur-in). Omitted when zero for the whole word. */
  blur?: number;
}

/** A single on-screen word with its style and baked animation track. */
export interface ResolveWord {
  text: string;
  /** Absolute timeline frame where the word appears. */
  startFrame: number;
  /** Absolute timeline frame where the word ends (exclusive). */
  endFrame: number;
  /** Clip length in frames (endFrame - startFrame). */
  durFrames: number;
  /** Font family name (e.g. "Impact"). */
  font: string;
  /** Base font size in pixels at the export resolution. */
  sizePx: number;
  /** Fill color as #rrggbb. */
  colorHex: string;
  /** Section type this word belongs to (verse, chorus, rap, ...). */
  sectionType: string;
  /** Per-frame baked animation samples. */
  keys: ResolveKeyframe[];
}

/** Top-level export consumed by scripts/resolve/resolve_import.py. */
export interface ResolveExport {
  /** Schema version so the importer can guard against mismatches. */
  version: 1;
  title: string;
  fps: number;
  width: number;
  height: number;
  words: ResolveWord[];
}
