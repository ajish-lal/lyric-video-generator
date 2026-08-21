// Pure, framework-free helpers for the timing editor: flattening a config into
// editable units, writing edits back, and keeping timings non-overlapping.

export const MIN_DURATION = 0.05;
export const MAX_FONT = 2000;
export const REGION_COLORS = ['rgba(37,99,235,0.28)', 'rgba(124,58,237,0.28)'];

/** Round to millisecond precision for clean, re-editable JSON. */
export const round = (value) => Math.round(value * 1000) / 1000;

export const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00.000';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

/** Short `m:ss` clock (no milliseconds), for compact export-range display. */
export const formatClock = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Parse a time entered as `mm:ss(.ms)`, `hh:mm:ss`, or plain seconds into a
 * number of seconds. Returns null when the input is blank or unparseable.
 */
export const parseTimeInput = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.includes(':')) {
    const parts = text.split(':').map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
};

// Colour/opacity contributions of the built-in presets, mirrored from the TS
// presets so the preview shows the same colours the renderer resolves.
const EMPHASIS_STYLE = {
  subtle: { opacity: 0.85 },
  scream: { color: '#ff304f' },
  whisper: { opacity: 0.55 },
  anger: { color: '#ff2530' },
  cold: { color: '#9fdcff' },
  corrupted: { color: '#c8ffd0' },
};
const TREATMENT_STYLE = {
  corrupted: { color: '#c8ffd0' },
  ghost: { opacity: 0.5 },
};
const SECTION_STYLE = {
  nu_metal_verse: { color: '#e9edf2' },
  pre_chorus: { color: '#dbe2ea' },
  rap_section: { color: '#e9edf2' },
  heavy_chorus: { color: '#ffffff' },
  scream_section: { color: '#ff304f' },
  breakdown: { color: '#ffffff' },
  dark_bridge: { color: '#aab4c2' },
  dreamy_bridge: { color: '#d8f7ff' },
  final_chorus: { color: '#ffffff' },
};

/** Pull colour/opacity out of one style layer, expanding emphasis/treatment. */
function styleColorLayer(style) {
  if (style == null) return {};
  const s = typeof style === 'string' ? { emphasis: style } : style;
  const out = {};
  const emp = s.emphasis && EMPHASIS_STYLE[String(s.emphasis).toLowerCase()];
  if (emp) Object.assign(out, emp);
  const treat = s.treatment && TREATMENT_STYLE[String(s.treatment).toLowerCase()];
  if (treat) Object.assign(out, treat);
  if (s.color != null) out.color = s.color;
  if (s.opacity != null) out.opacity = s.opacity;
  return out;
}

/** Section style layer = preset colour + explicit overrides. */
function sectionColorLayer(style) {
  if (!style) return {};
  const preset = style.preset ? SECTION_STYLE[style.preset] : null;
  return { ...(preset || {}), ...styleColorLayer(style) };
}

function matchWordStyle(wordStyles, text) {
  if (!wordStyles || text == null) return undefined;
  const key = String(text).trim().toLowerCase();
  for (const [name, style] of Object.entries(wordStyles)) {
    if (String(name).trim().toLowerCase() === key) return style;
  }
  return undefined;
}

/**
 * Resolve the colour + opacity a unit will actually render with, layering
 * global typography → section preset/style → line style → wordStyles map →
 * word style (later wins), matching the renderer's resolver closely enough for
 * an accurate preview.
 */
export function resolveUnitStyle(config, unit) {
  let color;
  let opacity;
  const apply = (layer) => {
    const ex = styleColorLayer(layer);
    if (ex.color != null) color = ex.color;
    if (ex.opacity != null) opacity = ex.opacity;
  };
  apply(config.typography);
  const line = unit.si == null ? config.lines?.[unit.li] : config.sections?.[unit.si]?.lines?.[unit.li];
  if (unit.si != null) {
    const sec = config.sections?.[unit.si];
    if (sec?.style) apply(sectionColorLayer(sec.style));
  }
  if (line?.style) apply(line.style);
  if (unit.wi != null) {
    const word = line?.words?.[unit.wi];
    if (word) {
      const mapStyle = matchWordStyle(config.wordStyles, word.text);
      if (mapStyle) apply(mapStyle);
      if (word.style) apply(word.style);
    }
  }
  return { color, opacity: opacity ?? 1 };
}

/**
 * Compute each unit's on-screen [start,end] window, mirroring the renderer:
 * single-word mode gives every word an exclusive slot (cascading overlaps) and
 * floors the window to ~1.5 frames plus `minWordDuration`; cumulative stays in
 * sync with the audio.
 */
export function computeDisplayWindows(units, opts = {}) {
  const { hold = 'next-word', minWordDuration = 0, mode = 'single-word', fps = 30 } = opts;
  const frameFloor = 1.5 / Math.max(1, fps);
  const min = Math.max(0, minWordDuration || 0);
  const byLine = new Map();
  for (const u of units) {
    const key = `${u.si}:${u.li}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(u);
  }
  const windows = new Map();
  for (const group of byLine.values()) {
    const ws = [...group].sort((a, b) => a.start - b.start);
    const lineEnd = ws.length ? ws[ws.length - 1].end : 0;
    let prevEnd = -Infinity;
    ws.forEach((u, i) => {
      const naturalEnd = hold === 'next-word' ? ws[i + 1]?.start ?? lineEnd : u.end;
      const start = mode === 'single-word' ? Math.max(u.start, prevEnd) : u.start;
      const end = Math.max(start + 0.01, naturalEnd, start + frameFloor, start + min);
      if (mode === 'single-word') prevEnd = end;
      windows.set(u.id, { start, end });
    });
  }
  return windows;
}

/**
 * Smoothstep fade opacity at time `t` for a display window, matching the
 * renderer's in/out ramp. `fadeIn`/`fadeOut` are seconds; both are capped to
 * the window so short words still reach full brightness.
 */
export function fadeOpacityAt(t, win, fadeIn = 0.12, fadeOut) {
  if (!win || t < win.start || t > win.end) return 0;
  const dur = Math.max(0.05, win.end - win.start);
  const fi = Math.max(0.001, Math.min(fadeIn ?? 0.12, dur * 0.9));
  const fo = Math.max(0.001, Math.min(fadeOut ?? fi, dur * 0.9));
  const ramp = Math.max(0, Math.min((t - win.start) / fi, (win.end - t) / fo, 1));
  return ramp * ramp * (3 - 2 * ramp);
}

/**
 * Flatten a ProjectConfig into an ordered list of timed units. Words are
 * preferred; a line with no timed words becomes a single unit. Each unit keeps
 * the path (section/line/word index) so edits can be written back on save.
 */
export function flattenUnits(config) {
  const units = [];
  let id = 0;
  const pushFromLines = (lines, si) => {
    (lines || []).forEach((line, li) => {
      const words = Array.isArray(line.words) ? line.words : [];
      const timedWords = words.filter((w) => typeof w.start === 'number' && typeof w.end === 'number');
      if (timedWords.length > 0) {
        words.forEach((w, wi) => {
          if (typeof w.start === 'number' && typeof w.end === 'number') {
            units.push({ id: id++, si, li, wi, level: 'word', text: w.text ?? '', start: w.start, end: w.end, fontSize: w.style?.fontSize ?? w.fontSize, color: w.style?.color ?? w.color });
          }
        });
      } else if (typeof line.start === 'number' && typeof line.end === 'number') {
        units.push({ id: id++, si, li, wi: null, level: 'line', text: line.text ?? '', start: line.start, end: line.end, fontSize: line.style?.fontSize, color: line.style?.color });
      }
    });
  };
  (config.sections || []).forEach((sec, si) => pushFromLines(sec.lines, si));
  pushFromLines(config.lines, null); // top-level inline lines (si === null)
  units.sort((a, b) => a.start - b.start);
  return units;
}

/** Locate the underlying word/line object a unit points at inside a config. */
export function targetFor(config, unit) {
  const line = unit.si === null ? config.lines?.[unit.li] : config.sections?.[unit.si]?.lines?.[unit.li];
  if (!line) return null;
  return unit.wi === null ? line : line.words?.[unit.wi] ?? null;
}

/**
 * Write unit timings back into a deep-cloned config and re-derive line and
 * section spans from their children so the file stays internally consistent.
 */
export function applyUnitsToConfig(config, units) {
  const next = JSON.parse(JSON.stringify(config));
  for (const unit of units) {
    const target = targetFor(next, unit);
    if (target) {
      target.start = round(unit.start);
      target.end = round(Math.max(unit.end, unit.start + MIN_DURATION));
      if (typeof unit.text === 'string') target.text = unit.text;
      const style = { ...(target.style || {}) };
      if (unit.fontSize != null) style.fontSize = unit.fontSize; else delete style.fontSize;
      if (unit.color != null) style.color = unit.color; else delete style.color;
      if (Object.keys(style).length > 0) target.style = style; else delete target.style;
    }
  }
  const spanFrom = (children) => {
    const timed = children.filter((c) => typeof c.start === 'number' && typeof c.end === 'number');
    if (timed.length === 0) return null;
    return { start: round(Math.min(...timed.map((c) => c.start))), end: round(Math.max(...timed.map((c) => c.end))) };
  };
  const reflowLines = (lines) => (lines || []).forEach((line) => {
    if (Array.isArray(line.words) && line.words.length > 0) {
      const span = spanFrom(line.words);
      if (span) { line.start = span.start; line.end = span.end; }
    }
  });
  (next.sections || []).forEach((sec) => {
    reflowLines(sec.lines);
    if (Array.isArray(sec.lines) && sec.lines.length > 0) {
      const span = spanFrom(sec.lines);
      if (span) { sec.start = span.start; sec.end = span.end; }
    }
  });
  reflowLines(next.lines);
  return next;
}

/**
 * Overlap / ordering warnings so the user can spot messy edits before saving.
 * Each warning references the offending unit (`id`) and, for overlaps, the
 * earlier neighbour (`otherId`) so the UI can select and auto-resolve it.
 */
export function computeWarnings(units) {
  const warnings = [];
  const sorted = [...units].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].end <= sorted[i].start) {
      warnings.push({ id: sorted[i].id, kind: 'reversed', message: `"${sorted[i].text}" has end ≤ start.` });
    }
    if (i > 0 && sorted[i].start < sorted[i - 1].end - 1e-6) {
      warnings.push({
        id: sorted[i].id,
        otherId: sorted[i - 1].id,
        kind: 'overlap',
        message: `"${sorted[i].text}" overlaps "${sorted[i - 1].text}".`,
      });
    }
  }
  return warnings;
}

/**
 * Resolve a single warning, returning updated units. A reversed clip gets a
 * minimum-length window; an overlap trims the earlier clip to end where the
 * later one starts (pushing the later clip only when there is no room).
 */
export function resolveWarning(units, warning) {
  const arr = units.map((u) => ({ ...u }));
  const cur = arr.find((u) => u.id === warning.id);
  if (!cur) return arr;
  if (warning.kind === 'reversed') {
    cur.end = round(cur.start + MIN_DURATION);
    return arr;
  }
  const prev = arr.find((u) => u.id === warning.otherId);
  if (!prev) return arr;
  if (cur.start - prev.start >= MIN_DURATION) {
    prev.end = round(cur.start);
  } else {
    prev.end = round(prev.start + MIN_DURATION);
    cur.start = round(prev.end);
    if (cur.end - cur.start < MIN_DURATION) cur.end = round(cur.start + MIN_DURATION);
  }
  return arr;
}

/**
 * Guarantee no two units overlap after a unit is moved/resized. `mode` decides
 * how neighbours react:
 *  - 'none'   : clamp the moved unit to sit between its neighbours.
 *  - 'resize' : trim the adjacent units' edges to meet the moved unit.
 *  - 'push'   : slide neighbours out of the way, cascading as needed.
 */
export function enforceNoOverlap(units, movedId, mode) {
  const arr = units.map((u) => ({ ...u }));
  const order = [...arr].sort((a, b) => a.start - b.start);
  const pos = order.findIndex((u) => u.id === movedId);
  if (pos === -1) return arr;
  const moved = order[pos];
  const prev = order[pos - 1];
  const next = order[pos + 1];

  if (moved.end - moved.start < MIN_DURATION) moved.end = moved.start + MIN_DURATION;

  if (mode === 'resize') {
    if (prev && moved.start < prev.end) prev.end = Math.max(prev.start + MIN_DURATION, moved.start);
    if (next && moved.end > next.start) next.start = Math.min(next.end - MIN_DURATION, moved.end);
  } else if (mode === 'push') {
    for (let i = pos - 1; i >= 0; i -= 1) {
      const cur = order[i];
      const right = order[i + 1];
      if (cur.end > right.start) {
        const d = cur.end - right.start;
        cur.start -= d;
        cur.end -= d;
      }
    }
    for (let i = pos + 1; i < order.length; i += 1) {
      const cur = order[i];
      const left = order[i - 1];
      if (cur.start < left.end) {
        const d = left.end - cur.start;
        cur.start += d;
        cur.end += d;
      }
    }
  } else {
    if (prev && moved.start < prev.end) moved.start = prev.end;
    if (next && moved.end > next.start) moved.end = next.start;
    if (moved.end - moved.start < MIN_DURATION) moved.end = moved.start + MIN_DURATION;
  }

  return arr.map((u) => ({ ...u, start: round(Math.max(0, u.start)), end: round(u.end) }));
}
