import React, { useMemo, useState } from 'react';
import { createProjectFromLyricsContent } from '../application/orchestration/project-generator.ts';
import TimingEditor from './TimingEditor.jsx';

export default function App() {
  const [view, setView] = useState('editor');
  const [lyricsText, setLyricsText] = useState('[Verse]\nHello world\n[Chorus]\nRise again');
  const [audioName, setAudioName] = useState('demo.mp3');
  const [projectJson, setProjectJson] = useState('');
  const [status, setStatus] = useState('Ready');

  const summary = useMemo(() => {
    if (!projectJson) return null;
    const parsed = JSON.parse(projectJson);
    return {
      scenes: parsed.scenes?.length ?? 0,
      animation: parsed.renderConfig?.lyricAnimation?.type ?? 'n/a',
      theme: parsed.renderConfig?.style?.theme ?? 'n/a',
    };
  }, [projectJson]);

  const handleGenerate = () => {
    setStatus('Generating project...');
    const project = createProjectFromLyricsContent(lyricsText, audioName);
    setProjectJson(JSON.stringify(project, null, 2));
    setStatus('Project generated');
  };

  return (
    <div className="app-shell">
      <h1>Lyric Video Generator</h1>
      <nav className="tabs">
        <button type="button" className={view === 'editor' ? 'tab active' : 'tab'} onClick={() => setView('editor')}>Timing editor</button>
        <button type="button" className={view === 'generate' ? 'tab active' : 'tab'} onClick={() => setView('generate')}>Generate project</button>
      </nav>

      <div style={{ display: view === 'editor' ? 'block' : 'none' }}>
        <TimingEditor active={view === 'editor'} />
      </div>

      {view === 'generate' && (
        <>
          <p>Build a styled project from your lyrics and audio metadata.</p>

          <div className="panel">
            <label>
              Lyrics
              <textarea value={lyricsText} onChange={(event) => setLyricsText(event.target.value)} rows={8} />
            </label>
            <label>
              Audio name
              <input value={audioName} onChange={(event) => setAudioName(event.target.value)} />
            </label>
            <button type="button" onClick={handleGenerate}>Generate project</button>
            <div className="status">{status}</div>
          </div>

          {summary && (
            <div className="preview-card">
              <h2>Project preview</h2>
              <p>Scenes: {summary.scenes}</p>
              <p>Animation: {summary.animation}</p>
              <p>Theme: {summary.theme}</p>
              <pre>{projectJson}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
