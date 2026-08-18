import React, { useEffect, useRef } from 'react';

/** The Words panel: copy/paste style, add word, and the selectable clip list. */
export default function WordList({
  units, selectedId, selectedIds, activeId, canPaste, hasSelection,
  onCopyStyle, onPasteStyle, onAddWord, onSelectRow,
}) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  // Keep the currently-playing word in view without yanking the whole page.
  useEffect(() => {
    const row = activeRef.current;
    const container = scrollRef.current;
    if (!row || !container) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (rowTop < viewTop || rowBottom > viewBottom) {
      container.scrollTo({ top: rowTop - container.clientHeight / 2 + row.offsetHeight / 2, behavior: 'smooth' });
    }
  }, [activeId]);

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
      <div className="word-scroll" ref={scrollRef}>
        {units.map((u) => (
          <button
            type="button"
            key={u.id}
            ref={u.id === activeId ? activeRef : null}
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
