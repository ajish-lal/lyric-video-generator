import React from 'react';
import { MAX_FONT } from '../timing-model.js';

/** Resolution presets and global font size, both written back into the config. */
export default function EditorSettings({ config, resPreset, globalFontSize, wordDisplayMode, onResolutionChange, onGlobalFontSizeChange, onWordDisplayModeChange }) {
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
    </div>
  );
}
