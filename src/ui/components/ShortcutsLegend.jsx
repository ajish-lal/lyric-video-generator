import React from 'react';

/** Static keyboard/interaction hints for the editor. */
export default function ShortcutsLegend() {
  return (
    <div className="shortcuts">
      <span><kbd>Space</kbd> play/pause</span>
      <span><kbd>←</kbd><kbd>→</kbd> seek 1s</span>
      <span><kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd> seek 5s</span>
      <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</span>
      <span><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo</span>
      <span>Click a region to seek there</span>
      <span><kbd>Ctrl</kbd>+ click rows to multi-select</span>
    </div>
  );
}
