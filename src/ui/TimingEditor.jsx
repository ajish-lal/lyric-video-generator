import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

const MIN_DURATION = 0.05;
const REGION_COLORS = ['rgba(37,99,235,0.28)', 'rgba(124,58,237,0.28)'];
const ACTIVE_COLOR = 'rgba(16,185,129,0.42)';

/** Round to millisecond precision for clean, re-editable JSON. */
const round = (value) => Math.round(value * 1000) / 1000;

const formatTime = (seconds) => {
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
function flattenUnits(config) {
  const units = [];
  let id = 0;
  const pushFromLines = (lines, si) => {
    (lines || []).forEach((line, li) => {
      const words = Array.isArray(line.words) ? line.words : [];
      const timedWords = words.filter((w) => typeof w.start === 'number' && typeof w.end === 'number');
      if (timedWords.length > 0) {
        words.forEach((w, wi) => {
          if (typeof w.start === 'number' && typeof w.end === 'number') {
            units.push({ id: id++, si, li, wi, level: 'word', text: w.text ?? '', start: w.start, end: w.end });
          }
        });
      } else if (typeof line.start === 'number' && typeof line.end === 'number') {
        units.push({ id: id++, si, li, wi: null, level: 'line', text: line.text ?? '', start: line.start, end: line.end });
      }
    });
  };
  (config.sections || []).forEach((sec, si) => pushFromLines(sec.lines, si));
  pushFromLines(config.lines, null); // top-level inline lines (si === null)
  units.sort((a, b) => a.start - b.start);
  return units;
}

/** Locate the underlying word/line object a unit points at inside a config. */
function targetFor(config, unit) {
  const line = unit.si === null ? config.lines?.[unit.li] : config.sections?.[unit.si]?.lines?.[unit.li];
  if (!line) return null;
  return unit.wi === null ? line : line.words?.[unit.wi] ?? null;
}

/**
 * Write unit timings back into a deep-cloned config and re-derive line and
 * section spans from their children so the file stays internally consistent.
 */
function applyUnitsToConfig(config, units) {
  const next = JSON.parse(JSON.stringify(config));
  for (const unit of units) {
    const target = targetFor(next, unit);
    if (target) {
      target.start = round(unit.start);
      target.end = round(Math.max(unit.end, unit.start + MIN_DURATION));
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
function computeWarnings(units) {
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

export default function TimingEditor() {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const regionsRef = useRef(null);
  const unitsRef = useRef([]);

  const [config, setConfig] = useState(null);
  const [configName, setConfigName] = useState('config.json');
  const [audioUrl, setAudioUrl] = useState(null);
  const [units, setUnits] = useState([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('Load an audio file and a config JSON to begin.');

  useEffect(() => { unitsRef.current = units; }, [units]);

  const warnings = useMemo(() => computeWarnings(units), [units]);
  const selected = useMemo(() => units.find((u) => u.id === selectedId) ?? null, [units, selectedId]);
  const activeId = useMemo(() => {
    const u = units.find((unit) => currentTime >= unit.start && currentTime < unit.end);
    return u ? u.id : null;
  }, [units, currentTime]);

  const drawRegions = useCallback(() => {
    const regions = regionsRef.current;
    if (!regions || !wsRef.current) return;
    regions.clearRegions();
    unitsRef.current.forEach((unit, i) => {
      regions.addRegion({
        id: String(unit.id),
        start: unit.start,
        end: unit.end,
        content: unit.text,
        drag: true,
        resize: true,
        color: REGION_COLORS[i % REGION_COLORS.length],
      });
    });
  }, []);

  // Build the wavesurfer instance whenever a new audio file is chosen.
  useEffect(() => {
    if (!audioUrl || !containerRef.current) return undefined;
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: audioUrl,
      height: 120,
      waveColor: '#4b5563',
      progressColor: '#2563eb',
      cursorColor: '#f9fafb',
      minPxPerSec: 60,
      plugins: [regions],
    });
    wsRef.current = ws;
    regionsRef.current = regions;

    ws.on('decode', (d) => { setDuration(d); setReady(true); drawRegions(); });
    ws.on('timeupdate', (t) => setCurrentTime(t));
    ws.on('play', () => setPlaying(true));
    ws.on('pause', () => setPlaying(false));
    ws.on('finish', () => setPlaying(false));

    regions.on('region-updated', (region) => {
      const id = Number(region.id);
      setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, start: region.start, end: region.end } : u)));
    });
    regions.on('region-clicked', (region, e) => {
      e.stopPropagation();
      setSelectedId(Number(region.id));
      wsRef.current?.setTime(region.start);
    });

    return () => { ws.destroy(); wsRef.current = null; regionsRef.current = null; setReady(false); };
  }, [audioUrl, drawRegions]);

  // Re-draw regions when a config is loaded after the audio is ready.
  useEffect(() => { if (ready) drawRegions(); }, [ready, config, drawRegions]);

  const onAudioFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setStatus(`Loaded audio: ${file.name}`);
  };

  const onConfigFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const flat = flattenUnits(parsed);
      setConfig(parsed);
      setConfigName(file.name);
      setUnits(flat);
      setSelectedId(null);
      setStatus(flat.length > 0 ? `Loaded ${flat.length} timed words from ${file.name}.` : 'No timed words found in this config.');
    } catch (error) {
      setStatus(`Could not parse config: ${error.message}`);
    }
  };

  const patchSelected = (patch) => {
    if (selected == null) return;
    setUnits((prev) => prev.map((u) => (u.id === selected.id ? { ...u, ...patch } : u)));
    const region = regionsRef.current?.getRegions().find((r) => Number(r.id) === selected.id);
    if (region) region.setOptions({ start: patch.start ?? selected.start, end: patch.end ?? selected.end });
  };

  const nudge = (delta, edge) => {
    if (!selected) return;
    const start = edge === 'start' ? round(Math.max(0, selected.start + delta)) : selected.start;
    const end = edge === 'end' ? round(Math.max(start + MIN_DURATION, selected.end + delta)) : selected.end;
    patchSelected({ start, end });
  };

  const save = () => {
    if (!config) return;
    const next = applyUnitsToConfig(config, units);
    const blob = new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = configName.replace(/\.json$/i, '') + '.timed.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Saved ${a.download}.`);
  };

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <label className="file-btn">Audio (mp3)
          <input type="file" accept="audio/*" onChange={onAudioFile} />
        </label>
        <label className="file-btn">Config (json)
          <input type="file" accept="application/json,.json" onChange={onConfigFile} />
        </label>
        <button type="button" disabled={!ready} onClick={() => wsRef.current?.playPause()}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" disabled={!ready} onClick={() => { wsRef.current?.stop(); setCurrentTime(0); }}>Stop</button>
        <span className="time">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <button type="button" className="save" disabled={!config} onClick={save}>Export timed JSON</button>
      </div>

      <div ref={containerRef} className="waveform" />
      {!audioUrl && <div className="hint">Pick an audio file to render the waveform.</div>}

      <div className="editor-body">
        <div className="word-list">
          <h3>Words ({units.length})</h3>
          <div className="word-scroll">
            {units.map((u) => (
              <button
                type="button"
                key={u.id}
                className={`word-row${u.id === selectedId ? ' selected' : ''}${u.id === activeId ? ' active' : ''}`}
                onClick={() => { setSelectedId(u.id); wsRef.current?.setTime(u.start); }}
              >
                <span className="word-text">{u.text || <em>(blank)</em>}</span>
                <span className="word-time">{u.start.toFixed(2)}–{u.end.toFixed(2)}s</span>
              </button>
            ))}
          </div>
        </div>

        <div className="inspector">
          <h3>Selected word</h3>
          {selected ? (
            <>
              <div className="field"><span>Text</span><strong>{selected.text || '(blank)'}</strong></div>
              <label className="field">Start (s)
                <input type="number" step="0.01" min="0" value={selected.start}
                  onChange={(e) => patchSelected({ start: round(Math.max(0, Number(e.target.value))) })} />
              </label>
              <label className="field">End (s)
                <input type="number" step="0.01" min="0" value={selected.end}
                  onChange={(e) => patchSelected({ end: round(Math.max(selected.start + MIN_DURATION, Number(e.target.value))) })} />
              </label>
              <div className="nudge">
                <span>Start</span>
                <button type="button" onClick={() => nudge(-0.05, 'start')}>-50ms</button>
                <button type="button" onClick={() => nudge(0.05, 'start')}>+50ms</button>
              </div>
              <div className="nudge">
                <span>End</span>
                <button type="button" onClick={() => nudge(-0.05, 'end')}>-50ms</button>
                <button type="button" onClick={() => nudge(0.05, 'end')}>+50ms</button>
              </div>
            </>
          ) : <p className="muted">Click a word on the waveform or in the list.</p>}

          {warnings.length > 0 && (
            <div className="warnings">
              <h4>{warnings.length} warning(s)</h4>
              <ul>{warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <div className="status">{status}</div>
    </div>
  );
}
