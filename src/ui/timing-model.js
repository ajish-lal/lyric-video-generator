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

/** Overlap / ordering warnings so the user can spot messy edits before saving. */
export function computeWarnings(units) {
  const warnings = [];
  const sorted = [...units].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].end <= sorted[i].start) warnings.push(`"${sorted[i].text}" has end ≤ start.`);
    if (i > 0 && sorted[i].start < sorted[i - 1].end - 1e-6) {
      warnings.push(`"${sorted[i].text}" overlaps "${sorted[i - 1].text}".`);
    }
  }
  return warnings;
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
