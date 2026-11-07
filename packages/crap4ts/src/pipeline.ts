import path from "path";
import { Glob } from "bun";
import type {
  Config,
  FileCoverage,
  FunctionCrap,
  FunctionInfo,
  ProjectSummary,
  SortField,
} from "./types";
import { CrapError } from "./types";
import { analyzeComplexity } from "./complexity/analyze";
import { parseCoverage } from "./coverage/resolve";
import { matchFunctions } from "./mapping/match";
import { summarize } from "./crap/score";
import { renderTable } from "./report/table";
import { renderJson } from "./report/json";
import { renderHtml } from "./report/html";
import { bunFileSystem } from "./detect/fs";
import type { FileSystem } from "./detect/types";
import { isGitignored, loadGitignoreGlobs } from "./gitignore";

export async function runPipeline(
  config: Config,
  fs: FileSystem = bunFileSystem,
): Promise<0 | 1 | 2> {
  const sourceFiles = await resolveSourceFiles(config, fs);
  if (sourceFiles.length === 0) {
    console.error("No source files found.");
    return 2;
  }
  const quiet = config.quiet === true;
  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);
  try {
    if (config.onlyCrappyDeprecated) {
      warn("--only-crappy is deprecated (now the default). Use --all to show all functions.");
    }
    const functions = await analyzeAllFiles(sourceFiles, fs);
    const coverage = await readAndParseCoverage(config, fs);
    const matched = matchFunctions(functions, coverage, config.threshold, warn);
    const sorted = sortFunctions(matched, config.sort);
    const summary = summarize(sorted, config.projectThreshold);
    const displayed = config.showAll ? sorted : sorted.filter((f) => f.isCrappy);
    const output = renderOutput({ ...summary, functions: displayed }, config);
    await writeOutput(output, config, { quiet, flagged: summary.isFlagged });
    if (!quiet || summary.isFlagged) {
      for (const message of warnings) console.warn(message);
    }
    return summary.isFlagged ? 1 : 0;
  } catch (error) {
    for (const message of warnings) console.warn(message);
    throw error;
  }
}

async function resolveSourceFiles(config: Config, fs: FileSystem): Promise<string[]> {
  const gitignoreGlobs = config.skipGitignore ? [] : await loadGitignoreGlobs(".", fs);
  if (config.files.length > 0) return resolveExplicitFiles(config.files, gitignoreGlobs, fs);
  return resolveGlobFiles(config.include, config.exclude, gitignoreGlobs);
}

async function resolveExplicitFiles(
  files: string[],
  gitignoreGlobs: Glob[],
  fs: FileSystem,
): Promise<string[]> {
  const kept: string[] = [];
  for (const file of files) {
    const resolved = path.resolve(file);
    if (!(await fs.exists(resolved))) continue;
    if (isGitignored(gitignoreGlobs, path.relative(".", resolved))) continue;
    kept.push(resolved);
  }
  return kept;
}

async function resolveGlobFiles(
  include: string,
  exclude: string,
  gitignoreGlobs: Glob[],
): Promise<string[]> {
  const includeGlob = new Glob(include);
  const excludeGlob = new Glob(exclude);
  const results: string[] = [];
  for await (const file of includeGlob.scan({ cwd: "." })) {
    if (!excludeGlob.match(file) && !isGitignored(gitignoreGlobs, file))
      results.push(path.resolve(file));
  }
  return results;
}

async function analyzeAllFiles(files: string[], fs: FileSystem): Promise<FunctionInfo[]> {
  const results: FunctionInfo[] = [];
  for (const filePath of files) {
    const content = await fs.readText(filePath);
    if (content === null) throw new CrapError(`Source file not found: ${filePath}`);
    results.push(...analyzeComplexity(content, filePath));
  }
  return results;
}

async function readAndParseCoverage(config: Config, fs: FileSystem): Promise<FileCoverage[]> {
  const covPath = path.resolve(config.coveragePath);
  if (!(await fs.exists(covPath))) throw new CrapError(`Coverage file not found: ${covPath}`);
  const content = await fs.readText(covPath);
  if (content === null) throw new CrapError(`Coverage file not found: ${covPath}`);
  return await parseCoverage(content, covPath, config.format, { fs });
}

function sortFunctions(functions: FunctionCrap[], sort: SortField): FunctionCrap[] {
  const sorted = [...functions];
  sorted.sort(comparator(sort));
  return sorted;
}

function comparator(sort: SortField): (a: FunctionCrap, b: FunctionCrap) => number {
  switch (sort) {
    case "score":
      return (a, b) => b.crapScore - a.crapScore;
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    case "complexity":
      return (a, b) => b.complexity - a.complexity;
    case "coverage":
      return (a, b) => (a.coverage ?? -1) - (b.coverage ?? -1);
  }
}

function renderOutput(summary: ProjectSummary, config: Config): string {
  switch (config.output) {
    case "table":
      return renderTable(summary);
    case "json":
      return renderJson(summary);
    case "html":
      return renderHtml(summary);
  }
}

async function writeOutput(
  output: string,
  config: Config,
  options: { quiet: boolean; flagged: boolean },
): Promise<void> {
  const dest = config.outputFile ?? defaultOutputFile(config);
  const printConsole = !(options.quiet && !options.flagged);
  if (dest) {
    await Bun.write(dest, output);
    if (printConsole) console.log(`Report written to ${dest}`);
  } else if (printConsole) {
    console.log(output);
  }
}

function defaultOutputFile(config: Config): string | undefined {
  if (config.output === "html") return "crap-report.html";
  return undefined;
}
