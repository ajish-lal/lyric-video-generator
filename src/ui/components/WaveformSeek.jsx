import React from 'react';

/** Waveform host (wavesurfer mounts into `containerRef`) plus the seek scrubber. */
export default function WaveformSeek({ containerRef, duration, currentTime, onScrub }) {
  const pct = duration ? (currentTime / duration) * 100 : 0;
  return (
    <div className="waveform-card">
      <div ref={containerRef} className="waveform" />
      <div
        className="seek-bar"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onScrub(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) onScrub(e); }}
      >
        <div className="seek-fill" style={{ width: `${pct}%` }} />
        <div className="seek-handle" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
