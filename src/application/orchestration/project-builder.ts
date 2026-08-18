import type { Project, Scene } from '../../core/models/project.js';
import type { ScenePlan } from '../../core/interfaces/scene-planner.js';
import type { LyricsDocument } from '../../core/models/project.js';
import type { BackgroundTheme, RenderConfig } from '../../core/models/render.js';

export class ProjectBuilder {
  build(input: { id: string; title: string; audioPath: string; lyrics: LyricsDocument; scenes: ScenePlan['scenes']; renderConfig?: RenderConfig; theme?: BackgroundTheme; }): Project {
    return {
      id: input.id,
      title: input.title,
      audioPath: input.audioPath,
      lyrics: input.lyrics,
      scenes: input.scenes.map((scene) => ({
        ...scene,
      })) as Scene[],
      renderConfig: input.renderConfig ?? this.defaultRenderConfig(input.theme ?? 'dark'),
    };
  }

  private defaultRenderConfig(theme: BackgroundTheme = 'dark'): RenderConfig {
    const light = theme === 'white';
    // On a light surface the letters must be dark to stay legible; otherwise white.
    const primaryColor = light ? '#141414' : '#ffffff';
    const background = light
      ? {
          palette: ['0xffffff', '0xf4f5f7', '0xffffff', '0xeef0f4'],
          gradientType: 'radial' as const,
          motionSpeed: 0.0016,
          grain: 2,
          vignette: 0.14,
          showFrame: false,
        }
      : {
          // Cold, near-neutral charcoal (no purple/blue tint) for a steely
          // nu-metal grade; the glow/grade adds the mood, not the base colour.
          palette: ['0x050506', '0x0b0c10', '0x121419', '0x060607'],
          gradientType: 'radial' as const,
          motionSpeed: 0.0022,
          grain: 4,
          vignette: 0.72,
          showFrame: false,
        };
    return {
      width: 1920,
      height: 1080,
      fps: 30,
      format: 'mp4',
      style: {
        theme: light ? 'clean-light' : 'cinematic-dark',
        fontFamily: 'Impact',
        textCase: 'upper',
        primaryColor,
        accentColor: '#ff4655',
        lyricPosition: 'center',
        background,
      },
      lyricAnimation: {
        type: 'word-by-word',
        duration: 0.3,
        easing: 'easeOut',
        intensity: 0.8,
      },
      wordDisplay: {
        mode: 'single-word',
        hold: 'next-word',
      },
      dynamicWordEffects: [
        {
          name: 'sustained-vocal', minDuration: 0.7, fontFamily: 'Baskerville', color: '#eafcff',
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
