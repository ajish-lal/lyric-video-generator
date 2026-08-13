import type { Project } from '../models/project.js';

export interface RenderResult {
  outputPath: string;
  format: string;
  duration: number;
}

export interface RenderOptions {
  /** Cap the rendered duration (used by preview). */
  maxDuration?: number;
}

export interface Renderer {
  render(project: Project, outputPath?: string, options?: RenderOptions): Promise<RenderResult>;
}
