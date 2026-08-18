import React from 'react';
import { MAX_FONT, MIN_DURATION, round } from '../timing-model.js';

/** Inspector for the selected clip: text, timing, font size, colour, nudge, warnings. */
export default function Inspector({
  selected, globalFontSize, warnings,
  onTextChange, onPatch, onFontSizeChange, onColorChange, onNudge,
}) {
  return (
    <div className="inspector">
      <h3>Selected word</h3>
      {selected ? (
        <>
          <label className="field">Text
            <input type="text" value={selected.text}
              onChange={(e) => onTextChange(selected.id, e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">Start (s)
              <input type="number" step="0.01" min="0" value={selected.start}
                onChange={(e) => onPatch({ start: round(Math.max(0, Number(e.target.value))) })} />
            </label>
            <label className="field">End (s)
              <input type="number" step="0.01" min="0" value={selected.end}
                onChange={(e) => onPatch({ end: round(Math.max(selected.start + MIN_DURATION, Number(e.target.value))) })} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">Font size (px)
              <input type="number" min="1" max={MAX_FONT} step="1" value={selected.fontSize ?? ''} placeholder={`${globalFontSize} (global)`}
                onChange={(e) => onFontSizeChange(selected.id, e.target.value === '' ? undefined : Math.min(MAX_FONT, Math.max(1, Number(e.target.value))))} />
            </label>
            <label className="field">Colour
              <span className="color-field">
                <input type="color" value={selected.color || '#ffffff'}
                  onChange={(e) => onColorChange(selected.id, e.target.value)} />
                <button type="button" className="link-btn" disabled={selected.color == null}
                  onClick={() => onColorChange(selected.id, undefined)}>Clear</button>
              </span>
            </label>
          </div>
          <div className="nudge-group">
            <div className="nudge">
              <span>Start</span>
              <button type="button" className="neg" onClick={() => onNudge(-0.05, 'start')}>-50ms</button>
              <button type="button" className="pos" onClick={() => onNudge(0.05, 'start')}>+50ms</button>
            </div>
            <div className="nudge">
              <span>End</span>
              <button type="button" className="neg" onClick={() => onNudge(-0.05, 'end')}>-50ms</button>
              <button type="button" className="pos" onClick={() => onNudge(0.05, 'end')}>+50ms</button>
            </div>
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
  );
}
