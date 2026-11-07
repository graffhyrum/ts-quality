export type FunctionInfo = {
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  complexity: number;
};

export type StatementCoverage = {
  startLine: number;
  endLine: number;
  hits: number;
};

export type FileCoverage = {
  filePath: string;
  statements: StatementCoverage[];
};

export type FunctionCrap = FunctionInfo & {
  coverage: number | null;
  crapScore: number;
  isCrappy: boolean;
};

export type ProjectSummary = {
  functions: FunctionCrap[];
  totalFunctions: number;
  crappyCount: number;
  crappyPercent: number;
  isFlagged: boolean;
};

export type CoverageFormat = "istanbul" | "lcov" | "v8";

export type OutputFormat = "table" | "json" | "html";

export type SortField = "score" | "name" | "complexity" | "coverage";

export type Config = {
  coveragePath: string;
  format: CoverageFormat | undefined;
  threshold: number;
  projectThreshold: number;
  output: OutputFormat;
  outputFile: string | undefined;
  sort: SortField;
  showAll: boolean;
  onlyCrappyDeprecated: boolean;
  include: string;
  exclude: string;
  files: string[];
  init: boolean;
  skipGitignore: boolean;
  quiet: boolean;
};

export class CrapError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 2,
  ) {
    super(message);
    this.name = "CrapError";
  }
}
