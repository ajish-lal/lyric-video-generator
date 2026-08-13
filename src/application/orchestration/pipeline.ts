import { lyricsFromTranscript, parseLyricsFile } from '../lyrics/lyrics-parser.js';
import { RulesScenePlanner } from '../../providers/planning/rules-scene-planner.js';
import { ProjectBuilder } from './project-builder.js';
import { LyricVideoRenderer } from '../../providers/renderers/lyric-video-renderer.js';
import { readFileSync } from 'node:fs';
import type { Project } from '../../core/models/project.js';
import type { RenderResult } from '../../core/interfaces/renderer.js';
import { LocalWhisperTranscriber } from '../../providers/transcription/local-whisper-transcriber.js';
import type { AudioTranscriber } from '../../core/interfaces/transcriber.js';

export class Pipeline {
  constructor(
    private readonly scenePlanner = new RulesScenePlanner(),
    private readonly projectBuilder = new ProjectBuilder(),
    private readonly renderer = new LyricVideoRenderer(),
    private readonly transcriber: AudioTranscriber = new LocalWhisperTranscriber(),
  ) {}

  createProjectFromLyricsFile(lyricsPath: string, audioPath = 'input/demo.mp3'): Project {
    const lyricsContent = readFileSync(lyricsPath, 'utf8');
    const lyrics = parseLyricsFile(lyricsContent);
    return this.buildProject(lyrics, audioPath);
  }

  private buildProject(lyrics: Project['lyrics'], audioPath: string): Project {
    const plan = this.scenePlanner.createPlan(lyrics);
    return this.projectBuilder.build({
      id: 'demo-project',
      title: 'Demo project',
      audioPath,
      lyrics,
      scenes: plan.scenes,
    });
  }

  async generate(outputPath: string, audioPath?: string, lyricsPath?: string): Promise<{ project: Project; render: RenderResult }> {
    const project = lyricsPath
      ? this.createProjectFromLyricsFile(lyricsPath, audioPath)
      : this.buildProject(lyricsFromTranscript(await this.transcriber.transcribe(audioPath ?? 'input/demo.mp3')), audioPath ?? 'input/demo.mp3');
    return { project, render: await this.renderer.render(project, outputPath) };
  }
}
