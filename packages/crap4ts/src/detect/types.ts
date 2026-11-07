import type { CoverageFormat } from "../types";

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string | null>;
  realPath(path: string): Promise<string>;
}

export interface RunnerAdapter {
  readonly name: string;
  detect(projectRoot: string): Promise<boolean>;
  getCoverageConfig(): { path: string; format: CoverageFormat };
  generateConfig(): string;
  configFilename(): string;
  getSetupInstructions(): string[];
}
