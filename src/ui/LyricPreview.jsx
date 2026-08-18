import React, { useEffect, useMemo, useRef, useState } from 'react';

// Font sizes in the config are authored at this reference height (see style-resolver).
const REFERENCE_HEIGHT = 1080;
const DEFAULT_FONT_PX = 160;

/** Pull style + resolution hints out of the loaded song config, with fallbacks. */
function readStyle(config) {
  const theme = config?.theme === 'white' ? 'white' : 'dark';
  return {
    theme,
    width: config?.resolution?.width || 1920,
    height: config?.resolution?.height || 1080,
    bg: theme === 'white' ? '#f4f4f5' : '#0b0f19',
    text: config?.typography?.color || (theme === 'white' ? '#18181b' : '#f4f4f5'),
    font: config?.typography?.font || 'Impact, Haettenschweiler, sans-serif',
    animation: config?.typography?.animation || 'fade',
    baseFontPx: config?.typography?.fontSize || DEFAULT_FONT_PX,
    mode: config?.wordDisplay?.mode === 'cumulative' ? 'cumulative' : 'single-word',
  };
}

/** Group flattened units back into lines so the preview shows word-in-line context. */
function groupLines(units) {
  const map = new Map();
  for (const u of units) {
    const key = `${u.si}:${u.li}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(u);
  }
  return [...map.values()].map((words) => {
    const sorted = [...words].sort((a, b) => a.start - b.start);
    return { start: sorted[0].start, end: sorted[sorted.length - 1].end, words: sorted };
  });
}

/**
 * Lightweight, non-authoritative preview of the lyric video. It mirrors the
 * audio clock so you can eyeball timing while listening; it is not a
 * pixel-accurate copy of the FFmpeg export.
 */
export default function LyricPreview({ units, currentTime, config }) {
  const style = useMemo(() => readStyle(config), [config]);
  const lines = useMemo(() => groupLines(units), [units]);

  const stageRef = useRef(null);
  const [stageHeight, setStageHeight] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      // Defer + only commit real changes to avoid a resize/scrollbar feedback loop.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = Math.round(el.clientHeight);
        setStageHeight((prev) => (prev !== h ? h : prev));
      });
    });
    ro.observe(el);
    setStageHeight(Math.round(el.clientHeight));
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // Font occupies the same fraction of frame height as the export would; a
  // per-word fontSize overrides the global one. Capped to the frame height so
  // an extreme value can never overflow and break the layout.
  const wordFontPx = (w) => {
    const base = w?.fontSize ?? style.baseFontPx;
    const px = Math.round((base / REFERENCE_HEIGHT) * stageHeight);
    return Math.max(8, Math.min(px, stageHeight || px));
  };

  // The word currently being sung (drives the one-word-at-a-time preview).
  const activeWord = useMemo(
    () => units.find((u) => currentTime >= u.start && currentTime < u.end) ?? null,
    [units, currentTime],
  );

  // The line under the playhead, used only for cumulative display.
  const line = useMemo(
    () => lines.find((l) => currentTime >= l.start && currentTime <= l.end) ?? null,
    [lines, currentTime],
  );

  const renderWord = (w, extraClass = '') => (
    <span
      key={w.id}
      className={`preview-word${extraClass}`}
      style={{ color: w.color || style.text, fontSize: `${wordFontPx(w)}px` }}
    >
      {w.text}
    </span>
  );

  let content;
  if (style.mode === 'cumulative' && line) {
    const shown = line.words.filter((w) => currentTime >= w.start);
    content = (
      <div className="preview-line" style={{ fontFamily: style.font }}>
        {shown.map((w) => renderWord(w, w === activeWord ? ' active' : ''))}
      </div>
    );
  } else if (activeWord) {
    content = (
      <div
        key={activeWord.id}
        className={`preview-line ${style.animation}`}
        style={{ fontFamily: style.font }}
      >
        {renderWord(activeWord, ' active')}
      </div>
    );
  } else {
    content = (
      <div className="preview-empty" style={{ color: style.text }}>
        {units.length ? '♪' : 'Load a config to preview'}
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className="preview-stage"
      style={{ background: style.bg, '--preview-ratio': style.width / style.height }}
    >
      <span className="preview-res-badge">{style.width}×{style.height}</span>
      {content}
    </div>
  );
}
