import type { Project } from '../models/project.js';

export interface RenderResult {
  outputPath: string;
  format: string;
  duration: number;
}

export interface Renderer {
  render(project: Project, outputPath?: string): Promise<RenderResult>;
}
