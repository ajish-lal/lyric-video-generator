import React from 'react';

/** The Words panel: copy/paste style, add word, and the selectable clip list. */
export default function WordList({
  units, selectedId, selectedIds, activeId, canPaste, hasSelection,
  onCopyStyle, onPasteStyle, onAddWord, onSelectRow,
}) {
  return (
    <div className="word-list">
      <div className="word-list-head">
        <h3>Words ({units.length})</h3>
        <div className="word-list-actions">
          <button type="button" disabled={!hasSelection} title="Copy font size + colour" onClick={onCopyStyle}>Copy style</button>
          <button type="button" disabled={!canPaste} onClick={onPasteStyle}>
            Paste style{selectedIds.length > 1 ? ` (${selectedIds.length})` : ''}
          </button>
          <button type="button" disabled={!hasSelection} onClick={onAddWord}>Add word</button>
        </div>
      </div>
      <p className="word-hint">Cmd/Ctrl-click to select multiple, then Paste style.</p>
      <div className="word-scroll">
        {units.map((u) => (
          <button
            type="button"
            key={u.id}
            className={`word-row${u.id === selectedId ? ' selected' : ''}${selectedIds.includes(u.id) ? ' multi' : ''}${u.id === activeId ? ' active' : ''}`}
            onClick={(e) => onSelectRow(u.id, e.metaKey || e.ctrlKey)}
          >
            <span className="word-text">{u.text || <em>(blank)</em>}</span>
            <span className="word-time">{u.start.toFixed(2)}–{u.end.toFixed(2)}s</span>
          </button>
        ))}
      </div>
    </div>
  );
}
