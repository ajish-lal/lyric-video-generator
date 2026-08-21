import React, { useEffect, useState } from 'react';
import { MAX_FONT, formatClock, parseTimeInput } from '../timing-model.js';

/** Resolution presets and global font size, both written back into the config. */
export default function EditorSettings({
  config, resPreset, globalFontSize, wordDisplayMode,
  exportStart, exportEnd, currentTime, duration,
  onResolutionChange, onGlobalFontSizeChange, onWordDisplayModeChange, onExportRangeChange,
}) {
  // Local text state so the user can type freely; commit on blur/Enter.
  const [startStr, setStartStr] = useState('');
  const [endStr, setEndStr] = useState('');
  useEffect(() => { setStartStr(exportStart != null ? formatClock(exportStart) : ''); }, [exportStart]);
  useEffect(() => { setEndStr(exportEnd != null ? formatClock(exportEnd) : ''); }, [exportEnd]);

  const commit = (which, value) => {
    const seconds = parseTimeInput(value);
    onExportRangeChange({ [which]: value.trim() === '' ? null : seconds });
  };

  return (
    <div className="editor-settings">
      <label className="setting">Resolution
        <select
          value={resPreset}
          disabled={!config}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            onResolutionChange({ width: w, height: h });
          }}
        >
          <option value="1920x1080">Landscape 1080p (1920×1080)</option>
          <option value="1080x1920">Vertical 9:16 (1080×1920)</option>
        </select>
      </label>
      <label className="setting">Word display
        <select
          value={wordDisplayMode}
          disabled={!config}
          onChange={(e) => onWordDisplayModeChange(e.target.value)}
        >
          <option value="single-word">Single word</option>
          <option value="cumulative">Cumulative (build up line)</option>
        </select>
      </label>
      <label className="setting">Font size (global)
        <input type="number" min="1" max={MAX_FONT} step="1" value={globalFontSize} disabled={!config}
          onChange={(e) => onGlobalFontSizeChange(Math.min(MAX_FONT, Math.max(1, Number(e.target.value) || 0)))} />
      </label>

      <div className="setting export-range" title="Trim the exported video. Accepts m:ss or seconds; blank = full length.">
        <span className="export-range-title">Export range</span>
        <div className="export-range-row">
          <span className="export-range-label">Start</span>
          <input
            type="text" inputMode="decimal" placeholder="0:00" disabled={!config}
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            onBlur={(e) => commit('start', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit('start', e.currentTarget.value); } }}
          />
          <button type="button" disabled={!config} title="Set start to the playhead"
            onClick={() => onExportRangeChange({ start: Number(currentTime.toFixed(3)) })}>⏱</button>
        </div>
        <div className="export-range-row">
          <span className="export-range-label">End</span>
          <input
            type="text" inputMode="decimal" placeholder={duration ? formatClock(duration) : 'end'} disabled={!config}
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
            onBlur={(e) => commit('end', e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit('end', e.currentTarget.value); } }}
          />
          <button type="button" disabled={!config} title="Set end to the playhead"
            onClick={() => onExportRangeChange({ end: Number(currentTime.toFixed(3)) })}>⏱</button>
        </div>
        <span className="export-range-hint">
          {exportStart != null || exportEnd != null
            ? `Exports ${formatClock(exportStart ?? 0)}–${exportEnd != null ? formatClock(exportEnd) : formatClock(duration)}`
            : 'Full length'}
        </span>
      </div>
    </div>
  );
}
