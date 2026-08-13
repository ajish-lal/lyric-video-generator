import type { Project, Scene } from '../../core/models/project.js';
import type { ScenePlan } from '../../core/interfaces/scene-planner.js';
import type { LyricsDocument } from '../../core/models/project.js';
import type { RenderConfig } from '../../core/models/render.js';

export class ProjectBuilder {
  build(input: { id: string; title: string; audioPath: string; lyrics: LyricsDocument; scenes: ScenePlan['scenes']; renderConfig?: RenderConfig; }): Project {
    return {
      id: input.id,
      title: input.title,
      audioPath: input.audioPath,
      lyrics: input.lyrics,
      scenes: input.scenes.map((scene) => ({
        ...scene,
      })) as Scene[],
      renderConfig: input.renderConfig ?? this.defaultRenderConfig(),
    };
  }

  private defaultRenderConfig(): RenderConfig {
    return {
      width: 1920,
      height: 1080,
      fps: 30,
      format: 'mp4',
      style: {
        theme: 'cinematic-dark',
        fontFamily: 'Arial',
        textCase: 'original',
        primaryColor: '#ffffff',
        accentColor: '#7cff4f',
        lyricPosition: 'center',
        background: {
          palette: ['0x060816', '0x172554', '0x3B0764', '0x0F766E'],
          gradientType: 'radial',
          motionSpeed: 0.004,
          grain: 3,
          vignette: 0.55,
          showFrame: true,
        },
      },
      lyricAnimation: {
        type: 'word-by-word',
        duration: 0.3,
        easing: 'easeOut',
        intensity: 0.8,
      },
      wordDisplay: {
        mode: 'single-word',
        hold: 'word-end',
      },
      dynamicWordEffects: [
        {
          name: 'sustained-vocal', minDuration: 0.7, fontFamily: 'Georgia', color: '#d8f7ff',
          animation: { type: 'smog-fade', duration: 0.5, easing: 'easeOut', intensity: 0.7 },
        },
        {
          name: 'rapid-vocal', maxDuration: 0.28, fontFamily: 'Impact', color: '#7cff4f',
          animation: { type: 'slash-vibrate', duration: 0.15, easing: 'easeOut', intensity: 0.9 },
        },
      ],
    };
  }
}
