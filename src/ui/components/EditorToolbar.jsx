import React from 'react';
import { formatTime } from '../timing-model.js';

/** Top toolbar: file inputs, transport, drag mode, history, preview toggle, export. */
export default function EditorToolbar({
  ready, config, playing, dragMode, canUndo, canRedo, showPreview, currentTime, duration,
  onAudioFile, onConfigFile, onPlayPause, onStop, onDragModeChange,
  onUndo, onRedo, onReset, onTogglePreview, onSave,
}) {
  return (
    <div className="editor-toolbar">
      <label className="file-btn">Audio (mp3)
        <input type="file" accept="audio/*" onChange={onAudioFile} />
      </label>
      <label className="file-btn">Config (json)
        <input type="file" accept="application/json,.json" onChange={onConfigFile} />
      </label>
      <button type="button" className="play-btn" disabled={!ready} title="Space" onClick={onPlayPause}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" disabled={!ready} onClick={onStop}>Stop</button>
      <select className="mode-select" value={dragMode} onChange={(e) => onDragModeChange(e.target.value)}
        title="What happens to neighbouring words when you move one">
        <option value="none">Move only</option>
        <option value="push">Push neighbours</option>
        <option value="resize">Resize neighbours</option>
      </select>
      <button type="button" disabled={!canUndo} title="Ctrl/⌘+Z" onClick={onUndo}>Undo</button>
      <button type="button" disabled={!canRedo} title="Ctrl/⌘+Shift+Z" onClick={onRedo}>Redo</button>
      <button type="button" disabled={!config} onClick={onReset}>Reset</button>
      <button type="button" className={showPreview ? 'toggle on' : 'toggle'} onClick={onTogglePreview}>
        {showPreview ? 'Preview: on' : 'Preview: off'}
      </button>
      <span className="time">{formatTime(currentTime)} / {formatTime(duration)}</span>
      <button type="button" className="save" disabled={!config} onClick={onSave}>Export timed JSON</button>
    </div>
  );
}
