import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import LyricPreview from './LyricPreview.jsx';
import EditorToolbar from './components/EditorToolbar.jsx';
import EditorSettings from './components/EditorSettings.jsx';
import ShortcutsLegend from './components/ShortcutsLegend.jsx';
import WaveformSeek from './components/WaveformSeek.jsx';
import WordList from './components/WordList.jsx';
import Inspector from './components/Inspector.jsx';
import {
  MIN_DURATION,
  REGION_COLORS,
  round,
  flattenUnits,
  applyUnitsToConfig,
  computeWarnings,
  enforceNoOverlap,
  resolveWarning,
} from './timing-model.js';

export default function TimingEditor({ active = true }) {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const regionsRef = useRef(null);
  const unitsRef = useRef([]);

  const originalUnitsRef = useRef([]);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const dragSnapshotRef = useRef(null);
  const lastMovedIdRef = useRef(null);
  const dragModeRef = useRef('none');
  const activeRef = useRef(active);

  const [config, setConfig] = useState(null);
  const [configName, setConfigName] = useState('config.json');
  const [audioUrl, setAudioUrl] = useState(null);
  const [units, setUnits] = useState([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [copiedStyle, setCopiedStyle] = useState(null);
  const [dragMode, setDragMode] = useState('none');
  const [redrawKey, setRedrawKey] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const [status, setStatus] = useState('Load an audio file and a config JSON to begin.');

  useEffect(() => { unitsRef.current = units; }, [units]);
  useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const warnings = useMemo(() => computeWarnings(units), [units]);
  const selected = useMemo(() => units.find((u) => u.id === selectedId) ?? null, [units, selectedId]);
  const activeId = useMemo(() => {
    const u = units.find((unit) => currentTime >= unit.start && currentTime < unit.end);
    return u ? u.id : null;
  }, [units, currentTime]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const commitUnits = useCallback((next) => {
    pastRef.current = [...pastRef.current, unitsRef.current];
    futureRef.current = [];
    setUnits(next);
    setRedrawKey((k) => k + 1);
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [unitsRef.current, ...futureRef.current];
    setUnits(prev);
    setRedrawKey((k) => k + 1);
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const nextState = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, unitsRef.current];
    setUnits(nextState);
    setRedrawKey((k) => k + 1);
  }, []);

  const reset = useCallback(() => {
    if (originalUnitsRef.current.length === 0) return;
    pastRef.current = [...pastRef.current, unitsRef.current];
    futureRef.current = [];
    setUnits(originalUnitsRef.current.map((u) => ({ ...u })));
    setSelectedId(null);
    setRedrawKey((k) => k + 1);
  }, []);

  // Space toggles playback; arrows seek (±1s, ±5s with Shift) while the editor
  // tab is active and no field is focused.
  useEffect(() => {
    const onKey = (e) => {
      if (!activeRef.current || !wsRef.current) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      const ws = wsRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        ws.playPause();
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        // Seek ±1s, or ±5s with Shift.
        e.preventDefault();
        const step = (e.shiftKey ? 5 : 1) * (e.code === 'ArrowLeft' ? -1 : 1);
        const total = ws.getDuration() || 0;
        ws.setTime(Math.min(total, Math.max(0, ws.getCurrentTime() + step)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Undo/redo/reset also fires keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      if (!activeRef.current || !(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

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
      height: 170,
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
      lastMovedIdRef.current = id;
      setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, start: region.start, end: region.end } : u)));
    });
    regions.on('region-clicked', (region, e) => {
      e.stopPropagation();
      setSelectedId(Number(region.id));
      setSelectedIds([Number(region.id)]);
      // Seek to the exact click position inside the region, not just its start.
      const el = region.element;
      if (el) {
        const rect = el.getBoundingClientRect();
        const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        wsRef.current?.setTime(region.start + rel * (region.end - region.start));
      } else {
        wsRef.current?.setTime(region.start);
      }
    });

    // Snapshot before a drag; on release resolve overlaps per the chosen mode.
    const el = containerRef.current;
    const onDown = () => { dragSnapshotRef.current = unitsRef.current; lastMovedIdRef.current = null; };
    const onUp = () => {
      const movedId = lastMovedIdRef.current;
      const snapshot = dragSnapshotRef.current;
      dragSnapshotRef.current = null;
      lastMovedIdRef.current = null;
      if (movedId == null || !snapshot) return;
      const resolved = enforceNoOverlap(unitsRef.current, movedId, dragModeRef.current);
      pastRef.current = [...pastRef.current, snapshot];
      futureRef.current = [];
      setUnits(resolved);
      setRedrawKey((k) => k + 1);
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      setReady(false);
    };
  }, [audioUrl, drawRegions]);

  // Re-draw regions when a config loads or after undo/redo/reset/overlap resolve.
  useEffect(() => { if (ready) drawRegions(); }, [ready, config, redrawKey, drawRegions]);

  const onAudioFile = (event) => {
    const file = event.target.files?.[0];
    event.target.blur();
    if (!file) return;
    setAudioUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setStatus(`Loaded audio: ${file.name}`);
  };

  const onConfigFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.blur();
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const flat = flattenUnits(parsed);
      setConfig(parsed);
      setConfigName(file.name);
      setUnits(flat);
      originalUnitsRef.current = flat.map((u) => ({ ...u }));
      pastRef.current = [];
      futureRef.current = [];
      const first = flat[0]?.id ?? null;
      setSelectedId(first);
      setSelectedIds(first == null ? [] : [first]);
      setStatus(flat.length > 0 ? `Loaded ${flat.length} timed words from ${file.name}.` : 'No timed words found in this config.');
    } catch (error) {
      setStatus(`Could not parse config: ${error.message}`);
    }
  };

  const patchSelected = (patch) => {
    if (selected == null) return;
    const patched = unitsRef.current.map((u) => (u.id === selected.id ? { ...u, ...patch } : u));
    commitUnits(enforceNoOverlap(patched, selected.id, dragModeRef.current));
  };

  // Auto-resolve a single overlap/reversed warning, then select the fixed word.
  const resolveWarningAt = (warning) => {
    commitUnits(resolveWarning(unitsRef.current, warning));
    setSelectedId(warning.id);
    setSelectedIds([warning.id]);
  };

  const setUnitFontSize = (id, value) => {
    commitUnits(unitsRef.current.map((u) => (u.id === id ? { ...u, fontSize: value } : u)));
  };

  const setUnitColor = (id, value) => {
    commitUnits(unitsRef.current.map((u) => (u.id === id ? { ...u, color: value } : u)));
  };

  // Click behaviour for the word list: plain click selects one; Cmd/Ctrl-click
  // toggles a clip in the multi-selection used as the paste target.
  const selectRow = (id, additive) => {
    setSelectedId(id);
    setSelectedIds((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
    wsRef.current?.setTime(unitsRef.current.find((u) => u.id === id)?.start ?? 0);
  };

  const copyStyle = () => {
    if (!selected) return;
    setCopiedStyle({ fontSize: selected.fontSize, color: selected.color });
    setStatus('Copied style (font size + colour).');
  };

  const pasteStyle = () => {
    if (!copiedStyle) return;
    const targets = new Set(selectedIds.length ? selectedIds : selectedId != null ? [selectedId] : []);
    if (targets.size === 0) return;
    commitUnits(unitsRef.current.map((u) => (targets.has(u.id) ? { ...u, fontSize: copiedStyle.fontSize, color: copiedStyle.color } : u)));
    setStatus(`Pasted style onto ${targets.size} clip(s).`);
  };

  // Append a new timed word to the selected clip's line at the current playhead.
  const addWord = () => {
    if (!config || !selected || selected.si === undefined) {
      setStatus('Select a word first — new words are added to its line.');
      return;
    }
    const next = JSON.parse(JSON.stringify(config));
    const line = selected.si === null ? next.lines?.[selected.li] : next.sections?.[selected.si]?.lines?.[selected.li];
    if (!line) { setStatus('Could not locate the line to add to.'); return; }
    if (!Array.isArray(line.words)) line.words = [];
    const start = round(Math.min(currentTime, (duration || currentTime + 1) - 0.5));
    const end = round(start + 0.5);
    line.words.push({ text: 'new', start, end, style: {} });
    const wi = line.words.length - 1;
    const nextId = unitsRef.current.reduce((m, u) => Math.max(m, u.id), -1) + 1;
    const unit = { id: nextId, si: selected.si, li: selected.li, wi, level: 'word', text: 'new', start, end };
    setConfig(next);
    commitUnits([...unitsRef.current, unit].sort((a, b) => a.start - b.start));
    setSelectedId(nextId);
    setSelectedIds([nextId]);
    setStatus('Added a new word — edit its text/timing, then export.');
  };

  const setUnitText = (id, value) => {
    commitUnits(unitsRef.current.map((u) => (u.id === id ? { ...u, text: value } : u)));
  };

  const setResolution = (patch) => {
    setConfig((c) => (c ? { ...c, resolution: { ...(c.resolution || {}), ...patch } } : c));
  };

  const setGlobalFontSize = (value) => {
    setConfig((c) => (c ? { ...c, typography: { ...(c.typography || {}), fontSize: value } } : c));
  };

  const setWordDisplayMode = (mode) => {
    setConfig((c) => (c ? { ...c, wordDisplay: { ...(c.wordDisplay || {}), mode } } : c));
  };

  // Merge an export-range patch; a null value clears that bound. Drops the
  // whole exportRange object once both bounds are cleared.
  const setExportRange = (patch) => {
    setConfig((c) => {
      if (!c) return c;
      const next = { ...(c.exportRange || {}), ...patch };
      if (next.start == null) delete next.start;
      if (next.end == null) delete next.end;
      if (Object.keys(next).length === 0) {
        const { exportRange, ...rest } = c;
        return rest;
      }
      return { ...c, exportRange: next };
    });
  };

  const nudge = (delta, edge) => {
    if (!selected) return;
    const start = edge === 'start' ? round(Math.max(0, selected.start + delta)) : selected.start;
    const end = edge === 'end' ? round(Math.max(start + MIN_DURATION, selected.end + delta)) : selected.end;
    patchSelected({ start, end });
  };

  // Seek from a pointer position on the seek bar (click or drag).
  const scrubFromEvent = (e) => {
    const ws = wsRef.current;
    if (!ws) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    ws.setTime(rel * (ws.getDuration() || 0));
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

  const resW = config?.resolution?.width ?? 1920;
  const resH = config?.resolution?.height ?? 1080;
  const globalFontSize = config?.typography?.fontSize ?? 160;
  const wordDisplayMode = config?.wordDisplay?.mode === 'cumulative' ? 'cumulative' : 'single-word';
  const exportStart = config?.exportRange?.start ?? null;
  const exportEnd = config?.exportRange?.end ?? null;
  const resPreset = `${resW}x${resH}`;

  return (
    <div className="editor">
      <EditorToolbar
        ready={ready}
        config={config}
        playing={playing}
        dragMode={dragMode}
        canUndo={canUndo}
        canRedo={canRedo}
        showPreview={showPreview}
        currentTime={currentTime}
        duration={duration}
        onAudioFile={onAudioFile}
        onConfigFile={onConfigFile}
        onPlayPause={() => wsRef.current?.playPause()}
        onStop={() => { wsRef.current?.stop(); setCurrentTime(0); }}
        onDragModeChange={setDragMode}
        onUndo={undo}
        onRedo={redo}
        onReset={reset}
        onTogglePreview={() => setShowPreview((v) => !v)}
        onSave={save}
      />

      <EditorSettings
        config={config}
        resPreset={resPreset}
        globalFontSize={globalFontSize}
        wordDisplayMode={wordDisplayMode}
        exportStart={exportStart}
        exportEnd={exportEnd}
        currentTime={currentTime}
        duration={duration}
        onResolutionChange={setResolution}
        onGlobalFontSizeChange={setGlobalFontSize}
        onWordDisplayModeChange={setWordDisplayMode}
        onExportRangeChange={setExportRange}
      />

      <ShortcutsLegend />

      <WaveformSeek
        containerRef={containerRef}
        duration={duration}
        currentTime={currentTime}
        onScrub={scrubFromEvent}
      />
      {!audioUrl && <div className="hint">Pick an audio file to render the waveform.</div>}

      {showPreview && <LyricPreview units={units} currentTime={currentTime} config={config} />}

      <div className="editor-body">
        <WordList
          units={units}
          selectedId={selectedId}
          selectedIds={selectedIds}
          activeId={activeId}
          hasSelection={!!selected}
          canPaste={!!copiedStyle && (selectedIds.length > 0 || selectedId != null)}
          onCopyStyle={copyStyle}
          onPasteStyle={pasteStyle}
          onAddWord={addWord}
          onSelectRow={selectRow}
        />

        <Inspector
          selected={selected}
          globalFontSize={globalFontSize}
          warnings={warnings}
          onTextChange={setUnitText}
          onPatch={patchSelected}
          onFontSizeChange={setUnitFontSize}
          onColorChange={setUnitColor}
          onNudge={nudge}
          onSelectWarning={selectRow}
          onResolveWarning={resolveWarningAt}
        />
      </div>

      <div className="status">{status}</div>
    </div>
  );
}
